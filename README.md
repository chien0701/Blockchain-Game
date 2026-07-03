# ⛓️ FairChain — 區塊鏈公平遊戲驗證系統

> 以 21 點（Blackjack）為示範，透過 Commit-Reveal 雙盲機制與 Keccak256 密碼學，確保每一局線上遊戲的結果都由雙方共同決定，任何第三方都可以公開驗證，沒有人能單方面作弊。

🌐 **線上展示網址**：[https://chien0701.github.io/Blockchain-Game](https://chien0701.github.io/Blockchain-Game)

---

## 📌 專題動機

傳統線上博弈平台（如 Stake.com）採用中心化架構，遊戲結果由伺服器單方面計算，玩家只能「相信」莊家誠實。即使平台聲稱使用可驗證的亂數演算法，仍存在以下根本性缺陷：

| 攻擊向量 | 說明 |
|---|---|
| **上帝視角攻擊** | 莊家可預先看到玩家種子後再決定自己的種子，操控結果 |
| **承諾值靜默替換** | 莊家可在揭露前偷換已提交的 Hash，但玩家無從察覺 |
| **中心化資產託管風險** | 平台掌控所有資金，作弊後的賠付完全依賴平台自律 |
| **惡意中斷遊戲** | 莊家發現自己會輸時，選擇不揭露種子，讓遊戲卡死 |

本專題目標是設計並實作一套**以密碼學為基礎的去中心化公平驗證系統**，從根本上消除上述攻擊向量。

---

## 🎯 系統目標

1. **雙盲發牌**：遊戲開始前，雙方的隨機種子都被密碼學鎖定，任何一方都無法在看到對方底牌後才決定自己的
2. **不可竄改紀錄**：所有 Hash 透過區塊鏈交易寫入，全球節點共同記錄，任何人都無法靜默修改
3. **任意人可驗證**：遊戲結束後，所有密碼學參數公開，第三方可用開源邏輯重新計算，對比結果是否吻合
4. **自動強制執行**：智能合約一旦檢測到作弊，立即凍結資金並執行賠付，無需人工介入

---

## 🏗️ 專案架構

```
blockchain-game-frontend/        ← 純前端靜態網站（部署至 GitHub Pages）
│
├── .github/
│   └── workflows/
│       └── deploy.yml           ← GitHub Actions 自動部署設定
│
├── public/
│   └── 404.html                 ← SPA 路由修復（頁面重新整理時防止 404）
│
├── src/
│   ├── main.jsx                 ← React 應用程式進入點（含 basename 設定）
│   ├── App.jsx                  ← 路由設定（React Router v6）
│   ├── index.css                ← TailwindCSS 全域樣式
│   │
│   ├── context/
│   │   └── WalletContext.jsx    ← MetaMask 錢包狀態全域管理（React Context）
│   │
│   ├── utils/
│   │   ├── crypto.js            ← 密碼學工具（keccak256、種子生成、Hash 計算）
│   │   └── gameLogic.js         ← 遊戲邏輯（發牌、點數計算、勝負判定、localStorage）
│   │
│   ├── components/
│   │   ├── Navbar.jsx           ← 頂部導覽列（含錢包連接按鈕）
│   │   ├── Footer.jsx           ← 頁尾
│   │   ├── PlayingCard.jsx      ← 撲克牌 UI 元件（支援隱藏/顯示）
│   │   └── StepBar.jsx          ← Commit → Reveal → Result 進度指示器
│   │
│   └── pages/
│       ├── Home.jsx             ← 首頁（系統介紹、流程圖解、特點說明）
│       ├── Lobby.jsx            ← 遊戲大廳（房間列表、建立房間）
│       ├── Game.jsx             ← 主遊戲頁面（完整 Commit-Reveal 流程）
│       └── Verifier.jsx         ← 第三方驗證工具（輸入 Game ID 重新計算驗證）
│
├── index.html                   ← HTML 進入點（含 SPA 路由修復 script）
├── vite.config.js               ← Vite 建置設定（base: '/Blockchain-Game/'）
├── tailwind.config.js           ← TailwindCSS 設定
├── postcss.config.js            ← PostCSS 設定
└── package.json                 ← 套件依賴與 npm 指令
```

---

## 🔐 核心設計邏輯：Commit-Reveal 協議

### 為什麼需要 Commit-Reveal？

在傳統系統中，如果讓雙方輪流公布隨機數，**後公布的一方天然具有優勢**——他可以在看到對方的數字後，選擇對自己有利的數字再公布。Commit-Reveal 協議透過**密碼學承諾**解決這個問題。

### 完整流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        COMMIT 階段                                   │
│                                                                     │
│  玩家                          莊家              區塊鏈              │
│   │                             │                  │               │
│   ├─ seed_P = random_bytes(32)  │                  │               │
│   ├─ hash_P = keccak256(seed_P) │                  │               │
│   │                             ├─ seed_D = random │               │
│   │                             ├─ hash_D = keccak256(seed_D)      │
│   │                             │                  │               │
│   ├──────── Commit(hash_P) ─────────────────────►  │ ✅ 永久記錄   │
│   │                             ├── Commit(hash_D) ►│ ✅ 永久記錄   │
│   │                             │                  │               │
│   │    雙方底牌已鎖死，無法反悔      │                  │               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        REVEAL 階段                                   │
│                                                                     │
│   ├──────── Reveal(seed_P) ─────────────────────►  │               │
│   │                             ├── Reveal(seed_D) ►│               │
│   │                             │                  │               │
│   │                          驗證：keccak256(seed_P) == hash_P ✓   │
│   │                          驗證：keccak256(seed_D) == hash_D ✓   │
│   │                             │                  │               │
│   │                          final = keccak256(seed_P ‖ seed_D)    │
│   │                             │  → 發牌 → 計算點數 → 判定勝負     │
│   ◄──────────────── 結果 ────────────────────────── │               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        VERIFY 階段（任意第三方）                       │
│                                                                     │
│  驗證者                                                              │
│   ├─ 從鏈上讀取：seed_P, seed_D, hash_P, hash_D, result            │
│   ├─ 驗證：keccak256(seed_P) == hash_P ?                           │
│   ├─ 驗證：keccak256(seed_D) == hash_D ?                           │
│   ├─ 計算：final = keccak256(seed_P ‖ seed_D)                      │
│   ├─ 重新發牌並計算結果                                               │
│   └─ 對比：計算結果 == 記錄結果 ? → ✅ 公平 / ❌ 作弊                │
└─────────────────────────────────────────────────────────────────────┘
```

### 關鍵安全性質

| 性質 | 說明 | 實現方式 |
|---|---|---|
| **隱藏性 (Hiding)** | Commit 後，對方無法從 Hash 反推出原始種子 | Keccak256 是單向函數，在計算上不可逆 |
| **綁定性 (Binding)** | 一旦 Commit，無法在 Reveal 時換成其他種子 | 找到碰撞（兩個輸入產生相同 Hash）在計算上不可行 |
| **公平性 (Fairness)** | 最終隨機數由雙方共同決定 | final = keccak256(seed1 ‖ seed2)，任一方的種子都影響結果 |
| **可驗證性 (Verifiability)** | 任何人都可以重新計算驗證 | 所有參數公開，邏輯開源 |

---

## 🃏 21 點遊戲邏輯

### 發牌機制

最終隨機數（`final_random`）是一個 32 bytes 的 keccak256 Hash，用來做 Fisher-Yates 洗牌：

```javascript
// 產生 52 張牌的完整牌組
const deck = [所有花色 × 所有點數];

// 用 final_random 的各個 byte 做 Fisher-Yates 洗牌
for (let i = 51; i > 0; i--) {
  const byte = parseInt(hex.slice(byteIndex * 2, byteIndex * 2 + 2), 16);
  const j = byte % (i + 1);
  swap(deck[i], deck[j]);
}

// 取前四張：玩家兩張、莊家兩張
playerHand = [deck[0], deck[2]];
dealerHand = [deck[1], deck[3]];
```

### 點數計算

```
A           → 11 點（若爆牌則自動降為 1 點）
2 ~ 9       → 面值
10 / J / Q / K → 10 點
超過 21      → 爆牌，自動判輸
```

### 勝負判定

```
玩家爆牌 → 莊家贏
莊家爆牌 → 玩家贏
玩家點數 > 莊家點數 → 玩家贏
莊家點數 > 玩家點數 → 莊家贏
點數相同 → 平手
```

---

## ⛓️ 區塊鏈技術應用

### 使用的密碼學原語

| 技術 | 用途 | 實作位置 |
|---|---|---|
| **Keccak256** | 計算種子的雜湊值（承諾值）| `src/utils/crypto.js` → `hashSeed()` |
| **Keccak256** | 合併雙方種子產生最終隨機數 | `src/utils/crypto.js` → `combineSeeds()` |
| **crypto.getRandomValues** | 生成密碼學安全的隨機種子 | `ethers.randomBytes(32)` |
| **ECDSA 數位簽名** | MetaMask 錢包身份驗證 | `WalletContext.jsx` |

### ethers.js v6 的角色

本專題使用 ethers.js 作為與以太坊生態系互動的橋樑：

```javascript
import { ethers } from 'ethers';

// 1. 生成密碼學安全的隨機種子
const seed = ethers.hexlify(ethers.randomBytes(32));
// → "0x7f3a9b2c1e..."（64 個十六進位字元）

// 2. 計算 Keccak256 雜湊值
const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));
// → "0xd4e8f3a1..."

