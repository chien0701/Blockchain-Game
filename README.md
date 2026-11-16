# FairChain — 結合 Commit-Reveal 與未來區塊雜湊之區塊鏈可驗證公平博弈系統

> A Blockchain-Based Provably Fair Gaming System Combining Commit–Reveal with a Future Block Hash
>
> 國立雲林科技大學資訊工程系 大學部實務專題（吳宜謙、吳廷岳、李柏勳；指導教授：李建緯）

🌐 線上展示：<https://chien0701.github.io/Blockchain-Game/>（Ethereum Sepolia 測試網，僅使用無價值之測試代幣）

## 協議（FairBet v3）

1. **下注**：玩家在本機產生種子 `seed` 與盲化值 `salt`，只送出承諾 `keccak256(seed‖salt)` 與下注金額；合約記錄 `revealBlock = 下注區塊 + 1`。
2. **等待**：下注當下 `revealBlock` 尚未產生，沒有人（包括玩家自己）能算出結果。
3. **結算**：玩家於 `revealBlock < 區塊 ≤ revealBlock + 256` 內揭露種子；合約驗證承諾，以 `finalRandom = keccak256(seed‖blockhash(revealBlock))` 判定並依規則賠付。
4. **過期**：超過 256 個區塊未結算，任何人可呼叫 `claimExpired`，下注金額留存資金池。
5. **驗證**：任何人以 `getBet()` 讀取證據，另向 RPC 取得區塊雜湊，重算承諾、熵、finalRandom、結果與賠付五項。

本系統實作的是**由玩家單方承諾**的 Commit-Reveal（承諾－揭露）機制，第二份熵由未來區塊雜湊提供，**並非雙方各自獨立承諾之協議**。
殘餘風險為玩家與開獎區塊之出塊者串通；本系統未經專業審計，不應承載真實資產。完整規格見 [docs/PROTOCOL_V3.md](docs/PROTOCOL_V3.md)。

## 引用的既有作法

本專題屬整合應用，下列結構與公式沿用既有文獻與實務，並非本專題首創：

| 項目 | 出處 | 本專題的差異 |
|---|---|---|
| 種子承諾結合未來區塊雜湊 | Volland, *Solidity Patterns: Randomness*（2018）；Bonneau et al., *On Bitcoin as a Public Randomness Source*（2015）；Reutov, *Predicting Random Numbers in Ethereum Smart Contracts*（2018） | 承諾者由受信任之一方改為玩家本人 |
| 賠付鎖定與區塊數期限 | Dice2Win 合約（2018，`lockedInBets`、250 區塊期限） | 逾期時下注金額留存資金池，並設獨立 `Expired` 狀態 |
| 不揭露之押金懲罰 | Chatterjee et al., *Probabilistic Smart Contracts*（ICBC 2019） | 以下注金額作為押金 |
| Crash 倍率函數 | bustabit, *Provably fair and verification*（52 位元，`99 / (1 − X)`） | 去除莊家優勢、改為整數 bps 並設上限 |
| 重入防護 | Checks-Effects-Interactions（Solidity 文件） | — |

完整參考文獻（37 筆）見專題本 [docs/專題本/05_結論與參考文獻.md](docs/專題本/05_結論與參考文獻.md)。

## 遊戲

| 類別 | 遊戲 | 說明 |
|---|---|---|
| 鏈上下注（8 款頁面，合約 9 種遊戲類型） | 骰子／猜硬幣、輪盤、拉霸、Crash、Limbo、幸運轉盤、Plinko、左輪 | 結果為 `finalRandom` 的純函數，由合約判定與賠付 |
| 公平性展示（不防作弊） | 二十一點、猜數字 | 兩把種子皆在瀏覽器產生，只能證明承諾未被偷換 |
| 本機展示 | 挖礦 | 工作量證明教學，不上鏈 |

未連接 MetaMask 時，所有下注遊戲以模擬模式運作（同一套協議，熵由本機產生，不上鏈）。

## 合約（Sepolia）

| 合約 | 地址 | 狀態 |
|---|---|---|
| FairBet v3 | `0xb798377B9bE67114f9302dfB6e9cC8A7Bf2c402c` | 使用中 |
| GameCommitReveal | `0xe9C2a98699FEd3653774783160e65556f7B6aDB3` | 公平性展示用 |
| FairBet v2 | `0x25A753d62A0030680C92473681e4BD52BA42A7e8` | 已停用（協議缺陷），僅供查驗舊局 |

部署紀錄：[contracts/deployments/sepolia.json](contracts/deployments/sepolia.json)。

## 開發

```bash
npm install
npm run dev          # http://localhost:5173/Blockchain-Game/
npm test             # 前端測試（Vitest，61 項）
cd contracts && npx hardhat test   # 合約測試（51 項）
npm run verify:bet -- --rpc <RPC> --address <FairBet v3> --bet <id>   # 不經網站的獨立驗證
```

推送到 `main` 會由 GitHub Actions 先跑完前端與合約測試，再部署到 GitHub Pages。

## 文件

- [docs/PROTOCOL_V3.md](docs/PROTOCOL_V3.md)：協議規格與威脅模型
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：系統架構
- [docs/DECISIONS.md](docs/DECISIONS.md)：設計決策紀錄
- [docs/experiments/](docs/experiments/)：Sepolia 實測原始資料
- [docs/專題本/](docs/專題本/)：實務專題報告
