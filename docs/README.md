# FairChain 專題技術文件

> **更新（2026-09-08）**：`CLAUDE.md` 已同步更新；多項技術債已修復（見 TECH_DEBT.md）。

> 本文件依 **2026-09-08 當下的實際程式碼** 撰寫。
> 若本文件與程式碼不符，**以程式碼為準**，並請更新本文件。
> 不確定之處已標記「**需要確認**」，未以推論充當事實。

---

## 30 秒理解版

**FairChain 是一套「可證明公平」的區塊鏈博弈系統。**

線上博弈的根本問題是：玩家必須**信任**莊家沒有作弊，卻無法驗證。
FairChain 用 **Commit-Reveal 雙盲協議**把「信任」換成「可驗證的數學」：

1. 開局前，玩家與莊家各自產生隨機種子，把 `keccak256(種子‖salt)` 的**承諾**寫上區塊鏈（此時看不到種子，但事後改不掉）。
2. 開局時雙方公開種子，**智能合約**重算驗證承諾無誤，再合併成 `finalRandom = keccak256(種子P‖種子D)`。
3. 所有遊戲結果都是 `finalRandom` 的**純函數**，所以**合約能自己判定輸贏並自動賠付**，任何第三方也能重算驗證。

目前有 **11 款遊戲**，其中 **9 款可用測試幣真實下注**（合約自動結算），部署在 **Ethereum Sepolia 測試網**。

> 一句話：**不是做一個賭場，而是做一套「結果可被任何人公開驗證、資金在鏈上自動結算」的公平框架，並用多款遊戲證明它通用。**

---

## 文件導覽

| 文件 | 內容 | 什麼時候看 |
|---|---|---|
| [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) | 專題是什麼、解決什麼問題、使用者流程、技術總覽 | **第一份該看的** |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系統架構圖、元件關係、資料流程（含 Mermaid 圖） | 想理解「整體怎麼運作」 |
| [FEATURES.md](./FEATURES.md) | 每個功能的目的／流程／實作／限制 | 想知道「某個功能怎麼做的」 |
| [TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md) | 核心演算法、數學推導、技術選型、設計決策 | 準備口試、深入技術 |
| [DATA_STRUCTURE.md](./DATA_STRUCTURE.md) | 所有資料結構與欄位說明、修改影響範圍 | 要改資料格式前 |
| [TECH_DEBT.md](./TECH_DEBT.md) | 技術債、潛在 Bug、安全性、待改進項目 | 想知道弱點在哪 |
| [MEETING_QA.md](./MEETING_QA.md) | 教授可能問的 50 題與建議回答 | Meeting／口試前 |
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | 新人 3 天上手、修改前必讀、專案地圖 | **新組員從這裡開始動手** |

---

## 快速啟動

```bash
cd C:\Users\lkj75\Documents\Blockchain-Game
npm install
npm run dev
```
開啟 `http://localhost:5173/Blockchain-Game/`（**網址結尾的 `/Blockchain-Game/` 不可省略**）。

線上版：https://chien0701.github.io/Blockchain-Game/

---

## ⚠️ 本文件與舊 CLAUDE.md 的不一致（以程式碼為準）

根目錄 `CLAUDE.md` 有多處已過時，實際程式碼如下：

| CLAUDE.md 寫的 | 實際程式碼 |
|---|---|
| 目標網路：Arbitrum Sepolia | **Ethereum Sepolia（chainId 11155111）** |
| 合約「目前架構層，展示版不上鏈」 | **已實際部署上鏈並可下注結算** |
| 資料儲存：localStorage →「Option B 正在規劃」 | **Option B 已完成**，鏈上為權威來源 |
| `commit = keccak256(seed)` | **`keccak256(seed‖salt)`**（已加 salt） |
| 21 點「莊家不補牌」 | **莊家補牌至 17 點以上**（已實作 Hit/Stand） |
| 線上網址 `nimble05.github.io` | **`chien0701.github.io`** |
| 架構樹只有 4 個 page | **實際有 7 個主頁 + 10 個遊戲頁** |
| push 到 main 觸發自動部署 | ✅ 已修復：workflow 已注入合約地址，CI build 會產出正確的上鏈版本 |
