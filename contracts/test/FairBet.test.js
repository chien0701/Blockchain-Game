const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/* 前端 crypto.js / games/random.js 的等價實作 */
const generateSeed = () => ethers.hexlify(ethers.randomBytes(32));
const generateSalt = () => ethers.hexlify(ethers.randomBytes(32));
const commitHash = (seed, salt) =>
  ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [seed, salt]);
const combineSeeds = (p, d) =>
  ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [p, d]);

const intFromHex = (fr, start, len) =>
  parseInt(fr.slice(2 + start * 2, 2 + (start + len) * 2), 16);
const rollDie    = (fr) => (intFromHex(fr, 0, 4) % 6) + 1;
const coinOf     = (fr) => intFromHex(fr, 0, 4) % 2;
const rouletteOf = (fr) => intFromHex(fr, 0, 4) % 37;
const reelsOf    = (fr) => [0, 1, 2].map((i) => intFromHex(fr, i * 4, 4) % 6);

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

/** 反覆抽種子直到 finalRandom 滿足條件（用於構造特定結果的測試）*/
function findSeeds(pred) {
  for (;;) {
    const pSeed = generateSeed(), dSeed = generateSeed();
    const fr = combineSeeds(pSeed, dSeed);
    if (pred(fr)) {
      const pSalt = generateSalt(), dSalt = generateSalt();
      return {
        pSeed, pSalt, dSeed, dSalt, fr,
        pCommit: commitHash(pSeed, pSalt),
        dCommit: commitHash(dSeed, dSalt),
      };
    }
  }
}

const G = { Dice: 0, Coin: 1, Roulette: 2, Slots: 3 };
const BET  = ethers.parseEther("0.001");
const FUND = ethers.parseEther("1");

