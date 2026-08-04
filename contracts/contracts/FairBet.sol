// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FairBet (v2)
 * @notice 鏈上下注 + Commit-Reveal，支援固定與變動倍率遊戲：
 *         固定倍率：Dice / Coin / Roulette / Slots
 *         變動倍率：Crash / Limbo / Wheel / Plinko / Revolver
 *
 * @dev 所有結果與倍率皆由合約從 finalRandom 計算，與前端 games/random.js 一致。
 *      倍率以 bps 表示（10000 = 1.00×）。payout = amount * multiplierBps / 10000。
 */
contract FairBet {

    enum GameType { Dice, Coin, Roulette, Slots, Crash, Limbo, Wheel, Plinko, Revolver }
    enum BetState { None, Placed, Settled }

    struct Bet {
        address  player;
        uint8    gameType;
        uint8    betType;
        uint256  param;        // crash/limbo 目標倍率(bps)、roulette 號碼、revolver 子彈數
        uint256  amount;
        bytes32  playerCommit;
        bytes32  dealerCommit;
        bytes32  finalRandom;
        uint256  outcome;      // 供展示（crash 崩盤點、wheel 段位…）
        uint256  payout;
        BetState state;
        uint256  placedAt;
        uint256  settledAt;
    }

    address public immutable owner;
    uint256 public betCount;
    uint256 public lockedPayouts;
    mapping(uint256 => Bet) public bets;

    uint256 public constant REVEAL_TIMEOUT = 1 hours;
    uint256 private constant BPS = 10000;
    uint256 private constant E52 = 1 << 52;          // crash/limbo 值域
    uint256 private constant CRASH_CAP = 1_000_000;  // 倍率上限 100×

    uint256 private constant RED_MASK =
        (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 12) |
        (1 << 14) | (1 << 16) | (1 << 18) | (1 << 19) | (1 << 21) | (1 << 23) |
        (1 << 25) | (1 << 27) | (1 << 30) | (1 << 32) | (1 << 34) | (1 << 36);

    event PoolFunded(address indexed from, uint256 amount);
    event BetPlaced(uint256 indexed betId, address indexed player, uint8 gameType, uint8 betType, uint256 param, uint256 amount);
    event BetSettled(uint256 indexed betId, address indexed player, bool won, uint256 outcome, bytes32 finalRandom, uint256 payout);
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

    receive() external payable { emit PoolFunded(msg.sender, msg.value); }

    // ─── Wheel / Plinko 倍率表（bps）───────────────────────────────
    function wheelTable(uint256 i) internal pure returns (uint256) {
        uint16[8] memory t = [0, 18000, 0, 15000, 0, 25000, 0, 12000];
        return t[i];
    }
    function plinkoTable(uint256 i) internal pure returns (uint256) {
        uint24[17] memory t = [
            160000, 90000, 20000, 14000, 14000, 12000, 11000, 10000,
            5000, 10000, 11000, 12000, 14000, 14000, 20000, 90000, 160000
        ];
        return t[i];
    }

    /// 各注型最大可能賠付（含本金），用於資金池鎖定
    function maxPayout(uint8 g, uint8 betType, uint256 param, uint256 amount) public pure returns (uint256) {
        if (g == uint8(GameType.Roulette)) return betType == 6 ? amount * 30 : amount * 2;
        if (g == uint8(GameType.Slots))    return amount * 8;
        if (g == uint8(GameType.Crash) || g == uint8(GameType.Limbo))
            return amount * param / BPS;                 // 目標倍率已知
        if (g == uint8(GameType.Wheel))    return amount * 25000 / BPS;  // 2.5×
        if (g == uint8(GameType.Plinko))   return amount * 160000 / BPS; // 16×
        if (g == uint8(GameType.Revolver)) return amount * 60000 / (6 - betType) / BPS;
        return amount * 2;
    }

    function placeBet(
        uint8 gameType, uint8 betType, uint256 param,
        bytes32 playerCommit, bytes32 dealerCommit
    ) external payable returns (uint256 betId) {
        if (msg.value == 0) revert ZeroBet();
        _validate(gameType, betType, param);

        uint256 potential = maxPayout(gameType, betType, param, msg.value);
        uint256 available = address(this).balance - lockedPayouts;
        if (potential > available) revert PoolInsufficient(potential, available);
        lockedPayouts += potential;

        betCount++;
        betId = betCount;
        Bet storage b = bets[betId];
        b.player = msg.sender; b.gameType = gameType; b.betType = betType; b.param = param;
        b.amount = msg.value; b.playerCommit = playerCommit; b.dealerCommit = dealerCommit;
        b.state = BetState.Placed; b.placedAt = block.timestamp;

        emit BetPlaced(betId, msg.sender, gameType, betType, param, msg.value);
    }

    function _validate(uint8 g, uint8 betType, uint256 param) internal pure {
        if (g == uint8(GameType.Dice)     && betType > 3) revert InvalidBet();
        if (g == uint8(GameType.Coin)     && betType > 1) revert InvalidBet();
        if (g == uint8(GameType.Roulette)) { if (betType > 6 || (betType == 6 && param > 36)) revert InvalidBet(); }
        if (g == uint8(GameType.Crash) || g == uint8(GameType.Limbo)) {
            if (param < 10100 || param > CRASH_CAP) revert InvalidBet();  // 1.01× ~ 100×
        }
        if (g == uint8(GameType.Revolver) && (betType < 1 || betType > 5)) revert InvalidBet();
        if (g > uint8(GameType.Revolver)) revert InvalidBet();
    }

    function settleBet(
        uint256 betId, bytes32 playerSeed, bytes32 playerSalt, bytes32 dealerSeed, bytes32 dealerSalt
    ) external {
        Bet storage b = bets[betId];
        if (b.state == BetState.None)    revert BetNotFound(betId);
        if (b.state == BetState.Settled) revert AlreadySettled(betId);
        if (b.player != msg.sender)      revert NotPlayer(betId);
        if (keccak256(abi.encodePacked(playerSeed, playerSalt)) != b.playerCommit) revert BadPlayerCommit(betId);
        if (keccak256(abi.encodePacked(dealerSeed, dealerSalt)) != b.dealerCommit) revert BadDealerCommit(betId);

        bytes32 fr = keccak256(abi.encodePacked(playerSeed, dealerSeed));
        (uint256 payout, uint256 outcome) = _resolve(b.gameType, b.betType, b.param, b.amount, fr);

        lockedPayouts -= maxPayout(b.gameType, b.betType, b.param, b.amount);
        b.finalRandom = fr; b.outcome = outcome; b.payout = payout;
        b.state = BetState.Settled; b.settledAt = block.timestamp;

        if (payout > 0) {
            (bool ok, ) = msg.sender.call{value: payout}("");
            if (!ok) revert TransferFailed();
        }
        emit BetSettled(betId, msg.sender, payout > 0, outcome, fr, payout);
    }

    function claimExpired(uint256 betId) external {
        Bet storage b = bets[betId];
        if (b.state == BetState.None)    revert BetNotFound(betId);
        if (b.state == BetState.Settled) revert AlreadySettled(betId);
        if (block.timestamp < b.placedAt + REVEAL_TIMEOUT) revert NotExpired(betId);
        lockedPayouts -= maxPayout(b.gameType, b.betType, b.param, b.amount);
        b.state = BetState.Settled; b.settledAt = block.timestamp;
        emit BetExpired(betId, b.amount);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 available = address(this).balance - lockedPayouts;
        if (amount > available) revert PoolInsufficient(amount, available);
        (bool ok, ) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function poolBalance() external view returns (uint256) { return address(this).balance; }
    function getBet(uint256 betId) external view returns (Bet memory) { return bets[betId]; }

    // ─── 結果引擎（與前端 random.js 完全一致）────────────────────

    /** crash/limbo 崩盤倍率 bps = min(CAP, 10000·E/(E-h)), h = uint256(fr) % 2^52 */
    function crashBps(bytes32 fr) public pure returns (uint256) {
        uint256 h = uint256(fr) % E52;
        uint256 m = (BPS * E52) / (E52 - h);
        return m > CRASH_CAP ? CRASH_CAP : m;
    }

    function _resolve(uint8 g, uint8 betType, uint256 param, uint256 amount, bytes32 fr)
        internal pure returns (uint256 payout, uint256 outcome)
    {
        if (g == uint8(GameType.Dice)) {
            uint256 roll = uint32(bytes4(fr)) % 6 + 1; outcome = roll;
            bool won = betType == 0 ? roll >= 4 : betType == 1 ? roll <= 3 : betType == 2 ? roll % 2 == 1 : roll % 2 == 0;
            payout = won ? amount * 2 : 0;

        } else if (g == uint8(GameType.Coin)) {
            uint256 c = uint32(bytes4(fr)) % 2; outcome = c;
            payout = betType == c ? amount * 2 : 0;

        } else if (g == uint8(GameType.Roulette)) {
            uint256 n = uint32(bytes4(fr)) % 37; outcome = n;
            bool isRed = (RED_MASK >> n) & 1 == 1; bool won;
            if      (betType == 0) won = isRed;
            else if (betType == 1) won = n != 0 && !isRed;
            else if (betType == 2) won = n != 0 && n % 2 == 1;
            else if (betType == 3) won = n != 0 && n % 2 == 0;
            else if (betType == 4) won = n >= 1 && n <= 18;
            else if (betType == 5) won = n >= 19 && n <= 36;
            else                   won = n == param;
            payout = won ? (betType == 6 ? amount * 30 : amount * 2) : 0;

        } else if (g == uint8(GameType.Slots)) {
            uint256 r0 = uint32(bytes4(fr)) % 6;
            uint256 r1 = uint32(bytes4(fr << 32)) % 6;
            uint256 r2 = uint32(bytes4(fr << 64)) % 6;
            outcome = r0 * 100 + r1 * 10 + r2;
            if (r0 == r1 && r1 == r2)                  payout = amount * 8;
            else if (r0 == r1 || r1 == r2 || r0 == r2) payout = amount * 2;

        } else if (g == uint8(GameType.Crash) || g == uint8(GameType.Limbo)) {
            uint256 m = crashBps(fr); outcome = m;
            payout = m >= param ? amount * param / BPS : 0;

        } else if (g == uint8(GameType.Wheel)) {
            uint256 seg = uint256(fr) % 8; outcome = seg;
            payout = amount * wheelTable(seg) / BPS;

        } else if (g == uint8(GameType.Plinko)) {
            uint256 bits = uint256(fr) & 0xFFFF;
            uint256 bucket = 0;
            for (uint256 i = 0; i < 16; i++) if ((bits >> i) & 1 == 1) bucket++;
            outcome = bucket;
            payout = amount * plinkoTable(bucket) / BPS;

        } else { // Revolver：betType = 子彈數(1-5)，chamber = uint256(fr)%6
            uint256 chamber = uint256(fr) % 6; outcome = chamber;
            bool survived = chamber >= betType;
            payout = survived ? amount * 60000 / (6 - betType) / BPS : 0;
        }
    }
}
