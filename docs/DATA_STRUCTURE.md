# 資料結構

> **本專案沒有資料庫伺服器。** 資料存在三個地方：
> ① 區塊鏈（權威）② localStorage（本地快取）③ React state（執行期）
>
> 專案中**沒有 `data.js`**；遊戲清單的等價物是 `src/games/registry.js`。

---

## 一、localStorage

### 鍵名總表（定義於 `src/utils/storage.js:12-15`）

| 鍵名 | 內容 | 上限 |
|---|---|---|
| `fairchain_game_<gameId>` | 單局完整紀錄 | 無 |
| `fairchain_index` | 最近遊戲摘要陣列 | 50 筆（`MAX_INDEX`） |
| `fairchain_pref_<key>` | UI 偏好（快速模式、上次押注） | 無 |

> 🔴 **鍵名不可隨意更改**——Verifier、Stats、Lobby 都依賴這些鍵讀取。

### 1-1 單局完整紀錄

由各遊戲頁呼叫 `saveGame(record)` 寫入。**欄位依遊戲類型而異**：

```js
// 下注遊戲（Dice / Roulette / Slots / Crash / Limbo / Wheel / Plinko / Revolver）
{
  gameId:       "game_1730000000000_a1b2c",  // 前端 ID（必要，作為鍵）
  gameType:     "dice",                      // 對應 registry 的 id（必要）
  chainGameId:  "12",                        // 鏈上 betId；模擬模式為 ''
  playerSeed:   "0x…",  playerSalt: "0x…",   // 驗證必要
  dealerSeed:   "0x…",  dealerSalt: "0x…",   // 驗證必要
  playerCommit: "0x…",  dealerCommit: "0x…", // 驗證必要
  finalRandom:  "0x…",                       // 驗證必要
  result:       { winner: "player"|"dealer"|"draw", reason: "…" },  // 必要
  betAmount:    "0.0005",                    // 僅 bet 模式有值，否則 null
  payout:       "0.001",                     // 僅 bet 模式有值，否則 null
  commitTxHash: "0x…",  revealTxHash: "0x…",
  timestamp:    "2026-09-08T…Z"              // 必要
}

// 21 點額外含
  playerHand: [{suit:"♠", value:"A"}, …],  dealerHand: [...]

// 挖礦（Mining）——結構不同！
{
  gameId, gameType: "mining", blockData, nonce, hash, difficulty,
  result: { winner: "player", reason: "難度 4，nonce=12345" }, timestamp
  // ⚠️ 沒有 playerCommit / finalRandom → Verifier 有守衛（Verifier.jsx:130）
}
```

| 欄位 | 必要性 | 被誰使用 | 修改影響 |
|---|---|---|---|
| `gameId` | **必要** | 儲存鍵、Verifier 查詢、驗證連結 | 改格式會讓舊紀錄查不到 |
| `gameType` | **必要** | Stats 分類、Lobby 圖示（對照 registry） | 必須與 registry 的 `id` 一致，否則顯示「🎮 未知」 |
| `playerSeed/Salt`、`dealerSeed/Salt`、`*Commit` | **驗證必要** | Verifier 重算 | 少任一個都無法驗證該局 |
| `finalRandom` | **必要** | Verifier 重算牌面／結果 | — |
| `result.winner` | **必要** | Stats 勝率、Lobby 徽章 | 值必須是 `player`/`dealer`/`draw` |
| `betAmount`、`payout` | 選填 | 索引計算 `bet`／`net` → 資金曲線 | 缺少時視為 0，不進資金曲線 |
| `chainGameId` | 選填 | 決定索引的 `onChain` 旗標 | 有值才顯示 CHAIN 徽章 |

### 1-2 索引 `fairchain_index`

`saveGame()` 自動維護。**新的在前**，同 `gameId` 會去重覆蓋。

```js
[
  {
    gameId:   "game_…",
    gameType: "crash",
    ts:       "2026-09-08T…Z",
    result:   "player",          // 來自 record.result.winner
    onChain:  true,              // Boolean(record.chainGameId)
    bet:      0.0005,            // Number(record.betAmount) || 0
    net:      0.0005             // bet > 0 ? payout - bet : 0
  }, …
]
```

**設計理由**：Stats／Lobby 只需摘要就能渲染，不必逐一讀取 50 筆完整紀錄。

