import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { createDeck, randomStream, uniformInt, mastermindSecret, replayBlackjack, calcScore } from '../utils/gameLogic';

const rand32 = () => ethers.hexlify(ethers.randomBytes(32));
const key = (c) => c.suit + c.value;

describe('牌堆亂數映射 v2（助教 R05）', () => {
  it('同一亂數得到同一副牌，且是 52 張不重複的排列', () => {
    const fr = rand32();
    const a = createDeck(fr), b = createDeck(fr);
    expect(a.map(key)).toEqual(b.map(key));
    expect(new Set(a.map(key)).size).toBe(52);
  });

  it('只差最後一個 byte 的兩個亂數會得到不同牌堆（v1 只看前 8 bytes，無法區分）', () => {
    const base = '0x' + '11'.repeat(31);
    const a = createDeck(base + '00'), b = createDeck(base + '01');
    expect(a.map(key)).not.toEqual(b.map(key));
    expect(createDeck(base + '00', 1).map(key)).toEqual(createDeck(base + '01', 1).map(key));
  });

  it('第一張牌的分布大致均勻（5,200 副，每張期望 100；卡方 df=51，α=0.001 臨界值 87.97）', () => {
    const counts = new Map();
    for (let i = 0; i < 5200; i++) { const k = key(createDeck(rand32())[0]); counts.set(k, (counts.get(k) || 0) + 1); }
    let chi = 0;
    for (const c of counts.values()) chi += (c - 100) ** 2 / 100;
    chi += (52 - counts.size) * 100;
    expect(chi).toBeLessThan(87.97);
  });

  it('uniformInt 以拒絕採樣丟掉餘數區間，輸出不偏', () => {
    const vals = [0xFFFFFFFF, 0xFFFFFFFE, 7];
    const next = () => vals.shift();
    expect(uniformInt(next, 6)).toBe(1);
  });

  it('randomStream 每次呼叫取下一個 32-bit，耗盡 8 個後換下一個雜湊', () => {
    const s = randomStream(rand32());
    const xs = Array.from({ length: 20 }, () => s());
    expect(xs.every((x) => Number.isInteger(x) && x >= 0 && x < 2 ** 32)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(15);
  });
});

describe('猜數字密碼', () => {
  it('v1 單 byte % 6 有偏差：256 = 6×42 + 4，0–3 號顏色 43/256，4、5 號 42/256', () => {
    const counts = Array(6).fill(0);
    for (let b = 0; b < 256; b++) counts[b % 6]++;
    expect(counts).toEqual([43, 43, 43, 43, 42, 42]);
  });
  it('v2 由同一種子還原出同一組密碼，值域 0–5', () => {
    const s = rand32();
    const a = mastermindSecret(s), b = mastermindSecret(s);
    expect(a).toEqual(b);
    expect(a.every((x) => x >= 0 && x < 6)).toBe(true);
  });
});

describe('21 點完整重播', () => {
  it('玩家爆牌時莊家不補牌；未爆牌時莊家補到 17 以上', () => {
    for (let i = 0; i < 200; i++) {
      const fr = rand32();
      const r = replayBlackjack(fr, i % 3);
      if (calcScore(r.playerHand) > 21) {
        expect(r.dealerHand.length).toBe(2);
        expect(r.result.winner).toBe('dealer');
      } else {
        expect(calcScore(r.dealerHand)).toBeGreaterThanOrEqual(17);
      }
    }
  });
});
