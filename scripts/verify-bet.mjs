/**
 * 獨立驗證工具：不經過 FairChain 網站，直接向任一 RPC 讀取 FairBet v3 下注局並重算。
 *
 *   npx vite-node scripts/verify-bet.mjs -- --rpc <RPC_URL> --address <FairBet 地址> --bet <betId>
 *
 * 結束代碼：0 verified｜1 failed｜2 incomplete／expired／pending／not-found｜3 參數或連線錯誤
 */
import { ethers } from 'ethers';
import { verifyBetV3 } from '../src/utils/verify';
import { FAIRBET_V3_ABI } from '../src/config/abi';
import { GAME_TYPE_NAMES, describeOutcome } from '../src/games/random';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const { rpc, address, bet } = args;
if (!rpc || !address || !bet) {
  console.error('用法：npx vite-node scripts/verify-bet.mjs -- --rpc <RPC_URL> --address <FairBet 地址> --bet <betId>');
  process.exit(3);
}

const ICON = { pass: '✅', fail: '❌', unavailable: '⚪' };

try {
  const provider = new ethers.JsonRpcProvider(rpc);
  const { chainId } = await provider.getNetwork();
  const fb = new ethers.Contract(address, FAIRBET_V3_ABI, provider);
  const [b, rules] = await Promise.all([fb.getBet(BigInt(bet)), fb.RULES_VERSION()]);

  const data = {
    state: Number(b.state), gameType: Number(b.gameType), betType: Number(b.betType),
    param: b.param.toString(), amountWei: b.amount.toString(), revealBlock: Number(b.revealBlock),
    playerCommit: b.playerCommit, playerSeed: b.playerSeed, playerSalt: b.playerSalt,
    entropy: b.entropy, finalRandom: b.finalRandom, outcome: Number(b.outcome), payoutWei: b.payout.toString(),
  };
  const blockHash = data.state === 2 ? (await provider.getBlock(data.revealBlock).catch(() => null))?.hash ?? null : null;
  const res = verifyBetV3(data, blockHash);

  console.log(`鏈 ${chainId} · FairBet ${address} · 規則 v${rules} · Bet #${bet}`);
  if (data.state !== 0) {
    console.log(`${GAME_TYPE_NAMES[data.gameType]} · 注型 ${data.betType} · 參數 ${data.param} · 注金 ${ethers.formatEther(data.amountWei)} ETH`);
    if (data.state === 2) console.log(`開獎 ${describeOutcome(data.gameType, data.outcome)} · 賠付 ${ethers.formatEther(data.payoutWei)} ETH · 開獎區塊 #${data.revealBlock}`);
  }
  for (const c of res.checks) {
    console.log(`${ICON[c.status]} ${c.label}${c.status === 'fail' ? `\n     紀錄 ${c.claimed}\n     重算 ${c.recomputed}` : ''}${c.reason ? `（${c.reason}）` : ''}`);
  }
  console.log(`結論：${res.verdict}`);
  process.exit(res.verdict === 'verified' ? 0 : res.verdict === 'failed' ? 1 : 2);
} catch (err) {
  console.error(`錯誤：${err?.shortMessage || err?.message}`);
  process.exit(3);
}
