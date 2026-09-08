# 開發指南

包含三部分：**新組員 3 天上手** ／ **修改專案前必讀** ／ **專案地圖**。

---

# 第一部分：新組員三天上手

## Day 1 — 看懂「這是什麼」（不寫程式）

**上午：跑起來**
```bash
cd C:\Users\lkj75\Documents\Blockchain-Game
npm install
npm run dev
```
開 `http://localhost:5173/Blockchain-Game/`（**結尾斜線與路徑不可省略**）。

**下午：當使用者玩一輪**（不要看程式碼）
1. 首頁往下捲，看完「運作原理」三步驟
2. 進 `/docs`，**親手操作互動 demo 一次**（這是理解 Commit-Reveal 最快的方式）
3. 進 `/lobby` 玩「骰子」與「Plinko」各一局（模擬模式即可）
4. 進 `/verifier` 用剛才的 Game ID 驗證那局
5. 進 `/lab` 跑一次 10,000 局模擬，看 RTP 收斂

**閱讀**：[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) → [ARCHITECTURE.md](./ARCHITECTURE.md)

**Day 1 結束時你應該能回答**
- 這個專題解決什麼問題？
- Commit-Reveal 的三個階段各做什麼？
- 為什麼要用區塊鏈而不是資料庫？

---

## Day 2 — 看懂「怎麼運作」（讀程式碼）

**依這個順序讀，每個檔案都不長：**

| 順序 | 檔案 | 行數 | 讀什麼 |
|---|---|---|---|
| 1 | `src/utils/crypto.js` | 50 | 只有 5 個函式，是整個系統的地基 |
| 2 | `src/games/random.js` | 51 | 各遊戲的結果計算公式 |
| 3 | `src/hooks/useBetting.js` | 197 | 流程狀態機，**第 53 行的 mode 判斷是核心** |
| 4 | `src/pages/games/Dice.jsx` | ~130 | 最單純的遊戲頁，看它怎麼組合上面三者 |
| 5 | `src/components/CommitRevealFlow.jsx` | 248 | 共用的承諾/揭露 UI |
| 6 | `contracts/contracts/FairBet.sol` | 235 | **重點看 `settleBet` 與 `_resolve`** |
| 7 | `src/utils/storage.js` | 149 | localStorage 的所有存取 |

**動手練習（不改功能）**
```bash
cd contracts
npx hardhat test        # 看 38 個測試全過
```
然後打開 `contracts/test/FairBet.test.js`，看它如何用 JS 重寫合約公式來交叉驗證。

**閱讀**：[TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md)（特別是 Crash 推導）

**Day 2 結束時你應該能回答**
- 一筆下注從按鈕到鏈上經過哪些函式？
- 合約怎麼知道玩家贏了？
- 為什麼前端還要「本地重算」一次？

---

## Day 3 — 能動手改

**練習 1（最安全）：改一個遊戲的文案**
`src/games/registry.js` → 改某款遊戲的 `tagline` → 存檔 → 首頁與大廳自動更新。

**練習 2：把一款遊戲暫時下架**
把某款的 `status` 改成 `'coming-soon'` → 大廳卡片變成鎖定的「SOON」。改回來。

**練習 3：加一個新的注金籌碼**
`src/components/CommitRevealFlow.jsx` 的 `CHIPS` 陣列加一筆 `{ v: 0.002, label:'2m', color:'bg-purple-600' }`。

**練習 4（進階）：改 Wheel 的倍率表**
⚠️ 這需要**同時改三個地方**，是理解「前後端一致性」的最佳練習：
1. `src/games/random.js` 的 `WHEEL` 陣列
2. `contracts/contracts/FairBet.sol` 的 `wheelTable()`
3. `contracts/test/FairBet.test.js` 的 `WHEEL` 常數

然後 `npx hardhat test` 必須全過。**只改一邊會導致合約與前端結果不一致。**
（此練習改完**不要**部署，改回原值即可。）

**Day 3 結束時你應該能**
- 獨立新增一款「不上鏈」的簡單遊戲頁
- 說明改動某個檔案會影響到哪些地方

---

# 第二部分：修改專案前必讀

## 🔴 絕對不可隨意修改

| 項目 | 位置 | 為什麼 |
|---|---|---|
| **localStorage 鍵名** | `storage.js:12-15` | Verifier／Stats／Lobby 都靠這些鍵讀取，改了舊紀錄全部失聯 |
| **`gameType` 數值對應** | `FairBet.sol:15` 的 enum + 各遊戲頁硬編碼的數字 | 這是前後端契約。**只能往後追加，不可插入或重排** |
| **雜湊計算方式** | `crypto.js` 的 `commitHash`／`combineSeeds` | 改了就與合約不一致，所有驗證失效、交易會 revert |
| **`base` 與 `basename`** | `vite.config.js`、`src/main.jsx` | 兩者必須同為 `/Blockchain-Game/`，否則 GitHub Pages 路由全壞 |
| **`public/404.html`** | — | GitHub Pages 的 SPA 路由修復依賴它，刪掉深層網址會 404 |
| **已部署合約的 `.sol`** | `contracts/contracts/` | 改了原始碼**不會**改變鏈上合約；會造成原始碼與 bytecode 不一致（已發生，見 TECH_DEBT #2） |

