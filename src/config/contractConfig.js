/**
 * 合約設定
 *
 * 部署完成後，把合約地址填入 .env：
 *   VITE_CONTRACT_ADDRESS=0x...
 *   VITE_CHAIN_ID=421614        (Arbitrum Sepolia)
 *   VITE_CHAIN_ID=31337         (本地 Hardhat)
 *
 * 若環境變數未設定，自動退回 mock 模式（純前端模擬）。
 */

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';

export const SUPPORTED_CHAIN_ID = Number(
  import.meta.env.VITE_CHAIN_ID || 11155111   // 預設 Ethereum Sepolia
);

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

/** 目前設定的網路資訊 */
export const CURRENT_CHAIN = CHAIN_CONFIG[SUPPORTED_CHAIN_ID] ?? CHAIN_CONFIG[11155111];

/** 是否已設定合約地址（用來判斷是否啟用真實上鏈模式） */
export const IS_ON_CHAIN = Boolean(CONTRACT_ADDRESS);

/** FairBet 下注合約（骰子/硬幣/輪盤/拉霸 的真實鏈上下注） */
export const FAIRBET_ADDRESS = import.meta.env.VITE_FAIRBET_ADDRESS || '';
export const IS_BETTING = Boolean(FAIRBET_ADDRESS);

// ─── ABI（只包含前端需要的函式與事件）────────────────────────────────────────
export const CONTRACT_ABI = [
  // commitGame(bytes32 playerCommit, bytes32 dealerCommit) returns (uint256 gameId)
  {
    type:    'function',
    name:    'commitGame',
    inputs:  [
      { name: 'playerCommit', type: 'bytes32' },
      { name: 'dealerCommit', type: 'bytes32' },
    ],
    outputs: [{ name: 'gameId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },

  // revealGame(uint256 gameId, bytes32 playerSeed, bytes32 playerSalt, bytes32 dealerSeed, bytes32 dealerSalt)
  {
    type:    'function',
    name:    'revealGame',
    inputs:  [
      { name: 'gameId',     type: 'uint256' },
      { name: 'playerSeed', type: 'bytes32' },
      { name: 'playerSalt', type: 'bytes32' },
      { name: 'dealerSeed', type: 'bytes32' },
      { name: 'dealerSalt', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },

  // getGame(uint256 gameId) returns (...)
  {
    type:    'function',
    name:    'getGame',
    inputs:  [{ name: 'gameId', type: 'uint256' }],
    outputs: [
      { name: 'player',       type: 'address' },
      { name: 'playerCommit', type: 'bytes32' },
      { name: 'dealerCommit', type: 'bytes32' },
      { name: 'playerSeed',   type: 'bytes32' },
      { name: 'playerSalt',   type: 'bytes32' },
      { name: 'dealerSeed',   type: 'bytes32' },
      { name: 'dealerSalt',   type: 'bytes32' },
      { name: 'finalRandom',  type: 'bytes32' },
      { name: 'state',        type: 'uint8'   },
      { name: 'committedAt',  type: 'uint256' },
      { name: 'revealedAt',   type: 'uint256' },
    ],
    stateMutability: 'view',
  },

  // getState(uint256 gameId) returns (uint8)
  {
    type:    'function',
    name:    'getState',
    inputs:  [{ name: 'gameId', type: 'uint256' }],
    outputs: [{ name: 'state',  type: 'uint8'   }],
    stateMutability: 'view',
  },

  // getFinalRandom(uint256 gameId) returns (bytes32)
  {
    type:    'function',
    name:    'getFinalRandom',
    inputs:  [{ name: 'gameId',      type: 'uint256' }],
    outputs: [{ name: 'finalRandom', type: 'bytes32' }],
    stateMutability: 'view',
  },

  // event GameCommitted(uint256 indexed gameId, address indexed player, bytes32 playerCommit, bytes32 dealerCommit)
  {
    type:      'event',
    name:      'GameCommitted',
    anonymous: false,
    inputs: [
      { name: 'gameId',       type: 'uint256', indexed: true  },
      { name: 'player',       type: 'address', indexed: true  },
      { name: 'playerCommit', type: 'bytes32', indexed: false },
      { name: 'dealerCommit', type: 'bytes32', indexed: false },
    ],
  },

  // event GameRevealed(uint256 indexed gameId, address indexed player, bytes32 finalRandom, bytes32 playerSeed, bytes32 dealerSeed)
  {
    type:      'event',
    name:      'GameRevealed',
    anonymous: false,
    inputs: [
      { name: 'gameId',      type: 'uint256', indexed: true  },
      { name: 'player',      type: 'address', indexed: true  },
      { name: 'finalRandom', type: 'bytes32', indexed: false },
      { name: 'playerSeed',  type: 'bytes32', indexed: false },
      { name: 'dealerSeed',  type: 'bytes32', indexed: false },
    ],
  },
];

// ─── FairBet ABI（鏈上下注）──────────────────────────────────────────────────
export const FAIRBET_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    inputs: [
      { name: 'gameType',     type: 'uint8'   },
      { name: 'betType',      type: 'uint8'   },
      { name: 'param',        type: 'uint256' },
      { name: 'playerCommit', type: 'bytes32' },
      { name: 'dealerCommit', type: 'bytes32' },
    ],
    outputs: [{ name: 'betId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'settleBet',
    inputs: [
      { name: 'betId',      type: 'uint256' },
      { name: 'playerSeed', type: 'bytes32' },
      { name: 'playerSalt', type: 'bytes32' },
      { name: 'dealerSeed', type: 'bytes32' },
      { name: 'dealerSalt', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'poolBalance',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBet',
    inputs: [{ name: 'betId', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'player',       type: 'address' },
        { name: 'gameType',     type: 'uint8'   },
        { name: 'betType',      type: 'uint8'   },
        { name: 'param',        type: 'uint256' },
        { name: 'amount',       type: 'uint256' },
        { name: 'playerCommit', type: 'bytes32' },
        { name: 'dealerCommit', type: 'bytes32' },
        { name: 'finalRandom',  type: 'bytes32' },
        { name: 'outcome',      type: 'uint256' },
        { name: 'payout',       type: 'uint256' },
        { name: 'state',        type: 'uint8'   },
        { name: 'placedAt',     type: 'uint256' },
        { name: 'settledAt',    type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'betCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'BetPlaced',
    anonymous: false,
    inputs: [
      { name: 'betId',    type: 'uint256', indexed: true  },
      { name: 'player',   type: 'address', indexed: true  },
      { name: 'gameType', type: 'uint8',   indexed: false },
      { name: 'betType',  type: 'uint8',   indexed: false },
      { name: 'param',    type: 'uint256', indexed: false },
      { name: 'amount',   type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetSettled',
    anonymous: false,
    inputs: [
      { name: 'betId',       type: 'uint256', indexed: true  },
      { name: 'player',      type: 'address', indexed: true  },
      { name: 'won',         type: 'bool',    indexed: false },
      { name: 'outcome',     type: 'uint256', indexed: false },
      { name: 'finalRandom', type: 'bytes32', indexed: false },
      { name: 'payout',      type: 'uint256', indexed: false },
    ],
  },
];
