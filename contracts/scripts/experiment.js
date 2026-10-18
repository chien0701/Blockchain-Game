/**
 * 比較實驗（助教交付物 D 的 L1 部分）：在指定網路上以固定遊戲與注型跑 N 局完整流程並量測。
 *
 *   ROUNDS=100 npx hardhat run scripts/experiment.js --network sepolia
 *
 * 每局：placeBet → 等開獎區塊 → settleBet → 換另一個 RPC 獨立驗證。
 * 每 FAULT_EVERY 局模擬「下注後頁面關閉」：丟棄本地 betId，改以 betIdByCommit(承諾) 反查後再結算。
 * 另以背景輪詢 finalized 區塊，計算每局結算交易到「最終確定」的時間。
 * 原始資料寫入 docs/experiments/<network>-<日期>.json，摘要印在終端機。
 */
const { ethers, network, config } = require("hardhat");
const fs = require("fs");
const path = require("path");
const R = require("../../src/games/random.js");

const ROUNDS = Number(process.env.ROUNDS || 100);
const FAULT_EVERY = Number(process.env.FAULT_EVERY || 10);
const STAKE = ethers.parseEther(process.env.STAKE || "0.0001");
const GAME = { name: "猜硬幣（押正面，2×）", gameType: 1, betType: 0, param: 0 };
const VERIFY_RPCS = {
  sepolia: ["https://sepolia.drpc.org", "https://1rpc.io/sepolia", "https://ethereum-sepolia.blockpi.network/v1/rpc/public"],
  localhost: ["http://127.0.0.1:8545"],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand32 = () => ethers.hexlify(ethers.randomBytes(32));
const commitHash = (s, salt) => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [s, salt]);
const combine = (a, b) => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [a, b]);

async function retry(fn, tries = 8) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries) throw e; await sleep(2500); }
  }
}

async function pickVerifier() {
  for (const url of VERIFY_RPCS[network.name] || []) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      const id = (await p.getNetwork()).chainId;
      if (id === (await ethers.provider.getNetwork()).chainId) return { p, url };
    } catch { /* 換下一個 */ }
  }
  throw new Error("找不到可用的獨立驗證 RPC");
}

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
  return { n: s.length, min: s[0], median: q(0.5), p95: q(0.95), max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length };
}

