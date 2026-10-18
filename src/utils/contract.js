/**
 * contract.js — 封裝所有鏈上讀寫
 *   GameCommitReveal：21 點、猜數字的公平性展示（無金流）
 *   FairBet v3：下注、結算、讀取；v2 僅供查驗舊局
 */

import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  FAIRBET_ADDRESS,
  FAIRBET_ABI,
  FAIRBET_V2,
  IS_ON_CHAIN,
  CURRENT_CHAIN,
} from '../config/contractConfig';
import { BET_STATE_V3, BET_STATE_V2 } from '../config/abi';

// ─── 內部工具 ─────────────────────────────────────────────────────────────────

/**
 * 唯讀 RPC provider — 不需 MetaMask、不需連錢包
 * 讓任何第三方都能直接從鏈上讀資料驗證（permissionless）
 */
export function getReadOnlyProvider(rpcUrl) {
  return new ethers.JsonRpcProvider(rpcUrl || CURRENT_CHAIN.rpcUrl);
}

/** 取得合約實例（唯讀，不需要 signer） */
function getReadContract(provider) {
  if (!IS_ON_CHAIN) throw new Error('合約地址未設定，請在 .env 設定 VITE_CONTRACT_ADDRESS');
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

/** 取得合約實例（可寫，需要 signer） */
function getWriteContract(signer) {
  if (!IS_ON_CHAIN) throw new Error('合約地址未設定，請在 .env 設定 VITE_CONTRACT_ADDRESS');
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

/** 從 receipt 解析指定 event */
function parseEvent(contract, receipt, eventName) {
  const iface = contract.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === eventName) return parsed.args;
    } catch { /* 略過非本合約的 log */ }
  }
  return null;
}

// ─── 網路檢查 ─────────────────────────────────────────────────────────────────

// 註：網路檢查與切換統一由 context/WalletContext.jsx 提供
//     （isWrongNetwork、switchToSupportedNetwork），此處不再重複實作。

// ─── 核心合約呼叫 ─────────────────────────────────────────────────────────────

/**
 * Step 1 — 提交承諾至區塊鏈
 *
 * @param {ethers.Signer} signer
 * @param {string} playerCommit  keccak256(seed ‖ salt) hex string
 * @param {string} dealerCommit  keccak256(seed ‖ salt) hex string
 * @returns {{ chainGameId: string, txHash: string, blockNumber: number }}
 */
