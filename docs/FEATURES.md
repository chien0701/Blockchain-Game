# 功能說明

每個功能依「目的／使用方式／系統流程／程式實作／核心邏輯／限制／可能問題／改進」說明。

---

## 1. 錢包連接與網路管理

**【功能目的】** 讓使用者用 MetaMask 與區塊鏈互動；沒有 MetaMask 的人也能看完整流程。

**【使用方式】** 點右上「連接錢包」。若網路不是 Sepolia，畫面頂部出現紅色橫幅，按「立即切換」。

**【系統流程】**
```
點擊連接 → window.ethereum 存在?
  ├─ 是 → eth_requestAccounts → 取得 address + chainId → isMock = false
  └─ 否/被拒 → 產生隨機假地址 → isMock = true（模擬模式）
chainId ≠ 11155111 → isWrongNetwork = true → Navbar 顯示切換橫幅
```

**【程式實作】** `src/context/WalletContext.jsx`、`src/components/Navbar.jsx`

**【重要程式邏輯】**
- `connect()`：MetaMask 失敗時**不報錯而是降級成模擬模式**，讓展示不中斷。
- `getSigner()`：模擬模式下**主動拋錯**，避免假錢包誤送交易。
- `isWrongNetwork`：衍生狀態，`isConnected && !isMock && chainId !== SUPPORTED_CHAIN_ID`。
- `useEffect` 監聽 `accountsChanged` / `chainChanged`，並在 unmount 時 `removeListener`。

**【限制】** 只支援 MetaMask（`window.ethereum`），未整合 WalletConnect。

**【可能問題】** 使用者在 MetaMask 切換帳號後，`address` 會更新但 `isMock` 不會重設；
若原本是模擬模式再安裝 MetaMask，需重新整理頁面。

**【改進】** 加入 WalletConnect、頁面載入時自動偵測已授權帳號（`eth_accounts`）。

---

## 2. Commit-Reveal 下注流程（8 款下注遊戲共用）

**【功能目的】** 產生雙方都無法預測／竄改的隨機結果，並讓合約自動結算金流。

**【使用方式】** 選注型 → 設定注金 → 按「⚡ 下注並直接開獎」（快速）或分兩步（詳細教學模式）。

**【系統流程】**
```
掛載時   產生 seedP/saltP/seedD/saltD，算出 commitP/commitD
下注     placeBet(gameType, betType, param, commitP, commitD) + msg.value
         → 合約收注、鎖定最大賠付、emit BetPlaced → betId
揭露     settleBet(betId, seedP, saltP, seedD, saltD)
         → 驗證兩承諾 → finalRandom → _resolve 判定 → 自動賠付 → emit BetSettled
前端     用 games/random.js 重算 → 與合約 outcome 比對 → 顯示一致性
         → storage.saveGame() 寫入紀錄
```

**【程式實作】**
| 角色 | 檔案 |
|---|---|
| 流程狀態機 | `src/hooks/useBetting.js` |
| 共用 UI（承諾／揭露畫面、注金面板、模式切換） | `src/components/CommitRevealFlow.jsx` |
| 等待動畫 | `src/components/GameLoader.jsx` |
| 結果區塊 | `src/components/GameResult.jsx` |
| 鏈上呼叫 | `src/utils/contract.js` |
| 各遊戲玩法 | `src/pages/games/*.jsx` |

**【重要程式邏輯】**
- `useBetting.js:53` 的 `mode` 判斷是整個系統的分流核心：
  `isMock ? 'mock' : IS_BETTING ? 'bet' : IS_ON_CHAIN ? 'plain' : 'mock'`
- `quickPlay()` 在同一個 async 函式中連發兩筆交易，UI 不中斷（**鏈上仍是兩筆交易**，只是體驗連貫）。
- 每個遊戲頁用 `crForFlow = { ...cr, commit: () => cr.commit(params()), quickPlay: ... }`
  把自己的注型參數包進去，共用元件不需認識個別遊戲。

**【限制】**
- 需兩筆交易 → Sepolia 約 12 秒/筆，一局約 25–30 秒。
- 因為是單人對合約，**莊家種子由前端持有**，嚴格雙盲在此弱化（詳見 TECHNICAL_DETAILS）。

**【可能問題】**
- 注金超過資金池可賠付上限 → 合約 `revert PoolInsufficient`（前端注金面板已做上限保護，但若池餘額變動仍可能發生）。
- 使用者在兩筆交易中間關閉頁面 → 注金卡在合約，需等 1 小時後由任何人呼叫 `claimExpired` 沒收。

**【改進】** 遷移至 L2（Arbitrum）降低延遲；把兩階段壓成單筆交易的變體設計。

---

## 3. 21 點（Blackjack）

**【功能目的】** 以最經典的牌類遊戲展示 Commit-Reveal 發牌。

**【使用方式】** 大廳點「21 點」→ 承諾 → 揭露 → Hit/Stand → 結算。

