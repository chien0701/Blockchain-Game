export function hexSlice(hex, byteStart, byteLen) {
  const raw = hex.replace(/^0x/, '');
  return raw.slice(byteStart * 2, (byteStart + byteLen) * 2);
}

export function intFromHex(hex, byteStart, byteLen) {
  return parseInt(hexSlice(hex, byteStart, byteLen), 16);
}

export function rollDie(finalRandom, byteStart = 0) {
  return (intFromHex(finalRandom, byteStart, 4) % 6) + 1;
}

export function mapRange(finalRandom, byteStart, byteLen, range) {
  return intFromHex(finalRandom, byteStart, byteLen) % range;
}

// ── FairBet v2 變動倍率遊戲（與合約逐位元一致，倍率為 bps）──

const E52 = 1n << 52n;
const CRASH_CAP = 1_000_000n;

/** crash/limbo 崩盤倍率 bps = min(CAP, 10000·E/(E-h)) */
export function crashBps(finalRandom) {
  const h = BigInt(finalRandom) % E52;
  const m = (10000n * E52) / (E52 - h);
  return Number(m > CRASH_CAP ? CRASH_CAP : m);
}

export const WHEEL = [0, 18000, 0, 15000, 0, 25000, 0, 12000];
export function wheelSeg(finalRandom) {
  return Number(BigInt(finalRandom) % 8n);
}

export const PLINKO = [
  160000, 90000, 20000, 14000, 14000, 12000, 11000, 10000,
  5000, 10000, 11000, 12000, 14000, 14000, 20000, 90000, 160000,
];
export function plinkoBucket(finalRandom) {
  let bits = BigInt(finalRandom) & 0xFFFFn, b = 0;
  for (let i = 0n; i < 16n; i++) if ((bits >> i) & 1n) b++;
  return b;
}

export function revolverChamber(finalRandom) {
  return Number(BigInt(finalRandom) % 6n);
}

/** bps → 顯示用倍數字串，如 20000 → "2.00" */
export const bpsToX = (bps) => (bps / 10000).toFixed(2);

/** FairBet 的 GameType enum（順序即合約 uint8 值，不可重排） */
export const GAME_TYPE_NAMES = [
  '骰子', '猜硬幣', '輪盤', '拉霸', 'Crash', 'Limbo', '幸運轉盤', 'Plinko', '左輪',
];

/**
 * 依 gameType 重算合約會 emit 的 outcome
 * 必須與 FairBet.sol 的 _resolve() 完全一致
 */
export function outcomeOf(gameType, finalRandom) {
  switch (Number(gameType)) {
    case 0: return rollDie(finalRandom);
    case 1: return intFromHex(finalRandom, 0, 4) % 2;
    case 2: return intFromHex(finalRandom, 0, 4) % 37;
    case 3: {
      const r = [0, 1, 2].map((i) => mapRange(finalRandom, i * 4, 4, 6));
      return r[0] * 100 + r[1] * 10 + r[2];
    }
    case 4:
    case 5: return crashBps(finalRandom);
    case 6: return wheelSeg(finalRandom);
    case 7: return plinkoBucket(finalRandom);
    case 8: return revolverChamber(finalRandom);
    default: return null;
  }
}

export const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/**
 * 與 FairBet.resolve() 逐位元一致：回傳 { payout（wei, BigInt）, outcome }
 * amount 以 wei 為單位（BigInt），倍率以 bps 整數運算、向下取整
 */
export function resolveBet(gameType, betType, param, amount, finalRandom) {
  const g = Number(gameType), bt = Number(betType), p = BigInt(param), a = BigInt(amount);
  const outcome = outcomeOf(g, finalRandom);
  let payout = 0n;
  switch (g) {
    case 0: {
      const won = bt === 0 ? outcome >= 4 : bt === 1 ? outcome <= 3 : bt === 2 ? outcome % 2 === 1 : outcome % 2 === 0;
      payout = won ? a * 2n : 0n; break;
    }
    case 1: payout = bt === outcome ? a * 2n : 0n; break;
    case 2: {
      const n = outcome, red = ROULETTE_RED.has(n);
      const won = bt === 0 ? red
        : bt === 1 ? n !== 0 && !red
        : bt === 2 ? n !== 0 && n % 2 === 1
        : bt === 3 ? n !== 0 && n % 2 === 0
        : bt === 4 ? n >= 1 && n <= 18
        : bt === 5 ? n >= 19 && n <= 36
        : BigInt(n) === p;
      payout = won ? (bt === 6 ? a * 30n : a * 2n) : 0n; break;
    }
    case 3: {
      const r = [Math.floor(outcome / 100), Math.floor(outcome / 10) % 10, outcome % 10];
      if (r[0] === r[1] && r[1] === r[2]) payout = a * 8n;
      else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) payout = a * 2n;
      break;
    }
    case 4:
    case 5: payout = BigInt(outcome) >= p ? a * p / 10000n : 0n; break;
    case 6: payout = a * BigInt(WHEEL[outcome]) / 10000n; break;
    case 7: payout = a * BigInt(PLINKO[outcome]) / 10000n; break;
    case 8: payout = outcome >= bt ? a * 60000n / BigInt(6 - bt) / 10000n : 0n; break;
    default: return null;
  }
  return { payout, outcome };
}

/** 依賠付與注金判定：'win' 淨贏、'push' 拿回本金、'lose' 淨輸 */
export function netResult(payout, amount) {
  const p = BigInt(payout), a = BigInt(amount);
  return p > a ? 'win' : p === a ? 'push' : 'lose';
}

/** 淨結果 → 紀錄用的勝負 */
export const winnerOf = (net) => (net === 'win' ? 'player' : net === 'push' ? 'draw' : 'dealer');

/** 把 outcome 轉成人看得懂的敘述 */
export function describeOutcome(gameType, outcome) {
  switch (Number(gameType)) {
    case 0: return `骰出 ${outcome} 點`;
    case 1: return outcome === 0 ? '正面' : '反面';
    case 2: return `輪盤 ${outcome} 號`;
    case 3: return `輪軸 ${String(outcome).padStart(3, '0')}`;
    case 4: return `崩於 ${bpsToX(outcome)}×`;
    case 5: return `擲出 ${bpsToX(outcome)}×`;
    case 6: return `第 ${outcome + 1} 段（${bpsToX(WHEEL[outcome])}×）`;
    case 7: return `第 ${outcome + 1} 槽（${bpsToX(PLINKO[outcome])}×）`;
    case 8: return `轉出第 ${outcome + 1} 膛`;
    default: return String(outcome);
  }
}
