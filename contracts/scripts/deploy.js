const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  console.log(`\n🚀 部署到網路：${network.name}`);
  console.log("─".repeat(50));

  // ── 取得部署者 ──────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log(`📬 部署者地址：${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 餘額：${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error("❌ 餘額為 0，請先取得測試幣");
    process.exit(1);
  }

  // ── 部署合約 ────────────────────────────────────────────
  console.log("\n📦 部署 GameCommitReveal...");
  const Factory  = await ethers.getContractFactory("GameCommitReveal");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ 合約已部署：${address}`);

  // ── 取得部署交易資訊 ────────────────────────────────────
  const deployTx      = contract.deploymentTransaction();
  const deployReceipt = await deployTx.wait();
  console.log(`📋 交易 Hash：${deployTx.hash}`);
  console.log(`⛽ Gas 使用：${deployReceipt.gasUsed.toString()}`);
  console.log(`🔢 區塊高度：${deployReceipt.blockNumber}`);

  // ── 部署後驗證：呼叫 gameCount() 確認合約可用 ───────────
  const gameCount = await contract.gameCount();
  console.log(`\n🔍 驗證：gameCount = ${gameCount} (應為 0)`);
  if (gameCount !== 0n) {
    console.error("❌ 合約狀態異常");
    process.exit(1);
  }
  console.log("✅ 合約驗證通過");

  // ── 將部署資訊寫入 deployment.json ─────────────────────
  const deploymentInfo = {
    network:         network.name,
    chainId:         (await ethers.provider.getNetwork()).chainId.toString(),
    contractAddress: address,
    deployer:        deployer.address,
    txHash:          deployTx.hash,
    blockNumber:     deployReceipt.blockNumber,
    deployedAt:      new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\n📝 部署資訊已儲存至：contracts/deployment.json`);

  // ── 同步更新前端設定提示 ────────────────────────────────
  console.log("\n" + "─".repeat(50));
  console.log("📌 請將以下資訊更新至前端：");
  console.log(`   合約地址：${address}`);
  console.log(`   網路：${network.name} (chainId: ${deploymentInfo.chainId})`);

  if (network.name === "arbitrumSepolia") {
    console.log(`\n🔗 Arbiscan：https://sepolia.arbiscan.io/address/${address}`);
    console.log("\n💡 若要驗證合約原始碼，執行：");
    console.log(`   npx hardhat verify --network arbitrumSepolia ${address}`);
  }

  console.log("\n✨ 部署完成！\n");
}

main().catch((err) => {
  console.error("❌ 部署失敗：", err);
  process.exitCode = 1;
});
