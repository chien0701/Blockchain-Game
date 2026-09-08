import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  intFromHex, rollDie, mapRange, crashBps, wheelSeg, WHEEL,
  plinkoBucket, PLINKO, revolverChamber, outcomeOf, bpsToX,
} from '../games/random';

const randFr = () => ethers.hexlify(ethers.randomBytes(32));

/* 合約 FairBet._resolve 的等價實作（以 BigInt 模擬 Solidity 語意）。
   兩份實作必須永遠一致——這是「前後端逐位元一致」的回歸測試。 */
const E52 = 1n << 52n;
const CAP = 1_000_000n;
const solUint32OfFirst4 = (fr) => BigInt('0x' + fr.slice(2, 10));
const solCrashBps = (fr) => {
  const h = BigInt(fr) % E52;
  const m = (10000n * E52) / (E52 - h);
  return Number(m > CAP ? CAP : m);
};
const solResolveOutcome = (g, fr) => {
  switch (g) {
    case 0: return Number(solUint32OfFirst4(fr) % 6n) + 1;
    case 1: return Number(solUint32OfFirst4(fr) % 2n);
    case 2: return Number(solUint32OfFirst4(fr) % 37n);
    case 3: {
      const r = [0, 1, 2].map((i) => Number(BigInt('0x' + fr.slice(2 + i * 8, 10 + i * 8)) % 6n));
      return r[0] * 100 + r[1] * 10 + r[2];
    }
    case 4:
    case 5: return solCrashBps(fr);
    case 6: return Number(BigInt(fr) % 8n);
    case 7: {
      let bits = BigInt(fr) & 0xFFFFn, c = 0;
      for (let i = 0n; i < 16n; i++) if ((bits >> i) & 1n) c++;
      return c;
    }
    case 8: return Number(BigInt(fr) % 6n);
    default: return null;
  }
};

describe('hex 解析工具', () => {
  it('intFromHex 取指定 byte 區段', () => {
    const fr = '0x' + 'ff'.repeat(32);
    expect(intFromHex(fr, 0, 1)).toBe(255);
    expect(intFromHex(fr, 0, 4)).toBe(0xffffffff);
  });

  it('mapRange 結果永遠落在 [0, range)', () => {
    for (let i = 0; i < 200; i++) {
      const v = mapRange(randFr(), 0, 4, 37);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(37);
    }
  });

  it('bpsToX 轉換正確', () => {
    expect(bpsToX(20000)).toBe('2.00');
    expect(bpsToX(160000)).toBe('16.00');
  });
});

describe('各遊戲結果值域', () => {
  it('rollDie 落在 1-6', () => {
    for (let i = 0; i < 300; i++) {
      const v = rollDie(randFr());
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('wheelSeg 落在 0-7 且倍率表有 8 段', () => {
    expect(WHEEL).toHaveLength(8);
    for (let i = 0; i < 200; i++) {
      const s = wheelSeg(randFr());
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(8);
    }
  });

  it('plinkoBucket 落在 0-16 且倍率表有 17 槽', () => {
    expect(PLINKO).toHaveLength(17);
    for (let i = 0; i < 300; i++) {
      const b = plinkoBucket(randFr());
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(16);
    }
  });

  it('revolverChamber 落在 0-5', () => {
    for (let i = 0; i < 200; i++) {
      const c = revolverChamber(randFr());
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(6);
    }
  });

  it('crashBps 下限為 10000（1.00×）、上限為 1000000（100×）', () => {
    for (let i = 0; i < 300; i++) {
      const m = crashBps(randFr());
      expect(m).toBeGreaterThanOrEqual(10000);
      expect(m).toBeLessThanOrEqual(1_000_000);
    }
  });
});

describe('crashBps 邊界與數學性質', () => {
  it('h = 0 時恰為 10000 bps', () => {
    expect(crashBps('0x' + '00'.repeat(32))).toBe(10000);
  });

  it('h 極大時封頂於 1000000 bps', () => {
    expect(crashBps('0x' + 'ff'.repeat(32))).toBe(1_000_000);
  });

  it('P(crash ≥ 2×) 約為 1/2（大數法則，容許 ±3%）', () => {
    const N = 20000;
    let hit = 0;
    for (let i = 0; i < N; i++) if (crashBps(randFr()) >= 20000) hit++;
    expect(Math.abs(hit / N - 0.5)).toBeLessThan(0.03);
  });

  it('P(crash ≥ 10×) 約為 1/10（容許 ±2%）', () => {
    const N = 20000;
    let hit = 0;
    for (let i = 0; i < N; i++) if (crashBps(randFr()) >= 100000) hit++;
    expect(Math.abs(hit / N - 0.1)).toBeLessThan(0.02);
  });
});

describe('前端與合約邏輯一致性（回歸測試）', () => {
  it('outcomeOf 與 Solidity 等價實作在 9 種遊戲、各 60 組隨機值下完全一致', () => {
    for (let g = 0; g <= 8; g++) {
      for (let i = 0; i < 60; i++) {
        const fr = randFr();
        expect(outcomeOf(g, fr)).toBe(solResolveOutcome(g, fr));
      }
    }
  });

  it('未知 gameType 回傳 null', () => {
    expect(outcomeOf(99, randFr())).toBeNull();
  });
});