**【系統流程】**
```
commit → reveal → play（玩家可補牌/停牌）→ result
揭露後 createDeck(finalRandom) 洗出 52 張牌
發牌：playerHand = [deck[0], deck[2]]，dealerHand = [deck[1], deck[3]]
玩家 Hit：從 deck[4] 起依序抽；爆牌（>21）立即結算
玩家 Stand：莊家補牌至 17 點以上，再比點數
```

**【程式實作】** `src/pages/Game.jsx`（665 行，**自行實作流程，未使用 useBetting**）、
`src/utils/gameLogic.js`（洗牌／計分／勝負）

**【重要程式邏輯】**
- `createDeck()` 用 **xorshift PRNG** 由 `finalRandom` 種子化，跑 Fisher-Yates 洗牌。
- `calcScore()` 的 A 處理：先算 11，爆牌時每次 `-10` 直到不爆或無 A 可降。

**【限制】**
- **無金流**：21 點走 `GameCommitReveal` 合約，只做公平驗證，不能下注。
  原因：玩家的 Hit/Stand 決策使結果不再是 `finalRandom` 的單一純函數，合約無法獨立判定輸贏。
- 無分牌（Split）、加倍（Double）、保險（Insurance）等進階規則。

**【可能問題】** `Game.jsx` 與共用 hook 邏輯重複，改 A 沒改 B 會造成兩邊行為不一致。

**【改進】** 重構為使用 `useBetting`／`useCommitReveal`；若要支援下注，需把 21 點規則上鏈或改用樂觀式結算。

---

## 4. 挖礦模擬（Proof of Work）

**【功能目的】** 教學展示 PoW／nonce／難度，補足專題對「工作量證明」概念的覆蓋。

**【使用方式】** 選難度（前導 0 的個數 2–5）→ 手動輸入 nonce 或按「開始自動挖礦」。

**【系統流程】**
```
hash = keccak256(`${blockData}:${nonce}`)
符合條件 = hash 去掉 0x 後的前 N 碼皆為 '0'
自動挖礦：setInterval 每 16ms 嘗試 400 個 nonce，找到即停
找到 → 存入 storage（gameType: 'mining'）
```

**【程式實作】** `src/pages/games/Mining.jsx`（135 行，**完全不接觸合約**）

**【重要程式邏輯】** 「找答案很難、驗證只需一次」——這正是 PoW 的本質，UI 直接呈現嘗試次數。

**【限制】** 純本機計算，與區塊鏈無實際互動；難度 5 在低階裝置可能要數十秒。

**【可能問題】** 挖礦紀錄**沒有** `playerCommit` 欄位，
所以 `Verifier.jsx:130` 有守衛：偵測到缺少 `playerCommit` 就顯示「此局為挖礦紀錄，不適用 Commit-Reveal 驗證」。

**【改進】** 把難度目標與 nonce 也上鏈存證。

---

## 5. 猜數字（Mastermind）

**【功能目的】** 展示「承諾不可變」——莊家無法在猜測過程中偷改答案。

**【使用方式】** 按「鎖定密碼並開始」→ 用 6 色排出 4 格猜測 → 依 ●（位置對）○（顏色對位置錯）提示推理，最多 8 次。

**【系統流程】**
```
commit 階段：dealerCommit 上鏈（密碼由 dealerSeed 推導但尚未公開）
播放階段：secret = [0..3].map(i => intFromHex(dealerSeed, i, 1) % 6)
         每次猜測計算 exact / partial 回饋
結束（猜中或用完 8 次）→ 呼叫 cr.reveal() 揭露 → 證明 seedD 與承諾吻合
```

**【程式實作】** `src/pages/games/Mastermind.jsx`（使用 `useCommitReveal`，非 `useBetting`）

**【重要程式邏輯】** `feedback()` 用兩個計數陣列算 exact/partial，避免重複計算同色。

**【限制】** 因為是單機，密碼其實在前端記憶體中；**價值在於「事後可證明未竄改」**而非「前端看不到」。

**【可能問題】** 若玩家開 DevTools 可直接看到 `secret`——這是單人架構的本質限制，需在報告中誠實說明。

**【改進】** 改為雙人對局，或由伺服器／合約持有密碼。

---

## 6. 驗證工具（Verifier）

**【功能目的】** 讓任何人證明某局遊戲未被竄改——這是整個專題的核心賣點。

**【使用方式】** `/verifier` 選「💾 本地紀錄」「⛓️ 鏈上・公平局」或「🎰 鏈上・下注局」，輸入 ID 後按驗證。

**【系統流程】**
```
本地模式：storage.loadGame(id) → 4 項檢查
  1. verifyCommit(playerSeed, playerSalt, playerCommit)
  2. verifyCommit(dealerSeed, dealerSalt, dealerCommit)
  3. combineSeeds(pSeed, dSeed) === finalRandom
  4. dealCards(finalRandom) 重算勝負 === 紀錄的 result

鏈上模式：getReadOnlyProvider() → getGameData(provider, chainGameId)
  → 同樣重算 1~3 項（不需錢包、不需信任本網站）
  → 並用 finalRandom 重算牌面顯示
```