// 3. 合併雙方種子
const combined = ethers.keccak256(
  ethers.concat([ethers.toUtf8Bytes(seed1), ethers.toUtf8Bytes(seed2)])
);

// 4. MetaMask 錢包連接
const provider = new ethers.BrowserProvider(window.ethereum);
const accounts = await provider.send('eth_requestAccounts', []);
```

### 智能合約設計（架構層）

雖然本展示版為純前端實作，系統架構設計了對應的 Solidity 合約層：

```solidity
// Commit 階段
function commit(string gameId, bytes32 seedHash, bool isDealer) external {
    // 將 Hash 永久寫入鏈上
    games[gameId].committed[isDealer ? dealer : player] = seedHash;
    emit Committed(gameId, msg.sender, seedHash);
}

// Reveal 階段
function reveal(string gameId, string seedPlain, bool isDealer) external {
    // 驗證明文種子與之前提交的 Hash 是否一致
    require(
        keccak256(abi.encodePacked(seedPlain)) ==
        games[gameId].committed[msg.sender],
        "Hash mismatch: 種子與承諾不符"
    );
    // 計算最終隨機數並結算
    settleGame(gameId);
}
```

### Optimistic Settlement 架構

```
遊戲結束
    │
    ▼
派彩暫存於智能合約
    │
    ▼
