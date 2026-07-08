/**
 * 區塊鏈概念分類表
 *
 * 每個遊戲掛一個 concept，讓大廳、說明頁、統計頁共用同一套標籤與配色。
 * 這是「為什麼這個遊戲需要區塊鏈」的單一真相來源。
 */

export const CONCEPTS = {
  'commit-reveal': {
    label:  'Commit-Reveal',
    cn:     '雙盲承諾',
    short:  '雙方先鎖承諾、後揭種子，誰都無法看到對方再出手',
    desc:   '雙方各自提交種子的雜湊承諾，揭露階段才公開明文，合約驗證承諾後合併雙方種子產生隨機數。任一方都無法單獨操控結果。',
    accent: 'cyan',
    icon:   '🔒',
  },
  'pow': {
    label:  'Proof of Work',
    cn:     '工作量證明',
    short:  '反覆調整 nonce 直到雜湊值低於難度目標',
    desc:   '不斷改變 nonce 重算 keccak256，直到雜湊值符合難度條件。展示比特幣挖礦的本質——找答案很難，驗證很快。',
    accent: 'amber',
    icon:   '⛏️',
  },
  'pure-random': {
    label:  'Verifiable Randomness',
    cn:     '可驗證隨機',
    short:  '雙方種子合併出單一不可預測的結果',
    desc:   '最純粹的鏈上隨機展示：雙方種子合併雜湊後取模，得到擲骰或硬幣結果，過程完全可重算驗證。',
    accent: 'blue',
    icon:   '🎲',
  },
  'modulo-map': {
    label:  'Modulo Mapping',
    cn:     '取模映射',
    short:  '把 256-bit 隨機數映射到有限結果空間',
    desc:   '將 finalRandom 對結果數量取模（如輪盤 0-36），展示如何把大整數隨機數公平地落到離散結果上。',
    accent: 'violet',
    icon:   '🎡',
  },
  'immutable-commit': {
    label:  'Immutable Commitment',
    cn:     '承諾不可變',
    short:  '答案一旦承諾上鏈，出題者無法中途竄改',
    desc:   '出題方先把答案的雜湊承諾上鏈，玩家多次猜測，出題方無法在過程中偷改答案。展示承諾的不可竄改性。',
    accent: 'emerald',
    icon:   '🧠',
  },
  'slice-decode': {
    label:  'Hash Slicing',
    cn:     '雜湊切片',
    short:  '從單一雜湊切出多個獨立隨機欄位',
    desc:   '把一個 finalRandom 切成多個 byte 區段，各自解碼成不同符號，展示如何從一次隨機產生多重結果。',
    accent: 'pink',
    icon:   '🎰',
  },
  'variable-payout': {
    label:  'Variable Multiplier',
    cn:     '變動倍率',
    short:  '賠率由 finalRandom 經數學公式即時決定',
    desc:   '賠率不固定，由 finalRandom 代入可驗證公式計算（如 Crash 的 10000·2⁵²/(2⁵²−h)）。合約自己算倍率並自動賠付，前端可逐位元重算驗證。',
    accent: 'cyan',
    icon:   '🚀',
  },
  'distribution': {
    label:  'Random Distribution',
    cn:     '機率分布',
    short:  '多次二元隨機累加成鐘形分布',
    desc:   'Plinko 用 16 個 bit 的左右彈跳累加成二項分布，展示如何從均勻隨機位元造出中間高、兩邊低的機率分布。',
    accent: 'violet',
    icon:   '🔻',
  },
};

/** 取得 concept 資料，找不到回傳安全預設 */
export const getConcept = (key) =>
  CONCEPTS[key] ?? { label: key, cn: key, short: '', desc: '', accent: 'gray', icon: '🔗' };

/** accent 名稱 → Tailwind class 對照（避免動態 class 被 purge）*/
export const ACCENT_CLASS = {
  cyan:    { text: 'text-cyan-400',    border: 'border-cyan-700',    bg: 'bg-cyan-950/40',    dot: 'bg-cyan-400'    },
  amber:   { text: 'text-amber-400',   border: 'border-amber-700',   bg: 'bg-amber-950/40',   dot: 'bg-amber-400'   },
  blue:    { text: 'text-blue-400',    border: 'border-blue-700',    bg: 'bg-blue-950/40',    dot: 'bg-blue-400'    },
  violet:  { text: 'text-violet-400',  border: 'border-violet-700',  bg: 'bg-violet-950/40',  dot: 'bg-violet-400'  },
  emerald: { text: 'text-emerald-400', border: 'border-emerald-700', bg: 'bg-emerald-950/40', dot: 'bg-emerald-400' },
  pink:    { text: 'text-pink-400',    border: 'border-pink-700',    bg: 'bg-pink-950/40',    dot: 'bg-pink-400'    },
  gray:    { text: 'text-gray-400',    border: 'border-gray-700',    bg: 'bg-gray-900',       dot: 'bg-gray-400'    },
};
