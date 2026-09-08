# 核心技術細節

## 一、核心程式碼地圖

| 重要性 | 檔案 | 負責什麼 |
|---|---|---|
| ★★★★★ | `contracts/contracts/FairBet.sol` | 下注收款、承諾驗證、結果判定、變動倍率、自動賠付、資金池安全 |
| ★★★★★ | `src/utils/crypto.js` | 承諾與最終隨機數的密碼學計算（前後端一致性的源頭） |
| ★★★★★ | `src/games/random.js` | 前端結果計算，須與合約 `_resolve` 逐位元相同 |
| ★★★★ | `src/hooks/useBetting.js` | 三模式流程狀態機（bet / plain / mock） |
| ★★★★ | `src/utils/contract.js` | 所有鏈上讀寫封裝、唯讀 provider |
| ★★★ | `src/utils/gameLogic.js` | 21 點洗牌（xorshift + Fisher-Yates）、計分、勝負 |
| ★★★ | `src/utils/storage.js` | localStorage 集中管理與統計聚合 |
| ★★ | `contracts/contracts/GameCommitReveal.sol` | 無金流的純公平驗證合約 |

---

## 二、密碼學核心

### 2-1 承諾方案（Commitment Scheme）

```js
// src/utils/crypto.js
commitHash(seed, salt) = ethers.solidityPackedKeccak256(['bytes32','bytes32'], [seed, salt])
combineSeeds(sP, sD)   = ethers.solidityPackedKeccak256(['bytes32','bytes32'], [sP, sD])
```
```solidity
// FairBet.sol:135-138
keccak256(abi.encodePacked(playerSeed, playerSalt)) == b.playerCommit
bytes32 fr = keccak256(abi.encodePacked(playerSeed, dealerSeed));
```

**輸入**：兩個 32-byte 值　**輸出**：一個 32-byte 雜湊
**為什麼這樣設計**：`ethers.solidityPackedKeccak256` 與 Solidity 的
`keccak256(abi.encodePacked(...))` 是**位元層級等價**的編碼，
確保前端算出的承諾與合約算出的完全相同——這是「任何人可重算驗證」的前提。

**為什麼要 salt**：若種子取值空間小（例如只有正／反兩種），
攻擊者可窮舉所有可能算出 hash 反推承諾（字典／彩虹表攻擊）。
加上 32-byte 隨機 salt 後需窮舉 2²⁵⁶ 種組合，實務上不可行。
本專案種子本身已是 32-byte 隨機，salt 的作用是**縱深防禦 + 業界標準實踐**，
並讓相同種子在不同局產生不同承諾。

**隨機源**：`ethers.randomBytes(32)` 底層為密碼學安全亂數（CSPRNG），
**不是** `Math.random()`——隨機源品質決定整個公平性的上限。

---

### 2-2 Crash／Limbo 崩盤倍率：完整推導 ★

合約與前端使用相同公式（`FairBet.sol:176-180`、`random.js:24-28`）：

$$\text{crashX} = \frac{E}{E-h},\qquad E = 2^{52},\quad h = \text{uint256}(\text{finalRandom}) \bmod 2^{52}$$

（實作乘上 10000 轉為 bps 整數，並於 1,000,000 bps（100×）封頂）

**推導**

1. `finalRandom` 為均勻 256-bit 亂數，取模後 $h$ 在 $[0, E)$ **均勻分布**。
2. 求玩家撐到 $m$ 倍的機率：

$$P\!\left(\frac{E}{E-h}\ge m\right)=P\!\left(E-h\le \frac{E}{m}\right)=P\!\left(h\ge E\left(1-\tfrac{1}{m}\right)\right)$$

3. 代入均勻分布：

$$=\frac{E-E\left(1-\frac{1}{m}\right)}{E}=\frac{E/m}{E}=\boxed{\frac{1}{m}}$$

**結論**：$P(\text{crash}\ge m)=1/m$。撐到 2× 機率 1/2、10× 機率 1/10。

4. 期望值（設目標倍率 $m$，贏得 $m$ 倍）：