export async function commitGame(signer, playerCommit, dealerCommit) {
  const contract = getWriteContract(signer);

  // 送出交易
  const tx = await contract.commitGame(playerCommit, dealerCommit);

  // 等待上鏈（1 個區塊確認）
  const receipt = await tx.wait(1);

  // 從 GameCommitted event 取出 gameId
  const args = parseEvent(contract, receipt, 'GameCommitted');
  if (!args) throw new Error('找不到 GameCommitted event，合約可能版本不符');

  return {
    chainGameId: args.gameId.toString(),   // uint256 → string（避免 BigInt 序列化問題）
    txHash:      receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Step 2 — 揭露種子與 salt，從鏈上取回最終隨機數
 *
 * @param {ethers.Signer} signer
 * @param {string} chainGameId  commitGame() 回傳的 chainGameId
 * @param {string} playerSeed   明文玩家種子 bytes32
 * @param {string} playerSalt   明文玩家 salt bytes32
 * @param {string} dealerSeed   明文莊家種子 bytes32
 * @param {string} dealerSalt   明文莊家 salt bytes32
 * @returns {{ finalRandom: string, txHash: string, blockNumber: number }}
 */
export async function revealGame(signer, chainGameId, playerSeed, playerSalt, dealerSeed, dealerSalt) {
  const contract = getWriteContract(signer);

  const tx = await contract.revealGame(
    BigInt(chainGameId),
    playerSeed,
    playerSalt,
    dealerSeed,
    dealerSalt,
  );

  const receipt = await tx.wait(1);

  // 從 GameRevealed event 取出 finalRandom
  const args = parseEvent(contract, receipt, 'GameRevealed');
  if (!args) throw new Error('找不到 GameRevealed event');

  return {
    finalRandom: args.finalRandom,   // bytes32 hex string
    txHash:      receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

// ─── 查詢函式（唯讀）─────────────────────────────────────────────────────────

/** GameState enum 對應 */
export const GameState = { None: 0, Committed: 1, Revealed: 2 };

/**
 * 查詢完整遊戲資料（供驗證器使用）
 * @returns {{ player, playerCommit, dealerCommit, playerSeed, playerSalt, dealerSeed, dealerSalt, finalRandom, state, committedAt, revealedAt }}
 */
export async function getGameData(provider, chainGameId) {
  const contract = getReadContract(provider);
  const result = await contract.getGame(BigInt(chainGameId));

  return {
    player:       result.player,
    playerCommit: result.playerCommit,
    dealerCommit: result.dealerCommit,
    playerSeed:   result.playerSeed,
    playerSalt:   result.playerSalt,
    dealerSeed:   result.dealerSeed,
    dealerSalt:   result.dealerSalt,
    finalRandom:  result.finalRandom,
    state:        Number(result.state),
    committedAt:  Number(result.committedAt),
    revealedAt:   Number(result.revealedAt),
  };
}

/**
 * 取得 Explorer 連結
 */
export function getTxUrl(txHash) {
  if (!CURRENT_CHAIN.explorerUrl) return '';
  return `${CURRENT_CHAIN.explorerUrl}/tx/${txHash}`;
}

export function getContractUrl() {
  if (!IS_ON_CHAIN || !CURRENT_CHAIN.explorerUrl) return '';
  return `${CURRENT_CHAIN.explorerUrl}/address/${CONTRACT_ADDRESS}`;
}

// ─── FairBet v3 鏈上下注 ──────────────────────────────────────────────────────

function getFairBet(signerOrProvider, address = FAIRBET_ADDRESS) {
  if (!address) throw new Error('FairBet 地址未設定，請在 .env 設定 VITE_FAIRBET_ADDRESS');
  return new ethers.Contract(address, FAIRBET_ABI, signerOrProvider);
}

export const BetState = BET_STATE_V3;

/** 下注：只送玩家承諾。回傳 revealBlock（下注區塊 + 1） */
export async function placeBetOnChain(signer, p) {
  const fb = getFairBet(signer);
  const tx = await fb.placeBet(
    p.gameType, p.betType, BigInt(p.param ?? 0), p.playerCommit,
    { value: ethers.parseEther(p.amountEth) },
  );
  const receipt = await tx.wait(1);
  const args = parseEvent(fb, receipt, 'BetPlaced');
  if (!args) throw new Error('找不到 BetPlaced event');
  return {
    betId:       args.betId.toString(),
    revealBlock: Number(args.revealBlock),
    amountWei:   args.amount.toString(),
    txHash:      receipt.hash,
  };
}

/** 等到鏈上最新區塊 ≥ target（之後送出的交易必定落在 target 之後） */
export async function waitForBlock(provider, target, { timeoutMs = 180_000, intervalMs = 2_000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const n = await provider.getBlockNumber();
    onTick?.(n);
    if (n >= target) return n;
    if (Date.now() > deadline) throw new Error(`等待區塊 #${target} 逾時（目前 #${n}）`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** 揭露種子 → 合約以 blockhash(revealBlock) 為熵判定並自動賠付 */
export async function settleBetOnChain(signer, betId, playerSeed, playerSalt) {
  const fb = getFairBet(signer);
  const tx = await fb.settleBet(BigInt(betId), playerSeed, playerSalt);
  const receipt = await tx.wait(1);
  const args = parseEvent(fb, receipt, 'BetSettled');
  if (!args) throw new Error('找不到 BetSettled event');
  return {
    won:         args.won,
    outcome:     Number(args.outcome),
    entropy:     args.entropy,
    finalRandom: args.finalRandom,
    payoutWei:   args.payout.toString(),
    payoutEth:   ethers.formatEther(args.payout),
    txHash:      receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * 區塊的最終性：PoS 下約 2 個 epoch（約 13 分鐘）後才最終確定，之前可能因重組被替換。
 * 回傳 { finalized, finalizedBlock }；節點不支援 finalized 標籤時回傳 null。
 */
export async function getFinality(provider, blockNumber) {
  try {
    const f = await provider.getBlock('finalized');
    if (!f) return null;
    return { finalized: f.number >= blockNumber, finalizedBlock: f.number };
  } catch {
    return null;
  }
}

/** 以承諾反查 betId（重整後恢復未完成的局）；查無回傳 null */
export async function findBetIdByCommit(provider, commit, address = FAIRBET_ADDRESS) {
  const id = await getFairBet(provider, address).betIdByCommit(commit);
  return id === 0n ? null : id.toString();
}

export async function getPoolBalance(provider) {
  return ethers.formatEther(await getFairBet(provider).poolBalance());
}

/** 區塊雜湊（供驗證器獨立比對合約記錄的 entropy） */
export async function getBlockHash(provider, blockNumber) {
  const blk = await provider.getBlock(blockNumber);
  if (!blk?.hash) throw new Error(`RPC 未回傳區塊 #${blockNumber}`);
  return blk.hash;
}

/** 讀取 v3 下注局：種子、熵、結果全部在合約 storage，不需查歷史日誌 */
export async function getBetV3(provider, betId, address = FAIRBET_ADDRESS) {
  const b = await getFairBet(provider, address).getBet(BigInt(betId));
  return {
    version:      3,
    address,
    betId:        String(betId),
    player:       b.player,
    gameType:     Number(b.gameType),
    betType:      Number(b.betType),
    state:        Number(b.state),
    revealBlock:  Number(b.revealBlock),
    param:        b.param.toString(),
    amountWei:    b.amount.toString(),
    amountEth:    ethers.formatEther(b.amount),
    playerCommit: b.playerCommit,
    playerSeed:   b.playerSeed,
    playerSalt:   b.playerSalt,
    entropy:      b.entropy,
    finalRandom:  b.finalRandom,
    outcome:      Number(b.outcome),
    payoutWei:    b.payout.toString(),
    payoutEth:    ethers.formatEther(b.payout),
  };
}

// ─── FairBet v2（已停用，僅供查驗舊局）────────────────────────────────────────

async function findBlockByTimestamp(provider, ts) {
  let lo = 0, hi = await provider.getBlockNumber();
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const blk = await provider.getBlock(mid);
    if (blk.timestamp < ts) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function classifyRpcError(err) {
  const m = (err?.shortMessage || err?.message || '').toLowerCase();
  if (m.includes('range') || m.includes('limit') || m.includes('too many') || m.includes('exceed')) return 'rpc-limit';
  if (m.includes('timeout') || m.includes('network') || m.includes('fetch')) return 'rpc-unreachable';
  return 'rpc-error';
}

/**
 * v2 的種子只在 settleBet 的 calldata。以 settledAt 時間戳二分搜尋出結算區塊，
 * 只查詢該區塊附近的日誌，避免對 RPC 發出全鏈範圍查詢。
 * seedsStatus：'found' | 'not-found' | 'rpc-limit' | 'rpc-unreachable' | 'rpc-error'
 */
export async function getBetV2(provider, betId) {
  const fb = new ethers.Contract(FAIRBET_V2.address, FAIRBET_V2.abi, provider);
  const b = await fb.getBet(BigInt(betId));
  const data = {
    version:      2,
    address:      FAIRBET_V2.address,
    betId:        String(betId),
    player:       b.player,
    gameType:     Number(b.gameType),
    betType:      Number(b.betType),
    param:        b.param.toString(),
    amountWei:    b.amount.toString(),
    amountEth:    ethers.formatEther(b.amount),
    playerCommit: b.playerCommit,
    dealerCommit: b.dealerCommit,
    finalRandom:  b.finalRandom,
    outcome:      Number(b.outcome),
    payoutWei:    b.payout.toString(),
    payoutEth:    ethers.formatEther(b.payout),
    state:        Number(b.state),
    placedAt:     Number(b.placedAt),
    settledAt:    Number(b.settledAt),
    seeds:        null,
    seedsStatus:  null,
    settleTxHash: null,
  };
  if (data.state !== BET_STATE_V2.Settled || data.finalRandom === ethers.ZeroHash) return data;

  try {
    const center = await findBlockByTimestamp(provider, data.settledAt);
    let logs = [];
    for (const radius of [2, 50]) {
      logs = await fb.queryFilter(fb.filters.BetSettled(BigInt(betId)), center - radius, center + radius);
      if (logs.length) break;
    }
    if (!logs.length) { data.seedsStatus = 'not-found'; return data; }
    const txHash = logs[logs.length - 1].transactionHash;
    const tx = await provider.getTransaction(txHash);
    const decoded = fb.interface.decodeFunctionData('settleBet', tx.data);
    data.settleTxHash = txHash;
    data.seeds = { playerSeed: decoded[1], playerSalt: decoded[2], dealerSeed: decoded[3], dealerSalt: decoded[4] };
    data.seedsStatus = 'found';
  } catch (err) {
    data.seedsStatus = classifyRpcError(err);
  }
  return data;
}

export function getFairBetUrl(address = FAIRBET_ADDRESS) {
  if (!address || !CURRENT_CHAIN.explorerUrl) return '';
  return `${CURRENT_CHAIN.explorerUrl}/address/${address}`;
}