async function main() {
  const [player] = await ethers.getSigners();
  const fbAddr = process.env.FAIRBET;
  if (!fbAddr) throw new Error("請設定 FAIRBET=<合約地址>");
  const fb = await ethers.getContractAt("FairBet", fbAddr, player);
  const verifier = await pickVerifier();
  const vfb = new ethers.Contract(fbAddr, (await artifacts.readArtifact("FairBet")).abi, verifier.p);
  console.log(`網路 ${network.name}｜合約 ${fbAddr}｜獨立驗證 RPC ${verifier.url}｜${ROUNDS} 局｜${GAME.name}｜注金 ${ethers.formatEther(STAKE)} ETH`);

  const finalized = [];
  let polling = true;
  (async () => {
    while (polling) {
      try { const b = await ethers.provider.getBlock("finalized"); finalized.push([Date.now(), b.number]); } catch { /* 略過 */ }
      await sleep(12000);
    }
  })();

  const rounds = [];
  const balance0 = await ethers.provider.getBalance(player.address);
  for (let i = 1; i <= ROUNDS; i++) {
    const r = { round: i, fault: i % FAULT_EVERY === 0, errors: [] };
    try {
      const seed = rand32(), salt = rand32(), commit = commitHash(seed, salt);
      const t0 = Date.now();
      const tx1 = await fb.placeBet(GAME.gameType, GAME.betType, GAME.param, commit, { value: STAKE });
      const rc1 = await tx1.wait(1);
      const t1 = Date.now();
      const ev = rc1.logs.map((l) => { try { return fb.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "BetPlaced");
      let betId = ev.args.betId; const revealBlock = Number(ev.args.revealBlock);

      if (r.fault) {
        betId = null;
        betId = await retry(() => fb.betIdByCommit(commit));
        r.recovered = betId === ev.args.betId;
      }
      if (["localhost", "hardhat"].includes(network.name)) await ethers.provider.send("evm_mine", []);
      while ((await ethers.provider.getBlockNumber()) < revealBlock) await sleep(1000);
      const t2 = Date.now();

      let rc2, attempts = 0;
      for (;;) {
        attempts++;
        try { rc2 = await (await fb.settleBet(betId, seed, salt)).wait(1); break; }
        catch (e) {
          r.errors.push((e.shortMessage || e.message).slice(0, 120));
          if (attempts >= 3) throw e;
          await sleep(4000);
        }
      }
      const t3 = Date.now();
      const st = rc2.logs.map((l) => { try { return fb.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "BetSettled");

      const b = await retry(() => vfb.getBet(betId));
      const bh = (await retry(() => verifier.p.getBlock(Number(b.revealBlock)))).hash;
      const fr = combine(b.playerSeed, bh);
      const js = R.resolveBet(GAME.gameType, GAME.betType, GAME.param, STAKE, fr);
      const checks = {
        commit: commitHash(b.playerSeed, b.playerSalt) === b.playerCommit,
        entropy: b.entropy === bh,
        finalRandom: b.finalRandom === fr,
        outcome: Number(b.outcome) === js.outcome,
        payout: b.payout === js.payout,
      };
      Object.assign(r, {
        betId: betId.toString(), placeTx: rc1.hash, settleTx: rc2.hash,
        placeBlock: rc1.blockNumber, revealBlock, settleBlock: rc2.blockNumber,
        gasPlace: Number(rc1.gasUsed), gasSettle: Number(rc2.gasUsed),
        feeWei: (rc1.gasUsed * rc1.gasPrice + rc2.gasUsed * rc2.gasPrice).toString(),
        msPlace: t1 - t0, msWaitReveal: t2 - t1, msSettle: t3 - t2, msTotal: t3 - t0, settledAt: t3,
        settleAttempts: attempts, outcome: Number(st.args.outcome), payoutWei: st.args.payout.toString(),
        verified: Object.values(checks).every(Boolean), checks,
      });
    } catch (e) {
      r.failed = true; r.errors.push((e.shortMessage || e.message).slice(0, 160));
    }
    rounds.push(r);
    console.log(`#${i} ${r.failed ? "失敗" : `${(r.msTotal / 1000).toFixed(1)}s 結果 ${r.outcome} 賠付 ${ethers.formatEther(r.payoutWei)} 驗證 ${r.verified ? "通過" : "不符"}${r.fault ? `（中斷恢復 ${r.recovered ? "成功" : "失敗"}）` : ""}`}`);
  }

  const lastSettle = Math.max(...rounds.filter((r) => !r.failed).map((r) => r.settleBlock));
  const deadline = Date.now() + Number(process.env.FINALITY_WAIT_MIN ?? 25) * 60 * 1000;
  while (Date.now() < deadline && (!finalized.length || finalized[finalized.length - 1][1] < lastSettle)) await sleep(12000);
  polling = false;
  for (const r of rounds) {
    if (r.failed) continue;
    const hit = finalized.find(([, n]) => n >= r.settleBlock);
    r.msToFinalized = hit ? hit[0] - r.settledAt : null;
  }

  const ok = rounds.filter((r) => !r.failed);
  const faults = rounds.filter((r) => r.fault);
  const balance1 = await ethers.provider.getBalance(player.address);
  const summary = {
    network: network.name, chainId: Number((await ethers.provider.getNetwork()).chainId), contract: fbAddr,
    game: GAME, stakeEth: ethers.formatEther(STAKE), rounds: ROUNDS, startedAt: new Date(rounds[0]?.settledAt || Date.now()).toISOString(),
    verifierRpc: verifier.url,
    txPerRound: 2, signaturesPerRound: 2,
    successRate: ok.length / ROUNDS,
    verifiedRate: ok.filter((r) => r.verified).length / Math.max(ok.length, 1),
    recoveryRate: faults.filter((r) => r.recovered).length / Math.max(faults.length, 1),
    faultRounds: faults.length,
    settleRetries: ok.filter((r) => r.settleAttempts > 1).length,
    gasPlace: stats(ok.map((r) => r.gasPlace)), gasSettle: stats(ok.map((r) => r.gasSettle)),
    gasPerRound: stats(ok.map((r) => r.gasPlace + r.gasSettle)),
    feeWeiPerRound: stats(ok.map((r) => Number(r.feeWei))),
    secPlace: stats(ok.map((r) => r.msPlace / 1000)), secWaitReveal: stats(ok.map((r) => r.msWaitReveal / 1000)),
    secSettle: stats(ok.map((r) => r.msSettle / 1000)), secTotal: stats(ok.map((r) => r.msTotal / 1000)),
    secSettleToFinalized: stats(ok.filter((r) => r.msToFinalized != null).map((r) => r.msToFinalized / 1000)),
    wins: ok.filter((r) => BigInt(r.payoutWei) > STAKE).length,
    empiricalRtp: ok.reduce((a, r) => a + Number(BigInt(r.payoutWei)), 0) / (ok.length * Number(STAKE)),
    playerBalanceChangeEth: ethers.formatEther(balance1 - balance0),
  };
  const dir = path.join(config.paths.root, "..", "docs", "experiments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ summary, rounds }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  console.log("原始資料：", file);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
