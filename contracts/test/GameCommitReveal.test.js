const { expect } = require("chai");
const { ethers } = require("hardhat");

/* 前端 crypto.js 的等價實作（用來確保前後端一致）*/
function generateSeed() { return ethers.hexlify(ethers.randomBytes(32)); }
function generateSalt() { return ethers.hexlify(ethers.randomBytes(32)); }
function commitHash(seed, salt) {
  return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [seed, salt]);
}
function combineSeeds(seedP, seedD) {
  return ethers.solidityPackedKeccak256(['bytes32', 'bytes32'], [seedP, seedD]);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("GameCommitReveal", function () {
  let contract, player, other;

  beforeEach(async function () {
    [player, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("GameCommitReveal");
    contract = await Factory.deploy();
  });

  describe("部署", function () {
    it("gameCount 初始值應為 0", async function () {
      expect(await contract.gameCount()).to.equal(0n);
    });
  });

  describe("commitGame()", function () {
    it("成功 commit，gameCount 遞增為 1", async function () {
      const pc = commitHash(generateSeed(), generateSalt());
      const dc = commitHash(generateSeed(), generateSalt());
      await contract.connect(player).commitGame(pc, dc);
      expect(await contract.gameCount()).to.equal(1n);
    });

    it("回傳正確的 gameId（第一局為 1）", async function () {
      const pc = commitHash(generateSeed(), generateSalt());
      const dc = commitHash(generateSeed(), generateSalt());
      const gameId = await contract.connect(player).commitGame.staticCall(pc, dc);
      expect(gameId).to.equal(1n);
    });

    it("連續 commit 兩局，gameCount = 2", async function () {
      const c = () => commitHash(generateSeed(), generateSalt());
      await contract.commitGame(c(), c());
      await contract.commitGame(c(), c());
      expect(await contract.gameCount()).to.equal(2n);
    });

    it("emit GameCommitted，帶正確參數", async function () {
      const pc = commitHash(generateSeed(), generateSalt());
      const dc = commitHash(generateSeed(), generateSalt());
      await expect(contract.connect(player).commitGame(pc, dc))
        .to.emit(contract, "GameCommitted")
        .withArgs(1n, player.address, pc, dc);
    });

    it("commit 後 getState 應為 Committed（=1）", async function () {
      const pc = commitHash(generateSeed(), generateSalt());
      const dc = commitHash(generateSeed(), generateSalt());
      await contract.commitGame(pc, dc);
      expect(await contract.getState(1n)).to.equal(1n);
    });

    it("儲存的 player 地址正確", async function () {
      const pc = commitHash(generateSeed(), generateSalt());
      const dc = commitHash(generateSeed(), generateSalt());
      await contract.connect(player).commitGame(pc, dc);
      const [addr] = await contract.getGame(1n);
      expect(addr).to.equal(player.address);
    });
  });

  describe("revealGame()", function () {
    let pSeed, pSalt, dSeed, dSalt, pCommit, dCommit;

    beforeEach(async function () {
      pSeed = generateSeed(); pSalt = generateSalt();
      dSeed = generateSeed(); dSalt = generateSalt();
      pCommit = commitHash(pSeed, pSalt);
      dCommit = commitHash(dSeed, dSalt);
      await contract.connect(player).commitGame(pCommit, dCommit);
    });

    it("正常揭露，emit GameRevealed", async function () {
      const expected = combineSeeds(pSeed, dSeed);
      await expect(contract.connect(player).revealGame(1n, pSeed, pSalt, dSeed, dSalt))
        .to.emit(contract, "GameRevealed")
        .withArgs(1n, player.address, expected, pSeed, dSeed);
    });

    it("揭露後 getState 應為 Revealed（=2）", async function () {
      await contract.connect(player).revealGame(1n, pSeed, pSalt, dSeed, dSalt);
      expect(await contract.getState(1n)).to.equal(2n);
    });

    it("合約的 finalRandom 與前端 combineSeeds 完全一致", async function () {
      const expected = combineSeeds(pSeed, dSeed);
      await contract.connect(player).revealGame(1n, pSeed, pSalt, dSeed, dSalt);
      expect(await contract.getFinalRandom(1n)).to.equal(expected);
    });

    it("合約的 commit 驗證與前端 commitHash 完全一致（10 組）", async function () {
      for (let i = 0; i < 10; i++) {
        const ps = generateSeed(), pa = generateSalt();
        const ds = generateSeed(), da = generateSalt();
        await contract.commitGame(commitHash(ps, pa), commitHash(ds, da));
        const gameId = BigInt(i + 2);
        await contract.revealGame(gameId, ps, pa, ds, da);
        expect(await contract.getState(gameId)).to.equal(2n);
      }
    });

    it("玩家 commit 不符（salt 錯）→ revert InvalidPlayerCommit", async function () {
      const wrongSalt = generateSalt();
      await expect(
        contract.connect(player).revealGame(1n, pSeed, wrongSalt, dSeed, dSalt)
      ).to.be.revertedWithCustomError(contract, "InvalidPlayerCommit");
    });

    it("莊家 commit 不符（seed 錯）→ revert InvalidDealerCommit", async function () {
      const wrongSeed = generateSeed();
      await expect(
        contract.connect(player).revealGame(1n, pSeed, pSalt, wrongSeed, dSalt)
      ).to.be.revertedWithCustomError(contract, "InvalidDealerCommit");
    });

    it("重複揭露 → revert AlreadyRevealed", async function () {
      await contract.connect(player).revealGame(1n, pSeed, pSalt, dSeed, dSalt);
      await expect(
        contract.connect(player).revealGame(1n, pSeed, pSalt, dSeed, dSalt)
      ).to.be.revertedWithCustomError(contract, "AlreadyRevealed");
    });

    it("非 player 揭露 → revert NotPlayer", async function () {
      await expect(
        contract.connect(other).revealGame(1n, pSeed, pSalt, dSeed, dSalt)
      ).to.be.revertedWithCustomError(contract, "NotPlayer");
    });

    it("不存在的 gameId → revert GameNotFound", async function () {
      await expect(
        contract.connect(player).revealGame(999n, pSeed, pSalt, dSeed, dSalt)
      ).to.be.revertedWithCustomError(contract, "GameNotFound");
    });

    it("salt 防護：相同種子配不同 salt，承諾值不同", function () {
      const seed = generateSeed();
      const c1 = commitHash(seed, generateSalt());
      const c2 = commitHash(seed, generateSalt());
      expect(c1).to.not.equal(c2);
    });
  });

  describe("getGame()", function () {
    it("commit 後可讀到正確的 playerCommit / dealerCommit", async function () {
      const pSeed = generateSeed(), pSalt = generateSalt();
      const dSeed = generateSeed(), dSalt = generateSalt();
      const pc = commitHash(pSeed, pSalt), dc = commitHash(dSeed, dSalt);
      await contract.connect(player).commitGame(pc, dc);

      const [addr, pCommit, dCommit] = await contract.getGame(1n);
      expect(addr).to.equal(player.address);
      expect(pCommit).to.equal(pc);
      expect(dCommit).to.equal(dc);
    });

    it("reveal 後可讀到種子、salt、finalRandom", async function () {
      const pSeed = generateSeed(), pSalt = generateSalt();
      const dSeed = generateSeed(), dSalt = generateSalt();
      await contract.connect(player).commitGame(
        commitHash(pSeed, pSalt), commitHash(dSeed, dSalt)
      );
      await contract.connect(player).revealGame(1n, pSeed, pSalt, dSeed, dSalt);

      const [, , , ps, pa, ds, da, fr] = await contract.getGame(1n);
      expect(ps).to.equal(pSeed);
      expect(pa).to.equal(pSalt);
      expect(ds).to.equal(dSeed);
      expect(da).to.equal(dSalt);
      expect(fr).to.equal(combineSeeds(pSeed, dSeed));
    });
  });

  describe("完整 E2E 流程", function () {
    it("commit → reveal → 前後端 finalRandom 完全一致", async function () {
      const pSeed = generateSeed(), pSalt = generateSalt();
      const dSeed = generateSeed(), dSalt = generateSalt();

      await (await contract.connect(player).commitGame(
        commitHash(pSeed, pSalt), commitHash(dSeed, dSalt)
      )).wait();
      expect(await contract.getState(1n)).to.equal(1n);

      const receipt = await (await contract.connect(player)
        .revealGame(1n, pSeed, pSalt, dSeed, dSalt)).wait();
      expect(await contract.getState(1n)).to.equal(2n);

      const iface = contract.interface;
      const log = receipt.logs
        .map(l => { try { return iface.parseLog(l); } catch { return null; } })
        .find(e => e?.name === "GameRevealed");

      expect(log).to.not.be.null;
      expect(log.args.finalRandom).to.equal(combineSeeds(pSeed, dSeed));
    });
  });
});