啟動 5 分鐘挑戰期 ◄─── 第三方驗證者可提交作弊證明
    │
    ├─── 無異議 ───► 派彩自動發放給獲勝方
    │
    └─── 有作弊證明 ─► 凍結派彩 → 退款給受害者 → 罰款給驗證者
```

---

## 🖥️ 頁面功能說明

### `/` 首頁
- 系統整體介紹與設計動機
- Commit-Reveal 流程圖解（ASCII 藝術圖）
- 四大核心特點說明
- 導引使用者進入遊戲或驗證工具

### `/lobby` 遊戲大廳
- 顯示當前所有遊戲房間（含狀態、莊家地址、下注金額）
- 玩家可建立新房間（設定房名、下注額）
- 房間狀態：等待中 / 遊戲中 / 已結束

### `/game/:id` 遊戲頁面
**Commit 階段**
- 自動生成玩家的隨機種子（`ethers.randomBytes(32)`）
- 計算並展示種子的 Keccak256 Hash
- 莊家種子的 Hash 同步展示（但明文隱藏）
- 模擬將 Hash 寫入區塊鏈的交易

**Reveal 階段**
- 展示雙方明文種子
- 即時驗證每個種子是否與承諾 Hash 吻合（✅/❌）
- 說明最終隨機數的計算公式

**Result 階段**
- 展示雙方牌面（撲克牌 UI）
- 顯示點數與勝負原因
- 展示完整密碼學證明（隨機數、Game ID、TX Hash）
- 提供「前往驗證」快速連結

### `/verifier` 驗證工具
- 輸入任意 Game ID，讀取 localStorage 中的遊戲紀錄
- 在瀏覽器端重新執行完整計算流程
- 逐項列出四個驗證點（✅/❌）：
  1. 玩家種子 Hash 是否與承諾吻合
  2. 莊家種子 Hash 是否與承諾吻合
  3. 最終隨機數是否由雙方種子正確計算
  4. 遊戲結果是否與隨機數一致
- 重新計算並展示牌面

---

## 🛠️ 技術棧

| 分類 | 技術 | 版本 | 用途 |
|---|---|---|---|
| **UI 框架** | React | 18.2 | 元件化 UI 架構 |
| **建置工具** | Vite | 5.x | 開發伺服器與生產建置 |
| **路由** | React Router | 6.x | SPA 頁面切換 |
| **樣式** | TailwindCSS | 3.x | Utility-first CSS |
| **密碼學 / Web3** | ethers.js | 6.x | Keccak256、錢包連接 |
| **狀態管理** | React Context | 內建 | 錢包全域狀態 |
| **資料儲存** | localStorage | 瀏覽器 API | 遊戲紀錄持久化 |
| **CI/CD** | GitHub Actions | - | 自動建置與部署 |
| **靜態託管** | GitHub Pages | - | 免費雲端部署 |

---

## 🚀 GitHub Actions 自動部署

本專題使用 GitHub Actions 實現 CI/CD，每次推送到 `main` 分支時自動建置並部署。

### 部署流程

```
git push → GitHub Actions 觸發
              │
              ▼
        checkout 最新程式碼
              │
              ▼
        npm ci（安裝套件）
              │
              ▼
        npx vite build（建置靜態檔案）
              │
              ▼
        dist/ 推送至 gh-pages 分支
              │
              ▼
        GitHub Pages 自動更新網站 🌐
