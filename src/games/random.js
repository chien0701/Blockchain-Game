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