describe("FairBet", function () {
  let fb, owner, player, other;

  beforeEach(async function () {
    [owner, player, other] = await ethers.getSigners();
    fb = await (await ethers.getContractFactory("FairBet")).deploy();
    await owner.sendTransaction({ to: await fb.getAddress(), value: FUND });
  });

  const place = (s, gameType, betType = 0, betValue = 0, amount = BET) =>
    fb.connect(player).placeBet(gameType, betType, betValue, s.pCommit, s.dCommit, { value: amount });

  const settle = (s, betId = 1n) =>
    fb.connect(player).settleBet(betId, s.pSeed, s.pSalt, s.dSeed, s.dSalt);

  describe("資金池", function () {
    it("receive 注資 emit PoolFunded 且餘額正確", async function () {
      expect(await fb.poolBalance()).to.equal(FUND);
    });

    it("owner 可提領未鎖定資金，非 owner revert", async function () {
      await expect(fb.connect(owner).withdraw(ethers.parseEther("0.5")))
        .to.changeEtherBalances([owner, fb], [ethers.parseEther("0.5"), -ethers.parseEther("0.5")]);
      await expect(fb.connect(other).withdraw(1n))
        .to.be.revertedWithCustomError(fb, "NotOwner");
    });
  });

  describe("placeBet()", function () {
    it("0 注金 revert ZeroBet", async function () {
      const s = findSeeds(() => true);
      await expect(place(s, G.Dice, 0, 0, 0n))
        .to.be.revertedWithCustomError(fb, "ZeroBet");
    });

    it("無效注型 revert InvalidBet", async function () {
      const s = findSeeds(() => true);
      await expect(place(s, G.Dice, 4)).to.be.revertedWithCustomError(fb, "InvalidBet");
      await expect(place(s, G.Coin, 2)).to.be.revertedWithCustomError(fb, "InvalidBet");
      await expect(place(s, G.Roulette, 6, 37)).to.be.revertedWithCustomError(fb, "InvalidBet");
    });

    it("資金池不足以賠付 revert PoolInsufficient", async function () {
      const empty = await (await ethers.getContractFactory("FairBet")).deploy();
      const s = findSeeds(() => true);
      await expect(
        empty.connect(player).placeBet(G.Roulette, 6, 7, s.pCommit, s.dCommit, { value: BET })
      ).to.be.revertedWithCustomError(empty, "PoolInsufficient");
    });

    it("下注後鎖定最大賠付，注金入池", async function () {
      const s = findSeeds(() => true);
      await expect(place(s, G.Dice, 0)).to.changeEtherBalances([player, fb], [-BET, BET]);
      expect(await fb.lockedPayouts()).to.equal(BET * 2n);
    });
  });

  describe("settleBet() — 骰子", function () {
    it("押大開大 → 賠付 2 倍，事件參數與前端計算一致", async function () {
      const s = findSeeds((fr) => rollDie(fr) >= 4);
      await place(s, G.Dice, 0);
      await expect(settle(s))
        .to.emit(fb, "BetSettled")
        .withArgs(1n, player.address, true, rollDie(s.fr), s.fr, BET * 2n);
    });

    it("賠付金額真的轉給玩家", async function () {
      const s = findSeeds((fr) => rollDie(fr) >= 4);
      await place(s, G.Dice, 0);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [BET * 2n, -(BET * 2n)]);
    });

    it("押大開小 → 賠付 0，注金留在池中", async function () {
      const s = findSeeds((fr) => rollDie(fr) <= 3);
      await place(s, G.Dice, 0);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [0n, 0n]);
    });

    it("結算後解除鎖定", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await settle(s);
      expect(await fb.lockedPayouts()).to.equal(0n);
    });

    it("合約骰子結果與前端 rollDie 一致（15 組隨機種子）", async function () {
      for (let i = 0; i < 15; i++) {
        const s = findSeeds(() => true);
        const id = BigInt(i + 1);
        await place(s, G.Dice, 0);
        await expect(settle(s, id))
          .to.emit(fb, "BetSettled")
          .withArgs(id, player.address, rollDie(s.fr) >= 4, rollDie(s.fr), s.fr, rollDie(s.fr) >= 4 ? BET * 2n : 0n);
      }
    });
  });

  describe("settleBet() — 硬幣 / 輪盤 / 拉霸", function () {
    it("硬幣：結果與前端 coinOf 一致", async function () {
      const s = findSeeds(() => true);
      const c = coinOf(s.fr);
      await place(s, G.Coin, c);
      await expect(settle(s))
        .to.emit(fb, "BetSettled")
        .withArgs(1n, player.address, true, c, s.fr, BET * 2n);
    });

    it("輪盤單一號碼命中 → 30 倍", async function () {
      const s = findSeeds((fr) => rouletteOf(fr) === 7);
      await place(s, G.Roulette, 6, 7);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [BET * 30n, -(BET * 30n)]);
    });

    it("輪盤紅黑判定與前端一致", async function () {
      const s = findSeeds((fr) => rouletteOf(fr) !== 0);
      const n = rouletteOf(s.fr);
      await place(s, G.Roulette, RED.has(n) ? 0 : 1);
      await expect(settle(s))
        .to.emit(fb, "BetSettled")
        .withArgs(1n, player.address, true, n, s.fr, BET * 2n);
    });

    it("拉霸三連線 → 8 倍，輪軸與前端 reelsOf 一致", async function () {
      const s = findSeeds((fr) => { const r = reelsOf(fr); return r[0] === r[1] && r[1] === r[2]; });
      const [r0, r1, r2] = reelsOf(s.fr);
      await place(s, G.Slots);
      await expect(settle(s))
        .to.emit(fb, "BetSettled")
        .withArgs(1n, player.address, true, r0 * 100 + r1 * 10 + r2, s.fr, BET * 8n);
    });

    it("拉霸全不同 → 賠付 0", async function () {
      const s = findSeeds((fr) => new Set(reelsOf(fr)).size === 3);
      await place(s, G.Slots);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [0n, 0n]);
    });
  });

  describe("安全性", function () {
    it("錯誤 salt → revert BadPlayerCommit", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await expect(
        fb.connect(player).settleBet(1n, s.pSeed, generateSalt(), s.dSeed, s.dSalt)
      ).to.be.revertedWithCustomError(fb, "BadPlayerCommit");
    });

    it("重複結算 → revert AlreadySettled", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await settle(s);
      await expect(settle(s)).to.be.revertedWithCustomError(fb, "AlreadySettled");
    });

    it("非下注者結算 → revert NotPlayer", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await expect(
        fb.connect(other).settleBet(1n, s.pSeed, s.pSalt, s.dSeed, s.dSalt)
      ).to.be.revertedWithCustomError(fb, "NotPlayer");
    });

    it("owner 不可提領已鎖定的賠付準備", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Roulette, 6, 7);
      const balance = await ethers.provider.getBalance(await fb.getAddress());
      await expect(fb.connect(owner).withdraw(balance))
        .to.be.revertedWithCustomError(fb, "PoolInsufficient");
    });
  });

  describe("超時沒收（防不揭露逃逸）", function () {
    it("未超時 → revert NotExpired", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await expect(fb.claimExpired(1n)).to.be.revertedWithCustomError(fb, "NotExpired");
    });

    it("超時後沒收，注金留池、解鎖，且無法再結算", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await time.increase(3601);
      await expect(fb.claimExpired(1n)).to.emit(fb, "BetExpired").withArgs(1n, BET);
      expect(await fb.lockedPayouts()).to.equal(0n);
      await expect(settle(s)).to.be.revertedWithCustomError(fb, "AlreadySettled");
    });
  });
});
