# Blockchain-Game（FairChain）

> 完整技術文件在 **[`docs/`](./docs/)**。本檔僅記錄開發 Claude Code 時需要的重點。
> 若本檔與程式碼不一致，**以程式碼為準**。

## 專案概述

區塊鏈公平遊戲驗證系統。核心是 **Commit-Reveal + Salt 雙盲協議**，
讓任何第三方都能驗證遊戲結果未被竄改，且由智能合約**自動判定輸贏與賠付**。

目前有 **11 款遊戲**，其中 **9 款可用測試幣真實下注**（合約結算），
已部署於 **Ethereum Sepolia**。

**核心架構原則：所有遊戲結果必須是 `finalRandom` 的純函數。**
唯有如此，合約才能獨立重算判定、第三方才能驗證。
這條原則也決定了哪些遊戲能上鏈結算（21 點因有玩家中途決策，只能做公平驗證）。

## 架構

```
src/
├── components/       Navbar, SystemBar, Footer, CommitRevealFlow(共用流程UI),
│                     GameLoader(主題動畫), GameResult, MoneyChart, StepBar, PlayingCard
├── config/
│   └── contractConfig.js   合約地址、ABI、CHAIN_CONFIG、IS_ON_CHAIN/IS_BETTING
├── context/
│   └── WalletContext.jsx   MetaMask 連線、getSigner、網路切換
├── games/
│   ├── registry.js         11 款遊戲單一真相來源
│   ├── concepts.js         8 種區塊鏈概念標籤與配色
│   └── random.js           ★ 結果計算純函數（須與合約 _resolve 逐位元一致）
├── hooks/
│   ├── useBetting.js       ★ 8 款下注遊戲的流程狀態機（bet/plain/mock 三模式）
│   └── useCommitReveal.js  僅 Mastermind 使用
├── pages/            Home, Lobby, Game(21點), Verifier, Docs, Stats, Lab
│   └── games/        Dice, Roulette, Slots, Crash, Limbo, Wheel, Plinko,
│                     Revolver, Mastermind, Mining
├── utils/
│   ├── crypto.js     ★ 種子/salt、承諾計算與驗證
│   ├── contract.js   ★ 鏈上讀寫封裝、唯讀 provider、getBetData
│   ├── gameLogic.js  21點洗牌(xorshift+Fisher-Yates)、計分、勝負
│   └── storage.js    localStorage 集中管理 + 統計聚合
└── __tests__/        Vitest 前端測試（28 個）

contracts/
├── contracts/FairBet.sol           ★ 9 種下注遊戲、變動倍率、資金池、自動賠付
├── contracts/GameCommitReveal.sol  純公平驗證（無金流）
├── test/                           Hardhat 測試（38 個）
└── ANALYSIS.md                     Gas 報告 + Slither 安全分析
```

## 技術棧

- 前端：React 18 + Vite 5 + TailwindCSS + React Router v6 + GSAP
- 區塊鏈：ethers.js v6、Solidity 0.8.24、Hardhat
- 測試：Vitest（前端 28）+ Hardhat/Chai（合約 38）
- 部署鏈：**Ethereum Sepolia（chainId 11155111）**
- 網站：GitHub Pages（gh-pages 分支）

## 核心邏輯

### Commit-Reveal with Salt

1. **Commit**：雙方各產生 seed 與 salt，提交 `keccak256(seed‖salt)` 上鏈
2. **Reveal**：公開明文，合約驗證 `keccak256(seed‖salt) == commit`
3. **Result**：`finalRandom = keccak256(seedP‖seedD)`，合約用純函數判定結果
4. **Verify**：第三方用唯讀 RPC 讀鏈上資料重算比對

前端 `ethers.solidityPackedKeccak256(['bytes32','bytes32'],[a,b])`
≡ 合約 `keccak256(abi.encodePacked(a,b))`——**這個等價關係是整個系統的地基**。

### 三種執行模式（`useBetting.js` 內判斷）

| 模式 | 條件 | 行為 |
|---|---|---|
| `bet` | 有 `VITE_FAIRBET_ADDRESS` + 已連 MetaMask | 真實下注、合約結算、自動賠付 |
| `plain` | 只有 `VITE_CONTRACT_ADDRESS` | 僅上鏈公平驗證，無金流 |
| `mock` | 無合約地址或使用模擬錢包 | 純前端模擬 |

### 變動倍率

`payout = amount × multiplierBps / 10000`（bps 整數，Solidity 無浮點）。
Crash/Limbo：`crashBps = min(1e6, 10000·2^52/(2^52 − fr mod 2^52))`，
可證明 `P(crash ≥ m) = 1/m`、期望值為 1。

## 🔴 修改前必讀

| 絕對不可隨意改 | 原因 |
|---|---|
| `storage.js` 的 localStorage 鍵名 | Verifier/Stats/Lobby 都靠它讀取 |
| `FairBet.sol` 的 `GameType` enum 順序 | 前端硬編碼對應數字，**只能往後追加** |
| `crypto.js` 的雜湊計算方式 | 改了就與合約不一致，交易會 revert |
| `vite.config.js` 的 `base` 與 `main.jsx` 的 `basename` | 兩者須同為 `/Blockchain-Game/` |
| `public/404.html` | GitHub Pages SPA 路由依賴它 |

**改遊戲結果公式必須同步三處**：
`src/games/random.js` ↔ `contracts/contracts/FairBet.sol` ↔ `contracts/test/FairBet.test.js`
改完須 `npm test` + `npx hardhat test` 全過，**且要重新部署合約**。

**種子必須用 `useState(() => generateSeed())` 惰性初始化**，全程不可重新產生
（重玩靠 `key={round}` 重新掛載）。

## 常用指令

```bash
npm run dev            # 開發（http://localhost:5173/Blockchain-Game/）
npm run build          # 建置（讀 .env 的 VITE_* 寫死進去）
npm test               # 前端測試（Vitest，28 個）

cd contracts
npx hardhat test                                    # 合約測試（38 個）+ gas 報告
npx hardhat run scripts/deploy.js --network sepolia # 部署雙合約 + 注資金池
slither .                                           # 靜態安全分析
```

## 部署

push 到 main 會觸發 `.github/workflows/deploy.yml`。
**合約地址已寫進 workflow 的 env**，因此 CI build 會產出正確的上鏈版本。
> ⚠️ **重新部署合約後，必須同步更新 workflow 裡的地址**，否則線上站會指向舊合約。

線上網址：https://chien0701.github.io/Blockchain-Game/

## 目前部署的合約（Sepolia）

```
GameCommitReveal  0xe9C2a98699FEd3653774783160e65556f7B6aDB3
FairBet           0x25A753d62A0030680C92473681e4BD52BA42A7e8
```

## 已知待辦

1. **合約原始碼未在 Etherscan 驗證**——`owner` 改 `immutable` 後鏈上 bytecode 與原始碼不一致，
   需取得 Etherscan API key 後「重新部署 → 驗證」一次到位。
2. `Game.jsx`（21 點，665 行）自行實作流程，未使用共用 hook，應重構。
3. `useCommitReveal` 與 `useBetting` 高度重複，應合併。

完整技術債清單見 [`docs/TECH_DEBT.md`](./docs/TECH_DEBT.md)。
