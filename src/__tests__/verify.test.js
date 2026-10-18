import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { commitHash, combineSeeds } from '../utils/crypto';
import { resolveBet } from '../games/random';
import { verifyBetV3, verifyBetV2, verifyLocalRecord, ZERO_HASH } from '../utils/verify';
import { replayBlackjack, dealCards, determineWinner } from '../utils/gameLogic';

const rand32 = () => ethers.hexlify(ethers.randomBytes(32));
const AMOUNT = ethers.parseEther('0.001');

function settledV3({ gameType = 7, betType = 0, param = '0' } = {}) {
  const seed = rand32(), salt = rand32(), blockHash = rand32();
  const fr = combineSeeds(seed, blockHash);
  const r = resolveBet(gameType, betType, param, AMOUNT, fr);
  return {
    blockHash,
    bet: {
      state: 2, gameType, betType, param, amountWei: AMOUNT.toString(), revealBlock: 100,
      playerCommit: commitHash(seed, salt), playerSeed: seed, playerSalt: salt,
      entropy: blockHash, finalRandom: fr, outcome: r.outcome, payoutWei: r.payout.toString(),
    },
  };
}

const failedIds = (res) => res.checks.filter((c) => c.status === 'fail').map((c) => c.id);

describe('verifyBetV3：正確案例', () => {
  it('9 種遊戲的正確紀錄皆為 verified', () => {
    for (const [g, bt, p] of [[0, 1, 0], [1, 0, 0], [2, 6, 7], [3, 0, 0], [4, 0, 20000], [5, 0, 50000], [6, 0, 0], [7, 0, 0], [8, 3, 0]]) {
      const { bet, blockHash } = settledV3({ gameType: g, betType: bt, param: String(p) });
      expect(verifyBetV3(bet, blockHash).verdict).toBe('verified');
    }
  });
});

describe('verifyBetV3：反證（只要一項被竄改就必須失敗）', () => {
  it('改種子 → 承諾與 finalRandom 失敗', () => {
    const { bet, blockHash } = settledV3();
    const res = verifyBetV3({ ...bet, playerSeed: rand32() }, blockHash);
    expect(res.verdict).toBe('failed');
    expect(failedIds(res)).toContain('commit');
  });
  it('合約記錄的熵與 RPC 取得的區塊雜湊不同 → 失敗', () => {
    const { bet, blockHash } = settledV3();
    const fakeEntropy = rand32();
    const res = verifyBetV3({ ...bet, entropy: fakeEntropy, finalRandom: combineSeeds(bet.playerSeed, fakeEntropy) }, blockHash);
    expect(failedIds(res)).toEqual(expect.arrayContaining(['entropy', 'finalRandom']));
  });
  it('改 outcome → 失敗', () => {
    const { bet, blockHash } = settledV3();
    expect(failedIds(verifyBetV3({ ...bet, outcome: (bet.outcome + 1) % 17 }, blockHash))).toContain('outcome');
  });
  it('改 payout（多付 1 wei）→ 失敗', () => {
    const { bet, blockHash } = settledV3();
    expect(failedIds(verifyBetV3({ ...bet, payoutWei: (BigInt(bet.payoutWei) + 1n).toString() }, blockHash))).toContain('payout');
  });
  it('改遊戲類型 → 失敗', () => {
    const { bet, blockHash } = settledV3({ gameType: 1 });
    expect(verifyBetV3({ ...bet, gameType: 0, betType: 0 }, blockHash).verdict).toBe('failed');
  });
  it('改注金 → 賠付重算不符', () => {
    const { bet, blockHash } = settledV3({ gameType: 7 });
    expect(failedIds(verifyBetV3({ ...bet, amountWei: (AMOUNT * 2n).toString() }, blockHash))).toContain('payout');
  });
});

describe('verifyBetV3：證據不足或非結算狀態不得顯示通過', () => {
  it('取不到區塊雜湊 → incomplete（不是 verified）', () => {
    const { bet } = settledV3();
    const res = verifyBetV3(bet, null);
    expect(res.verdict).toBe('incomplete');
    expect(res.checks.find((c) => c.id === 'entropy').status).toBe('unavailable');
  });
  it('過期局 → expired', () => {
    expect(verifyBetV3({ state: 3, finalRandom: ZERO_HASH, payoutWei: '0' }, null).verdict).toBe('expired');
  });
  it('過期局卻有賠付 → failed', () => {
    expect(verifyBetV3({ state: 3, finalRandom: ZERO_HASH, payoutWei: '1' }, null).verdict).toBe('failed');
  });
  it('未結算 → pending', () => {
    expect(verifyBetV3({ state: 1 }, null).verdict).toBe('pending');
  });
});

