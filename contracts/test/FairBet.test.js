const { expect } = require("chai");
const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

/* 直接載入前端結果引擎（不是另寫一份 JS 模型）：合約與前端必須逐位元一致 */
const R = require("../../src/games/random.js");

const rand32 = () => ethers.hexlify(ethers.randomBytes(32));
const commitHash = (s, salt) => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [s, salt]);
const combine = (a, b) => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [a, b]);

const G = { Dice: 0, Coin: 1, Roulette: 2, Slots: 3, Crash: 4, Limbo: 5, Wheel: 6, Plinko: 7, Revolver: 8 };
const S = { None: 0, Placed: 1, Settled: 2, Expired: 3 };
const BET = ethers.parseEther("0.001");
const FUND = ethers.parseEther("5");
const WINDOW = 256;

const BET_TYPES = {
  [G.Dice]:     [[0, 0], [1, 0], [2, 0], [3, 0]],
  [G.Coin]:     [[0, 0], [1, 0]],
  [G.Roulette]: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 7], [6, 36]],
  [G.Slots]:    [[0, 0]],
  [G.Crash]:    [[0, 10100], [0, 20000], [0, 100000], [0, 1000000]],
  [G.Limbo]:    [[0, 15000], [0, 50000]],
  [G.Wheel]:    [[0, 0]],
  [G.Plinko]:   [[0, 0]],
  [G.Revolver]: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
};

function findFr(pred) {
  for (;;) { const fr = rand32(); if (pred(fr)) return fr; }
}

