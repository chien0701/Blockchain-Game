/**
 * storage.js — 集中管理所有 localStorage 存取
 *
 * 設計原則：
 *   - 所有鍵名集中在此，其他檔案不直接碰 localStorage
 *   - 全部包 try/catch，避免隱私模式 / 配額爆掉時整頁崩潰
 *   - 索引（index）記錄輕量摘要，供大廳歷史與統計頁快速讀取
 *
 * ⚠️ 鍵名不可隨意更改，會影響 Verifier 讀取與歷史紀錄。
 */

const PREFIX     = 'fairchain';
const gameKey    = (id) => `${PREFIX}_game_${id}`;
const INDEX_KEY  = `${PREFIX}_index`;
const MAX_INDEX  = 50;

/* ── 低階安全包裝 ─────────────────────────────────────────────── */

function safeGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ── 遊戲紀錄 ─────────────────────────────────────────────────── */

/**
 * 儲存一局完整遊戲資料，並更新索引
 * @param {object} record 至少需含 gameId、result、timestamp
 */
export function saveGame(record) {
  const gameType = record.gameType || 'blackjack';
  safeSet(gameKey(record.gameId), { ...record, gameType });

  const index = listGames();
  const entry = {
    gameId:   record.gameId,
    gameType,
    ts:       record.timestamp,
    result:   record.result?.winner ?? null,
    onChain:  Boolean(record.chainGameId),
  };

  // 去重（同 gameId 覆蓋）後置頂
  const deduped = index.filter((g) => g.gameId !== record.gameId);
  deduped.unshift(entry);
  safeSet(INDEX_KEY, deduped.slice(0, MAX_INDEX));
}

/** 讀取一局完整資料 */
export function loadGame(gameId) {
  return safeGet(gameKey(gameId));
}

/** 讀取索引（最近遊戲摘要清單）*/
export function listGames() {
  return safeGet(INDEX_KEY) ?? [];
}

/** 相容舊呼叫名稱 */
export const recentGames = listGames;

/** 刪除一局（含索引）*/
export function removeGame(gameId) {
  try { localStorage.removeItem(gameKey(gameId)); } catch { /* ignore */ }
  safeSet(INDEX_KEY, listGames().filter((g) => g.gameId !== gameId));
}

/** 清空所有遊戲紀錄 */
export function clearAllGames() {
  const index = listGames();
  index.forEach((g) => {
    try { localStorage.removeItem(gameKey(g.gameId)); } catch { /* ignore */ }
  });
  try { localStorage.removeItem(INDEX_KEY); } catch { /* ignore */ }
}

/* ── UI 偏好（快速模式、上次押注等）──────────────────────────────── */

export function getPref(key, fallback = null) {
  return safeGet(`${PREFIX}_pref_${key}`) ?? fallback;
}

export function setPref(key, value) {
  safeSet(`${PREFIX}_pref_${key}`, value);
}

/* ── 統計聚合（供統計頁使用）────────────────────────────────────── */

/**
 * 從索引計算統計摘要
 * @returns {{ total, wins, losses, draws, winRate, onChainCount, mockCount, byGame }}
 */
export function getStats() {
  const index = listGames();
  const stats = {
    total:        index.length,
    wins:         0,
    losses:       0,
    draws:        0,
    winRate:      0,
    onChainCount: 0,
    mockCount:    0,
    byGame:       {},
  };

  for (const g of index) {
    if (g.result === 'player') stats.wins++;
    else if (g.result === 'dealer') stats.losses++;
    else if (g.result === 'draw') stats.draws++;

    if (g.onChain) stats.onChainCount++;
    else stats.mockCount++;

    stats.byGame[g.gameType] = (stats.byGame[g.gameType] || 0) + 1;
  }

  const decided = stats.wins + stats.losses;
  stats.winRate = decided > 0 ? Math.round((stats.wins / decided) * 100) : 0;

  return stats;
}
