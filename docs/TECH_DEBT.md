# 技術債與已知問題

> **狀態更新（2026-09-08）**：#1、#3、#7～#15 已修復，詳見各項標註。
> 未修復：#2（需 Etherscan API key + 重新部署）、#4／#5（重構運作中的程式碼，應獨立進行）、#6（需重新部署合約）。

> 依嚴重度排序。**本文件不修改任何程式碼，僅記錄與建議。**
> 嚴重度定義：Critical＝會造成功能損壞或安全事故｜High＝明顯影響正確性或維護｜
> Medium＝影響品質｜Low＝小瑕疵

---

## 🔴 Critical

### ✅ #1〔已修復〕GitHub Actions 會把線上站覆蓋成「模擬模式」

**問題**
`.github/workflows/deploy.yml` 在 push 到 main 時執行 `npx vite build`，
但 **CI 環境沒有 `.env`，也沒有設定任何 GitHub Secrets**。
`VITE_CONTRACT_ADDRESS` / `VITE_FAIRBET_ADDRESS` 為 undefined
→ `IS_ON_CHAIN=false`、`IS_BETTING=false` → 產生的是**模擬模式**的 build。

**原因**
Vite 的 `VITE_*` 是 build 時期注入；`.env` 被 `.gitignore` 排除，CI 讀不到。

**影響**
一旦 Actions 成功執行，會把現在能真實下注的線上站**覆蓋成不能上鏈的版本**。
（目前線上版是**手動部署**的，Actions 歷來未成功部署過——這也是為何問題尚未爆發。）

**建議解法**（擇一）
1. 在 repo 設定 **Secrets**（`VITE_CONTRACT_ADDRESS` 等），並在 workflow 的 build 步驟注入：
   ```yaml
   - run: npx vite build
     env:
       VITE_CONTRACT_ADDRESS: ${{ secrets.VITE_CONTRACT_ADDRESS }}
       VITE_FAIRBET_ADDRESS:  ${{ secrets.VITE_FAIRBET_ADDRESS }}
       VITE_CHAIN_ID:         "11155111"
   ```
   （合約地址是公開資訊，也可直接寫在 workflow 裡，不必用 Secret。）
2. 或**停用該 workflow**，維持手動部署，並在 README 註明。

---

## 🟠 High

### #2 鏈上合約與原始碼已不一致

**問題** `FairBet.sol` 的 `owner` 在部署後才依 Slither 建議改為 `immutable`，
但 `0x25A753d6…` 上的 bytecode 是舊版。

**影響** 目前**無法通過 Etherscan 原始碼驗證**（bytecode 不匹配）。
「任何人可讀合約原始碼」這塊尚未達成。

**建議** 取得 Etherscan API key 後，**重新部署 → 驗證 → 更新 `.env` → 重新部署前端**，一次完成。

### ✅ #3〔已修復〕8 款下注遊戲無法做鏈上驗證

**問題** `Verifier.jsx` 鏈上模式呼叫的 `getGameData()` 內部使用 `CONTRACT_ADDRESS`
（GameCommitReveal），**查不到 FairBet 的 `bets`**。

**影響** 專題最核心的「任何人可驗證」在**主力的 9 款下注遊戲上並未真正提供**，
只有 21 點／Mastermind 可鏈上驗證。這是口試會被抓的關鍵缺口。

**建議** 在 `contract.js` 新增 `getBetData(provider, betId)` 呼叫 `FairBet.getBet()`，
Verifier 增加「下注局」驗證分頁：驗證兩個承諾 + `finalRandom` + 用 `random.js` 重算 outcome 比對。

### #4 21 點（Game.jsx）重複實作流程邏輯

**問題** `Game.jsx`（665 行）自行維護 commit/reveal 狀態機並直接呼叫 `contractCommit`／`contractReveal`，
未使用 `useCommitReveal` 或 `useBetting`。

**影響** 同樣的邏輯有兩份實作，修其一忘了另一份就會行為不一致；
`Game.jsx` 也是全專案最大的檔案，難維護。

**建議** 重構為使用 `useCommitReveal`，把 Hit/Stand 專屬狀態留在頁面層。

### #5 兩個高度相似的 hook 並存

**問題** `useCommitReveal.js`（僅 Mastermind 使用）與 `useBetting.js`（8 款遊戲使用）
有大量重複程式碼（種子生成、parseError、commit/reveal 流程）。

**影響** 修 bug 要改兩處；新人不知道該用哪一個。

**建議** 讓 `useCommitReveal` 成為 `useBetting` 的薄封裝（`mode` 強制為 `plain`），或直接合併。

---

## 🟡 Medium

### #6 取模偏差（modulo bias）

**問題** 骰子 `% 6`、輪盤 `% 37`、轉盤 `% 8` 皆對 $2^{32}$ 或 $2^{256}$ 取模，
除非模數是 2 的冪，否則各結果機率有極微幅差異。

**影響** 理論上不完全均勻。實務影響極小（$2^{32}/6$ 的偏差量級約 $10^{-9}$），
但**嚴謹的審查委員會問**。

**建議** 論文「限制」章誠實說明；或改用拒絕採樣（rejection sampling）。
（轉盤 `% 8` 因 8 是 2 的冪，**無偏差**。）

