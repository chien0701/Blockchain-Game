const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/* ── 前端 games/random.js 等價實作（合約結果須與此逐位元一致）── */
const genSeed = () => ethers.hexlify(ethers.randomBytes(32));
const genSalt = () => ethers.hexlify(ethers.randomBytes(32));
const commitHash = (s, salt) => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [s, salt]);
const combineSeeds = (p, d) => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [p, d]);

const intFromHex = (fr, start, len) => parseInt(fr.slice(2 + start * 2, 2 + (start + len) * 2), 16);
const rollDie = (fr) => (intFromHex(fr, 0, 4) % 6) + 1;
const rouletteOf = (fr) => intFromHex(fr, 0, 4) % 37;
const reelsOf = (fr) => [0, 1, 2].map((i) => intFromHex(fr, i * 4, 4) % 6);

const E52 = 1n << 52n, CAP = 1_000_000n;
const crashBps = (fr) => {
  const h = BigInt(fr) % E52;
  const m = (10000n * E52) / (E52 - h);
  return m > CAP ? CAP : m;
};
const WHEEL = [0n, 18000n, 0n, 15000n, 0n, 25000n, 0n, 12000n];
const wheelSeg = (fr) => Number(BigInt(fr) % 8n);
const PLINKO = [160000n,90000n,20000n,14000n,14000n,12000n,11000n,10000n,5000n,10000n,11000n,12000n,14000n,14000n,20000n,90000n,160000n];
const plinkoBucket = (fr) => {
  let bits = BigInt(fr) & 0xFFFFn, b = 0;
  for (let i = 0n; i < 16n; i++) if ((bits >> i) & 1n) b++;
  return b;
};
const chamberOf = (fr) => Number(BigInt(fr) % 6n);

function findSeeds(pred) {
  for (;;) {
    const p = genSeed(), d = genSeed();
    const fr = combineSeeds(p, d);
    if (pred(fr)) {
      const ps = genSalt(), ds = genSalt();
      return { p, ps, d, ds, fr, pc: commitHash(p, ps), dc: commitHash(d, ds) };
    }
  }
}

const G = { Dice:0, Coin:1, Roulette:2, Slots:3, Crash:4, Limbo:5, Wheel:6, Plinko:7, Revolver:8 };
const BET  = ethers.parseEther("0.001");
const FUND = ethers.parseEther("2");
const bps  = (n) => BET * BigInt(n) / 10000n;

