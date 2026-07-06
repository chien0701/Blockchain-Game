const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log(`\n🚀 部署到網路：${network.name}`);
  console.log("─".repeat(50));

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

  // ── 2. FairBet（鏈上下注：骰子 / 硬幣 / 輪盤 / 拉霸）────────
  console.log("\n📦 部署 FairBet...");
  const FB = await ethers.getContractFactory("FairBet");
  const fb = await FB.deploy();
  await fb.waitForDeployment();
  const fbAddress = await fb.getAddress();
  console.log(`✅ FairBet：${fbAddress}`);

  // ── 3. 注入莊家資金池 ────────────────────────────────────────
  const defaultFund = network.name === "localhost" ? "5" : "0.03";
  const fundAmount  = ethers.parseEther(process.env.POOL_FUND || defaultFund);

  console.log(`\n💵 注入資金池 ${ethers.formatEther(fundAmount)} ETH...`);
  const fundTx = await deployer.sendTransaction({ to: fbAddress, value: fundAmount });
  await fundTx.wait();
  console.log(`✅ 資金池餘額：${ethers.formatEther(await fb.poolBalance())} ETH`);

  // ── 4. 部署後驗證 ────────────────────────────────────────────
  const gameCount = await cr.gameCount();
  const betCount  = await fb.betCount();
  if (gameCount !== 0n || betCount !== 0n) {
    console.error("❌ 合約狀態異常");
    process.exit(1);
  }
  console.log("✅ 合約驗證通過（gameCount=0, betCount=0）");

  // ── 5. 寫入 deployment.json ─────────────────────────────────
  const deploymentInfo = {
    network:            network.name,
    chainId:            (await ethers.provider.getNetwork()).chainId.toString(),
    commitRevealAddress: crAddress,
    fairBetAddress:      fbAddress,
    poolFund:            ethers.formatEther(fundAmount),
    deployer:            deployer.address,
    deployedAt:          new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n📝 部署資訊已儲存至 contracts/deployment.json");

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