### ✅ #7〔已修復〕Lab 蒙地卡羅為同步迴圈，會凍結 UI

**問題** `Lab.jsx` 的 `run()` 用 `setTimeout` 延後 30ms 後執行同步 for 迴圈跑 50,000 次。

**影響** 執行期間主執行緒被佔用，畫面卡住（低階裝置 1–2 秒）；無進度回饋。

**建議** 改用 Web Worker，或分批 `requestAnimationFrame` 並顯示進度條。

### ✅ #8〔已修復〕前端沒有任何自動化測試

**問題** 合約有 38 個測試，但 `src/` **完全沒有測試**。
`games/random.js` 的純函數（`crashBps`、`plinkoBucket`…）是最該被測的部分。

**影響** 前端與合約的一致性目前只靠「合約測試中的 JS 等價實作」間接保證；
若有人改了 `random.js` 而沒改合約，不會有任何測試擋下來。

**建議** 加入 Vitest，對 `random.js` 與 `crypto.js` 寫單元測試，
並補一個「前端函數 vs 合約 view 函數」的一致性測試。

### ✅ #9〔已修復〕環境模式容易造成混淆

**問題** `mode` 由 `isMock`／`IS_BETTING`／`IS_ON_CHAIN` 三個旗標推導，
使用者若在模擬模式下遊玩，畫面雖有標籤但仍可能誤以為已上鏈。

**影響** 曾實際發生：使用者以為在上鏈玩，但鏈上 `betCount` 仍為 0。

**建議** 結果頁在模擬模式時加上更明顯的浮水印或警示色。

### ✅ #10〔已修復〕首頁 Hero 裝飾字串未標記 aria-hidden

**問題** `Home.jsx` 產生 18 行假 hash 當背景（`opacity 4%`）。

**影響** 多餘 DOM 節點；對閱讀器無意義（未加 `aria-hidden`）。

**建議** 加 `aria-hidden="true"`，或改為 CSS 背景。

---

## 🟢 Low

### ✅ #11〔已修復〕`registry.js` 有未使用欄位
`minPlayers` 與 `en` 目前**沒有任何 UI 使用**（`en` 在簡化 UI 時已被移除顯示）。
建議：保留但註明用途，或移除以免誤導。

### ✅ #12〔已修復〕`contract.js` 存在未被呼叫的匯出
`checkNetwork()`、`switchNetwork()`、`getOnChainState()`、`getFairBetUrl()`
目前**未被任何頁面引用**（網路切換是走 `WalletContext` 的版本）。
建議：確認後移除，或保留並註明為公開 API。

### ✅ #13〔已修復〕`PlayingCard.jsx` 使用了不存在的 Tailwind class
`PlayingCard.jsx:8` 的 `lg` 尺寸為 `'w-18 h-24 text-base'`，
但 **Tailwind 預設 spacing 沒有 `18`**（14 之後跳到 16、20），
且 `tailwind.config.js` **未自訂 spacing** → `w-18` 不會產生任何 CSS。
**影響**：21 點的大尺寸牌沒有明確寬度，靠內容撐開（視覺上仍可用，但非預期尺寸）。
**建議**：改為 `w-[4.5rem]`，或在 `tailwind.config.js` 的 `theme.extend.spacing` 加入 `18: '4.5rem'`。

### ✅ #14〔查核後無此問題〕`.playwright-mcp/`
專案根目錄有 30+ 個 `.yml` 快照檔（開發期產生）。
**查核結果**：早已在 `.gitignore` 中且從未被 git 追蹤，**無需處理**（原記載有誤，已更正）。

### ✅ #15〔已修復〕文件與程式碼不一致
根目錄 `CLAUDE.md` 有 8 處已過時（見 [README.md](./README.md#️-本文件與舊-claudemd-的不一致以程式碼為準)）。
建議：更新 `CLAUDE.md`，或在其中指向本 `docs/`。

---

## 安全性總結

| 面向 | 狀態 |
|---|---|
| 重入攻擊 | ✅ 已用 Checks-Effects-Interactions 防護 |
| 整數溢位 | ✅ Solidity 0.8+ 內建檢查 |
| 存取控制 | ✅ `onlyPlayer` 結算、`onlyOwner` 提領 |
| 償付能力 | ✅ `lockedPayouts` 鎖定機制 |
| 不揭露逃逸 | ✅ `claimExpired` 超時沒收 |
| 隨機源品質 | ✅ CSPRNG（`ethers.randomBytes`） |
| 私鑰管理 | ⚠️ 測試私鑰曾在對話中傳遞，**該帳號僅限測試用，永不可存真實資產** |
| 專業審計 | ❌ 未經第三方審計；僅有 Slither 靜態掃描 |
| 形式化驗證 | ❌ 未做 |

## 可擴充性總結

| 面向 | 評估 |
|---|---|
| 新增遊戲 | 🟢 良好——registry 加一筆 + 新頁面 + 路由；合約 `_resolve` 加分支 |
| 新增鏈 | 🟢 良好——`CHAIN_CONFIG` 加一筆即可 |
| 多人對賭 | 🔴 需重新設計合約（現為單人對莊家） |
| 複雜規則遊戲 | 🔴 受「結果須為 finalRandom 純函數」限制 |
| 高併發 | 🟡 受限於鏈本身出塊速度（L1 約 12 秒） |