```

### `.github/workflows/deploy.yml` 說明

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main          # 只有推送到 main 才觸發

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest    # 在 GitHub 的 Ubuntu 虛擬機上跑

    steps:
      - uses: actions/checkout@v4       # 取得程式碼
      - uses: actions/setup-node@v4     # 安裝 Node.js 20
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci                     # 安裝套件（比 npm install 更嚴格）
      - run: npx vite build             # 建置生產版本
      - uses: peaceiris/actions-gh-pages@v3  # 部署 dist/ 至 gh-pages 分支
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

### GitHub Pages 路徑修復

由於 GitHub Pages 的 URL 有 repo 名稱前綴（`/Blockchain-Game/`），需要在兩個地方設定：

```javascript
// vite.config.js — 確保所有靜態資源路徑正確
base: '/Blockchain-Game/'

// src/main.jsx — 確保 React Router 路由正確
<BrowserRouter basename="/Blockchain-Game">
```

SPA（Single Page Application）在 GitHub Pages 上重新整理會出現 404，透過 `public/404.html` 搭配 `index.html` 的 script 解決：

```
使用者重新整理 /Blockchain-Game/game/room_001
    │
    ▼
GitHub Pages 回傳 404.html
    │
    ▼
404.html 的 script 把路徑轉成 query string
    │
    ▼
