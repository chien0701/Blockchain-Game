# 合約分析報告（Gas + 靜態安全）

> 量測日期：2026-10-02｜對象：FairBet **v3**（原始碼現況）、GameCommitReveal
> 工具：hardhat-gas-reporter 1.0.10、Slither 0.11.6｜編譯：Solidity 0.8.24、optimizer runs=200、evm=paris
> v2（已停用）的舊數據保留在文末，僅供對照。

## 一、Gas 效能（Hardhat 本機網路，51 個測試的統計）

| 合約 | 函式 | 最小 | 最大 | 平均 |
|---|---|---|---|---|
| FairBet v3 | `placeBet`（下注＋承諾） | 128,347 | 165,538 | **約 150,560** |
| FairBet v3 | `settleBet`（揭露＋判定＋賠付） | 約 132,700 | 約 187,000 | **約 161,000–164,000** |
| FairBet v3 | `claimExpired`（宣告過期） | 33,727 | 33,772 | 33,738 |
| GameCommitReveal | `commitGame` | 140,419 | 157,531 | 151,461 |
| GameCommitReveal | `revealGame` | 171,071 | 171,107 | 171,100 |

| 部署 | gas | 佔區塊上限 |
|---|---|---|
| FairBet v3 | 1,427,945 | 2.4% |
| GameCommitReveal | 424,766 | 0.7% |

`settleBet` 的平均值會因每次測試的隨機結果而略有浮動（約 161k–164k）。

### 觀察

- **一局（下注＋結算）約 31.3 萬 gas**，比 v2 的約 33.2 萬略低。
  - `placeBet` 變便宜（約 −49k）：不再寫入莊家承諾，且 `player / gameType / betType / state / revealBlock` 打包在同一個儲存槽。
  - `settleBet` 變貴（約 +30k）：把種子、salt、熵寫進 storage。這是**刻意的取捨**——驗證者可以直接用 `getBet()` 讀到完整證據，不必再查歷史日誌（v2 因 RPC 限制日誌查詢而常常只能「部分驗證」，見助教 R06／T09）。
- 以上是 **gas 單位**，不是費用。實際費用 = gas × 當時 gas price，測試網的數字不能直接外推主網（助教 P2）。
- Plinko 的 16 次迴圈讓 `settleBet` 落在上緣；可改成位元運算 popcount，但可讀性差，目前保留。

## 二、Slither 靜態分析

### FairBet v3：18 筆（4 類偵測器）

| 偵測器 | 筆數 | Slither 等級 | 判斷 |
|---|---|---|---|
| **weak-prng** | 13 | **High** | **真陽性，對應已知殘餘風險**（見下） |
| reentrancy-events | 2 | Low | 事件在外部呼叫後才發出；狀態已先更新（Checks-Effects-Interactions），測試「收款時重入 settleBet 只拿到一次賠付」已涵蓋 |
| low-level-calls | 2 | Informational | 以 `.call{value:}` 轉帳，是目前建議寫法 |
| cyclomatic-complexity | 1 | Informational | `resolve()` 有 9 種遊戲分支 |

v2 曾有的 `timestamp`（以 `block.timestamp` 判斷逾時）已消失：v3 改用區塊高度計算期限。

GameCommitReveal：0 筆。

#### weak-prng 的解讀

Slither 追蹤到 `finalRandom` 的來源包含 `blockhash`，因此把所有對它取模的地方都標成弱亂數。**這個判斷是對的**：

- 產出 `revealBlock` 的出塊者，可以調整區塊內容，或乾脆不出塊，藉此影響 `blockhash`。
- 出塊者**不知道玩家的種子**，所以單獨行動時無法把某一局導向特定結果。只有在**玩家與該區塊出塊者串通**時，才能真正操控。
- 這是採用「未來區塊雜湊」方案時就已經知道並接受的代價（決策紀錄見 `docs/DECISIONS.md` D1）。上主網或處理高額注金時，應改用 VRF。

#### v2 → v3 的教訓（助教 R08）

| | Slither 結果 | 實際協議安全性 |
|---|---|---|
| v2 | **沒有** High／Medium | 玩家可同時提交雙方承諾，下注前就能算出結果，**100% 必贏**（助教 T03 已在本機重現） |
| v3 | 13 筆 High（weak-prng） | 玩家無法預知結果；只剩「玩家與出塊者串通」這個已知風險 |

靜態分析看的是**程式碼模式**，它不知道「誰能決定亂數」這種**協議層**的問題。v2 掃描乾淨卻完全可被利用，v3 被標了高危卻比 v2 安全得多。因此本專題**不再**用「Slither 無高危漏洞」來論證安全性；Slither 只是低成本的第一道防線，結果必須放回威脅模型裡解讀。

### 仍未做的

- 第三方專業審計
- 形式化驗證
- 主網或公開測試網的 MEV、重組實驗

## 附錄：v2 舊數據（已停用）

| 函式 | 平均 gas |
|---|---|
| `placeBet` | 199,221 |
| `settleBet` | 132,844 |
| `claimExpired` | 59,746 |
| 部署 FairBet v2 | 1,358,713 |

v2 的 Slither 結果：6 筆，皆為 Low／Informational（reentrancy-events、timestamp、low-level-calls、cyclomatic-complexity、immutable-states）。
