// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FairBet (v3)
 * @notice 鏈上下注。亂數 = keccak256(玩家種子 ‖ 下注後下一個區塊的 blockhash)。
 *
 * @dev 協議（詳見 docs/PROTOCOL_V3.md）：
 *      1. placeBet：玩家只送出自己的承諾 keccak256(seed‖salt) 與注金，
 *         合約記下 revealBlock = 下注區塊 + 1。下注當下該區塊尚未產生，任何人都無法預知其雜湊。
 *      2. settleBet：revealBlock 產生後、256 個區塊內，玩家揭露 seed/salt，
 *         合約以 blockhash(revealBlock) 作為熵，算出結果並自動賠付。
 *      3. claimExpired：超過 256 個區塊未揭露，任何人可宣告過期，注金留在資金池。
 *         settle 與 expire 的有效區間互斥，不存在先到先贏的競爭。
 *
 *      v2 的缺陷（玩家同時提交雙方承諾，下注前即可算出結果）已由此設計移除。
 *      殘餘風險：產出 revealBlock 的出塊者若與玩家串通，可調整區塊內容以影響 blockhash。
 */
contract FairBet {

    enum GameType { Dice, Coin, Roulette, Slots, Crash, Limbo, Wheel, Plinko, Revolver }
    enum BetState { None, Placed, Settled, Expired }

    struct Bet {
        address  player;
        uint8    gameType;
        uint8    betType;
        BetState state;
        uint64   revealBlock;
        uint256  param;
        uint256  amount;
        bytes32  playerCommit;
        bytes32  playerSeed;
        bytes32  playerSalt;
        bytes32  entropy;
        bytes32  finalRandom;
        uint256  outcome;
        uint256  payout;
    }

    uint256 public constant RULES_VERSION = 3;
    uint256 public constant REVEAL_WINDOW = 256;

    address public immutable owner;
    uint256 public betCount;
    uint256 public lockedPayouts;
    mapping(uint256 => Bet) internal bets;
    mapping(bytes32 => uint256) public betIdByCommit;

    uint256 private constant BPS = 10000;
    uint256 private constant E52 = 1 << 52;
    uint256 private constant CRASH_CAP = 1_000_000;

    uint256 private constant RED_MASK =
        (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 12) |
        (1 << 14) | (1 << 16) | (1 << 18) | (1 << 19) | (1 << 21) | (1 << 23) |
        (1 << 25) | (1 << 27) | (1 << 30) | (1 << 32) | (1 << 34) | (1 << 36);

    event PoolFunded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event BetPlaced(
        uint256 indexed betId, address indexed player,
        uint8 gameType, uint8 betType, uint256 param, uint256 amount,
        bytes32 playerCommit, uint64 revealBlock
    );
    event BetSettled(
        uint256 indexed betId, address indexed player,
        bool won, uint256 outcome, bytes32 entropy, bytes32 finalRandom, uint256 payout
    );
    event BetExpired(uint256 indexed betId, uint256 forfeited);

    error ZeroBet();
    error InvalidBet();
    error CommitReused(bytes32 commit);
    error PoolInsufficient(uint256 needed, uint256 available);
    error BetNotFound(uint256 betId);
    error NotPlaced(uint256 betId, BetState state);
    error NotPlayer(uint256 betId);
    error BadPlayerCommit(uint256 betId);
    error TooEarly(uint256 betId, uint256 revealBlock);
    error RevealWindowClosed(uint256 betId);
    error NotExpired(uint256 betId);
    error NotOwner();
    error TransferFailed();

    constructor() { owner = msg.sender; }

    receive() external payable { emit PoolFunded(msg.sender, msg.value); }

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
            return amount * param / BPS;
        if (g == uint8(GameType.Wheel))    return amount * 25000 / BPS;
        if (g == uint8(GameType.Plinko))   return amount * 160000 / BPS;
        if (g == uint8(GameType.Revolver)) return amount * 60000 / (6 - betType) / BPS;
        return amount * 2;
    }

    function placeBet(uint8 gameType, uint8 betType, uint256 param, bytes32 playerCommit)
        external payable returns (uint256 betId)
    {
        if (msg.value == 0) revert ZeroBet();
        _validate(gameType, betType, param);
        if (betIdByCommit[playerCommit] != 0) revert CommitReused(playerCommit);

        uint256 potential = maxPayout(gameType, betType, param, msg.value);
        uint256 available = address(this).balance - lockedPayouts;
        if (potential > available) revert PoolInsufficient(potential, available);
        lockedPayouts += potential;

        betId = ++betCount;
        uint64 revealBlock = uint64(block.number + 1);
        Bet storage b = bets[betId];
        b.player = msg.sender; b.gameType = gameType; b.betType = betType;
        b.state = BetState.Placed; b.revealBlock = revealBlock;
        b.param = param; b.amount = msg.value; b.playerCommit = playerCommit;
        betIdByCommit[playerCommit] = betId;

        emit BetPlaced(betId, msg.sender, gameType, betType, param, msg.value, playerCommit, revealBlock);
    }

    function _validate(uint8 g, uint8 betType, uint256 param) internal pure {
        if (g > uint8(GameType.Revolver)) revert InvalidBet();
        if (g == uint8(GameType.Dice)     && betType > 3) revert InvalidBet();
        if (g == uint8(GameType.Coin)     && betType > 1) revert InvalidBet();
        if (g == uint8(GameType.Roulette) && (betType > 6 || (betType == 6 && param > 36))) revert InvalidBet();
        if ((g == uint8(GameType.Crash) || g == uint8(GameType.Limbo)) && (param < 10100 || param > CRASH_CAP))
            revert InvalidBet();
        if (g == uint8(GameType.Revolver) && (betType < 1 || betType > 5)) revert InvalidBet();
    }

    function settleBet(uint256 betId, bytes32 playerSeed, bytes32 playerSalt) external {
        Bet storage b = bets[betId];
        if (b.state == BetState.None)   revert BetNotFound(betId);
        if (b.state != BetState.Placed) revert NotPlaced(betId, b.state);
        if (b.player != msg.sender)     revert NotPlayer(betId);
        if (block.number <= b.revealBlock) revert TooEarly(betId, b.revealBlock);
        if (block.number > b.revealBlock + REVEAL_WINDOW) revert RevealWindowClosed(betId);
        if (keccak256(abi.encodePacked(playerSeed, playerSalt)) != b.playerCommit) revert BadPlayerCommit(betId);

        bytes32 entropy = blockhash(b.revealBlock);
        bytes32 fr = keccak256(abi.encodePacked(playerSeed, entropy));
        (uint256 payout, uint256 outcome) = resolve(b.gameType, b.betType, b.param, b.amount, fr);

        lockedPayouts -= maxPayout(b.gameType, b.betType, b.param, b.amount);
        b.state = BetState.Settled;
        b.playerSeed = playerSeed; b.playerSalt = playerSalt;
        b.entropy = entropy; b.finalRandom = fr;
        b.outcome = outcome; b.payout = payout;

        if (payout > 0) {
            (bool ok, ) = msg.sender.call{value: payout}("");
            if (!ok) revert TransferFailed();
        }
        emit BetSettled(betId, msg.sender, payout > b.amount, outcome, entropy, fr, payout);
    }

    function claimExpired(uint256 betId) external {
        Bet storage b = bets[betId];
        if (b.state == BetState.None)   revert BetNotFound(betId);
        if (b.state != BetState.Placed) revert NotPlaced(betId, b.state);
        if (block.number <= b.revealBlock + REVEAL_WINDOW) revert NotExpired(betId);
        lockedPayouts -= maxPayout(b.gameType, b.betType, b.param, b.amount);
        b.state = BetState.Expired;
        emit BetExpired(betId, b.amount);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 available = address(this).balance - lockedPayouts;
        if (amount > available) revert PoolInsufficient(amount, available);
        (bool ok, ) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(owner, amount);
    }

    function poolBalance() external view returns (uint256) { return address(this).balance; }
    function getBet(uint256 betId) external view returns (Bet memory) { return bets[betId]; }

    /** crash/limbo 崩盤倍率 bps = min(CAP, 10000·E/(E-h)), h = uint256(fr) % 2^52 */
    function crashBps(bytes32 fr) public pure returns (uint256) {
        uint256 h = uint256(fr) % E52;
        uint256 m = (BPS * E52) / (E52 - h);
        return m > CRASH_CAP ? CRASH_CAP : m;
    }

    /// 結果與賠付的純函數；公開供第三方以 eth_call 交叉驗證
    function resolve(uint8 g, uint8 betType, uint256 param, uint256 amount, bytes32 fr)
        public pure returns (uint256 payout, uint256 outcome)
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

        } else {
            uint256 chamber = uint256(fr) % 6; outcome = chamber;
            bool survived = chamber >= betType;
            payout = survived ? amount * 60000 / (6 - betType) / BPS : 0;
        }
    }
}
