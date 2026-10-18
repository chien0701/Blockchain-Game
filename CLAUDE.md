# Blockchain-Game（FairChain）

> 完整技術文件在 **[`docs/`](./docs/)**。本檔僅記錄開發 Claude Code 時需要的重點。
> 若本檔與程式碼不一致，**以程式碼為準**。

## 專案概述

區塊鏈公平遊戲驗證系統。下注協議是 **FairBet v3：玩家承諾 + 未來區塊雜湊**
（`finalRandom = keccak256(玩家種子 ‖ blockhash(下注區塊+1))`），
由智能合約**自動判定輸贏與賠付**，任何第三方都能用唯讀 RPC 完整驗證。

目前有 **11 款遊戲**：8 個下注頁面對應合約 9 種遊戲類型（骰子頁含骰子與硬幣）；
21 點、猜數字走 GameCommitReveal（**只做公平性展示，玩家可在行動前算出結果**）；挖礦為本機展示。

> v3 已於 2026-10-18 部署到 Sepolia（`0xb798…402c`，區塊 #11939197），**尚未做 Etherscan 原始碼驗證**；
> 鏈上程式碼與 commit 097e0bb 的對應改以逐位元組比對證明（見 `contracts/deployments/sepolia.json`）。
> 舊的 v2（`0x25A7…`）有協議缺陷，只供查驗舊局；前端偵測到 `.env` 指向 v2 時會自動停用下注。
> 協議規格：`docs/PROTOCOL_V3.md`；決策紀錄：`docs/DECISIONS.md`。

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
│   └── random.js           ★ resolveBet 結果與賠付純函數（合約測試直接載入它與 Solidity 比對）
├── hooks/
│   ├── useBetting.js       ★ 8 款下注遊戲的流程狀態機（bet/mock）、pending 恢復、recordFields
│   └── useCommitReveal.js  僅 Mastermind 使用
├── pages/            Home, Lobby, Game(21點), Verifier, Docs, Stats, Lab
│   └── games/        Dice, Roulette, Slots, Crash, Limbo, Wheel, Plinko,
│                     Revolver, Mastermind, Mining
├── config/abi.js     ★ 前端 ABI（純模組；合約測試檢查與編譯產物一致）
├── utils/
│   ├── crypto.js     ★ 種子/salt、承諾計算與驗證
│   ├── contract.js   ★ 鏈上讀寫：v3 下注／結算／getBetV3、v2 唯讀 getBetV2、waitForBlock
│   ├── verify.js     ★ 驗證邏輯純函數（verified/failed/incomplete/expired/pending）
│   ├── gameLogic.js  21點洗牌（rng v2：keccak 串流 + 拒絕採樣；v1 保留查驗舊局）、重播、猜數字密碼
│   └── storage.js    localStorage 集中管理、統計（最近 50 局窗口）、未完成的下注
└── __tests__/        Vitest 前端測試（61 個 + 2 個需本地節點的 E2E）

