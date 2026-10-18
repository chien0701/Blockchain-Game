# 交付物 A：鏈的候選比較

> 撰寫日期：2026-10-18｜所有外部說法都附官方來源與檢索日期，**未附來源的句子是我們自己的推論**，會標「推論」。
> 起點是 [PROTOCOL_V3.md](./PROTOCOL_V3.md) §1 的部署圖：換一條鏈之後，每條箭頭的**簽署者、付費者、可拒絕者**會怎麼變，以及 v3 依賴的「未來區塊雜湊」還成不成立。

---

## 一、分類軸（助教第 02 頁）

| 軸 | 選項 | 對 FairChain 的意義 |
|---|---|---|
| 誰能加入驗證 | 無許可（公鏈） / 許可（聯盟鏈） | 無許可才有「任何第三方都能驗證」；許可鏈的驗證者限於成員 |
| 執行環境 | EVM / 非 EVM | EVM 可以直接沿用 `FairBet.sol`；非 EVM 需要重寫合約與前端 |
| 排序者 | 輪替的驗證者 / 單一排序器 / 排序服務 | 決定「誰能影響開獎區塊」：v3 的殘餘風險就是排序者與玩家串通 |
| 最終性 | 機率性加檢查點 / 排序器軟確認加 L1 硬最終性 / 即時 | 決定「結果顯示後還會不會變」 |
| 鏈上亂數來源 | 區塊雜湊、RANDAO / 不安全或常數 / 無 | 決定 v3 協議能不能原樣搬過去 |

---

## 二、候選比較

| 項目 | Ethereum L1（Sepolia） | Arbitrum（EVM Rollup） | OP Stack（EVM Rollup，例：Base） | Solana（非 EVM） | Hyperledger Fabric（許可鏈） |
|---|---|---|---|---|---|
| 出塊／排序 | 驗證者輪流提議；每個 slot 12 秒，32 slot 為一個 epoch [E1] | 排序器負責接收、准入、排序交易並發布區塊 [A2] | 排序器排序（推論：與 Arbitrum 同類） | 領導者輪替；共識 Tower BFT 或 Alpenglow [S1] | 排序服務只排序、打包，不檢查內容 [F2] |
| 最終性 | 檢查點在每個 epoch 開始；最終確定後要推翻須犧牲至少 1/3 質押 [E1]。我們實測到的「結算 → 最終確定」時間見交付物 D | 排序器的軟確認依賴排序器誠實；批次在母鏈最終確定後才是硬最終性 [A2] | 同類（推論） | processed → confirmed（≥ 66% 質押投票）→ finalized（其上再疊 31 個以上 confirmed 區塊）[S1] | 背書、排序、驗證三階段；交易經背書策略驗證後標為有效或無效 [F2] |
| `blockhash` 能不能當熵 | 可取最近 256 個區塊；出塊者可放棄出塊來重抽（見第三節） | **不行**：官方說 `blockhash(x)` 是「密碼學上不安全的偽隨機值」，不應作為安全亂數來源 [A1] | 可呼叫，但 L2 區塊由排序器產生（推論：排序器可調整交易順序來改變雜湊） | 無 EVM `blockhash`；程式不能自己產生亂數，一般用預言機的 VRF [S2] | 鏈碼在多個背書節點各跑一次，結果必須一致，否則背書不吻合、交易失效 [F1]，所以鏈碼內不能自己產生亂數（推論） |
| `prevrandao` | RANDAO；每個提議者有 1 bit 影響力 [E2] | 常數 1 [A1] | L1 起源區塊的 RANDAO [O1] | 不適用 | 不適用 |
| 部署圖：誰簽署 | 玩家簽 `placeBet` 與 `settleBet` | 相同 | 相同 | 玩家簽 commit 與 reveal 兩筆，預言機另簽 VRF 結果 [S2] | 提案由成員身分（MSP 憑證）簽署，背書節點也要簽 [F2] |
| 誰付費 | 玩家付 gas | 玩家付 L2 gas（含 L1 資料費） | 同左 | 玩家付交易費與預言機費用 | 無 gas；成本由營運組織承擔 |
| 誰可拒絕 | 出塊者可不收交易，但下一個出塊者會收 | 排序器可不收；可經母鏈的延遲收件匣強制納入，窗口介於 30 分鐘到 24 小時 [A2] | 同類（推論） | 領導者可不收；預言機可不回應 | 排序服務或背書節點可拒絕；沒有公開的強制納入管道 |
| 第三方能否驗證 | 能，任何人用公開 RPC | 能 | 能 | 能 | **只有成員**能讀帳本 |
| v3 能否原樣搬遷 | ✅ 目前部署 | ❌ 熵來源不安全，必須換 VRF | 🟡 合約可部署，但信任對象從輪替驗證者變成單一排序器 | ❌ 重寫合約，熵改用 VRF | ❌ 失去公開驗證，亂數須改成成員之間的 commit-reveal |