> ⚠️ `bet` 與 `net` 是後期新增的欄位。**在該功能上線前存的舊紀錄沒有這兩個欄位**，
> 讀取時為 `undefined` → `g.bet > 0` 為 false → 不計入資金曲線（不會報錯）。

### 1-3 UI 偏好

| 鍵 | 值 | 寫入位置 |
|---|---|---|
| `fairchain_pref_quickMode` | `true` / `false` | `CommitRevealFlow.jsx` |
| `fairchain_pref_bet_dice` | `{ mode, bet, amount }` | `Dice.jsx` |
| `fairchain_pref_bet_roulette` | `{ bet, num, amount }` | `Roulette.jsx` |
| `fairchain_pref_bet_crash` | `{ target, amount }` | `Crash.jsx` |
| `fairchain_pref_bet_limbo` | `{ target, amount }` | `Limbo.jsx` |
| `fairchain_pref_bet_wheel` / `_slots` / `_plinko` | `{ amount }` | 各遊戲頁 |
| `fairchain_pref_bet_revolver` | `{ bullets, amount }` | `Revolver.jsx` |

---

## 二、鏈上資料結構

### 2-1 FairBet 的 `Bet` struct（`FairBet.sol:18-32`）

```solidity
struct Bet {
    address  player;        // 下注者，只有他能 settle
    uint8    gameType;      // 0=Dice 1=Coin 2=Roulette 3=Slots 4=Crash
                            // 5=Limbo 6=Wheel 7=Plinko 8=Revolver
    uint8    betType;       // 注型；Revolver 時為子彈數(1-5)
    uint256  param;         // Crash/Limbo=目標倍率(bps)、Roulette=號碼、其餘=0
    uint256  amount;        // 注金（wei）
    bytes32  playerCommit;  // keccak256(seed‖salt)
    bytes32  dealerCommit;
    bytes32  finalRandom;   // 結算後填入
    uint256  outcome;       // 展示用（骰子點數／崩盤 bps／彈珠槽位…）
    uint256  payout;        // 實際賠付（wei）
    BetState state;         // 0=None 1=Placed 2=Settled
    uint256  placedAt;      // 用於 1 小時超時判斷
    uint256  settledAt;
}
```

**`gameType` 的數值順序是合約與前端的契約**——前端遊戲頁硬編碼這些數字
（如 `Crash.jsx` 傳 `gameType: 4`）。**新增遊戲只能往後追加，不可插入或重排**，
否則所有既有前端呼叫都會對應到錯誤的遊戲。

### 2-2 GameCommitReveal 的 `Game` struct

```solidity
struct Game {
    address player;
    bytes32 playerCommit; bytes32 dealerCommit;
    bytes32 playerSeed;   bytes32 playerSalt;
    bytes32 dealerSeed;   bytes32 dealerSalt;
    bytes32 finalRandom;
    GameState state;      // None / Committed / Revealed
    uint256 committedAt;  uint256 revealedAt;
}
```

### 2-3 事件（第三方索引與驗證的入口）

```solidity
event BetPlaced (uint256 indexed betId, address indexed player, uint8 gameType, uint8 betType, uint256 param, uint256 amount);
event BetSettled(uint256 indexed betId, address indexed player, bool won, uint256 outcome, bytes32 finalRandom, uint256 payout);
event BetExpired(uint256 indexed betId, uint256 forfeited);
event PoolFunded(address indexed from, uint256 amount);
```
前端靠 `contract.js:parseEvent()` 從 receipt 解析這些事件取得 `betId` 與結算結果。

---

## 三、前端資料結構

### 3-1 遊戲註冊表 `src/games/registry.js`

```js
{
  id:         'crash',            // 唯一鍵；同時是路由 /play/<id> 與 storage 的 gameType
  name:       'Crash 火箭',        // 顯示名稱
  en:         'Crash',            // 英文名（目前 UI 已不顯示，僅保留於資料）
  icon:       '🚀',
  tagline:    '選目標倍率…',
  concept:    'variable-payout',  // 必須對應 concepts.js 的鍵
  difficulty: 3,                  // 1-3 → difficultyStars()
  status:     'live',             // 'live' 可進入；'coming-soon' 顯示但鎖定
  minPlayers: 1,                  // 目前未被任何 UI 使用（保留欄位）
}
```

