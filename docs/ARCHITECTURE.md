# 系統架構與資料流

> **2026-10-02 更新**：第三、五節已改為 FairBet v3 流程；完整協議規格與部署圖見 [PROTOCOL_V3.md](./PROTOCOL_V3.md)。

## 一、整體架構

**沒有傳統後端、沒有資料庫伺服器。** 這是刻意的架構決策：
權威資料放在**區塊鏈**（不可竄改、公開），本機只放**快取與偏好**（localStorage）。

```mermaid
graph TB
    subgraph Browser["瀏覽器（使用者端）"]
        UI["表現層<br/>React 元件 / 頁面"]
        LOGIC["應用邏輯層<br/>useBetting · useCommitReveal<br/>games/random.js · registry.js"]
        CRYPTO["密碼學層<br/>crypto.js（Keccak256）"]
        STORE["本地儲存<br/>storage.js → localStorage"]
        WALLET["錢包層<br/>WalletContext（MetaMask）"]
    end

    subgraph Chain["Ethereum Sepolia 測試網"]
        FB["FairBet v3 合約<br/>下注 · 判定 · 自動賠付 · 資金池<br/>熵 = 下注後下一個區塊的雜湊"]
        CR["GameCommitReveal 合約<br/>公平性展示（無金流、不防作弊）"]
    end

    EXT["第三方驗證者<br/>（不需錢包）"]

    UI --> LOGIC
    LOGIC --> CRYPTO
    LOGIC --> STORE
    LOGIC --> WALLET
    WALLET -->|"ethers.js v6<br/>簽署交易"| FB
    WALLET -->|"簽署交易"| CR
    LOGIC -->|"唯讀 JsonRpcProvider"| FB
    EXT -->|"公開讀取"| FB
    EXT -->|"公開讀取"| CR

    style Chain fill:#0d1942,color:#fff
    style Browser fill:#0e1424,color:#fff
```

### 各節點用途

| 節點 | 檔案 | 用途 |
|---|---|---|
| 表現層 | `src/pages/`、`src/components/` | 畫面渲染、使用者互動 |
| 應用邏輯層 | `src/hooks/`、`src/games/` | 遊戲流程狀態機、結果與賠付計算（`resolveBet`）、遊戲註冊 |
| 驗證層 | `src/utils/verify.js`、`scripts/verify-bet.mjs` | 純函數驗證判定；不依賴網站的命令列工具 |
| 密碼學層 | `src/utils/crypto.js` | 種子／salt 生成、承諾計算、承諾驗證 |
| 錢包層 | `src/context/WalletContext.jsx` | MetaMask 連線、網路切換、取得 signer |
| 合約互動 | `src/utils/contract.js` | 封裝所有鏈上讀寫，含唯讀 provider |
| 本地儲存 | `src/utils/storage.js` | 遊戲紀錄索引、UI 偏好、統計聚合 |
| FairBet v3 合約 | `contracts/contracts/FairBet.sol` | 9 種下注遊戲的收注／判定／賠付／資金池；公開 `resolve()` |
| GameCommitReveal | `contracts/contracts/GameCommitReveal.sol` | 純 Commit-Reveal 驗證（21 點、Mastermind 用） |

---

## 二、元件關係圖

```mermaid
graph TD
    APP["App.jsx<br/>路由 + lazy load"]
    WP["WalletProvider<br/>全域錢包狀態"]

    APP --> WP
    WP --> NAV["Navbar / SystemBar / Footer"]
    WP --> PAGES["頁面"]

    PAGES --> HOME["Home 首頁"]
    PAGES --> LOBBY["Lobby 大廳"]
    PAGES --> VER["Verifier 驗證"]
    PAGES --> STATS["Stats 統計"]
    PAGES --> LAB["Lab 實驗室"]
    PAGES --> DOCS["Docs 說明"]
    PAGES --> BJ["Game 21點<br/>（獨立實作）"]
    PAGES --> BET8["8 款下注遊戲<br/>Dice/Roulette/Slots/Crash<br/>Limbo/Wheel/Plinko/Revolver"]
    PAGES --> MM["Mastermind"]
    PAGES --> MINE["Mining（不上鏈）"]

    BET8 --> UB["useBetting hook"]
    MM --> UCR["useCommitReveal hook"]
    BET8 --> CRF["CommitRevealFlow<br/>共用 commit/reveal UI"]
    MM --> CRF
    CRF --> GL["GameLoader<br/>主題化等待動畫"]
    BET8 --> GR["GameResult<br/>ResultBanner/CryptoProof/ResultActions"]

    UB --> CONTRACT["utils/contract.js"]
    UCR --> CONTRACT
    BJ --> CONTRACT
    UB --> CRYPTO2["utils/crypto.js"]
    BET8 --> RAND["games/random.js<br/>結果計算純函數"]
    LAB --> RAND

    LOBBY --> REG["games/registry.js"]
    HOME --> REG
    STATS --> STOR["utils/storage.js"]
    STATS --> MC["MoneyChart 資金曲線"]
    VER --> STOR

    style BJ fill:#7f1d1d,color:#fff
    style MINE fill:#374151,color:#fff
```