跳轉至 /Blockchain-Game/?/game/room_001
    │
    ▼
index.html 的 script 把 query string 還原成正確路徑
    │
    ▼
React Router 接管，正確渲染 /game/room_001 ✅
```

---

## 📦 本地開發

### 環境需求

- Node.js v18 以上
- npm v9 以上
- 瀏覽器（Chrome / Firefox / Edge）
- MetaMask 擴充功能（可選，沒有會自動使用模擬錢包）

### 安裝步驟

```bash
# 1. Clone 專案
git clone https://github.com/Nimble05/Blockchain-Game.git
cd Blockchain-Game

# 2. 安裝所有套件
npm install

# 3. 啟動開發伺服器
npm run dev
```

### 啟動成功畫面

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### 常用指令

```bash
npm run dev      # 啟動開發伺服器（熱重載）
npm run build    # 建置生產版本至 dist/
npm run preview  # 預覽生產版本
```

### 更新線上網站

```bash
git add .
git commit -m "更新說明"
git push
# → GitHub Actions 自動觸發，約 1-2 分鐘後網站更新
```

---

## 🎮 使用流程示範

### 作為玩家體驗一局遊戲

```
1. 打開 https://nimble05.github.io/Blockchain-Game/
2. 點「連接錢包」（有 MetaMask 就連真實錢包，沒有自動產生模擬地址）
3. 前往「遊戲大廳」→ 加入或建立一個房間
4. 進入遊戲頁面：

   Commit 階段：
   - 看到自己的隨機種子與 Hash
   - 點「提交承諾至區塊鏈」

   Reveal 階段：
   - 看到雙方種子都被驗證
   - 點「發牌並計算結果」

   Result 階段：
   - 看到牌面與勝負結果
   - 點「驗證此局公平性」

5. 驗證工具自動帶入 Game ID，重新計算確認結果未被篡改
```

### 作為第三方驗證者

```
1. 前往「驗證工具」頁面
2. 輸入任意已完成的 Game ID（或從「最近遊戲」選擇）
3. 系統自動執行四項驗證
4. 查看每一項密碼學計算的詳細結果
```

---

## 📐 系統設計決策

### 為什麼選擇純前端 + GitHub Pages 架構？

| 考量 | 說明 |
|---|---|
| **零成本維運** | GitHub Pages 免費，不需要租用伺服器 |
| **高可用性** | GitHub 的 CDN 全球分佈，不會因為自己的主機關機而下線 |
| **展示便利性** | 任何人掃 QR Code 就能直接開瀏覽器查看，不需安裝任何東西 |
| **去中心化精神** | 核心邏輯（密碼學驗證）在瀏覽器端執行，不依賴中央伺服器 |
| **開源可驗證** | 使用者可以直接查看原始碼確認驗證邏輯正確 |

### 為什麼使用 localStorage 而非鏈上儲存？

展示版的重點在於展示**密碼學流程的正確性**，而非完整的鏈上資產管理。localStorage 讓我們可以：
- 在本地重新計算驗證（無需網路、無需 Gas 費）
- 快速展示整個流程

### 真實部署的差異

| 功能 | 展示版（本專題）| 真實部署版 |
|---|---|---|
| Hash 儲存 | localStorage | 寫入 Solidity 智能合約 |
| 隨機數計算 | 瀏覽器端 | 在合約的 `reveal()` 函數內執行 |
| 資金結算 | 模擬 | Optimistic Settlement 合約自動執行 |
| 驗證者舉報 | 本地計算 | 簽名後提交至合約的 `submitFraudProof()` |
| 網路 | 無（純前端）| Arbitrum Sepolia / Mainnet |

---

## 👥 專案成員

> 填入你們的資訊

---

## 📄 授權

MIT License
