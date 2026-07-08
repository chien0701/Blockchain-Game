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

/**
 * 確認目前 MetaMask 網路是否正確
 * @returns {{ ok: boolean, current: number, expected: number }}
 */
export async function checkNetwork(provider) {
  const { chainId } = await provider.getNetwork();
  return {
    ok:       Number(chainId) === SUPPORTED_CHAIN_ID,
    current:  Number(chainId),
    expected: SUPPORTED_CHAIN_ID,
  };
}

/**
 * 要求 MetaMask 切換到正確網路
 * 若網路不存在，自動加入 Arbitrum Sepolia
 */
export async function switchNetwork() {
  if (!window.ethereum) throw new Error('找不到 MetaMask');

  const chainHex = `0x${SUPPORTED_CHAIN_ID.toString(16)}`;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainHex }],
    });
  } catch (err) {
    // 4902 = 網路不存在，嘗試加入
    if (err.code === 4902 && CURRENT_CHAIN.rpcUrl) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId:         chainHex,
          chainName:       CURRENT_CHAIN.name,
          rpcUrls:         [CURRENT_CHAIN.rpcUrl],
          nativeCurrency:  { name: 'ETH', symbol: 'ETH', decimals: 18 },
          blockExplorerUrls: CURRENT_CHAIN.explorerUrl
            ? [CURRENT_CHAIN.explorerUrl]
            : [],
        }],
      });
    } else {
      throw err;
    }
  }
}

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
 * 查詢鏈上遊戲狀態（0=None, 1=Committed, 2=Revealed）
 */
export async function getOnChainState(provider, chainGameId) {
  const contract = getReadContract(provider);
  const state = await contract.getState(BigInt(chainGameId));
  return Number(state);
}

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

export function getFairBetUrl() {
  if (!IS_BETTING || !CURRENT_CHAIN.explorerUrl) return '';
  return `${CURRENT_CHAIN.explorerUrl}/address/${FAIRBET_ADDRESS}`;
}