> 🔴 紅色 `Game.jsx`（21 點）**自行實作 commit/reveal 流程，未使用共用 hook**——這是已知技術債，見 [TECH_DEBT.md](./TECH_DEBT.md)。
> ⬜ 灰色 `Mining.jsx` **完全不接觸合約**，是純本機 PoW 教學。

---

## 三、資料流程圖（以「鏈上下注」為例，v3）

```mermaid
sequenceDiagram
    participant U as 使用者
    participant P as 遊戲頁<br/>(如 Dice.jsx)
    participant H as useBetting
    participant S as storage.js
    participant CT as contract.js
    participant MM as MetaMask
    participant FB as FairBet v3

    Note over H: 元件掛載時：seed、salt = CSPRNG；commit = keccak(seed‖salt)
    U->>P: 選注型 + 注金 + 按「下注並開獎」
    P->>H: quickPlay({gameType, betType, param, amountEth})
    H->>MM: 取得 signer（未連錢包則停止）
    H->>S: savePendingBet({commit, seed, salt, …})
    H->>CT: placeBetOnChain(signer, {..., playerCommit})
    MM->>FB: placeBet(gameType, betType, param, commit)
    Note over FB: 注金入池、鎖定最大賠付<br/>revealBlock = 區塊 + 1
    FB-->>CT: BetPlaced(betId, revealBlock)
    H->>S: updatePendingBet({betId, revealBlock})
    H->>CT: waitForBlock(revealBlock)
    H->>CT: settleBetOnChain(signer, betId, seed, salt)
    MM->>FB: settleBet(betId, seed, salt)
    Note over FB: 驗證承諾、期限<br/>entropy = blockhash(revealBlock)<br/>finalRandom = keccak(seed‖entropy)<br/>resolve() → 先寫狀態、再轉帳
    FB-->>CT: BetSettled(won, outcome, entropy, finalRandom, payout)
    H->>H: resolveBet() 重算結果與賠付 → consistent
    H->>S: removePendingBet(commit)
    P->>S: saveGame({...recordFields(), result})
    P-->>U: 結果、賠付、一致性標記
```

### 關鍵設計：為什麼前端要「本地重算」再比對？

合約已經算出結果，前端仍用 `resolveBet()` 重算**結果與賠付**並比對，
用來當場證明「前端演算法 ≡ 合約演算法」；不一致會顯示 🚨 警告。
這項一致性另由合約測試把關：測試**直接載入前端的 `random.js`** 與 Solidity 比對。

---

## 四、使用者操作流程圖

```mermaid
flowchart TD
    START([進入網站]) --> CONN{已連接錢包?}
    CONN -->|否| MOCK[模擬模式<br/>流程可看但不上鏈]
    CONN -->|是| NET{網路正確?}
    NET -->|否| SWITCH[顯示紅色橫幅<br/>一鍵切換 Sepolia]
    SWITCH --> NET
    NET -->|是| LOBBY[遊戲大廳]
    MOCK --> LOBBY

    LOBBY --> PICK[選擇遊戲]
    PICK --> BJ{是 21 點?}
    BJ -->|是| BJFLOW[承諾 → 揭露 → Hit/Stand → 結算]
    BJ -->|否| MINE{是挖礦?}
    MINE -->|是| POW[調 nonce 找符合難度的 hash<br/>純本機]
    MINE -->|否| BET[選注型 + 注金]

    BET --> MODE{快速 or 詳細?}
    MODE -->|快速| QUICK[一鍵：下注 + 開獎<br/>兩筆交易連發]
    MODE -->|詳細| STEP[分兩步驟<br/>教學用]
    QUICK --> RESULT[結果頁]
    STEP --> RESULT
    BJFLOW --> RESULT
    POW --> RESULT

    RESULT --> SAVE[(存入 localStorage)]
    RESULT --> VERIFY{要驗證?}
    VERIFY -->|本地| LOCAL[驗證工具：讀 localStorage 重算]
    VERIFY -->|鏈上| CHAIN[驗證工具：唯讀 RPC 讀合約重算<br/>不需錢包]
    RESULT --> AGAIN[再玩一局] --> PICK
```

