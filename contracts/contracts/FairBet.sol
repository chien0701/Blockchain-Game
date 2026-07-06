// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FairBet
 * @notice 真實鏈上下注 + Commit-Reveal 公平驗證：
 *         1. placeBet()  — 下注（附測試幣）+ 提交雙方承諾
 *         2. settleBet() — 揭露種子，合約驗證、計算結果、自動賠付
 *
 * @dev 結果計算與前端 games/random.js 完全一致：
 *      骰子   = uint32(fr[0:4]) % 6 + 1
 *      硬幣   = uint32(fr[0:4]) % 2
 *      輪盤   = uint32(fr[0:4]) % 37
 *      拉霸   = uint32(fr[i*4:i*4+4]) % 6, i = 0,1,2
 */
contract FairBet {

    enum GameType { Dice, Coin, Roulette, Slots }
    enum BetState { None, Placed, Settled }

    struct Bet {
        address  player;
        GameType gameType;
        uint8    betType;
        uint8    betValue;
        uint256  amount;
        bytes32  playerCommit;
        bytes32  dealerCommit;
        bytes32  finalRandom;
        uint256  payout;
        BetState state;
        uint256  placedAt;
        uint256  settledAt;
    }

    address public owner;
    uint256 public betCount;
    uint256 public lockedPayouts;
    mapping(uint256 => Bet) public bets;

    uint256 public constant REVEAL_TIMEOUT = 1 hours;

    // 輪盤紅色號碼 bitmask：1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36
    uint256 private constant RED_MASK =
        (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 12) |
        (1 << 14) | (1 << 16) | (1 << 18) | (1 << 19) | (1 << 21) | (1 << 23) |
        (1 << 25) | (1 << 27) | (1 << 30) | (1 << 32) | (1 << 34) | (1 << 36);

    event PoolFunded(address indexed from, uint256 amount);
    event BetPlaced(
        uint256 indexed betId,
        address indexed player,
        GameType gameType,
        uint8 betType,
        uint8 betValue,
        uint256 amount
    );
    event BetSettled(
        uint256 indexed betId,
        address indexed player,
        bool won,
        uint16 outcome,
        bytes32 finalRandom,
        uint256 payout
    );
    event BetExpired(uint256 indexed betId, uint256 forfeited);

    error ZeroBet();
    error InvalidBet();
    error PoolInsufficient(uint256 needed, uint256 available);
    error BetNotFound(uint256 betId);
    error AlreadySettled(uint256 betId);
    error NotPlayer(uint256 betId);
    error BadPlayerCommit(uint256 betId);
    error BadDealerCommit(uint256 betId);
    error NotOwner();
    error NotExpired(uint256 betId);
    error TransferFailed();

    constructor() { owner = msg.sender; }

    /// 任何人都可注入資金池（莊家準備金）
    receive() external payable {
        emit PoolFunded(msg.sender, msg.value);
    }

    /// 各注型的最大可能賠付（含本金）
    function maxPayout(GameType g, uint8 betType, uint256 amount) public pure returns (uint256) {
        if (g == GameType.Roulette && betType == 6) return amount * 30; // 單一號碼
        if (g == GameType.Slots)                    return amount * 8;  // 三連線
        return amount * 2;                                              // 等額賠率
    }

    /**
     * @notice 下注 + 提交承諾（一筆交易完成）
     */
    function placeBet(
        GameType gameType,
        uint8 betType,
        uint8 betValue,
        bytes32 playerCommit,
        bytes32 dealerCommit
    ) external payable returns (uint256 betId) {
        if (msg.value == 0) revert ZeroBet();

        if (gameType == GameType.Dice && betType > 3) revert InvalidBet();
        if (gameType == GameType.Coin && betType > 1) revert InvalidBet();
        if (gameType == GameType.Roulette) {
            if (betType > 6) revert InvalidBet();
            if (betType == 6 && betValue > 36) revert InvalidBet();
        }

        uint256 potential = maxPayout(gameType, betType, msg.value);
        uint256 available = address(this).balance - lockedPayouts;
        if (potential > available) revert PoolInsufficient(potential, available);
        lockedPayouts += potential;

        betCount++;
        betId = betCount;

        Bet storage b = bets[betId];
        b.player       = msg.sender;
        b.gameType     = gameType;
        b.betType      = betType;
        b.betValue     = betValue;
        b.amount       = msg.value;
        b.playerCommit = playerCommit;
        b.dealerCommit = dealerCommit;
        b.state        = BetState.Placed;
        b.placedAt     = block.timestamp;

        emit BetPlaced(betId, msg.sender, gameType, betType, betValue, msg.value);
    }

    /**
     * @notice 揭露種子 → 驗證承諾 → 計算結果 → 自動賠付
     */
    function settleBet(
        uint256 betId,
        bytes32 playerSeed,
        bytes32 playerSalt,
        bytes32 dealerSeed,
        bytes32 dealerSalt
    ) external {
        Bet storage b = bets[betId];

        if (b.state == BetState.None)    revert BetNotFound(betId);
        if (b.state == BetState.Settled) revert AlreadySettled(betId);
        if (b.player != msg.sender)      revert NotPlayer(betId);

        if (keccak256(abi.encodePacked(playerSeed, playerSalt)) != b.playerCommit)
            revert BadPlayerCommit(betId);
        if (keccak256(abi.encodePacked(dealerSeed, dealerSalt)) != b.dealerCommit)
            revert BadDealerCommit(betId);

        bytes32 fr = keccak256(abi.encodePacked(playerSeed, dealerSeed));

        (bool won, uint16 outcome, uint256 payout) =
            _resolve(b.gameType, b.betType, b.betValue, b.amount, fr);

        lockedPayouts -= maxPayout(b.gameType, b.betType, b.amount);

        b.finalRandom = fr;
        b.payout      = payout;
        b.state       = BetState.Settled;
        b.settledAt   = block.timestamp;

        if (payout > 0) {
            (bool ok, ) = msg.sender.call{value: payout}("");
            if (!ok) revert TransferFailed();
        }

        emit BetSettled(betId, msg.sender, won, outcome, fr, payout);
    }

    /**
     * @notice 玩家超時未揭露 → 任何人可沒收注金入池
     * @dev 防止「看到會輸就不揭露」的逃逸漏洞
     */
    function claimExpired(uint256 betId) external {
        Bet storage b = bets[betId];
        if (b.state == BetState.None)    revert BetNotFound(betId);
        if (b.state == BetState.Settled) revert AlreadySettled(betId);
        if (block.timestamp < b.placedAt + REVEAL_TIMEOUT) revert NotExpired(betId);

        lockedPayouts -= maxPayout(b.gameType, b.betType, b.amount);
        b.state     = BetState.Settled;
        b.settledAt = block.timestamp;

        emit BetExpired(betId, b.amount);
    }

    /// 莊家提領（不可動用已鎖定的賠付準備）
    function withdraw(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 available = address(this).balance - lockedPayouts;
        if (amount > available) revert PoolInsufficient(amount, available);
        (bool ok, ) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getBet(uint256 betId) external view returns (Bet memory) {
        return bets[betId];
    }

    // ─── 結果計算（與前端 random.js 完全一致）────────────────────

    function _resolve(
        GameType g,
        uint8 betType,
        uint8 betValue,
        uint256 amount,
        bytes32 fr
    ) internal pure returns (bool won, uint16 outcome, uint256 payout) {
        if (g == GameType.Dice) {
            uint16 roll = uint16(uint32(bytes4(fr)) % 6 + 1);
            outcome = roll;
            if      (betType == 0) won = roll >= 4;
            else if (betType == 1) won = roll <= 3;
            else if (betType == 2) won = roll % 2 == 1;
            else                   won = roll % 2 == 0;
            payout = won ? amount * 2 : 0;

        } else if (g == GameType.Coin) {
            uint16 c = uint16(uint32(bytes4(fr)) % 2);
            outcome = c;
            won = (betType == c);
            payout = won ? amount * 2 : 0;

        } else if (g == GameType.Roulette) {
            uint16 n = uint16(uint32(bytes4(fr)) % 37);
            outcome = n;
            bool isRed = (RED_MASK >> n) & 1 == 1;
            if      (betType == 0) won = isRed;
            else if (betType == 1) won = n != 0 && !isRed;
            else if (betType == 2) won = n != 0 && n % 2 == 1;
            else if (betType == 3) won = n != 0 && n % 2 == 0;
            else if (betType == 4) won = n >= 1 && n <= 18;
            else if (betType == 5) won = n >= 19 && n <= 36;
            else                   won = (n == betValue);
            payout = won ? (betType == 6 ? amount * 30 : amount * 2) : 0;

        } else {
            uint8 r0 = uint8(uint32(bytes4(fr)) % 6);
            uint8 r1 = uint8(uint32(bytes4(fr << 32)) % 6);
            uint8 r2 = uint8(uint32(bytes4(fr << 64)) % 6);
            outcome = uint16(r0) * 100 + uint16(r1) * 10 + uint16(r2);
            if (r0 == r1 && r1 == r2)                          payout = amount * 8;
            else if (r0 == r1 || r1 == r2 || r0 == r2)         payout = amount * 2;
            won = payout > 0;
        }
    }
}