| 修改 | 影響 |
|---|---|
| 改 `id` | 路由失效、舊紀錄的 `gameType` 對不上（歷史顯示「未知」） |
| 改 `status` 為 `coming-soon` | 首頁與大廳自動變成鎖定卡片，**不需改其他檔案** |
| 改 `concept` | 必須是 `concepts.js` 既有的鍵，否則落到 `getConcept` 的安全預設 |
| 新增一筆 | 首頁陣容與大廳選擇器**自動出現**；但仍需新增頁面與 `App.jsx` 路由 |

### 3-2 概念表 `src/games/concepts.js`

8 個鍵：`commit-reveal`、`pow`、`pure-random`、`modulo-map`、
`immutable-commit`、`slice-decode`、`variable-payout`、`distribution`。

```js
{ label, cn, short, desc, accent, icon }
```
`accent` 必須是 `ACCENT_CLASS` 中已定義的色名（cyan/amber/blue/violet/emerald/pink/gray）。
**不可用動態拼接的 Tailwind class**，否則會被 purge 掉——這是刻意用查表的原因。

### 3-3 `useBetting` 回傳的執行期狀態

```js
{
  playerSeed, playerSalt, playerCommit,   // 掛載時產生，全程不變
  dealerSeed, dealerSalt, dealerCommit,
  phase,        // 'commit' | 'reveal' | 'ready'
  loading, loadMsg, loadUrl, error, dismissError,
  chainGameId, commitTxHash, revealTxHash, finalRandom,
  settlement,   // { won, outcome, payoutEth }  僅 bet 模式
  walletEth, poolEth, refreshBalances,
  onChain, isBetting, isMock, isWrongNetwork,
  commit, reveal, quickPlay,
}
```

> 🔴 **種子與 salt 使用 `useState` 惰性初始化，全程不可重新產生**。
> 若中途改變，承諾就對不上，合約會 `revert BadPlayerCommit`。
> 「再玩一局」是靠 `key={round}` 重新掛載元件取得全新種子。

### 3-4 統計聚合 `getStats()` 回傳

```js
{
  total, wins, losses, draws, winRate,     // winRate = wins/(wins+losses)，四捨五入
  onChainCount, mockCount,
  byGame: { dice: 3, crash: 5, … },
  totalWagered, totalNet, betCount,        // 只計 bet > 0 的局
}
```

---

## 四、環境變數

| 變數 | 位置 | 用途 | 缺少時 |
|---|---|---|---|
| `VITE_CONTRACT_ADDRESS` | 根目錄 `.env` | GameCommitReveal 地址 | `IS_ON_CHAIN=false` → 退回 mock |
| `VITE_FAIRBET_ADDRESS` | 根目錄 `.env` | FairBet 地址 | `IS_BETTING=false` → 無法下注 |
| `VITE_CHAIN_ID` | 根目錄 `.env` | 目標鏈（11155111） | 預設 11155111 |
| `DEPLOYER_PRIVATE_KEY` | `contracts/.env` | 部署者私鑰 | 無法部署 |
| `SEPOLIA_RPC_URL` | `contracts/.env` | RPC 端點 | 用公開預設值 |
| `ETHERSCAN_API_KEY` | `contracts/.env` | 原始碼驗證 | 無法 `hardhat verify` |

> 🔴 `VITE_*` 是 **build 時**寫死進 JS 的，不是執行期讀取。
> 改了 `.env` 必須**重新 build 並重新部署**才會生效。
> 🔴 兩個 `.env` 都在 `.gitignore` 中，**絕不可提交**。

---

## 五、目前已部署的合約（`contracts/deployment.json`）

```json
{
  "network": "sepolia",
  "chainId": "11155111",
  "commitRevealAddress": "0xe9C2a98699FEd3653774783160e65556f7B6aDB3",
  "fairBetAddress":      "0x25A753d62A0030680C92473681e4BD52BA42A7e8",
  "poolFund": "0.05",
  "deployer": "0xF1a6AC55133A582E691F5123E389e6fc52904C76",
  "deployedAt": "2026-07-08T05:40:48.315Z"
}
```
此檔在 `.gitignore` 中（部署時自動產生）。
