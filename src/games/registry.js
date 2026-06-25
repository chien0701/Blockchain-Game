/**
 * 遊戲註冊表 — 所有可遊玩項目的單一真相來源
 *
 * 大廳、說明頁、統計頁、路由都從這裡讀取。
 * 新增遊戲：在 GAMES 加一筆，status 改 'live' 並補上對應頁面即可。
 *
 * status:
 *   'live'        — 已完成，可遊玩
 *   'coming-soon' — 規劃中，大廳顯示但不可進入
 */

export const GAMES = [
  {
    id:        'blackjack',
    name:      '21 點',
    en:        'Blackjack',
    icon:      '🃏',
    tagline:   '雙盲發牌的經典博弈，莊家無法偷看你的牌',
    concept:   'commit-reveal',
    difficulty: 2,
    status:    'live',
    minPlayers: 1,
  },
  {
    id:        'mining',
    name:      '挖礦模擬',
    en:        'Proof of Work',
    icon:      '⛏️',
    tagline:   '手動調整 nonce，找出低於難度目標的雜湊值',
    concept:   'pow',
    difficulty: 2,
    status:    'live',
    minPlayers: 1,
  },
  {
    id:        'dice',
    name:      '骰子 / 猜硬幣',
    en:        'Dice & Coin',
    icon:      '🎲',
    tagline:   '雙方種子合併開獎，最純粹的可驗證隨機',
    concept:   'pure-random',
    difficulty: 1,
    status:    'live',
    minPlayers: 1,
  },
  {
    id:        'roulette',
    name:      '輪盤',
    en:        'Roulette',
    icon:      '🎡',
    tagline:   '押號碼或紅黑，落點由鏈上隨機數取模決定',
    concept:   'modulo-map',
    difficulty: 2,
    status:    'live',
    minPlayers: 1,
  },
  {
    id:        'mastermind',
    name:      '猜數字',
    en:        'Mastermind',
    icon:      '🧠',
    tagline:   '莊家承諾密碼上鏈，過程中無法偷改答案',
    concept:   'immutable-commit',
    difficulty: 3,
    status:    'live',
    minPlayers: 1,
  },
  {
    id:        'slots',
    name:      '拉霸',
    en:        'Slot Machine',
    icon:      '🎰',
    tagline:   '一個隨機數切成三軸符號，結果無法事後調整',
    concept:   'slice-decode',
    difficulty: 2,
    status:    'live',
    minPlayers: 1,
  },
];

/** 依 id 取得遊戲 */
export const getGame = (id) => GAMES.find((g) => g.id === id) ?? null;

/** 已上線的遊戲 */
export const liveGames = () => GAMES.filter((g) => g.status === 'live');

/** 規劃中的遊戲 */
export const upcomingGames = () => GAMES.filter((g) => g.status !== 'live');

/** 難度數字 → 星級字串 */
export const difficultyStars = (n) => '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

/** 預設遊戲（大廳「快速開始」用）*/
export const DEFAULT_GAME = 'blackjack';
