const { ethers, network, config } = require("hardhat");
const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const git = (cmd) => {
  try { return execSync(`git ${cmd}`, { encoding: "utf8" }).trim(); } catch { return null; }
};
const LOCAL = ["localhost", "hardhat"];

/** 公開 RPC 由多個節點負載平衡，剛部署的合約可能尚未同步到被查詢的節點 */
async function read(fn, tries = 10) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function main() {
  console.log(`\n🚀 部署到網路：${network.name}`);
  console.log("─".repeat(50));

  const dirty = Boolean(git("status --porcelain"));
  if (dirty && !LOCAL.includes(network.name)) {
    console.error("❌ 工作目錄有未提交的修改。公開網路部署必須先 commit，登錄表記錄的 gitCommit 才等於實際部署的原始碼。");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`📬 部署者地址：${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 餘額：${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error("❌ 餘額為 0，請先取得測試幣");
    process.exit(1);
  }

  // ── 1. GameCommitReveal（公平驗證：21點 / Mastermind）──────
  console.log("\n📦 部署 GameCommitReveal...");
  const CR = await ethers.getContractFactory("GameCommitReveal");
  const cr = await CR.deploy();
  await cr.waitForDeployment();
  const crAddress = await cr.getAddress();
  console.log(`✅ GameCommitReveal：${crAddress}`);

  // ── 2. FairBet v3（9 種下注遊戲；熵 = 下注後下一個區塊的雜湊）──
  console.log("\n📦 部署 FairBet...");
  const FB = await ethers.getContractFactory("FairBet");
  const fb = await FB.deploy();
  await fb.waitForDeployment();
  const fbAddress = await fb.getAddress();
  const fbReceipt = await fb.deploymentTransaction().wait();
  console.log(`✅ FairBet v${await read(() => fb.RULES_VERSION())}：${fbAddress}（區塊 #${fbReceipt.blockNumber}）`);

  // ── 3. 注入莊家資金池 ────────────────────────────────────────
  const defaultFund = network.name === "localhost" ? "5" : "0.03";
  const fundAmount  = ethers.parseEther(process.env.POOL_FUND || defaultFund);

  console.log(`\n💵 注入資金池 ${ethers.formatEther(fundAmount)} ETH...`);
  const fundTx = await deployer.sendTransaction({ to: fbAddress, value: fundAmount });
  await fundTx.wait();
  console.log(`✅ 資金池餘額：${ethers.formatEther(await read(() => fb.poolBalance()))} ETH`);

  // ── 4. 部署後驗證 ────────────────────────────────────────────
  const gameCount = await read(() => cr.gameCount());
  const betCount  = await read(() => fb.betCount());
  if (gameCount !== 0n || betCount !== 0n) {
    console.error("❌ 合約狀態異常");
    process.exit(1);
  }
  console.log("✅ 合約驗證通過（gameCount=0, betCount=0）");

  // ── 5. 寫入版本登錄表（受版控；地址為公開資訊）──────────────────
  const crReceipt = await cr.deploymentTransaction().wait();
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const sol = config.solidity.compilers[0];
  const entry = {
    deployedAt:  new Date().toISOString(),
    chainId,
    gitCommit:   git("rev-parse HEAD"),
    gitDirty:    dirty,
    compiler:    { version: sol.version, optimizer: sol.settings.optimizer, evmVersion: sol.settings.evmVersion || "paris" },
    deployer:    deployer.address,
    poolFund:    ethers.formatEther(fundAmount),
    contracts: {
      GameCommitReveal: { address: crAddress, block: crReceipt.blockNumber, tx: crReceipt.hash },
      FairBet:          { address: fbAddress, block: fbReceipt.blockNumber, tx: fbReceipt.hash,
                          rulesVersion: Number(await read(() => fb.RULES_VERSION())), protocol: "future-blockhash" },
    },
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  const history = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  history.unshift(entry);
  fs.writeFileSync(file, JSON.stringify(history, null, 2) + "\n");
  console.log(`\n📝 已寫入版本登錄表 contracts/deployments/${network.name}.json`);
  const deploymentInfo = { chainId };

  // ── 6. 前端設定提示 ──────────────────────────────────────────
  console.log("\n" + "─".repeat(50));
  console.log("📌 請將以下內容填入專案根目錄 .env：");
  console.log(`   VITE_CONTRACT_ADDRESS=${crAddress}`);
  console.log(`   VITE_FAIRBET_ADDRESS=${fbAddress}`);
  console.log(`   VITE_CHAIN_ID=${deploymentInfo.chainId}`);

  const explorers = {
    sepolia:         "https://sepolia.etherscan.io",
    arbitrumSepolia: "https://sepolia.arbiscan.io",
  };
  const explorer = explorers[network.name];
  if (explorer) {
    console.log(`\n🔗 GameCommitReveal：${explorer}/address/${crAddress}`);
    console.log(`🔗 FairBet：${explorer}/address/${fbAddress}`);
    console.log("\n💡 驗證合約原始碼：");
    console.log(`   npx hardhat verify --network ${network.name} ${crAddress}`);
    console.log(`   npx hardhat verify --network ${network.name} ${fbAddress}`);
  }

  console.log("\n✨ 部署完成！\n");
}

main().catch((err) => {
  console.error("❌ 部署失敗：", err);
  process.exitCode = 1;
});
