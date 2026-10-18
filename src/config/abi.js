export const COMMIT_REVEAL_ABI = [
  'function commitGame(bytes32 playerCommit, bytes32 dealerCommit) returns (uint256 gameId)',
  'function revealGame(uint256 gameId, bytes32 playerSeed, bytes32 playerSalt, bytes32 dealerSeed, bytes32 dealerSalt)',
  'function getGame(uint256 gameId) view returns (address player, bytes32 playerCommit, bytes32 dealerCommit, bytes32 playerSeed, bytes32 playerSalt, bytes32 dealerSeed, bytes32 dealerSalt, bytes32 finalRandom, uint8 state, uint256 committedAt, uint256 revealedAt)',
  'function getState(uint256 gameId) view returns (uint8 state)',
  'function getFinalRandom(uint256 gameId) view returns (bytes32 finalRandom)',
  'event GameCommitted(uint256 indexed gameId, address indexed player, bytes32 playerCommit, bytes32 dealerCommit)',
  'event GameRevealed(uint256 indexed gameId, address indexed player, bytes32 finalRandom, bytes32 playerSeed, bytes32 dealerSeed)',
];

export const FAIRBET_V3_ABI = [
  'function placeBet(uint8 gameType, uint8 betType, uint256 param, bytes32 playerCommit) payable returns (uint256 betId)',
  'function settleBet(uint256 betId, bytes32 playerSeed, bytes32 playerSalt)',
  'function claimExpired(uint256 betId)',
  'function getBet(uint256 betId) view returns (tuple(address player, uint8 gameType, uint8 betType, uint8 state, uint64 revealBlock, uint256 param, uint256 amount, bytes32 playerCommit, bytes32 playerSeed, bytes32 playerSalt, bytes32 entropy, bytes32 finalRandom, uint256 outcome, uint256 payout))',
  'function betIdByCommit(bytes32 commit) view returns (uint256)',
  'function resolve(uint8 g, uint8 betType, uint256 param, uint256 amount, bytes32 fr) pure returns (uint256 payout, uint256 outcome)',
  'function poolBalance() view returns (uint256)',
  'function betCount() view returns (uint256)',
  'function RULES_VERSION() view returns (uint256)',
  'function REVEAL_WINDOW() view returns (uint256)',
  'event BetPlaced(uint256 indexed betId, address indexed player, uint8 gameType, uint8 betType, uint256 param, uint256 amount, bytes32 playerCommit, uint64 revealBlock)',
  'event BetSettled(uint256 indexed betId, address indexed player, bool won, uint256 outcome, bytes32 entropy, bytes32 finalRandom, uint256 payout)',
  'event BetExpired(uint256 indexed betId, uint256 forfeited)',
];

export const FAIRBET_V2_ABI = [
  'function settleBet(uint256 betId, bytes32 playerSeed, bytes32 playerSalt, bytes32 dealerSeed, bytes32 dealerSalt)',
  'function getBet(uint256 betId) view returns (tuple(address player, uint8 gameType, uint8 betType, uint256 param, uint256 amount, bytes32 playerCommit, bytes32 dealerCommit, bytes32 finalRandom, uint256 outcome, uint256 payout, uint8 state, uint256 placedAt, uint256 settledAt))',
  'function poolBalance() view returns (uint256)',
  'event BetSettled(uint256 indexed betId, address indexed player, bool won, uint256 outcome, bytes32 finalRandom, uint256 payout)',
];

export const BET_STATE_V3 = { None: 0, Placed: 1, Settled: 2, Expired: 3 };
export const BET_STATE_V2 = { None: 0, Placed: 1, Settled: 2 };