**【程式實作】** `src/pages/Verifier.jsx`、`src/utils/contract.js`、`src/utils/crypto.js`

**【重要程式邏輯】**
`getReadOnlyProvider()` 用 `new ethers.JsonRpcProvider(公開RPC)` 而非 MetaMask，
所以**驗證者不必安裝錢包也不必信任本網站**——這是 permissionless 驗證成立的關鍵。

**【限制】**
- 鏈上驗證已支援兩類：公平局（GameCommitReveal）與下注局（FairBet）。
- 下注局若 RPC 限制歷史日誌查詢，無法取回種子，會降級為「outcome 一致性」驗證。
- 本地模式受限於同一瀏覽器的 localStorage。

**【可能問題】** 輸入非數字的鏈上 ID、或該局尚未揭露（state=Committed）時，會顯示對應提示而非崩潰。

**【改進】** 提供以錢包地址反查自己所有下注局的列表；支援貼上結算交易 Hash 直接驗證。

---

## 7. 統計與資金曲線

**【功能目的】** 一眼看出近期戰績與金錢盈虧。

**【使用方式】** `/stats`。無紀錄時顯示引導；有紀錄時顯示 KPI + 圖表。

**【系統流程】**
```
storage.getStats() 聚合 fairchain_index
  → 總局數／勝率／鏈上局數／平手／總下注／總淨收益
recent.filter(bet > 0).reverse()  → 只取真實下注局、轉成時間序
  → MoneyChart 計算累積淨收益 → SVG 折線圖
```

**【程式實作】** `src/pages/Stats.jsx`、`src/components/MoneyChart.jsx`、`src/utils/storage.js`

**【重要程式邏輯】** `MoneyChart` 是**手寫 SVG，無圖表函式庫**（避免增加 bundle）。
含零基準線、漸層面積、hover 十字線與 tooltip；累積值為正時線呈電光藍，為負時轉紅。

**【限制】** 只統計本瀏覽器紀錄；索引上限 50 筆（`MAX_INDEX`）。

**【可能問題】** 舊版紀錄沒有 `bet`／`net` 欄位 → 視為 0，不會出現在資金曲線（不會報錯）。

**【改進】** 從鏈上事件（`BetSettled`）重建完整歷史，跨裝置同步。

---

## 8. 期望值實驗室（蒙地卡羅模擬）

**【功能目的】** 用實測數據驗證理論公平性——把工程專題提升為「有分析的研究」。

**【使用方式】** `/lab` 選遊戲 + 模擬局數（1k/10k/50k）→ 按「跑模擬」。

**【系統流程】**
```
迴圈 N 次：
  randHex()                       用 crypto.getRandomValues 產生 32-byte 亂數
  GAMES[key].single(fr)           用與真實遊戲相同的函數算 {win, mult}
  累加 wins、totalPayout，每 N/80 局取樣一次 running RTP
結束 → 實測 RTP／勝率 vs 理論值 + 收斂曲線
```

**【程式實作】** `src/pages/Lab.jsx`（含內嵌 `ConvergenceChart`）、`src/games/random.js`

**【重要程式邏輯】** 各遊戲理論值直接寫在設定中並可推導，例如：
- Crash 目標 m：`P(win)=1/m`、`RTP = m×(1/m) = 1`
- Wheel：`RTP = 平均倍率 = 70000/8/10000 = 0.875`
- Plinko：`RTP = Σ C(16,k)/2^16 × 倍率(k)`（用 Pascal 第 16 列計算）

**【限制】** 模擬用瀏覽器亂數，非鏈上真實對局。

**【已改善】** 迴圈改為每批 2000 局搭配 `requestAnimationFrame` 分批執行，
不再凍結畫面，並顯示即時進度百分比與進度條。

**【改進】** 若要跑百萬級模擬可改用 Web Worker；可增加卡方檢定等統計檢驗。

---

## 9. 主題化等待動畫

**【功能目的】** 上鏈確認要等 12–30 秒，用對應遊戲主題的動畫降低單調感。

**【程式實作】** `src/components/GameLoader.jsx`（CSS keyframes 定義於 `src/index.css`）

**【重要程式邏輯】** 各遊戲透過 `CommitRevealFlow` 的 `loaderTheme` prop 指定主題
（crash→火箭、dice→翻滾骰子、slots→旋轉輪軸、plinko→落球、revolver→轉動彈膛…）。

**【限制】** 純 CSS 動畫，非依實際交易進度的進度條。

**【改進】** 顯示真實確認數（1/1 confirmations）與預估剩餘時間。

---

## 10. 說明頁互動教學

**【功能目的】** 讓不懂密碼學的人親手操作一次 Commit-Reveal。

**【系統流程】** 4 步驟：生成種子 → 提交承諾（莊家種子模糊隱藏）→ 揭露驗證 → 顯示骰子結果。
**使用真實的 `crypto.js` 函式**，不是假動畫。

**【程式實作】** `src/pages/Docs.jsx`（`InteractiveDemo` 元件）+ `src/games/concepts.js`（概念詞彙表）

**【限制】** 純前端演示，不上鏈。
