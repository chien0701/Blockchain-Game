# 實驗原始資料

## sepolia-2026-10-18.json：L1 完整流程實測（交付物 D 的 L1 部分）

由 `contracts/scripts/experiment.js` 產生；欄位說明見該腳本開頭。

| 項目 | 內容 |
|---|---|
| 合約 | FairBet v3 `0xb798377B9bE67114f9302dfB6e9cC8A7Bf2c402c`（Sepolia） |
| 遊戲 | 猜硬幣押正面，2 倍，注金 0.0001 ETH |
| 獨立驗證 | 每局改向 `https://sepolia.drpc.org` 讀取證據並重算五項 |
| 中斷模擬 | 每 10 局丟棄本地 betId，以 `betIdByCommit` 反查後結算 |
| 開始時間 | 2026-10-18 06:16 UTC |

### 有效樣本只有前 38 局

檔案裡有 100 局紀錄，統計只採用第 1–38 局：

| 局 | 狀況 | 原因 |
|---|---|---|
| 1–38 | 37 局完成，第 10 局失敗 | 第 10 局是中斷模擬：下注確認後立刻反查，負載平衡的 RPC 分到尚未同步的節點，`betIdByCommit` 回傳 0（不是報錯），腳本拿 0 去結算而被合約拒絕。**這是真實發現**；腳本已改為回傳 0 時重試，網站前端本來就把 0 當成「還找不到」 |
| 39–48 | 6 局完成、4 局失敗 | 06:40 UTC 誤以同一帳戶另外啟動第二個實驗，兩邊同時送交易造成 nonce 衝突（`replacement transaction underpriced`）。**實驗操作錯誤**，不納入統計 |
| 49–100 | 全部失敗 | 測試幣耗盡（`insufficient funds`） |

### 測試幣為什麼不夠

每局實測約 111 萬 gas（placeBet 約 49.5 萬、settleBet 約 60.5 萬），是本地 Hardhat 的約 3.5 倍。Sepolia 於 2026-10-06 啟用 Glamsterdam 升級，其中 [EIP-8037](https://eips.ethereum.org/EIPS/eip-8037) 把寫入新儲存槽從 20,000 gas 調到 97,920 gas；v3 結算時會寫入種子、salt、熵、finalRandom 等多個新儲存槽。ethers v6 預設付 1 gwei 小費，所以每局約 0.0011 ETH，是注金的 11 倍。

### 主要數字（前 38 局）

| 指標 | 結果 |
|---|---|
| 完成 | 37／38 |
| 第三方獨立驗證通過 | 37／37 |
| 中斷後恢復 | 2／3 |
| 一局總時間 | 中位數 35.5 秒，P95 47.3 秒 |
| 結算到最終確定 | 中位數 16.0 分鐘，P95 18.8 分鐘 |

要補完 100 局：先替測試帳戶補 Sepolia ETH（約 0.07 ETH），再執行

```bash
cd contracts
FAIRBET=0xb798377B9bE67114f9302dfB6e9cC8A7Bf2c402c ROUNDS=100 FAULT_EVERY=10 npx hardhat run scripts/experiment.js --network sepolia
```

**同一時間只能跑一個實驗**，否則會像這次一樣 nonce 衝突。

## odds-analysis.json

由 `node scripts/odds-analysis.mjs` 產生，說明見 [../ODDS_ANALYSIS.md](../ODDS_ANALYSIS.md)。