describe("FairBet v3", function () {
  let fb, owner, player, other;

  beforeEach(async function () {
    [owner, player, other] = await ethers.getSigners();
    fb = await (await ethers.getContractFactory("FairBet")).deploy();
    await owner.sendTransaction({ to: await fb.getAddress(), value: FUND });
  });

  async function place(g = G.Coin, betType = 0, param = 0, amount = BET, signer = player) {
    const seed = rand32(), salt = rand32();
    const commit = commitHash(seed, salt);
    const tx = await fb.connect(signer).placeBet(g, betType, param, commit, { value: amount });
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => fb.interface.parseLog(l)).find((e) => e?.name === "BetPlaced");
    return { id: ev.args.betId, seed, salt, commit, revealBlock: Number(ev.args.revealBlock), placedBlock: rc.blockNumber, g, betType, param, amount };
  }
  const settle = (b, signer = player) => fb.connect(signer).settleBet(b.id, b.seed, b.salt);
  const expectedFr = async (b) => combine(b.seed, (await ethers.provider.getBlock(b.revealBlock)).hash);

  describe("前端 random.js ↔ 合約 resolve() 一致性", function () {
    it("9 種遊戲 × 全部注型 × 30 組隨機 finalRandom：payout 與 outcome 完全一致", async function () {
      for (const [g, list] of Object.entries(BET_TYPES)) {
        for (const [bt, param] of list) {
          for (let i = 0; i < 30; i++) {
            const fr = rand32();
            const [payout, outcome] = await fb.resolve(g, bt, param, BET, fr);
            const js = R.resolveBet(g, bt, param, BET, fr);
            expect(payout, `g=${g} bt=${bt} fr=${fr}`).to.equal(js.payout);
            expect(Number(outcome), `g=${g} bt=${bt} fr=${fr}`).to.equal(js.outcome);
          }
        }
      }
    });

    it("邊界值 0x00…00 與 0xff…ff 一致", async function () {
      for (const fr of [ethers.ZeroHash, "0x" + "ff".repeat(32)]) {
        for (const [g, list] of Object.entries(BET_TYPES)) {
          const [bt, param] = list[0];
          const [payout, outcome] = await fb.resolve(g, bt, param, BET, fr);
          const js = R.resolveBet(g, bt, param, BET, fr);
          expect(payout).to.equal(js.payout);
          expect(Number(outcome)).to.equal(js.outcome);
        }
      }
    });

    it("crashBps view 與前端 crashBps 一致（20 組）", async function () {
      for (let i = 0; i < 20; i++) {
        const fr = rand32();
        expect(Number(await fb.crashBps(fr))).to.equal(R.crashBps(fr));
      }
    });

    it("指定結果的賠付：輪盤單號 30×、拉霸三同 8×、左輪 3 發存活 2×", async function () {
      const fr7 = findFr((fr) => R.outcomeOf(G.Roulette, fr) === 7);
      expect((await fb.resolve(G.Roulette, 6, 7, BET, fr7))[0]).to.equal(BET * 30n);
      const frSlots = findFr((fr) => { const o = R.outcomeOf(G.Slots, fr); return o % 111 === 0; });
      expect((await fb.resolve(G.Slots, 0, 0, BET, frSlots))[0]).to.equal(BET * 8n);
      const frRev = findFr((fr) => R.revolverChamber(fr) >= 3);
      expect((await fb.resolve(G.Revolver, 3, 0, BET, frRev))[0]).to.equal(BET * 2n);
    });
  });

  describe("完整流程：下注 → 等區塊 → 結算", function () {
    it("9 種遊戲各結算一局：finalRandom = keccak(seed ‖ blockhash(revealBlock))，賠付與前端重算相同", async function () {
      for (const [g, list] of Object.entries(BET_TYPES)) {
        const [bt, param] = list[list.length - 1];
        const b = await place(Number(g), bt, param);
        await mine(1);
        const fr = await expectedFr(b);
        const js = R.resolveBet(g, bt, param, BET, fr);
        await expect(settle(b)).to.emit(fb, "BetSettled")
          .withArgs(b.id, player.address, js.payout > BET, js.outcome, (await ethers.provider.getBlock(b.revealBlock)).hash, fr, js.payout);

        const stored = await fb.getBet(b.id);
        expect(stored.state).to.equal(S.Settled);
        expect(stored.playerSeed).to.equal(b.seed);
        expect(stored.playerSalt).to.equal(b.salt);
        expect(stored.finalRandom).to.equal(fr);
        expect(stored.payout).to.equal(js.payout);
      }
    });

    it("賠付實際轉入玩家錢包，金額等於前端重算值", async function () {
      const b = await place(G.Plinko);
      await mine(1);
      const js = R.resolveBet(G.Plinko, 0, 0, BET, await expectedFr(b));
      await expect(settle(b)).to.changeEtherBalances([player, fb], [js.payout, -js.payout]);
    });

    it("事件 won 代表淨贏（payout > 注金）；Plinko 0.5× 有返還但 won=false", async function () {
      for (let i = 0; i < 12; i++) {
        const b = await place(G.Plinko);
        await mine(1);
        const rc = await (await settle(b)).wait();
        const ev = rc.logs.map((l) => fb.interface.parseLog(l)).find((e) => e?.name === "BetSettled");
        expect(ev.args.won).to.equal(ev.args.payout > BET);
      }
    });
  });

  describe("安全回歸：助教 T03 — 下注前不得能決定勝負", function () {
    it("介面上已無莊家承諾／莊家種子參數，玩家無法替莊家提交亂數", async function () {
      expect(fb.interface.getFunction("placeBet").inputs.map((i) => i.name))
        .to.deep.equal(["gameType", "betType", "param", "playerCommit"]);
      expect(fb.interface.getFunction("settleBet").inputs.map((i) => i.name))
        .to.deep.equal(["betId", "playerSeed", "playerSalt"]);
    });

    it("攻擊者用下注當下可得的最新區塊雜湊預測並押注，40 局無法全勝，且每局預測值都不是實際 finalRandom", async function () {
      let wins = 0;
      for (let i = 0; i < 40; i++) {
        const seed = rand32(), salt = rand32();
        const latest = await ethers.provider.getBlock("latest");
        const predicted = combine(seed, latest.hash);
        const guess = R.outcomeOf(G.Coin, predicted);
        await fb.connect(player).placeBet(G.Coin, guess, 0, commitHash(seed, salt), { value: BET });
        const id = await fb.betCount();
        await mine(1);
        const rc = await (await fb.connect(player).settleBet(id, seed, salt)).wait();
        const ev = rc.logs.map((l) => fb.interface.parseLog(l)).find((e) => e?.name === "BetSettled");
        expect(ev.args.finalRandom).to.not.equal(predicted);
        if (ev.args.payout > 0n) wins++;
      }
      expect(wins).to.be.lessThan(35);
    });

    it("同一承諾不可重複下注（避免已公開的種子被再次使用）", async function () {
      const b = await place();
      await expect(fb.connect(player).placeBet(G.Coin, 0, 0, b.commit, { value: BET }))
        .to.be.revertedWithCustomError(fb, "CommitReused");
    });

    it("可由承諾反查 betId（供重整後恢復未完成的局）", async function () {
      const b = await place();
      expect(await fb.betIdByCommit(b.commit)).to.equal(b.id);
    });
  });

  describe("安全回歸：助教 T04／T05 — 期限與狀態", function () {
    it("revealBlock 尚未產生時結算 → TooEarly", async function () {
      const b = await place();
      await expect(settle(b)).to.be.revertedWithCustomError(fb, "TooEarly");
    });

    it("期限邊界：第 revealBlock+256 塊仍可結算", async function () {
      const b = await place();
      await mine(WINDOW);
      await expect(settle(b)).to.emit(fb, "BetSettled");
    });

    it("超過期限 → 不可結算（RevealWindowClosed），只能宣告過期", async function () {
      const b = await place();
      await mine(WINDOW + 1);
      await expect(settle(b)).to.be.revertedWithCustomError(fb, "RevealWindowClosed");
      await expect(fb.connect(other).claimExpired(b.id)).to.emit(fb, "BetExpired").withArgs(b.id, BET);
    });

    it("期限內不可宣告過期（settle 與 expire 有效區間互斥，沒有先到先贏）", async function () {
      const b = await place();
      await mine(WINDOW);
      await expect(fb.claimExpired(b.id)).to.be.revertedWithCustomError(fb, "NotExpired");
    });

    it("過期局狀態為 Expired（不是 Settled），無 finalRandom、無賠付，之後不能再結算", async function () {
      const b = await place();
      await mine(WINDOW + 1);
      await fb.claimExpired(b.id);
      const s = await fb.getBet(b.id);
      expect(s.state).to.equal(S.Expired);
      expect(s.finalRandom).to.equal(ethers.ZeroHash);
      expect(s.payout).to.equal(0n);
      await expect(settle(b)).to.be.revertedWithCustomError(fb, "NotPlaced").withArgs(b.id, S.Expired);
      await expect(fb.claimExpired(b.id)).to.be.revertedWithCustomError(fb, "NotPlaced");
    });

    it("已結算的局不能再結算，也不能宣告過期", async function () {
      const b = await place();
      await mine(1);
      await settle(b);
      await expect(settle(b)).to.be.revertedWithCustomError(fb, "NotPlaced").withArgs(b.id, S.Settled);
      await mine(WINDOW + 1);
      await expect(fb.claimExpired(b.id)).to.be.revertedWithCustomError(fb, "NotPlaced");
    });
  });

  describe("授權與輸入檢查", function () {
    it("非該局玩家結算 → NotPlayer", async function () {
      const b = await place();
      await mine(1);
      await expect(settle(b, other)).to.be.revertedWithCustomError(fb, "NotPlayer");
    });
    it("錯誤 salt → BadPlayerCommit", async function () {
      const b = await place();
      await mine(1);
      await expect(fb.connect(player).settleBet(b.id, b.seed, rand32()))
        .to.be.revertedWithCustomError(fb, "BadPlayerCommit");
    });
    it("不存在的局 → BetNotFound", async function () {
      await expect(fb.connect(player).settleBet(999, rand32(), rand32()))
        .to.be.revertedWithCustomError(fb, "BetNotFound");
    });
    it("非法注型：Crash 目標 1.00×／200×、左輪 0／6 發、輪盤號碼 37、未知遊戲 → InvalidBet", async function () {
      const c = commitHash(rand32(), rand32());
      for (const [g, bt, p] of [[G.Crash, 0, 10000], [G.Crash, 0, 2000000], [G.Revolver, 0, 0], [G.Revolver, 6, 0], [G.Roulette, 6, 37], [9, 0, 0]]) {
        await expect(fb.connect(player).placeBet(g, bt, p, c, { value: BET })).to.be.revertedWithCustomError(fb, "InvalidBet");
      }
    });
    it("注金為 0 → ZeroBet", async function () {
      await expect(fb.connect(player).placeBet(G.Coin, 0, 0, commitHash(rand32(), rand32())))
        .to.be.revertedWithCustomError(fb, "ZeroBet");
    });
  });

  describe("資金池：償付能力不變量 balance ≥ lockedPayouts", function () {
    const invariant = async () => {
      expect(await ethers.provider.getBalance(await fb.getAddress())).to.be.gte(await fb.lockedPayouts());
    };

    it("下注鎖定最大賠付，結算後解鎖", async function () {
      const b = await place(G.Plinko);
      expect(await fb.lockedPayouts()).to.equal(BET * 16n);
      await mine(1);
      await settle(b);
      expect(await fb.lockedPayouts()).to.equal(0n);
    });

    it("資金池不足 → PoolInsufficient", async function () {
      const empty = await (await ethers.getContractFactory("FairBet")).deploy();
      await expect(empty.connect(player).placeBet(G.Plinko, 0, 0, commitHash(rand32(), rand32()), { value: BET }))
        .to.be.revertedWithCustomError(empty, "PoolInsufficient");
    });

    it("並發多局 + owner 提領：owner 不能提領已鎖定的資金，不變量全程成立", async function () {
      const bets = [];
      for (const g of [G.Plinko, G.Roulette, G.Crash, G.Slots, G.Revolver]) {
        const [bt, param] = BET_TYPES[g][BET_TYPES[g].length - 1];
        bets.push(await place(g, bt, param, ethers.parseEther("0.01")));
        await invariant();
      }
      const free = (await ethers.provider.getBalance(await fb.getAddress())) - (await fb.lockedPayouts());
      await expect(fb.withdraw(free + 1n)).to.be.revertedWithCustomError(fb, "PoolInsufficient");
      await fb.withdraw(free);
      await invariant();
      await mine(1);
      for (const b of bets) { await settle(b); await invariant(); }
      expect(await fb.lockedPayouts()).to.equal(0n);
    });

    it("非 owner 提領 → NotOwner", async function () {
      await expect(fb.connect(other).withdraw(1n)).to.be.revertedWithCustomError(fb, "NotOwner");
    });

    it("過期局解鎖，注金留在資金池", async function () {
      const b = await place(G.Plinko);
      const before = await ethers.provider.getBalance(await fb.getAddress());
      await mine(WINDOW + 1);
      await fb.claimExpired(b.id);
      expect(await fb.lockedPayouts()).to.equal(0n);
      expect(await ethers.provider.getBalance(await fb.getAddress())).to.equal(before);
    });
  });

  describe("收款端為惡意合約", function () {
    let proxy;
    beforeEach(async function () {
      proxy = await (await ethers.getContractFactory("PlayerProxy")).deploy(await fb.getAddress());
    });

    async function proxyPlace() {
      const seed = rand32(), salt = rand32();
      await proxy.place(G.Plinko, 0, 0, commitHash(seed, salt), { value: BET });
      return { id: await fb.betCount(), seed, salt };
    }

    it("拒收 ETH 的玩家只會卡住自己那一局，不影響其他玩家結算", async function () {
      await proxy.setMode(1);
      const pb = await proxyPlace();
      const b = await place(G.Plinko);
      await mine(1);
      await expect(proxy.settle(pb.id, pb.seed, pb.salt)).to.be.revertedWithCustomError(fb, "TransferFailed");
      await expect(settle(b)).to.emit(fb, "BetSettled");
      expect((await fb.getBet(pb.id)).state).to.equal(S.Placed);
    });

    it("收款時重入 settleBet 會被狀態檢查擋下，只拿到一次賠付（Checks-Effects-Interactions）", async function () {
      await proxy.setMode(2);
      const pb = await proxyPlace();
      await mine(1);
      const before = await ethers.provider.getBalance(await proxy.getAddress());
      await proxy.settle(pb.id, pb.seed, pb.salt);
      const paid = (await ethers.provider.getBalance(await proxy.getAddress())) - before;
      expect(await proxy.reentryAttempts()).to.equal(1n);
      expect(await proxy.reentrySucceeded()).to.equal(false);
      expect(paid).to.equal((await fb.getBet(pb.id)).payout);
    });
  });
});