---

## 五、資料流追蹤（依功能）

### A. 種子、承諾與熵（下注遊戲，v3）

```
useBetting 掛載
  → generateSeed()、generateSalt()        32-byte CSPRNG（ethers.randomBytes）
  → commit = keccak256(seed‖salt)         useState 惰性初始化，全程不變
  → placeBet 只送 commit（種子仍保密），送出前寫入 pending
  → 合約記 revealBlock = 下注區塊 + 1
  → 等最新區塊 ≥ revealBlock
  → settleBet 送出 seed + salt
  → 合約：keccak256(seed‖salt) == commit；entropy = blockhash(revealBlock)
```

21 點、猜數字（GameCommitReveal）仍是雙種子，兩個都在前端產生，只做公平性展示。

### B. 結果計算（下注遊戲）

```
合約 settleBet
  → finalRandom = keccak256(abi.encodePacked(seed, entropy))
  → resolve(gameType, betType, param, amount, finalRandom)   public pure
      Dice     : uint32(bytes4(fr)) % 6 + 1
      Roulette : uint32(bytes4(fr)) % 37
      Slots    : 三段 bytes4 各 % 6
      Crash/Limbo: crashBps(fr) = min(1e6, 10000·2^52/(2^52 − fr mod 2^52))
      Wheel    : uint256(fr) % 8 → 倍率表
      Plinko   : popcount(uint256(fr) & 0xFFFF) → 17 槽倍率表
      Revolver : uint256(fr) % 6，存活條件 chamber >= 子彈數
  → payout = amount × multiplierBps / 10000（向下取整，含本金）
  → won = payout > amount（淨贏）
  → 寫入 storage、轉帳、emit BetSettled

前端 games/random.js 的 resolveBet() 以完全相同公式重算 → 比對結果與賠付
```

### C. 儲存與統計

```
遊戲結束 → storage.saveGame(record)
  ├─ 完整紀錄 → localStorage['fairchain_game_<gameId>']
  └─ 摘要索引 → localStorage['fairchain_index']（最多 50 筆，新的在前）
                 { gameId, gameType, ts, result, onChain, bet, net }

Stats 頁 → storage.getStats()  聚合索引 → 勝率／鏈上局數／總下注／總淨收益
        → MoneyChart           反轉索引成時間序 → 累積淨收益折線圖
Lobby 頁 → storage.recentGames() → 最近 8 局表格
Verifier → storage.loadGame(id)  → 完整紀錄重算驗證
```

### D. 鏈上驗證（第三方，不需錢包）

```
下注局（FairBet v3）
  → getReadOnlyProvider(可自訂 RPC)，檢查 chainId 與部署鏈一致
  → getBetV3(provider, betId)      一次取得 seed、salt、commit、revealBlock、entropy、finalRandom、outcome、payout
  → getBlockHash(provider, revealBlock)   另外取得區塊雜湊，不採信合約記錄
  → verifyBetV3(bet, blockHash)    承諾 → 熵 → finalRandom → 結果 → 賠付
  → verified / failed / incomplete / expired / pending

下注局（v2，已停用）
  → getBetV2：依結算時間戳二分搜尋區塊，只查附近日誌取種子；錯誤分類
  → verifyBetV2：過期局以 finalRandom 為零辨識；缺種子 → incomplete

公平局（GameCommitReveal）
  → getGameData → 核對承諾與 finalRandom（不代表種子來源獨立）

命令列：npm run verify:bet -- --rpc … --address … --bet …（不經過網站）
```