$$E[\text{payout}] = m\cdot\frac{1}{m} + 0\cdot\left(1-\frac{1}{m}\right) = 1$$

**期望值 = 1，數學上零莊家優勢。** 實務上的微小優勢僅來自 100× 封頂截斷長尾。

> 這個結論已由 `/lab` 蒙地卡羅模擬實證：10,000 局實測 RTP ≈ 0.99，誤差約 1%。

---

### 2-3 Plinko：二項分布

彈珠經 16 排釘子，每排左右各 1/2，落點 = 往右次數：

$$P(\text{落在第 }k\text{ 槽}) = \binom{16}{k}\left(\tfrac12\right)^{16} = \frac{\binom{16}{k}}{65536}$$

- 正中（k=8）：$12870/65536 \approx 19.6\%$ → 倍率最低（0.5×）
- 最邊（k=0 或 16）：$1/65536 \approx 0.0015\%$ → 倍率最高（16×）

實作：`popcount(uint256(fr) & 0xFFFF)`（合約 `FairBet.sol:223-226`、前端 `random.js:39-43`）。
**倍率表設計理念**：高倍率配極低機率，使期望值可控、資金池不被打爆。

---

### 2-4 其他遊戲的結果映射

| 遊戲 | 公式 | 檔案位置 |
|---|---|---|
| 骰子 | `uint32(bytes4(fr)) % 6 + 1` | FairBet.sol:186 |
| 硬幣 | `uint32(bytes4(fr)) % 2` | FairBet.sol:191 |
| 輪盤 | `uint32(bytes4(fr)) % 37` | FairBet.sol:195 |
| 拉霸 | 三段 `bytes4(fr << 0/32/64) % 6` | FairBet.sol:207-209 |
| 轉盤 | `uint256(fr) % 8` → 8 段倍率表 | FairBet.sol:219 |
| 左輪 | `uint256(fr) % 6`，存活條件 `chamber >= 子彈數` | FairBet.sol:230-232 |

> ⚠️ **取模偏差（modulo bias）**：$2^{32}$ 不能被 6 或 37 整除，
> 某些結果機率會**極微幅**偏高。嚴謹做法是拒絕採樣（rejection sampling）。
> 本專案採用取模是可接受的簡化，**應在論文「限制」章誠實說明**。

---

### 2-5 21 點洗牌：xorshift + Fisher-Yates

```js
// src/utils/gameLogic.js:5-27
function makePrng(hex) {
  let s = (parseInt(raw.slice(0,8),16) ^ parseInt(raw.slice(8,16),16)) >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s>>>0)/4294967296; };
}
for (let i = 51; i > 0; i--) { const j = Math.floor(rand()*(i+1)); swap(deck[i], deck[j]); }
```

**為什麼需要 PRNG 而不直接用 finalRandom 的 byte？**
`finalRandom` 只有 32 bytes，洗 52 張牌時 byte 不夠用，
早期版本重複使用 byte 造成**洗牌分布偏差**；改用 xorshift 由 finalRandom 種子化後，
可產生足量亂數且維持確定性（同一 finalRandom 永遠洗出同一副牌）。

**Fisher-Yates 的性質**：可證明每種排列出現機率相等，複雜度 O(n)。

---

## 三、合約安全三道防線

### 防線一：資金池鎖定（償付能力保證）

```solidity
uint256 potential = maxPayout(gameType, betType, param, msg.value);
uint256 available = address(this).balance - lockedPayouts;
if (potential > available) revert PoolInsufficient(potential, available);
lockedPayouts += potential;
```
下注時即鎖定該注的**最大可能賠付**；莊家 `withdraw()` 也只能提領未鎖定部分。
保證合約**永遠賠得出每一筆已接受的注**。

### 防線二：超時沒收（防不揭露逃逸）

Commit-Reveal 的經典漏洞：玩家發現會輸就不揭露，想賴掉賭注。
`claimExpired(betId)` 讓**任何人**在 1 小時後沒收該注入池，使「不揭露」無利可圖。

### 防線三：重入防護（Checks-Effects-Interactions）

