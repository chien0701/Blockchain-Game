import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WHEEL, PLINKO } from '../src/games/random.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const binom = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };

const crash = (m) => [[1 / m, m], [1 - 1 / m, 0]];
const BETS = [
  { name: '骰子 大／小／單／雙', dist: [[1 / 2, 2], [1 / 2, 0]] },
  { name: '猜硬幣', dist: [[1 / 2, 2], [1 / 2, 0]] },
  { name: '輪盤 紅黑／單雙／大小', dist: [[18 / 37, 2], [19 / 37, 0]] },
  { name: '輪盤 單號', dist: [[1 / 37, 30], [36 / 37, 0]] },
  { name: '拉霸', dist: [[6 / 216, 8], [90 / 216, 2], [120 / 216, 0]] },
  { name: 'Crash／Limbo 目標 2×', dist: crash(2) },
  { name: 'Crash／Limbo 目標 10×', dist: crash(10) },
  { name: 'Crash／Limbo 目標 100×', dist: crash(100) },
  { name: '幸運轉盤', dist: WHEEL.map((b) => [1 / WHEEL.length, b / 10000]) },
  { name: 'Plinko', dist: PLINKO.map((b, k) => [binom(16, k) / 65536, b / 10000]) },
  { name: '左輪 1 發', dist: [[5 / 6, 6 / 5], [1 / 6, 0]] },
  { name: '左輪 5 發', dist: [[1 / 6, 6], [5 / 6, 0]] },
];

const POOL = 0.03;
const STAKE_SHARE = 0.01;
const SESSION = 100;
const SIMS = 20000;

const expFile = fs.readdirSync(path.join(root, 'docs', 'experiments'), { withFileTypes: true })
  .filter((d) => d.name.startsWith('sepolia-') && d.name.endsWith('.json')).map((d) => d.name).sort().pop();
const measured = expFile ? JSON.parse(fs.readFileSync(path.join(root, 'docs', 'experiments', expFile), 'utf8')).summary : null;
const gasPerRound = measured?.gasPerRound.median ?? 313000;

function rng(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(dist, u) {
  let acc = 0;
  for (const [p, m] of dist) { acc += p; if (u < acc) return m; }
  return dist[dist.length - 1][1];
}

const rows = BETS.map(({ name, dist }, i) => {
  const rtp = dist.reduce((a, [p, m]) => a + p * m, 0);
  const sd = Math.sqrt(dist.reduce((a, [p, m]) => a + p * (m - rtp) ** 2, 0));
  const maxM = Math.max(...dist.map(([, m]) => m));
  const pMax = dist.filter(([, m]) => m === maxM).reduce((a, [p]) => a + p, 0);
  const pWin = dist.filter(([, m]) => m > 1).reduce((a, [p]) => a + p, 0);
  const stake = POOL * STAKE_SHARE;
  const r = rng(12345 + i);
  let down20 = 0, sumEnd = 0;
  for (let s = 0; s < SIMS; s++) {
    let pool = POOL;
    for (let k = 0; k < SESSION; k++) pool += stake - stake * sample(dist, r());
    sumEnd += pool;
    if (pool <= POOL * 0.8) down20++;
  }
  return {
    name, rtp, houseEdge: 1 - rtp, sd, maxM, pMax, pWin,
    maxStakeAtFullPool: POOL / maxM,
    sessionsPoolDown20: down20 / SIMS,
    meanPoolChange: sumEnd / SIMS - POOL,
  };
});

const pct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;
const lines = [];
lines.push(`| 注型 | RTP | 莊家優勢 | 每單位注金標準差 | 最大倍率 | 最大倍率機率 | 淨贏機率 | 滿池單注上限（ETH） | 100 局後資金池跌 ≥ 20% 的機率 |`);
lines.push('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${r.name} | ${pct(r.rtp)} | ${pct(r.houseEdge)} | ${r.sd.toFixed(3)} | ${r.maxM}× | ${r.pMax < 0.001 ? r.pMax.toExponential(2) : pct(r.pMax)} | ${pct(r.pWin)} | ${r.maxStakeAtFullPool.toFixed(5)} | ${pct(r.sessionsPoolDown20, 1)} |`);
}
const gasLines = [];
gasLines.push('| gas price | 每局手續費（ETH） | 手續費 = 注金 1% 時的注金 | 0.0001 ETH 注金時手續費佔比 | 0.01 ETH 注金時手續費佔比 |');
gasLines.push('|---|---|---|---|---|');
for (const g of [0.01, 0.1, 1, 10]) {
  const fee = gasPerRound * g * 1e-9;
  gasLines.push(`| ${g} gwei | ${fee.toPrecision(3)} | ${(fee / 0.01).toPrecision(3)} | ${pct(fee / 0.0001, 1)} | ${pct(fee / 0.01, 2)} |`);
}

const out = {
  generatedAt: new Date().toISOString(),
  assumptions: { pool: POOL, stakeShareOfPool: STAKE_SHARE, sessionRounds: SESSION, simulations: SIMS, gasPerRound, gasSource: measured ? `docs/experiments/${expFile}` : 'contracts/ANALYSIS.md' },
  rows,
};
fs.writeFileSync(path.join(root, 'docs', 'experiments', 'odds-analysis.json'), JSON.stringify(out, null, 2) + '\n');
console.log(lines.join('\n'));
console.log();
console.log(gasLines.join('\n'));
console.log(`\n每局 gas：${gasPerRound}（來源：${out.assumptions.gasSource}）`);
