import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  generateSeed, generateSalt, commitHash, combineSeeds,
  verifyCommit, shortenHash, newGameId,
} from '../utils/crypto';

describe('種子與 salt 產生', () => {
  it('皆為 32-byte hex 字串', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSeed()).toMatch(/^0x[0-9a-f]{64}$/);
      expect(generateSalt()).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('100 次產生不重複（隨機源有效）', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateSeed()));
    expect(set.size).toBe(100);
  });
});

describe('承諾計算', () => {
  it('與 Solidity keccak256(abi.encodePacked(a,b)) 等價', () => {
    for (let i = 0; i < 30; i++) {
      const seed = generateSeed(), salt = generateSalt();
      const expected = ethers.keccak256(ethers.concat([seed, salt]));
      expect(commitHash(seed, salt)).toBe(expected);
    }
  });

  it('確定性：相同輸入永遠相同輸出', () => {
    const seed = generateSeed(), salt = generateSalt();
    expect(commitHash(seed, salt)).toBe(commitHash(seed, salt));
  });

  it('salt 防護：相同種子配不同 salt 產生不同承諾', () => {
    const seed = generateSeed();
    expect(commitHash(seed, generateSalt())).not.toBe(commitHash(seed, generateSalt()));
  });

  it('雪崩效應：種子差一位元，承諾完全不同', () => {
    const a = '0x' + '00'.repeat(32);
    const b = '0x' + '00'.repeat(31) + '01';
    const salt = generateSalt();
    expect(commitHash(a, salt)).not.toBe(commitHash(b, salt));
  });
});

describe('verifyCommit', () => {
  it('正確的 seed + salt 通過驗證', () => {
    const seed = generateSeed(), salt = generateSalt();
    expect(verifyCommit(seed, salt, commitHash(seed, salt))).toBe(true);
  });

  it('錯誤的 salt 無法通過', () => {
    const seed = generateSeed(), salt = generateSalt();
    expect(verifyCommit(seed, generateSalt(), commitHash(seed, salt))).toBe(false);
  });

  it('錯誤的 seed 無法通過', () => {
    const seed = generateSeed(), salt = generateSalt();
    expect(verifyCommit(generateSeed(), salt, commitHash(seed, salt))).toBe(false);
  });
});

describe('combineSeeds', () => {
  it('與 Solidity keccak256(abi.encodePacked(seedP,seedD)) 等價', () => {
    for (let i = 0; i < 30; i++) {
      const p = generateSeed(), d = generateSeed();
      expect(combineSeeds(p, d)).toBe(ethers.keccak256(ethers.concat([p, d])));
    }
  });

  it('順序不可交換（雙方角色不對稱）', () => {
    const p = generateSeed(), d = generateSeed();
    expect(combineSeeds(p, d)).not.toBe(combineSeeds(d, p));
  });

  it('任一方改變種子即改變結果（無法單方預測操控）', () => {
    const p = generateSeed(), d = generateSeed();
    expect(combineSeeds(p, d)).not.toBe(combineSeeds(p, generateSeed()));
    expect(combineSeeds(p, d)).not.toBe(combineSeeds(generateSeed(), d));
  });
});

describe('工具函式', () => {
  it('shortenHash 縮短格式正確，空值回空字串', () => {
    const h = '0x' + 'ab'.repeat(32);
    expect(shortenHash(h, 6)).toBe(`${h.slice(0, 8)}…${h.slice(-6)}`);
    expect(shortenHash('')).toBe('');
    expect(shortenHash(null)).toBe('');
  });

  it('newGameId 格式正確且不重複', () => {
    const ids = Array.from({ length: 50 }, () => newGameId());
    ids.forEach((id) => expect(id).toMatch(/^game_\d+_[a-z0-9]+$/));
    expect(new Set(ids).size).toBe(50);
  });
});