## ⚠️ 修改前要知道的連動關係

### 改「遊戲結果公式」→ 必須同步三處
```
src/games/random.js  ←→  contracts/contracts/FairBet.sol (_resolve)
                     ←→  contracts/test/FairBet.test.js (JS 等價實作)
```
改完必須 `npx hardhat test` 全過，**且要重新部署合約**才會生效。

### 改「賠率倍數」→ 還要檢查
- `FairBet.sol` 的 `maxPayout()`（資金池鎖定用）
- 遊戲頁傳給 `BetPanel` 的 `maxMultiplier`（上限保護用）
- 兩者不一致會造成「前端讓你押、合約 revert PoolInsufficient」

### 改 `registry.js` 的 `id` → 影響
- 路由 `/play/<id>`（`App.jsx` 需同步）
- 舊紀錄的 `gameType` 對不上 → 歷史顯示「未知」

### 改 `.env` → 必須
**重新 build 並重新部署**。`VITE_*` 是 build 時寫死的，不是執行期讀取。

### 改共用元件 → 影響範圍
| 元件 | 被誰使用 |
|---|---|
| `CommitRevealFlow` | 9 個頁面（8 款下注 + Mastermind） |
| `GameResult` | 9 個遊戲頁 |
| `GameLoader` | 透過 CommitRevealFlow 影響 9 頁 |
| `useBetting` | 8 款下注遊戲 |
| `crypto.js` | **幾乎全部**（hooks、Verifier、Docs） |
| `storage.js` | Stats、Lobby、Verifier、所有遊戲頁 |

## 🐛 容易產生 Bug 的地方

1. **種子在流程中途被重新產生** → 承諾對不上 → `revert BadPlayerCommit`。
   種子必須用 `useState(() => generateSeed())` 惰性初始化，重玩要用 `key` 重新掛載。
2. **整數除法順序** → Solidity 必須「先乘後除」，前端也要一致，否則截斷結果不同。
3. **忘記 `saved.current` 守衛** → React StrictMode 下 effect 會跑兩次，導致同一局存兩筆。
   各遊戲頁的 `useRef(false)` 守衛不可移除。
4. **Tailwind 動態 class** → `bg-${color}-600` 會被 purge。
   必須用 `concepts.js` 的 `ACCENT_CLASS` 查表方式。
5. **BigInt 與 Number 混用** → `crashBps` 等函式內部用 BigInt，回傳前才 `Number()`。
   直接對 BigInt 做算術會拋 TypeError。

---

# 第三部分：專案地圖

