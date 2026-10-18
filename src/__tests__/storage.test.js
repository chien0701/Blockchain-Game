import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  saveGame, getStats, MAX_INDEX,
  listPendingBets, savePendingBet, updatePendingBet, removePendingBet,
} = await import('../utils/storage');

beforeEach(() => store.clear());

describe('統計窗口（助教 T07）', () => {
  it('存 51 局後統計只有最近 50 局，並標示為窗口而非全期間', () => {
    for (let i = 0; i < 51; i++) {
      saveGame({ gameId: `g${i}`, gameType: 'dice', result: { winner: 'player' }, betAmount: '1', payout: '2', timestamp: new Date().toISOString() });
    }
    const s = getStats();
    expect(s.total).toBe(MAX_INDEX);
    expect(s.window).toBe(50);
    expect(s.truncated).toBe(true);
  });
});

describe('未完成的下注（助教 R03）', () => {
  it('以承諾為鍵保存、更新、移除；同一承諾不會變成兩筆', () => {
    savePendingBet({ commit: '0xa', seed: '0x1', salt: '0x2', status: 'signing' });
    savePendingBet({ commit: '0xa', seed: '0x1', salt: '0x2', status: 'signing' });
    expect(listPendingBets()).toHaveLength(1);

    updatePendingBet('0xa', { status: 'placed', betId: '7', revealBlock: 101 });
    expect(listPendingBets()[0]).toMatchObject({ status: 'placed', betId: '7', revealBlock: 101, seed: '0x1' });

    removePendingBet('0xa');
    expect(listPendingBets()).toHaveLength(0);
  });
});