contracts/
├── contracts/FairBet.sol           ★ v3：玩家承諾 + 未來區塊雜湊、Expired 狀態、公開 resolve()
├── contracts/GameCommitReveal.sol  公平性展示（無金流；雙種子皆在前端，不防作弊）
├── contracts/test/PlayerProxy.sol  測試用惡意玩家（拒收 ETH、重入）
├── test/                           Hardhat 測試（51 個，含安全回歸與 ABI 一致性）
├── deployments/<network>.json      版本登錄表（受版控；localhost 除外）
└── ANALYSIS.md                     v3 Gas + Slither（含 weak-prng 解讀）
scripts/verify-bet.mjs              不依賴網站的獨立驗證工具（npm run verify:bet）
```

## 技術棧

- 前端：React 18 + Vite 5 + TailwindCSS + React Router v6 + GSAP
- 區塊鏈：ethers.js v6、Solidity 0.8.24、Hardhat
- 測試：Vitest（前端 61 + E2E 2）+ Hardhat/Chai（合約 51）；CI 部署前全跑
- 部署鏈：**Ethereum Sepolia（chainId 11155111）**
- 網站：GitHub Pages（gh-pages 分支）

## 核心邏輯

### FairBet v3 協議

1. **下注**：玩家送 `placeBet(gameType, betType, param, keccak256(seed‖salt))` + 注金；合約記 `revealBlock = block.number + 1`
2. **等區塊**：前端輪詢到最新區塊 ≥ revealBlock（下注當下該區塊不存在 → 無人能預知結果）
3. **結算**：`settleBet(betId, seed, salt)`，限該局玩家、須在 `revealBlock < 區塊 ≤ revealBlock+256`；
   `entropy = blockhash(revealBlock)`、`finalRandom = keccak256(seed‖entropy)`、`resolve()` 判定並轉帳；種子、熵、結果寫入 storage
4. **過期**：超過 256 區塊任何人可 `claimExpired` → 狀態 `Expired`，注金留池
5. **驗證**：`getBet()` 一次取得全部證據，另向 RPC 取區塊雜湊比對 entropy，再重算 finalRandom、outcome、payout

殘餘風險：玩家與開獎區塊出塊者串通（Slither `weak-prng` 標出的即此）。

前端 `ethers.solidityPackedKeccak256(['bytes32','bytes32'],[a,b])`
≡ 合約 `keccak256(abi.encodePacked(a,b))`——**這個等價關係是整個系統的地基**。

### 執行模式（`useBetting.js`）

| 模式 | 條件 | 行為 |
|---|---|---|
| `bet` | 有 v3 的 `VITE_FAIRBET_ADDRESS` + 已連接 MetaMask | 真實下注、合約結算、自動賠付；送出前寫入 pending |
| `mock` | 其他情況（未連錢包、無 MetaMask、地址未設定或仍為 v2） | 同一套協議，熵由本機產生，不上鏈 |

「贏」= 賠付 > 注金（`netResult`）；賠付 = 注金為平；全系統一致。

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

**改遊戲結果或賠付公式必須同步兩處**：`src/games/random.js` 的 `resolveBet` ↔ 合約 `resolve()`。
合約測試直接載入前端 `random.js` 比對，改一邊沒改另一邊會失敗。改完須 `npm test` + `npx hardhat test` 全過，**且要重新部署合約**。
**改合約介面**須同步 `src/config/abi.js`（`AbiSync.test.js` 會檢查）。

**不要**把「Slither 無高危」當安全論證；**不要**讓任何人能替玩家提交亂數（v2 的教訓）。

**種子必須用 `useState(() => generateSeed())` 惰性初始化**，全程不可重新產生
（重玩靠 `key={round}` 重新掛載）。

## 常用指令

```bash
npm run dev            # 開發（http://localhost:5173/Blockchain-Game/）
npm run build          # 建置（讀 .env 的 VITE_* 寫死進去）
npm test               # 前端測試（Vitest，61 個；E2E 需本地節點，見 docs/TA_FEEDBACK_RESPONSE.md）
npm run verify:bet -- --rpc <RPC> --address <FairBet v3> --bet <id>   # 獨立驗證

cd contracts
npx hardhat test                                    # 合約測試（51 個）+ gas 報告
npx hardhat run scripts/deploy.js --network sepolia # 部署雙合約 + 注資金池（工作目錄須已 commit）
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
FairBet v2        0x25A753d62A0030680C92473681e4BD52BA42A7e8   ← 已停用（協議缺陷），僅供查驗舊局
FairBet v3        0xb798377B9bE67114f9302dfB6e9cC8A7Bf2c402c   ← 使用中（區塊 #11939197，未做 Etherscan 驗證）
```

完整紀錄：`contracts/deployments/sepolia.json`。

## 已知待辦

1. Etherscan 原始碼驗證（需 Etherscan API key）
2. 助教交付物 D 的 L2 與 VRF 部分（需 Arbitrum Sepolia ETH 與 LINK；L1 部分已完成，見 `docs/experiments/`）
3. 重組處理：前端已顯示最終性，但重組發生時不會自動重新結算
4. 21 點、猜數字的隱藏資訊協議（目前不防作弊；需獨立莊家或 mental poker，與無後端架構衝突）
5. `useCommitReveal` 與 `useBetting` 仍是兩套流程（前者兩把種子都在前端，後者用未來區塊雜湊）

逐項狀態見 [`docs/TA_FEEDBACK_RESPONSE.md`](./docs/TA_FEEDBACK_RESPONSE.md)；舊技術債見 [`docs/TECH_DEBT.md`](./docs/TECH_DEBT.md)。
