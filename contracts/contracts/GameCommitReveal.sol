// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GameCommitReveal
 * @notice Commit-Reveal with Salt 雙盲協議：
 *         1. commitGame() — 提交 commitment = keccak256(seed ‖ salt)
 *         2. revealGame() — 揭露 seed + salt，合約驗證後計算 finalRandom
 *
 * @dev 雜湊方式與前端完全一致：
 *      前端：ethers.solidityPackedKeccak256(['bytes32','bytes32'], [a, b])
 *      合約：keccak256(abi.encodePacked(a, b))
 *
 *      使用 bytes32 而非 string：
 *      - gas 更省（固定 32 bytes，非可變長字串）
 *      - 語意精確（種子本就是 256-bit 隨機值）
 *      - 符合業界 commit-reveal 標準寫法
 */
contract GameCommitReveal {

    enum GameState { None, Committed, Revealed }

    struct Game {
        address  player;
        bytes32  playerCommit;   // keccak256(playerSeed ‖ playerSalt)
        bytes32  dealerCommit;   // keccak256(dealerSeed ‖ dealerSalt)
        bytes32  playerSeed;     // 揭露後填入
        bytes32  playerSalt;
        bytes32  dealerSeed;
        bytes32  dealerSalt;
        bytes32  finalRandom;    // keccak256(playerSeed ‖ dealerSeed)
        GameState state;
        uint256  committedAt;
        uint256  revealedAt;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) public games;

    event GameCommitted(
        uint256 indexed gameId,
        address indexed player,
        bytes32 playerCommit,
        bytes32 dealerCommit
    );

    event GameRevealed(
        uint256 indexed gameId,
        address indexed player,
        bytes32 finalRandom,
        bytes32 playerSeed,
        bytes32 dealerSeed
    );

    error GameNotFound(uint256 gameId);
    error AlreadyRevealed(uint256 gameId);
    error NotCommitted(uint256 gameId);
    error InvalidPlayerCommit(uint256 gameId, bytes32 expected, bytes32 got);
    error InvalidDealerCommit(uint256 gameId, bytes32 expected, bytes32 got);
    error NotPlayer(uint256 gameId);

    /**
     * @notice Step 1：提交承諾
     * @param playerCommit  keccak256(playerSeed ‖ playerSalt)
     * @param dealerCommit  keccak256(dealerSeed ‖ dealerSalt)
     * @return gameId       新遊戲編號（從 1 開始）
     */
    function commitGame(
        bytes32 playerCommit,
        bytes32 dealerCommit
    ) external returns (uint256 gameId) {
        gameCount++;
        gameId = gameCount;

        Game storage g = games[gameId];
        g.player       = msg.sender;
        g.playerCommit = playerCommit;
        g.dealerCommit = dealerCommit;
        g.state        = GameState.Committed;
        g.committedAt  = block.timestamp;

        emit GameCommitted(gameId, msg.sender, playerCommit, dealerCommit);
    }

    /**
     * @notice Step 2：揭露種子與 salt，驗證後計算最終隨機數
     */
    function revealGame(
        uint256 gameId,
        bytes32 playerSeed,
        bytes32 playerSalt,
        bytes32 dealerSeed,
        bytes32 dealerSalt
    ) external {
        Game storage g = games[gameId];

        if (g.state == GameState.None)      revert GameNotFound(gameId);
        if (g.state == GameState.Revealed)  revert AlreadyRevealed(gameId);
        if (g.state != GameState.Committed) revert NotCommitted(gameId);
        if (g.player != msg.sender)         revert NotPlayer(gameId);

        // ── 驗證承諾（與前端 commitHash 完全一致）──
        bytes32 pComputed = keccak256(abi.encodePacked(playerSeed, playerSalt));
        bytes32 dComputed = keccak256(abi.encodePacked(dealerSeed, dealerSalt));

        if (pComputed != g.playerCommit)
            revert InvalidPlayerCommit(gameId, g.playerCommit, pComputed);
        if (dComputed != g.dealerCommit)
            revert InvalidDealerCommit(gameId, g.dealerCommit, dComputed);

        // ── 計算最終隨機數（與前端 combineSeeds 完全一致）──
        bytes32 finalRandom = keccak256(abi.encodePacked(playerSeed, dealerSeed));

        g.playerSeed  = playerSeed;
        g.playerSalt  = playerSalt;
        g.dealerSeed  = dealerSeed;
        g.dealerSalt  = dealerSalt;
        g.finalRandom = finalRandom;
        g.state       = GameState.Revealed;
        g.revealedAt  = block.timestamp;

        emit GameRevealed(gameId, msg.sender, finalRandom, playerSeed, dealerSeed);
    }

    // ─── 查詢 ─────────────────────────────────────────────────────

    function getGame(uint256 gameId) external view returns (
        address  player,
        bytes32  playerCommit,
        bytes32  dealerCommit,
        bytes32  playerSeed,
        bytes32  playerSalt,
        bytes32  dealerSeed,
        bytes32  dealerSalt,
        bytes32  finalRandom,
        GameState state,
        uint256  committedAt,
        uint256  revealedAt
    ) {
        Game storage g = games[gameId];
        return (
            g.player,
            g.playerCommit,
            g.dealerCommit,
            g.playerSeed,
            g.playerSalt,
            g.dealerSeed,
            g.dealerSalt,
            g.finalRandom,
            g.state,
            g.committedAt,
            g.revealedAt
        );
    }

    function getFinalRandom(uint256 gameId) external view returns (bytes32) {
        return games[gameId].finalRandom;
    }

    function getState(uint256 gameId) external view returns (GameState) {
        return games[gameId].state;
    }
}
