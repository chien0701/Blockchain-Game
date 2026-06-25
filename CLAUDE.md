# Blockchain-Game（FairChain）

## 專案概述

以 21 點（Blackjack）為示範的區塊鏈公平遊戲驗證系統。
核心機制：Commit-Reveal 雙盲協議 + Keccak256 密碼學承諾。
目標：任意第三方可在鏈上驗證每局遊戲結果未被竄改。

## 架構

```
Blockchain-Game/
├── src/
│   ├── components/       ← UI 元件（Navbar, Footer, PlayingCard, StepBar）
│   ├── context/
│   │   └── WalletContext.jsx  ← MetaMask 全域狀態
│   ├── pages/            ← Home / Lobby / Game / Verifier
│   └── utils/
│       ├── crypto.js     ← keccak256、種子生成、Hash 計算（核心）
│       └── gameLogic.js  ← 發牌、點數計算、勝負判定、localStorage
├── contracts/            ← Hardhat 智能合約（Solidity）
│   └── hardhat.config.js ← 目標網路：Arbitrum Sepolia
└── .github/workflows/deploy.yml  ← CI/CD 自動部署
```

## 技術棧

- 前端：React 18 + Vite + TailwindCSS + React Router v6
- 密碼學：ethers.js v6（keccak256、randomBytes、BrowserProvider）
- 合約：Hardhat + Solidity（目前架構層，展示版不上鏈）
- 資料儲存：localStorage（展示版）→ 鏈上（Option B 正在規劃）
- 部署：GitHub Pages（`/Blockchain-Game/` base path）

## 核心邏輯

### Commit-Reveal 流程

1. **Commit**：雙方各自產生隨機種子，提交 `keccak256(seed)` 至鏈上
2. **Reveal**：公開明文種子，合約驗證 `keccak256(seed) == hash`
3. **Result**：`final = keccak256(seed_P ‖ seed_D)` 決定洗牌順序
4. **Verify**：第三方用相同邏輯重算，對比結果

### 發牌

```js
// Fisher-Yates 洗牌，用 final_random 各 byte 作為亂數來源
// playerHand = [deck[0], deck[2]], dealerHand = [deck[1], deck[3]]
```

### 21 點規則

- A = 11（爆牌自動降為 1）
- 10/J/Q/K = 10，其餘面值
- 莊家不補牌（展示版為雙方對比點數）

## 已知路徑設定

```js
// vite.config.js
base: '/Blockchain-Game/'

// src/main.jsx
<BrowserRouter basename="/Blockchain-Game">
```

## 部署

```bash
git add . && git commit -m "feat: ..." && git push
# GitHub Actions 自動 build dist/ 並推送 gh-pages 分支
# 線上網址：https://nimble05.github.io/Blockchain-Game/
```

## 合約指令

```bash
cd contracts
npm run compile           # 編譯 Solidity
npm run test              # 執行測試
npm run deploy:local      # 部署至本地 Hardhat 節點
npm run deploy:sepolia    # 部署至 Arbitrum Sepolia
```

## 注意事項

- `data.js` / `gameLogic.js` 的 localStorage 鍵名不可隨意更改（會影響 Verifier 讀取）
- MetaMask 未安裝時自動使用模擬錢包（不影響密碼學展示）
- SPA 路由修復依賴 `public/404.html` + `index.html` 的 script，不可刪除
- Option B 上鏈版本計畫使用 ethers.js 的 `BrowserProvider` 串接真實合約