---

## 三、對 v3 本身的影響

1. **一個區塊的前瞻太短。** EIP-4399 建議應用使用「有足夠前瞻的未來亂數」，並建議至少 4 個 epoch [E2]。v3 用的是**下注區塊的下一個區塊**，所以出塊者只要願意放棄那個區塊的收益，就能讓開獎改用另一個區塊重抽一次。這正是 Slither `weak-prng` 標出的風險，也是 PROTOCOL §7 寫的殘餘風險。前瞻拉長能讓「誰是開獎區塊的出塊者」在下注當下更難預知，代價是每局要等更久，以及 256 個區塊的 `blockhash` 視窗限制。我們目前**沒有**改動，理由與成本見 DECISIONS。
2. **搬到 L2 前一定要先換熵來源。** Arbitrum 官方明說 `blockhash` 不安全 [A1]；OP Stack 的區塊由排序器產生（推論：排序器能挑選雜湊）。可行的替代是 Chainlink VRF：亂數附帶證明，證明在鏈上驗證後才能使用 [V1]。但 VRF 把信任移到預言機的私鑰上；官方也寫明，金鑰外洩且攻擊者又能產生目標鏈的區塊時，結果可被嚴重偏移 [V1]。
3. **最終性要分開顯示。** L1 的「已確認」與「已最終確定」差約兩個 epoch；L2 的軟確認依賴排序器誠實 [A2]。前端目前在結算後會輪詢 `finalized` 區塊並分開標示（`FinalityBadge`），驗證頁也會顯示熵所在區塊是否已最終確定。

---

## 四、結論

- **現階段留在 Ethereum L1（Sepolia）**：它是表中唯一同時滿足「EVM 可直接部署」、「區塊雜湊不是官方標示為不安全」、「任何第三方能驗證」的選項。
- **若要搬到 L2**：先把熵改成 VRF，再做交付物 D 的 L1 對 L2 比較；只換鏈不換熵，安全性會變差。
- **非 EVM、許可鏈**：不適合本專題的目標。前者要整套重寫；後者失去公開驗證，而公開驗證正是本專題要展示的性質。

---

## 來源（檢索日期皆為 2026-10-18）

| 代號 | 來源 |
|---|---|
| E1 | ethereum.org, *Proof-of-stake (PoS)*. https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/ |
| E2 | M. Kalinin, D. Ryan, *EIP-4399: Supplant DIFFICULTY opcode with PREVRANDAO*, Security Considerations. https://eips.ethereum.org/EIPS/eip-4399 |
| A1 | Arbitrum Docs, *Solidity support*. https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/solidity-support |
| A2 | Arbitrum Docs, *Sequencer*. https://docs.arbitrum.io/how-arbitrum-works/deep-dives/sequencer |
| O1 | Optimism Docs, *Differences between Ethereum and OP Stack chains*. https://docs.optimism.io/stack/differences |
| S1 | Anza (Agave) Docs, *Commitment Status*. https://docs.anza.xyz/consensus/commitments |
| S2 | QuickNode Guides, *Generate onchain random numbers with Switchboard VRF*（第三方教學，非 Solana 官方）. https://www.quicknode.com/guides/solana-development/3rd-party-integrations/generate-onchain-random-numbers-with-switchboard-vrf |
| F1 | Hyperledger Fabric Docs, *Writing Your First Chaincode*（JSON determinism 一節）. https://hyperledger-fabric.readthedocs.io/en/latest/chaincode4ade.html |
| F2 | Hyperledger Fabric Docs, *Transaction Flow*. https://hyperledger-fabric.readthedocs.io/en/latest/txflow.html |
| V1 | Chainlink Docs, *Chainlink VRF*. https://docs.chain.link/vrf |
