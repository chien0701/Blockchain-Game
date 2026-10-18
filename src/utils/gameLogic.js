import { ethers } from 'ethers';

const SUITS  = ['♠', '♥', '♦', '♣'];
const VALUES = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

/** 目前的亂數映射版本；舊紀錄沒有 rng 欄位時視為 1 */
export const RNG_VERSION = 2;

/**
 * v2：以 keccak256(seed ‖ counter) 產生 32-bit 串流，有效熵為 seed 的完整 256 bit。
 * 52! ≈ 2^225.6 < 2^256，起始狀態數足以涵蓋所有排列（v1 只有約 2^32 種起始狀態）。
 */
export function randomStream(hex) {
  let counter = 0, buf = [];
  return () => {
    if (!buf.length) {
      const h = ethers.solidityPackedKeccak256(['bytes32', 'uint256'], [hex, counter++]).slice(2);
      buf = Array.from({ length: 8 }, (_, i) => parseInt(h.slice(i * 8, i * 8 + 8), 16));
    }
    return buf.shift();
  };
}

/** 拒絕採樣：回傳 [0, n) 的無偏整數 */
export function uniformInt(next, n) {
  const limit = Math.floor(0x100000000 / n) * n;
  for (;;) { const x = next(); if (x < limit) return x % n; }
}

/** v1（舊局查驗用）：兩段 32-bit XOR 作為 xorshift 起始狀態 */
function makePrngV1(hex) {
  const raw = hex.replace('0x', '');
  let s = (parseInt(raw.slice(0, 8), 16) ^ parseInt(raw.slice(8, 16), 16)) >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** 用 randomHex 建立一副確定性洗好的牌堆（Fisher-Yates） */
export const createDeck = (randomHex, rng = RNG_VERSION) => {
  const deck = [];
  for (const suit of SUITS) for (const value of VALUES) deck.push({ suit, value });

  if (rng === 1) {
    const rand = makePrngV1(randomHex);
    for (let i = 51; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  } else {
    const next = randomStream(randomHex);
    for (let i = 51; i > 0; i--) {
      const j = uniformInt(next, i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck;
};

/** 起手四張：玩家拿第 0、2 張，莊家拿第 1、3 張 */
export const dealCards = (randomHex, rng = RNG_VERSION) => {
  const deck = createDeck(randomHex, rng);
  return { playerHand: [deck[0], deck[2]], dealerHand: [deck[1], deck[3]] };
};

/** 計算一手牌的點數（Ace 自動調整） */
export const calcScore = (hand) => {
  let total = 0, aces = 0;
  for (const card of hand) {
    if (card.value === 'A')                         { total += 11; aces++; }
    else if (['J','Q','K'].includes(card.value))    { total += 10; }
    else                                            { total += parseInt(card.value); }
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
};

/** 判定勝負，回傳 { winner: 'player'|'dealer'|'draw', reason } */
export const determineWinner = (playerHand, dealerHand) => {
  const ps = calcScore(playerHand);
  const ds = calcScore(dealerHand);
  if (ps > 21) return { winner: 'dealer', reason: '玩家爆牌' };
  if (ds > 21) return { winner: 'player', reason: '莊家爆牌' };
  if (ps > ds)  return { winner: 'player', reason: `${ps} 點 > ${ds} 點` };
  if (ds > ps)  return { winner: 'dealer', reason: `${ds} 點 > ${ps} 點` };
  return { winner: 'draw', reason: `平手 ${ps} 點` };
};

/**
 * 依「亂數 + 玩家行動」完整重播一局 21 點。
 * 玩家行動只有補牌次數：補 playerHits 張後停牌；爆牌則莊家不再補牌，否則莊家補到 17 點以上。
 */
export function replayBlackjack(randomHex, playerHits, rng = RNG_VERSION) {
  const deck = createDeck(randomHex, rng);
  const playerHand = [deck[0], deck[2]];
  const dealerHand = [deck[1], deck[3]];
  let k = 4;
  for (let i = 0; i < playerHits; i++) playerHand.push(deck[k++]);
  if (calcScore(playerHand) <= 21) {
    while (calcScore(dealerHand) < 17 && k < deck.length) dealerHand.push(deck[k++]);
  }
  return { playerHand, dealerHand, result: determineWinner(playerHand, dealerHand) };
}

/** 猜數字密碼：v2 以拒絕採樣避免單 byte % 6 的偏差（256 = 6×42 + 4：0–3 號顏色 43/256，4、5 號 42/256） */
export function mastermindSecret(seedHex, len = 4, colors = 6, rng = RNG_VERSION) {
  if (rng === 1) {
    const raw = seedHex.replace(/^0x/, '');
    return Array.from({ length: len }, (_, i) => parseInt(raw.slice(i * 2, i * 2 + 2), 16) % colors);
  }
  const next = randomStream(seedHex);
  return Array.from({ length: len }, () => uniformInt(next, colors));
}
