const { expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const ABI = require("../../src/config/abi.js");

async function assertSubset(contractName, frontendAbi) {
  const compiled = new ethers.Interface((await artifacts.readArtifact(contractName)).abi);
  const frontend = new ethers.Interface(frontendAbi);
  for (const f of frontend.fragments) {
    if (f.type === "function") {
      const c = compiled.getFunction(f.format("sighash"));
      expect(c, `${contractName}: 找不到 ${f.format("sighash")}`).to.not.equal(null);
      expect(f.outputs.map((o) => o.format("sighash")), `${f.name} 回傳型別`)
        .to.deep.equal(c.outputs.map((o) => o.format("sighash")));
      expect(f.stateMutability, `${f.name} stateMutability`).to.equal(c.stateMutability);
    } else if (f.type === "event") {
      const c = compiled.getEvent(f.format("sighash"));
      expect(c, `${contractName}: 找不到事件 ${f.format("sighash")}`).to.not.equal(null);
      expect(f.inputs.map((i) => !!i.indexed), `${f.name} indexed`).to.deep.equal(c.inputs.map((i) => !!i.indexed));
    }
  }
}

describe("前端 ABI（src/config/abi.js）與合約編譯產物一致", function () {
  it("FairBet v3", async function () { await assertSubset("FairBet", ABI.FAIRBET_V3_ABI); });
  it("GameCommitReveal", async function () { await assertSubset("GameCommitReveal", ABI.COMMIT_REVEAL_ABI); });
});
