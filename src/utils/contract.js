/**
 * contract.js — 封裝所有與 GameCommitReveal 合約的互動
 *
 * 使用方式：
 *   import { commitGame, revealGame, getGameData } from './contract';
 *
 * 所有函式都有 IS_ON_CHAIN 保護：
 *   - 若未設定 VITE_CONTRACT_ADDRESS，自動拋出明確錯誤
 *   - Game.jsx 的呼叫者決定是否用 mock fallback
 */

import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  FAIRBET_ADDRESS,
  FAIRBET_ABI,
  IS_ON_CHAIN,
  IS_BETTING,
  SUPPORTED_CHAIN_ID,
  CURRENT_CHAIN,
} from '../config/contractConfig';

// ─── 內部工具 ─────────────────────────────────────────────────────────────────

/**
 * 唯讀 RPC provider — 不需 MetaMask、不需連錢包
 * 讓任何第三方都能直接從鏈上讀資料驗證（permissionless）
 */
export function getReadOnlyProvider() {
  return new ethers.JsonRpcProvider(CURRENT_CHAIN.rpcUrl);
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

// ─── FairBet 鏈上下注 ─────────────────────────────────────────────────────────

function getFairBet(signerOrProvider) {
  if (!IS_BETTING) throw new Error('FairBet 地址未設定，請在 .env 設定 VITE_FAIRBET_ADDRESS');
  return new ethers.Contract(FAIRBET_ADDRESS, FAIRBET_ABI, signerOrProvider);
}

/**
 * 下注 + 提交承諾（一筆 payable 交易）
 * @param {object} p { gameType, betType, betValue, amountEth, playerCommit, dealerCommit }
 * @returns {{ betId: string, txHash: string }}
 */
export async function placeBetOnChain(signer, p) {
  const fb = getFairBet(signer);
  const tx = await fb.placeBet(
    p.gameType, p.betType, BigInt(p.param ?? 0),
    p.playerCommit, p.dealerCommit,
    { value: ethers.parseEther(p.amountEth) },
  );
  const receipt = await tx.wait(1);
  const args = parseEvent(fb, receipt, 'BetPlaced');
  if (!args) throw new Error('找不到 BetPlaced event');
  return { betId: args.betId.toString(), txHash: receipt.hash };
}

/**
 * 揭露種子 → 合約判定輸贏並自動賠付
 * @returns {{ finalRandom, won, outcome, payoutEth, txHash }}
 */
export async function settleBetOnChain(signer, betId, playerSeed, playerSalt, dealerSeed, dealerSalt) {
  const fb = getFairBet(signer);
  const tx = await fb.settleBet(BigInt(betId), playerSeed, playerSalt, dealerSeed, dealerSalt);
  const receipt = await tx.wait(1);
  const args = parseEvent(fb, receipt, 'BetSettled');
  if (!args) throw new Error('找不到 BetSettled event');
  return {
    finalRandom: args.finalRandom,
    won:         args.won,
    outcome:     Number(args.outcome),
    payoutWei:   args.payout,
    payoutEth:   ethers.formatEther(args.payout),
    txHash:      receipt.hash,
  };
}

/** 查詢莊家資金池餘額（ETH 字串） */
export async function getPoolBalance(provider) {
  const fb = getFairBet(provider);
  return ethers.formatEther(await fb.poolBalance());
}

/** FairBet 的 BetState enum */
export const BetState = { None: 0, Placed: 1, Settled: 2 };

/**
 * 查詢一筆下注的鏈上資料（供第三方驗證）
 *
 * 注意：FairBet 的 Bet struct 不儲存種子與 salt，它們只存在於 settleBet
 * 的交易 calldata 中。因此本函式會嘗試從結算交易反解出種子：
 *   1. getBet() 取得承諾、finalRandom、outcome、payout
 *   2. 以 BetSettled 事件定位結算交易
 *   3. 解碼該交易 calldata 取回 seed / salt
 * 若步驟 2-3 因 RPC 限制失敗，仍回傳步驟 1 的資料（降級為部分驗證）。
 */
export async function getBetData(provider, betId) {
  const fb = getFairBet(provider);
  const b  = await fb.getBet(BigInt(betId));

  const data = {
    player:       b.player,
    gameType:     Number(b.gameType),
    betType:      Number(b.betType),
    param:        b.param.toString(),
    amountEth:    ethers.formatEther(b.amount),
    playerCommit: b.playerCommit,
    dealerCommit: b.dealerCommit,
    finalRandom:  b.finalRandom,
    outcome:      Number(b.outcome),
    payoutEth:    ethers.formatEther(b.payout),
    state:        Number(b.state),
    placedAt:     Number(b.placedAt),
    settledAt:    Number(b.settledAt),
    seeds:        null,
    settleTxHash: null,
  };

  if (data.state !== BetState.Settled) return data;

  try {
    const logs = await fb.queryFilter(fb.filters.BetSettled(BigInt(betId)));
    if (logs.length > 0) {
      const txHash = logs[logs.length - 1].transactionHash;
      const tx = await provider.getTransaction(txHash);
      const decoded = fb.interface.decodeFunctionData('settleBet', tx.data);
      data.settleTxHash = txHash;
      data.seeds = {
        playerSeed: decoded[1],
        playerSalt: decoded[2],
        dealerSeed: decoded[3],
        dealerSalt: decoded[4],
      };
    }
  } catch {
    // RPC 可能限制歷史日誌查詢範圍；降級為部分驗證
  }

  return data;
}

export function getFairBetUrl() {
  if (!IS_BETTING || !CURRENT_CHAIN.explorerUrl) return '';
  return `${CURRENT_CHAIN.explorerUrl}/address/${FAIRBET_ADDRESS}`;
}
