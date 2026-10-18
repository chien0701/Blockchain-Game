// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFairBet {
    function placeBet(uint8 gameType, uint8 betType, uint256 param, bytes32 playerCommit) external payable returns (uint256);
    function settleBet(uint256 betId, bytes32 playerSeed, bytes32 playerSalt) external;
}

/// 僅供測試：以合約身分下注，模擬「拒收 ETH」與「收款時重入」兩種惡意玩家
contract PlayerProxy {
    IFairBet public immutable fb;
    uint8 public mode;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;
    uint256 private lastBet;
    bytes32 private lastSeed;
    bytes32 private lastSalt;

    constructor(address fairBet) { fb = IFairBet(fairBet); }

    function setMode(uint8 m) external { mode = m; }

    function place(uint8 g, uint8 bt, uint256 param, bytes32 commit) external payable returns (uint256) {
        return fb.placeBet{value: msg.value}(g, bt, param, commit);
    }

    function settle(uint256 id, bytes32 seed, bytes32 salt) external {
        lastBet = id; lastSeed = seed; lastSalt = salt;
        fb.settleBet(id, seed, salt);
    }

    receive() external payable {
        if (mode == 1) revert("reject");
        if (mode == 2 && reentryAttempts == 0) {
            reentryAttempts++;
            try fb.settleBet(lastBet, lastSeed, lastSalt) { reentrySucceeded = true; } catch {}
        }
    }
}
