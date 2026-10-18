/**
 * 合約設定
 *
 * .env：
 *   VITE_CONTRACT_ADDRESS=0x...   GameCommitReveal（21 點、猜數字的公平性展示）
 *   VITE_FAIRBET_ADDRESS=0x...    FairBet v3（下注）
 *   VITE_CHAIN_ID=11155111        Ethereum Sepolia；本地 Hardhat 為 31337
 *
 * 未設定地址時自動退回模擬模式。
 */

import { COMMIT_REVEAL_ABI, FAIRBET_V3_ABI, FAIRBET_V2_ABI } from './abi';

export const SUPPORTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111);

export const CHAIN_CONFIG = {
  11155111: {
    name:        'Ethereum Sepolia',
    rpcUrl:      'https://ethereum-sepolia-rpc.publicnode.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    currency:    'ETH',
    isTestnet:   true,
  },
  421614: {
    name:        'Arbitrum Sepolia',
    rpcUrl:      'https://sepolia-rollup.arbitrum.io/rpc',
    explorerUrl: 'https://sepolia.arbiscan.io',
    currency:    'ETH',
    isTestnet:   true,
  },
  31337: {
    name:        'Hardhat Localhost',
    rpcUrl:      'http://127.0.0.1:8545',
    explorerUrl: '',
    currency:    'ETH',
    isTestnet:   true,
  },
};

export const CURRENT_CHAIN = CHAIN_CONFIG[SUPPORTED_CHAIN_ID] ?? CHAIN_CONFIG[11155111];

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';
export const IS_ON_CHAIN = Boolean(CONTRACT_ADDRESS);
export const CONTRACT_ABI = COMMIT_REVEAL_ABI;

/**
 * v2 有已知協議缺陷（玩家可提交雙方承諾，下注前即知結果），僅保留供查驗舊局。
 * 若 .env 仍指向 v2 地址，視為未設定 v3，避免以 v3 ABI 呼叫 v2 合約。
 */
export const FAIRBET_V2 = {
  version:     2,
  label:       'v2（已停用）',
  chainId:     11155111,
  address:     '0x25A753d62A0030680C92473681e4BD52BA42A7e8',
  abi:         FAIRBET_V2_ABI,
  deployedAt:  '2026-07-08T05:40:48Z',
  protocol:    'dual-seed',
};

const envFairBet = import.meta.env.VITE_FAIRBET_ADDRESS || '';
export const FAIRBET_ADDRESS =
  envFairBet.toLowerCase() === FAIRBET_V2.address.toLowerCase() ? '' : envFairBet;
export const IS_BETTING = Boolean(FAIRBET_ADDRESS);
export const FAIRBET_ABI = FAIRBET_V3_ABI;

export const FAIRBET_V3 = {
  version:  3,
  label:    'v3（目前）',
  chainId:  SUPPORTED_CHAIN_ID,
  address:  FAIRBET_ADDRESS,
  abi:      FAIRBET_V3_ABI,
  protocol: 'future-blockhash',
};

/** 版本登錄表：一局的完整識別 = chainId + 合約地址 + betId + 規則版本 */
export const FAIRBET_DEPLOYMENTS = [FAIRBET_V3, FAIRBET_V2].filter((d) => d.address);
