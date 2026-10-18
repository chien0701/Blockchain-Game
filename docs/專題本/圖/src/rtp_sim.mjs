import { ethers } from 'file:///C:/Users/lkj75/Documents/Blockchain-Game/node_modules/ethers/lib.esm/index.js';
import { resolveBet } from 'file:///C:/Users/lkj75/Documents/Blockchain-Game/src/games/random.js';
import { writeFileSync } from 'fs';
const N = 50000, U = 1000000n;
const G = [
  ['Crash（目標 2×）', 4, 0, 20000, 1],
  ['骰子（押大）', 0, 0, 0, 1],
  ['輪盤（押紅）', 2, 0, 0, 36/37],
  ['輪盤（單號，30×）', 2, 6, 7, 30/37],
  ['幸運轉盤', 6, 0, 0, 0.875],
  ['Plinko', 7, 0, 0, 0.9899871826],
  ['Limbo（目標 5×）', 5, 0, 50000, 1],
  ['左輪（3 發）', 8, 3, 0, 1],
];
const marks = new Set(); for (let k = 0; k <= 60; k++) marks.add(Math.max(10, Math.round(10 * Math.pow(N / 10, k / 60))));
const out = [];
for (const [name, g, bt, p, theo] of G) {
  let s = 0, s2 = 0; const pts = [];
  for (let i = 1; i <= N; i++) {
    const m = Number(resolveBet(g, bt, p, U, ethers.hexlify(ethers.randomBytes(32))).payout) / 1e6;
    s += m; s2 += m * m;
    if (marks.has(i)) pts.push([i, s / i]);
  }
  const mean = s / N, sd = Math.sqrt(s2 / N - mean * mean);
  out.push({ name, theo, pts, sd, final: mean });
  console.log(name, mean.toFixed(4), 'theo', theo.toFixed(4), 'sd', sd.toFixed(3));
}
writeFileSync(process.argv[2], JSON.stringify(out));