```solidity
// FairBet.sol:141-148
lockedPayouts -= maxPayout(...);          // Effects：先改狀態
b.state = BetState.Settled;
if (payout > 0) { msg.sender.call{value: payout}(""); }   // Interactions：最後才轉錢
```
即使收款方是惡意合約並重入，再次進入時 `state` 已是 `Settled`，直接 `revert AlreadySettled`。
未使用 OpenZeppelin `ReentrancyGuard`，而以 CEI 手法達成同等保護並省 gas。

---

## 四、量化分析結果

### Gas 成本（hardhat-gas-reporter，optimizer runs=200）

| 函式 | 平均 gas |
|---|---|
| `placeBet` | 199,221 |
| `settleBet` | 132,844 |
| `claimExpired` | 59,746 |
| `commitGame` | 151,461 |
| `revealGame` | 171,103 |
| FairBet 部署 | 1,358,713（區塊上限 2.3%） |
| GameCommitReveal 部署 | 424,766 |

一局完整下注（placeBet + settleBet）約 **332,000 gas**。

### Slither 靜態分析（0.11.6，2 合約 / 102 偵測器）

**6 項結果，全部為低危或資訊性，無高／中危漏洞。**

| 偵測項 | 等級 | 評估 |
|---|---|---|
| reentrancy-events | 資訊 | 僅事件順序，狀態已由 CEI 保護 |
| timestamp | 低 | 1 小時超時窗口，礦工可操縱 ±15 秒可忽略 |
| low-level-calls | 資訊 | `.call{value:}` 是現行推薦轉帳做法 |
| cyclomatic-complexity | 資訊 | `_resolve` 多遊戲分支 |
| immutable-states | 優化 | **已採納**，`owner` 改為 `immutable` |

完整報告見 `contracts/ANALYSIS.md`。

> ⚠️ **注意**：`owner` 改 `immutable` 是在**目前線上合約部署之後**才改的，
> 因此鏈上 bytecode 與現在的原始碼**不一致**。若要做 Etherscan 原始碼驗證，
> 需先重新部署（見 TECH_DEBT.md #2）。

---

## 五、技術選型

| 技術 | 用途 | 為什麼使用 | 替代方案（與未採用原因） |
|---|---|---|---|
| **React 18** | UI 框架 | 遊戲流程是明確的**狀態機**（commit→reveal→play→result），React 的宣告式狀態管理天然契合；元件化讓 11 款遊戲共用 CommitRevealFlow 等元件 | Vue（團隊不熟）／原生 JS（狀態管理會失控） |
| **Vite 5** | 建置工具 | 啟動與 HMR 快；原生支援 `import.meta.env` 環境變數；設定 `base` 即可配合 GitHub Pages 子路徑 | CRA（已停止維護、慢）／Webpack（設定繁瑣） |
| **ethers.js v6** | 區塊鏈互動 | 提供 `solidityPackedKeccak256` 讓前端能算出與 Solidity **完全相同**的雜湊；`BrowserProvider`／`JsonRpcProvider` 分離讓唯讀驗證不需錢包 | web3.js（API 較舊、體積大）／viem（團隊不熟） |
| **Keccak256** | 雜湊函數 | EVM 原生，Solidity 與 ethers 皆內建，確保前後端逐位元一致 | SHA-256（合約端需額外實作、gas 貴、與 EVM 生態不合）／MD5、SHA-1（已被攻破） |
| **Solidity 0.8.24** | 合約語言 | 0.8+ **內建整數溢位檢查**；custom error 比 `require(string)` 省 gas | Vyper（生態與工具鏈較小） |
| **Hardhat** | 合約開發框架 | 測試、gas 報告、部署腳本、本地鏈一體；`hardhat-toolbox` 開箱即用 | Truffle（衰退中）／Foundry（需寫 Solidity 測試，團隊 JS 較熟） |
| **TailwindCSS** | 樣式 | 自訂 `electric`／`ink` 色票形成設計系統；不需維護獨立 CSS 檔 | CSS Modules／styled-components（樣式分散、需額外執行期成本） |
| **GSAP + ScrollTrigger** | 動畫 | 首頁需要捲動驅動的敘事動畫；`useGSAP` 自動清理，相容 React StrictMode | Framer Motion（scroll 控制較弱）／純 CSS（無法做 scrub 綁定） |
| **localStorage** | 本地儲存 | 純前端架構下的零成本持久化；權威資料在鏈上，本機只是快取 | IndexedDB（此規模過重）／後端資料庫（會引入需被信任的中心化元件，違背命題） |
| **Ethereum Sepolia** | 部署鏈 | 免費測試幣、公開可驗證、Etherscan 生態完整 | 本地 Hardhat（第三方無法驗證，**推翻命題**）／主網（要真錢，無必要）／Arbitrum Sepolia（原本設定，但水龍頭取得測試幣較困難） |
| **GitHub Pages** | 網站部署 | 免費、與 repo 綁定、靜態站足夠 | Vercel／Cloudflare Pages（功能更多但此專案不需要） |