describe('verifyBetV2（舊合約）', () => {
  it('助教 T05：v2 過期局 finalRandom 為零，不得因 outcome 相同而判為通過', () => {
    const res = verifyBetV2({ state: 2, gameType: 1, betType: 0, param: '0', amountWei: AMOUNT.toString(), finalRandom: ZERO_HASH, outcome: 0, payoutWei: '0' });
    expect(res.verdict).toBe('expired');
  });
  it('助教 T09：取不到種子 → incomplete，且說明原因', () => {
    const fr = rand32();
    const r = resolveBet(1, 0, 0, AMOUNT, fr);
    const res = verifyBetV2({ state: 2, gameType: 1, betType: 0, param: '0', amountWei: AMOUNT.toString(), finalRandom: fr, outcome: r.outcome, payoutWei: r.payout.toString(), seeds: null, seedsStatus: 'rpc-limit' });
    expect(res.verdict).toBe('incomplete');
    expect(res.checks.find((c) => c.id === 'commitP').reason).toMatch(/RPC/);
  });
  it('有種子且全部吻合 → verified', () => {
    const p = rand32(), ps = rand32(), d = rand32(), ds = rand32();
    const fr = combineSeeds(p, d);
    const r = resolveBet(2, 0, 0, AMOUNT, fr);
    const bet = { state: 2, gameType: 2, betType: 0, param: '0', amountWei: AMOUNT.toString(), playerCommit: commitHash(p, ps), dealerCommit: commitHash(d, ds), finalRandom: fr, outcome: r.outcome, payoutWei: r.payout.toString(), seeds: { playerSeed: p, playerSalt: ps, dealerSeed: d, dealerSalt: ds } };
    expect(verifyBetV2(bet).verdict).toBe('verified');
  });
});

describe('本地紀錄依遊戲分派（助教 R01／T06）', () => {
  const T06 = '0x00000002' + '00'.repeat(28);

  it('T06 向量：玩家起手 15 停牌，莊家 13 補到 19 → 莊家勝（舊驗證器只比起手牌會誤判玩家勝）', () => {
    const replay = replayBlackjack(T06, 0, 1);
    expect(replay.playerHand.map((c) => c.suit + c.value)).toEqual(['♣6', '♦9']);
    expect(replay.dealerHand.map((c) => c.suit + c.value)).toEqual(['♠6', '♦7', '♥6']);
    expect(replay.result.winner).toBe('dealer');

    const naive = dealCards(T06, 1);
    expect(determineWinner(naive.playerHand, naive.dealerHand).winner).toBe('player');
  });

  it('21 點紀錄：以完整重播驗證，竄改勝負會失敗', () => {
    const p = rand32(), ps = rand32(), d = rand32(), ds = rand32();
    const fr = combineSeeds(p, d);
    const replay = replayBlackjack(fr, 1, 2);
    const rec = { gameType: 'blackjack', rng: 2, playerSeed: p, playerSalt: ps, dealerSeed: d, dealerSalt: ds, playerCommit: commitHash(p, ps), dealerCommit: commitHash(d, ds), finalRandom: fr, playerHand: replay.playerHand, dealerHand: replay.dealerHand, result: replay.result };
    expect(verifyLocalRecord(rec).verdict).toBe('verified');
    const flipped = replay.result.winner === 'player' ? 'dealer' : 'player';
    expect(verifyLocalRecord({ ...rec, result: { winner: flipped } }).verdict).toBe('failed');
  });

  it('骰子等舊版紀錄不再套用 21 點判定，結果項標為未驗證', () => {
    const p = rand32(), ps = rand32(), d = rand32(), ds = rand32();
    const rec = { gameType: 'dice', playerSeed: p, playerSalt: ps, dealerSeed: d, dealerSalt: ds, playerCommit: commitHash(p, ps), dealerCommit: commitHash(d, ds), finalRandom: combineSeeds(p, d), result: { winner: 'player' } };
    const res = verifyLocalRecord(rec);
    expect(res.kind).toBe('legacy-bet');
    expect(res.verdict).toBe('incomplete');
  });

  it('v3 本地紀錄：熵來源無法在本地確認 → incomplete；竄改賠付 → failed', () => {
    const { bet } = settledV3({ gameType: 4, param: '20000' });
    const rec = { ...bet, protocol: 'fb3', onChain: true, gameType: 'crash', gameTypeId: 4 };
    expect(verifyLocalRecord(rec).verdict).toBe('incomplete');
    expect(verifyLocalRecord({ ...rec, payoutWei: '123' }).verdict).toBe('failed');
  });

  it('挖礦紀錄 → 不適用', () => {
    expect(verifyLocalRecord({ gameType: 'mining' }).verdict).toBe('not-applicable');
  });
});
