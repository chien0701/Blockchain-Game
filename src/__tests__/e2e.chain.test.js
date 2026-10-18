/**
 * 端到端：前端實際使用的 contract.js / verify.js × 部署到本地 Hardhat 節點的 FairBet v3。
 * 平常 npm test 會跳過；執行方式見 docs/DEVELOPMENT_GUIDE.md（需設定 E2E_RPC 與 VITE_* 合約地址）。
 */
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  placeBetOnChain, waitForBlock, settleBetOnChain, getBetV3, getBlockHash, findBetIdByCommit, getReadOnlyProvider,
} from '../utils/contract';
import { verifyBetV3 } from '../utils/verify';
import { generateSeed, generateSalt, commitHash } from '../utils/crypto';
import { resolveBet } from '../games/random';

const RPC = process.env.E2E_RPC;

const CASES = [
  [0, 0, 0], [1, 1, 0], [2, 0, 0], [2, 6, 17], [3, 0, 0],
  [4, 0, 20000], [5, 0, 15000], [6, 0, 0], [7, 0, 0], [8, 2, 0],
];

describe.skipIf(!RPC)('E2E：前端鏈上層 × FairBet v3（本地節點）', () => {
  const provider = RPC ? new ethers.JsonRpcProvider(RPC) : null;

  async function playOne(signer, [gameType, betType, param]) {
    const seed = generateSeed(), salt = generateSalt();
    const commit = commitHash(seed, salt);
    const placed = await placeBetOnChain(signer, { gameType, betType, param, amountEth: '0.01', playerCommit: commit });
    await provider.send('evm_mine', []);
    await waitForBlock(provider, placed.revealBlock, { intervalMs: 50, timeoutMs: 5000 });
    const settled = await settleBetOnChain(signer, placed.betId, seed, salt);
    return { placed, settled, seed, commit };
  }

  it('10 種注型：下注 → 等開獎區塊 → 結算 → 第三方以唯讀 RPC 完整驗證為 verified', async () => {
    const signer = await provider.getSigner(1);
    const reader = getReadOnlyProvider(RPC);
    for (const c of CASES) {
      const { placed, settled } = await playOne(signer, c);
      const bet = await getBetV3(reader, placed.betId);
      const blockHash = await getBlockHash(reader, bet.revealBlock);
      const res = verifyBetV3(bet, blockHash);
      expect(res.verdict, `case ${c}`).toBe('verified');
      expect(bet.entropy).toBe(blockHash);
      const r = resolveBet(c[0], c[1], c[2], ethers.parseEther('0.01'), settled.finalRandom);
      expect(settled.payoutWei).toBe(r.payout.toString());
    }
  }, 60_000);

  it('重整後恢復：只憑本機保存的承諾找回 betId，續做同一局', async () => {
    const signer = await provider.getSigner(2);
    const seed = generateSeed(), salt = generateSalt();
    const commit = commitHash(seed, salt);
    const placed = await placeBetOnChain(signer, { gameType: 7, betType: 0, param: 0, amountEth: '0.01', playerCommit: commit });

    const recovered = await findBetIdByCommit(provider, commit);
    expect(recovered).toBe(placed.betId);
    const bet = await getBetV3(provider, recovered);
    expect(bet.state).toBe(1);

    await provider.send('evm_mine', []);
    await settleBetOnChain(signer, recovered, seed, salt);
    expect((await getBetV3(provider, recovered)).state).toBe(2);
    await expect(settleBetOnChain(signer, recovered, seed, salt)).rejects.toThrow();
  }, 30_000);
});