```
Blockchain-Game/
│
├── docs/                          ← 📘 本套文件
│
├── src/
│   ├── main.jsx                   進入點；BrowserRouter basename="/Blockchain-Game"
│   ├── App.jsx                    路由總表 + lazy load + WalletProvider 包裹
│   ├── index.css                  Tailwind 引入 + 自訂動畫 keyframes + 工具類
│   │
│   ├── components/
│   │   ├── Navbar.jsx             導覽列、錢包按鈕、錯誤網路橫幅
│   │   ├── SystemBar.jsx          頂部細條：網路名稱 + 即時區塊高度（每 12 秒輪詢）
│   │   ├── Footer.jsx             頁尾
│   │   ├── CommitRevealFlow.jsx   ★ 共用承諾/揭露 UI、BetPanel 注金面板、快速/詳細切換
│   │   ├── GameLoader.jsx         主題化等待動畫（依 loaderTheme 切換場景）
│   │   ├── GameResult.jsx         ResultBanner / CryptoProof / ResultActions
│   │   ├── MoneyChart.jsx         資金曲線 SVG 折線圖（無外部函式庫）
│   │   ├── StepBar.jsx            四階段進度條（承諾→揭露→遊玩→結果）
│   │   └── PlayingCard.jsx        撲克牌（僅 21 點與 Verifier 使用）
│   │
│   ├── config/
│   │   └── contractConfig.js      ★ 合約地址、ABI、CHAIN_CONFIG、IS_ON_CHAIN/IS_BETTING 旗標
│   │
│   ├── context/
│   │   └── WalletContext.jsx      ★ MetaMask 連線、getSigner、網路切換、isMock/isWrongNetwork
│   │
│   ├── games/
│   │   ├── registry.js            ★ 11 款遊戲的單一真相來源（大廳與首頁自動讀取）
│   │   ├── concepts.js            8 種區塊鏈概念的標籤與配色（查表避免 Tailwind purge）
│   │   └── random.js              ★ 結果計算純函數，必須與合約 _resolve 逐位元一致
│   │
│   ├── hooks/
│   │   ├── useBetting.js          ★ 8 款下注遊戲的流程狀態機（bet/plain/mock 三模式）
│   │   └── useCommitReveal.js     僅 Mastermind 使用；與 useBetting 高度重複（技術債）
│   │
│   ├── pages/
│   │   ├── Home.jsx               首頁；GSAP ScrollTrigger 捲動動畫、遊戲陣容
│   │   ├── Lobby.jsx              大廳；遊戲選擇器 + 個人紀錄表格
│   │   ├── Game.jsx               ⚠️ 21 點（665 行，自行實作流程，未用共用 hook）
│   │   ├── Verifier.jsx           驗證工具；本地模式 + 鏈上模式（僅查 GameCommitReveal）
│   │   ├── Docs.jsx               說明頁 + 互動 Commit-Reveal demo
│   │   ├── Stats.jsx              統計；資金曲線 + 勝率 + 各遊戲分布
│   │   ├── Lab.jsx                期望值實驗室；蒙地卡羅模擬 + 收斂曲線
│   │   └── games/
│   │       ├── Dice.jsx           骰子/猜硬幣（gameType 0/1）
│   │       ├── Roulette.jsx       輪盤（2）
│   │       ├── Slots.jsx          拉霸（3）
│   │       ├── Crash.jsx          Crash 火箭（4）
│   │       ├── Limbo.jsx          Limbo（5）
│   │       ├── Wheel.jsx          幸運轉盤（6）
│   │       ├── Plinko.jsx         Plinko 彈珠（7）
│   │       ├── Revolver.jsx       左輪（8）
│   │       ├── Mastermind.jsx     猜數字（用 GameCommitReveal，無金流）
│   │       └── Mining.jsx         挖礦 PoW（⬜ 純本機，完全不接觸合約）
│   │
│   └── utils/
│       ├── crypto.js              ★ 種子/salt 生成、承諾計算與驗證（系統地基）
│       ├── contract.js            ★ 所有鏈上讀寫封裝 + 唯讀 provider
│       ├── gameLogic.js           21 點洗牌（xorshift+Fisher-Yates）、計分、勝負
│       └── storage.js             ★ localStorage 集中管理 + 統計聚合
│
├── contracts/
│   ├── contracts/
│   │   ├── FairBet.sol            ★ 下注主合約（9 種遊戲、變動倍率、資金池、賠付）
│   │   └── GameCommitReveal.sol   純公平驗證合約（無金流）
│   ├── test/
│   │   ├── FairBet.test.js        18 個測試（含前後端交叉比對）
│   │   └── GameCommitReveal.test.js  20 個測試
│   ├── scripts/deploy.js          一次部署兩個合約 + 注資金池 + 寫 deployment.json
│   ├── hardhat.config.js          Solidity 0.8.24、optimizer、sepolia 網路、gas reporter
│   ├── ANALYSIS.md                Gas 報告 + Slither 安全分析（論文可引用）
│   └── deployment.json            部署結果（gitignored，自動產生）
│
├── public/404.html                GitHub Pages SPA 路由修復（不可刪）
├── .github/workflows/deploy.yml   ⚠️ 自動部署（存在問題，見 TECH_DEBT #1）
├── vite.config.js                 base='/Blockchain-Game/'、vendor manualChunks
├── tailwind.config.js             electric/ink 色票、動畫、發光陰影
└── CLAUDE.md                      ⚠️ 內容已過時（見 docs/README.md 對照表）
```

## 常用指令

```bash
# 前端
npm run dev            # 開發伺服器
npm run build          # 建置（會讀 .env 的 VITE_* 寫死進去）

# 合約
cd contracts
npx hardhat compile
npx hardhat test                                    # 38 個測試
npx hardhat run scripts/deploy.js --network sepolia # 部署（需 contracts/.env）
npx hardhat test                                    # 同時產出 gas-report.txt
slither .                                           # 靜態安全分析
```

## 部署流程（目前為手動）

```bash
npm run build          # 確認 .env 有合約地址
cd dist
git init && git checkout -b gh-pages
git add -A && git commit -m "deploy"
git push -f git@github.com:chien0701/Blockchain-Game.git gh-pages
```
> ⚠️ 為何是手動：見 [TECH_DEBT.md #1](./TECH_DEBT.md)。
> 部署前務必確認 build 產物中**沒有私鑰**、**有正確的合約地址**。