describe("FairBet v2", function () {
  let fb, owner, player, other;

  beforeEach(async function () {
    [owner, player, other] = await ethers.getSigners();
    fb = await (await ethers.getContractFactory("FairBet")).deploy();
    await owner.sendTransaction({ to: await fb.getAddress(), value: FUND });
  });

  const place = (s, g, betType = 0, param = 0, amount = BET) =>
    fb.connect(player).placeBet(g, betType, param, s.pc, s.dc, { value: amount });
  const settle = (s, id = 1n) =>
    fb.connect(player).settleBet(id, s.p, s.ps, s.d, s.ds);

  describe("既有遊戲（沿用 v1 邏輯）", function () {
    it("骰子押大開大 → 2×，事件一致", async function () {
      const s = findSeeds((fr) => rollDie(fr) >= 4);
      await place(s, G.Dice, 0);
      await expect(settle(s)).to.emit(fb, "BetSettled")
        .withArgs(1n, player.address, true, rollDie(s.fr), s.fr, BET * 2n);
    });
    it("輪盤單號命中 → 30×", async function () {
      const s = findSeeds((fr) => rouletteOf(fr) === 7);
      await place(s, G.Roulette, 6, 7);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [BET * 30n, -(BET * 30n)]);
    });
    it("拉霸三連線 → 8×", async function () {
      const s = findSeeds((fr) => { const r = reelsOf(fr); return r[0]===r[1] && r[1]===r[2]; });
      await place(s, G.Slots);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [BET * 8n, -(BET * 8n)]);
    });
  });

  describe("Crash / Limbo", function () {
    it("崩盤倍率與前端 crashBps 一致（合約 view）", async function () {
      for (let i = 0; i < 8; i++) {
        const s = findSeeds(() => true);
        expect(await fb.crashBps(s.fr)).to.equal(crashBps(s.fr));
      }
    });
    it("撐過目標 → 賠 目標倍，餘額正確", async function () {
      const target = 20000n; // 2×
      const s = findSeeds((fr) => crashBps(fr) >= target);
      await place(s, G.Crash, 0, target);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [bps(target), -bps(target)]);
    });
    it("沒撐過 → 賠 0", async function () {
      const target = 500000n; // 50×，極可能崩在前面
      const s = findSeeds((fr) => crashBps(fr) < target);
      await place(s, G.Crash, 0, target);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [0n, 0n]);
    });
    it("Limbo 同公式，撐過目標賠付一致", async function () {
      const target = 15000n;
      const s = findSeeds((fr) => crashBps(fr) >= target);
      await place(s, G.Limbo, 0, target);
      await expect(settle(s)).to.emit(fb, "BetSettled")
        .withArgs(1n, player.address, true, crashBps(s.fr), s.fr, bps(target));
    });
    it("目標倍率超出範圍 → revert InvalidBet", async function () {
      const s = findSeeds(() => true);
      await expect(place(s, G.Crash, 0, 10000)).to.be.revertedWithCustomError(fb, "InvalidBet");
      await expect(place(s, G.Crash, 0, 2000000)).to.be.revertedWithCustomError(fb, "InvalidBet");
    });
  });

  describe("Wheel", function () {
    it("段位與倍率和前端一致（10 組）", async function () {
      for (let i = 0; i < 10; i++) {
        const s = findSeeds(() => true);
        const seg = wheelSeg(s.fr);
        await place(s, G.Wheel);
        const id = BigInt(i + 1);
        await expect(settle(s, id)).to.emit(fb, "BetSettled")
          .withArgs(id, player.address, WHEEL[seg] > 0n, seg, s.fr, bps(WHEEL[seg]));
      }
    });
  });

  describe("Plinko", function () {
    it("桶位與倍率和前端一致（12 組）", async function () {
      for (let i = 0; i < 12; i++) {
        const s = findSeeds(() => true);
        const bucket = plinkoBucket(s.fr);
        await place(s, G.Plinko);
        const id = BigInt(i + 1);
        await expect(settle(s, id)).to.emit(fb, "BetSettled")
          .withArgs(id, player.address, PLINKO[bucket] > 0n, bucket, s.fr, bps(PLINKO[bucket]));
      }
    });
  });

  describe("Revolver", function () {
    it("存活 → 依子彈數賠付，倍率正確", async function () {
      const bullets = 3;
      const s = findSeeds((fr) => chamberOf(fr) >= bullets);
      await place(s, G.Revolver, bullets);
      const expected = BET * 60000n / BigInt(6 - bullets) / 10000n;
      await expect(settle(s)).to.changeEtherBalances([player, fb], [expected, -expected]);
    });
    it("中彈 → 賠 0", async function () {
      const bullets = 3;
      const s = findSeeds((fr) => chamberOf(fr) < bullets);
      await place(s, G.Revolver, bullets);
      await expect(settle(s)).to.changeEtherBalances([player, fb], [0n, 0n]);
    });
    it("子彈數 0 或 6 → revert InvalidBet", async function () {
      const s = findSeeds(() => true);
      await expect(place(s, G.Revolver, 0)).to.be.revertedWithCustomError(fb, "InvalidBet");
      await expect(place(s, G.Revolver, 6)).to.be.revertedWithCustomError(fb, "InvalidBet");
    });
  });

  describe("資金池與安全", function () {
    it("下注鎖定最大賠付，結算後解鎖", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Plinko);
      expect(await fb.lockedPayouts()).to.equal(BET * 16n);
      await settle(s);
      expect(await fb.lockedPayouts()).to.equal(0n);
    });
    it("資金池不足 → revert PoolInsufficient", async function () {
      const empty = await (await ethers.getContractFactory("FairBet")).deploy();
      const s = findSeeds(() => true);
      await expect(
        empty.connect(player).placeBet(G.Plinko, 0, 0, s.pc, s.dc, { value: BET })
      ).to.be.revertedWithCustomError(empty, "PoolInsufficient");
    });
    it("錯誤 salt → revert BadPlayerCommit", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await expect(fb.connect(player).settleBet(1n, s.p, genSalt(), s.d, s.ds))
        .to.be.revertedWithCustomError(fb, "BadPlayerCommit");
    });
    it("非玩家結算 → revert NotPlayer", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Dice, 0);
      await expect(fb.connect(other).settleBet(1n, s.p, s.ps, s.d, s.ds))
        .to.be.revertedWithCustomError(fb, "NotPlayer");
    });
    it("超時沒收，解鎖且無法再結算", async function () {
      const s = findSeeds(() => true);
      await place(s, G.Crash, 0, 20000);
      await time.increase(3601);
      await expect(fb.claimExpired(1n)).to.emit(fb, "BetExpired").withArgs(1n, BET);
      expect(await fb.lockedPayouts()).to.equal(0n);
      await expect(settle(s)).to.be.revertedWithCustomError(fb, "AlreadySettled");
    });
  });
});