---

## 六、重要設計決策（問題 → 選項 → 選擇 → 原因 → Trade-off）

### 決策 1：所有遊戲結果必須是 finalRandom 的純函數

- **問題**：合約要能自動賠付，就必須自己知道輸贏；但不能相信前端回報。
- **選項**：(a) 前端回報結果 (b) 預言機回報 (c) 合約自己從 finalRandom 計算
- **選擇**：(c)
- **原因**：只有 (c) 是去信任的。(a) 玩家會謊報；(b) 引入新的信任假設與成本。
- **Trade-off**：**限制了哪些遊戲能上鏈**。21 點有玩家中途決策，結果不是單一純函數，
  因此只能做公平驗證、不能下注。這是架構的必然結果，不是偷懶。

### 決策 2：採用 Commit-Reveal 而非 Chainlink VRF

- **問題**：區塊鏈是確定性的，如何取得不可預測且可驗證的隨機數？
- **選項**：(a) blockhash (b) Chainlink VRF (c) Commit-Reveal (d) MPC/門檻簽章
- **選擇**：(c)
- **原因**：(a) 可被驗證者操縱，有已知漏洞；(b) 需付費與預言機，且是**單方隨機**，
  教學上不如「雙方共同決定」能展示互不信任下的公平；(d) 對兩方賽局過度設計。
- **Trade-off**：需要兩筆交易（延遲與 gas 加倍），且有「不揭露逃逸」問題（以超時沒收解決）。

### 決策 3：變動倍率統一用 bps 整數

- **問題**：Crash／Plinko 等遊戲賠率不固定，但 Solidity 沒有浮點數。
- **選項**：(a) 固定倍率（放棄這些遊戲）(b) 定點數 bps 整數 (c) 前端算倍率傳給合約
- **選擇**：(b)，`payout = amount × multiplierBps / 10000`
- **原因**：整數運算才能保證前後端逐位元一致；(c) 違反決策 1。
- **Trade-off**：精度受限於萬分位；除法順序必須前後端一致（先乘後除）。

### 決策 4：三模式降級（bet / plain / mock）

- **問題**：沒有 MetaMask 或沒設合約地址的人（例如口試現場網路異常）也要能展示。
- **選項**：(a) 強制上鏈 (b) 只做模擬 (c) 依環境自動降級
- **選擇**：(c)，判斷邏輯在 `useBetting.js:53`
- **原因**：展示韌性；同一份程式碼支援教學與真實兩種情境。
- **Trade-off**：三條路徑都要測試；容易出現「以為在上鏈其實在模擬」的混淆
  （已用畫面上的模式標籤緩解）。

### 決策 5：權威資料放鏈上，localStorage 只做快取

- **問題**：要不要做後端資料庫？
- **選項**：(a) 後端 + DB (b) 純前端 + localStorage (c) 兩者皆有
- **選擇**：(b)
- **原因**：引入後端就引入了「需要被信任的中心化元件」，與專題命題矛盾。
- **Trade-off**：紀錄無法跨裝置同步；清除瀏覽器資料就沒了本地歷史
  （但鏈上資料仍在，可由 Game ID 驗證）。
