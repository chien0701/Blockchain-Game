import { ethers } from 'ethers';

/**
 * 加密方案：Commit-Reveal with Salt
 *
 *   commitment = keccak256(abi.encodePacked(seed, salt))   ← 承諾
 *   finalRandom = keccak256(abi.encodePacked(seedP, seedD)) ← 最終隨機數
 *
 * seed 與 salt 都是 bytes32（32-byte hex string）。
 * salt 的作用：即使兩局種子相同，承諾值也不同，防 rainbow table。
 *
 * 與合約完全對應：
 *   前端 ethers.solidityPackedKeccak256(['bytes32','bytes32'], [a, b])
 *   合約 keccak256(abi.encodePacked(a, b))
 */

/** 生成 32 bytes 隨機種子（bytes32 hex 字串） */
export const generateSeed = () =>
  ethers.hexlify(ethers.randomBytes(32));

/** 生成 32 bytes 隨機 salt（與種子分離的盲化值） */
export const generateSalt = () =>
  ethers.hexlify(ethers.randomBytes(32));

/** 計算承諾值 commitment = keccak256(seed ‖ salt) */
export const commitHash = (seed, salt) =>
  ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [seed, salt]);

/** 合併兩個種子取得最終隨機數 = keccak256(seedP ‖ seedD) */
export const combineSeeds = (seedP, seedD) =>
  ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [seedP, seedD]);

/** 驗證承諾：重算 commitHash 是否等於原始承諾 */
export const verifyCommit = (seed, salt, commitment) =>
  commitHash(seed, salt) === commitment;

/** 縮短 Hash 方便展示，例如 0xabcd…ef12 */
export const shortenHash = (hash, chars = 6) => {
  if (!hash) return '';
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
};

/** 生成模擬區塊鏈交易 Hash（mock 模式用） */
export const mockTxHash = () =>
  ethers.hexlify(ethers.randomBytes(32));

/** 生成前端 Game ID */
export const newGameId = () =>
  `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
