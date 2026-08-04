# 合約分析報告（Gas + 靜態安全）

> 供論文第五章「效能分析 / 安全性」引用。工具:hardhat-gas-reporter、Slither 0.11.6。

## 一、Gas 效能分析

編譯設定:Solidity 0.8.24、optimizer 啟用(runs=200)、evm=paris。

### 函式執行成本（gas）

| 合約 | 函式 | 最小 | 最大 | 平均 |
|---|---|---|---|---|
| FairBet | `placeBet`（下注） | 189,221 | 226,278 | **199,221** |
| FairBet | `settleBet`（結算+賠付） | 93,343 | 142,618 | **132,844** |
| FairBet | `claimExpired`（超時沒收） | — | — | 59,746 |
| GameCommitReveal | `commitGame` | 140,419 | 157,531 | **151,461** |
| GameCommitReveal | `revealGame` | 171,083 | 171,107 | **171,103** |

### 部署成本

| 合約 | 部署 gas | 佔區塊上限 |
|---|---|---|
| FairBet | 1,358,713 | 2.3% |
| GameCommitReveal | 424,766 | 0.7% |

### 觀察
- 一局完整下注（placeBet + settleBet）約 **332,000 gas**;以 Sepolia/L2 的低 gas price,單局成本極低。
- 變動倍率的 `settleBet` 因遊戲而異(93k~143k),Plinko 的 16 次迴圈使其偏上緣。
- 結論:成本可接受;若上主網,可用 L2(Arbitrum)進一步降低。

## 二、Slither 靜態安全分析

分析範圍:2 個合約、102 個偵測器。結果:**6 項,全部為低危/資訊性,無高危或中危漏洞。**

| 偵測項 | 等級 | 評估 |
|---|---|---|
| reentrancy-events | 資訊 | 僅事件發射順序;狀態變更已由 Checks-Effects-Interactions 保護,無實質重入風險 |
| timestamp | 低 | `claimExpired` 用 block.timestamp 判斷 1 小時超時;礦工可操縱約 ±15 秒,對 1 小時窗口影響可忽略 |
| low-level-calls | 資訊 | 使用 `.call{value:}` 轉帳,此為現行推薦做法(非漏洞) |
| cyclomatic-complexity | 資訊 | `_resolve` 為多遊戲分支,結構複雜但可讀 |
| immutable-states | 優化 | **已採納**:`owner` 改為 `immutable`,省 gas |

### 結論
- **無重入、無整數溢位（0.8+ 內建檢查）、無存取控制漏洞、無 tx.origin 誤用。**
- 已依 Slither 建議將 `owner` 宣告為 `immutable`。
- 剩餘提示均為可接受的設計取捨,並於論文「限制」章說明。
- 未來工作:專業第三方審計(audit)、形式化驗證。
