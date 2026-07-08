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
