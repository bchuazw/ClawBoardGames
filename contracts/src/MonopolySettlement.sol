// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MonopolySettlement
 * @notice Thin settlement contract for ClawBoardGames v2.
 *
 * Flow (fixed players):
 *   1. createGame(players)           -> gameId (DEPOSITING)
 *   2. depositAndCommit(id, hash)    -> each of the 4 agents sends 0.001 native (BNB on BNB Chain) + secret hash
 *      When 4 deposits received      -> status = REVEALING, revealDeadline set
 *
 * Flow (open games — any agent can join):
 *   1. createOpenGame()              -> gameId (OPEN), added to openGameIds
 *   2. depositAndCommit(id, hash)    -> any address; first 4 get slots. When 4th -> REVEALING, removed from openGameIds
 *   3. revealSeed(id, secret)        -> same as above
 *   4. checkpoint / settleGame / withdraw / voidGame -> same as above
 */
contract MonopolySettlement is ReentrancyGuard {

    // ========== CONSTANTS ==========

    uint256 public constant ENTRY_FEE = 0.001 ether;
    uint256 public constant NUM_PLAYERS = 4;
    uint256 public constant WINNER_BPS = 8000;      // 80%
    uint256 public constant PLATFORM_BPS = 2000;     // 20%
    uint256 public constant REVEAL_TIMEOUT = 2 minutes;
    uint256 public constant DEPOSIT_TIMEOUT = 10 minutes; // cancel if not all deposited
    uint256 public constant GAME_TIMEOUT = 24 hours;      // emergency cancel if GM never settles
    uint256 public constant STARTING_CLAW = 1000e18;      // 1000 CLAW per player

    // ========== STATE ==========

    address public owner;
    address public platformFeeAddr;
    address public gmSigner;              // authorized GM address
    ICLAWToken public clawToken;
    uint256 public gameCount;

    enum Status { PENDING, OPEN, DEPOSITING, REVEALING, STARTED, SETTLED, VOIDED }

    struct Game {
        address[4] players;
        Status status;
        bytes32[4] commitHashes;
        bytes32[4] revealedSecrets;
        uint8 depositCount;
        uint8 revealCount;
        bytes32 diceSeed;
        address winner;
        bytes32 gameLogHash;
        uint256 revealDeadline;
        uint256 createdAt;
        uint256 startedAt;
        bool winnerPaid;
    }

    struct Checkpoint {
        uint256 round;
        uint256 playersPacked;
        uint256 propertiesPacked;
        uint256 metaPacked;
    }

    mapping(uint256 => Game) public games;
    mapping(uint256 => Checkpoint) public checkpoints;
    mapping(uint256 => mapping(address => bool)) public hasDeposited;

    /// @dev Open game IDs (any agent can join). Removed when 4th deposit.
    uint256[] public openGameIds;
    mapping(uint256 => uint256) public gameIdToOpenIndex; // 1-based; 0 = not in list

    // ========== EVENTS ==========

    event GameCreated(uint256 indexed gameId, address[4] players);
    event OpenGameCreated(uint256 indexed gameId);
    event DepositAndCommit(uint256 indexed gameId, address indexed player, bytes32 commitHash);
    event AllDeposited(uint256 indexed gameId, uint256 revealDeadline);
    event SeedRevealed(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId, bytes32 diceSeed);
    event CheckpointWritten(uint256 indexed gameId, uint256 round);
    event GameSettled(uint256 indexed gameId, address indexed winner, bytes32 gameLogHash);
    event Withdrawn(uint256 indexed gameId, address indexed winner, uint256 amount);
    event GameVoided(uint256 indexed gameId);

    // ========== MODIFIERS ==========

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyGM() {
        require(msg.sender == gmSigner, "Not GM");
        _;
    }

    // ========== CONSTRUCTOR ==========

    constructor(address _platformFeeAddr, address _gmSigner, address _clawToken) {
        require(_platformFeeAddr != address(0), "Zero platform");
        require(_gmSigner != address(0), "Zero GM");
        require(_clawToken != address(0), "Zero CLAW");
        owner = msg.sender;
        platformFeeAddr = _platformFeeAddr;
        gmSigner = _gmSigner;
        clawToken = ICLAWToken(_clawToken);
    }

    // ========== GAME LIFECYCLE ==========

    /**
     * @notice Create a new game with 4 players.
     * @param players The 4 player addresses.
     * @return gameId The ID of the created game.
     */
    function createGame(address[4] calldata players) external returns (uint256 gameId) {
        gameId = gameCount++;

        // Validate: all unique, non-zero addresses
        for (uint256 i = 0; i < 4; i++) {
            require(players[i] != address(0), "Zero address");
            for (uint256 j = i + 1; j < 4; j++) {
                require(players[i] != players[j], "Duplicate player");
            }
        }

        Game storage g = games[gameId];
        g.players = players;
        g.status = Status.DEPOSITING;
        g.createdAt = block.timestamp;

        emit GameCreated(gameId, players);
    }

    /**
     * @notice Create an open game that any address can join (first 4 to deposit get the slots). GM only.
     * @return gameId The ID of the created open game.
     */
    function createOpenGame() external onlyGM returns (uint256 gameId) {
        gameId = gameCount++;

        Game storage g = games[gameId];
        g.players = [address(0), address(0), address(0), address(0)];
        g.status = Status.OPEN;
        g.createdAt = block.timestamp;

        openGameIds.push(gameId);
        gameIdToOpenIndex[gameId] = openGameIds.length; // 1-based

        emit OpenGameCreated(gameId);
    }

    /**
     * @notice Deposit entry fee + commit dice secret in ONE transaction.
     * @param gameId The game to join.
     * @param secretHash keccak256(secret) where secret is a bytes32.
     */
    function depositAndCommit(uint256 gameId, bytes32 secretHash) external payable nonReentrant {
        Game storage g = games[gameId];
        require(
            g.status == Status.DEPOSITING || g.status == Status.OPEN,
            "Not in deposit phase"
        );
        require(msg.value == ENTRY_FEE, "Wrong amount");
        require(secretHash != bytes32(0), "Empty commit hash");
        require(!hasDeposited[gameId][msg.sender], "Already deposited");

        uint8 playerIdx;

        if (g.status == Status.OPEN) {
            // Open game: assign msg.sender to first empty slot; stay OPEN until 4th deposit
            playerIdx = _findEmptySlot(g);
            g.players[playerIdx] = msg.sender;
        } else {
            // Fixed players: must be one of the 4
            playerIdx = _findPlayerIndex(g, msg.sender);
        }

        hasDeposited[gameId][msg.sender] = true;
        g.commitHashes[playerIdx] = secretHash;
        g.depositCount++;

        emit DepositAndCommit(gameId, msg.sender, secretHash);

        // If all 4 deposited, move to reveal phase and remove from open pool
        if (g.depositCount == NUM_PLAYERS) {
            g.status = Status.REVEALING;
            g.revealDeadline = block.timestamp + REVEAL_TIMEOUT;
            _removeFromOpenGameIds(gameId);
            emit AllDeposited(gameId, g.revealDeadline);
        }
    }

    /**
     * @notice Reveal your dice secret. Must match your commit hash.
     * @param gameId The game ID.
     * @param secret Your original secret (bytes32).
     */
    function revealSeed(uint256 gameId, bytes32 secret) external {
        Game storage g = games[gameId];
        require(g.status == Status.REVEALING, "Not in reveal phase");

        uint8 playerIdx = _findPlayerIndex(g, msg.sender);
        require(g.commitHashes[playerIdx] != bytes32(0), "No commit");
        require(g.revealedSecrets[playerIdx] == bytes32(0), "Already revealed");
        require(keccak256(abi.encodePacked(secret)) == g.commitHashes[playerIdx], "Hash mismatch");

        g.revealedSecrets[playerIdx] = secret;
        g.revealCount++;

        emit SeedRevealed(gameId, msg.sender);

        // If all 4 revealed, compute dice seed and start game
        if (g.revealCount == NUM_PLAYERS) {
            g.diceSeed = g.revealedSecrets[0] ^ g.revealedSecrets[1] ^ g.revealedSecrets[2] ^ g.revealedSecrets[3];
            g.status = Status.STARTED;
            g.startedAt = block.timestamp;

            // Mint CLAW to each player
            for (uint256 i = 0; i < NUM_PLAYERS; i++) {
                clawToken.mint(g.players[i], STARTING_CLAW);
            }

            emit GameStarted(gameId, g.diceSeed);
        }
    }

    /**
     * @notice Write a compressed game state checkpoint (GM only).
     * @param gameId The game ID.
     * @param round The round number for this checkpoint.
     * @param playersPacked Packed player states (positions, cash, alive, jail).
     * @param propertiesPacked Packed property states (owner, mortgaged).
     * @param metaPacked Packed meta (currentPlayer, turn, round, aliveCount).
     */
    function checkpoint(
        uint256 gameId,
        uint256 round,
        uint256 playersPacked,
        uint256 propertiesPacked,
        uint256 metaPacked
    ) external onlyGM {
        Game storage g = games[gameId];
        require(g.status == Status.STARTED, "Game not started");

        checkpoints[gameId] = Checkpoint({
            round: round,
            playersPacked: playersPacked,
            propertiesPacked: propertiesPacked,
            metaPacked: metaPacked
        });

        emit CheckpointWritten(gameId, round);
    }

    /**
     * @notice Settle the game (GM only). Immediate -- no dispute window.
     * @param gameId The game ID.
     * @param winner The winning player address.
     * @param gameLogHash Hash of the full game log for verification.
     */
    function settleGame(uint256 gameId, address winner, bytes32 gameLogHash) external onlyGM {
        Game storage g = games[gameId];
        require(g.status == Status.STARTED, "Game not started");
        require(_isPlayer(g, winner), "Winner not a player");

        g.winner = winner;
        g.gameLogHash = gameLogHash;
        g.status = Status.SETTLED;

        emit GameSettled(gameId, winner, gameLogHash);

        // Burn all CLAW from the four players
        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            uint256 bal = clawToken.balanceOf(g.players[i]);
            if (bal > 0) {
                clawToken.retrieveFrom(g.players[i], bal);
            }
        }
    }

    /**
     * @notice Winner withdraws their prize. 80% to winner, 20% to platform.
     * @param gameId The game ID.
     */
    function withdraw(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(g.status == Status.SETTLED, "Not settled");
        require(msg.sender == g.winner, "Not the winner");
        require(!g.winnerPaid, "Already paid");

        g.winnerPaid = true;

        uint256 totalPot = ENTRY_FEE * NUM_PLAYERS;                // 0.004 native (BNB)
        uint256 winnerShare = (totalPot * WINNER_BPS) / 10000;     // 0.0032 BNB
        uint256 platformShare = totalPot - winnerShare;              // 0.0008 BNB

        (bool sent1, ) = payable(g.winner).call{value: winnerShare}("");
        require(sent1, "Winner transfer failed");

        (bool sent2, ) = payable(platformFeeAddr).call{value: platformShare}("");
        require(sent2, "Platform transfer failed");

        emit Withdrawn(gameId, g.winner, winnerShare);
    }

    /**
     * @notice Void a game if reveal deadline has passed. Refunds all depositors.
     * @param gameId The game ID.
     */
    function voidGame(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(
            g.status == Status.REVEALING && block.timestamp > g.revealDeadline,
            "Cannot void"
        );

        g.status = Status.VOIDED;

        // Refund all players who deposited
        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            if (hasDeposited[gameId][g.players[i]]) {
                (bool sent, ) = payable(g.players[i]).call{value: ENTRY_FEE}("");
                require(sent, "Refund failed");
            }
        }

        emit GameVoided(gameId);
    }

    /**
     * @notice Cancel a game stuck in DEPOSITING or OPEN phase (after deposit timeout).
     *         Refunds all players who deposited. Anyone can call.
     */
    function cancelGame(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(
            (g.status == Status.DEPOSITING || g.status == Status.OPEN) &&
            block.timestamp > g.createdAt + DEPOSIT_TIMEOUT,
            "Cannot cancel"
        );

        if (g.status == Status.OPEN) {
            _removeFromOpenGameIds(gameId);
        }
        g.status = Status.VOIDED;

        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            if (g.players[i] != address(0) && hasDeposited[gameId][g.players[i]]) {
                (bool sent, ) = payable(g.players[i]).call{value: ENTRY_FEE}("");
                require(sent, "Refund failed");
            }
        }

        emit GameVoided(gameId);
    }

    /**
     * @notice Emergency void for a STARTED game if GM never settled (after 24h).
     *         Refunds all players. Anyone can call.
     */
    function emergencyVoid(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(
            g.status == Status.STARTED &&
            block.timestamp > g.startedAt + GAME_TIMEOUT,
            "Cannot emergency void"
        );

        g.status = Status.VOIDED;

        // Burn all CLAW from the four players before refunding BNB
        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            uint256 bal = clawToken.balanceOf(g.players[i]);
            if (bal > 0) {
                clawToken.retrieveFrom(g.players[i], bal);
            }
        }

        for (uint256 i = 0; i < NUM_PLAYERS; i++) {
            (bool sent, ) = payable(g.players[i]).call{value: ENTRY_FEE}("");
            require(sent, "Refund failed");
        }

        emit GameVoided(gameId);
    }

    // ========== ADMIN ==========

    function setGMSigner(address _gmSigner) external onlyOwner {
        gmSigner = _gmSigner;
    }

    function setPlatformFeeAddr(address _addr) external onlyOwner {
        platformFeeAddr = _addr;
    }

    // ========== VIEW ==========

    function getGame(uint256 gameId) external view returns (
        address[4] memory players,
        Status status,
        uint8 depositCount,
        uint8 revealCount,
        bytes32 diceSeed,
        address winner,
        uint256 revealDeadline,
        bool winnerPaid
    ) {
        Game storage g = games[gameId];
        return (g.players, g.status, g.depositCount, g.revealCount, g.diceSeed, g.winner, g.revealDeadline, g.winnerPaid);
    }

    function getCheckpoint(uint256 gameId) external view returns (
        uint256 round,
        uint256 playersPacked,
        uint256 propertiesPacked,
        uint256 metaPacked
    ) {
        Checkpoint storage c = checkpoints[gameId];
        return (c.round, c.playersPacked, c.propertiesPacked, c.metaPacked);
    }

    /// @notice Returns all game IDs that are currently open for anyone to join.
    function getOpenGameIds() external view returns (uint256[] memory) {
        return openGameIds;
    }

    // ========== INTERNAL ==========

    function _findEmptySlot(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) {
            if (g.players[i] == address(0)) return i;
        }
        revert("No empty slot");
    }

    function _removeFromOpenGameIds(uint256 gameId) internal {
        uint256 idx = gameIdToOpenIndex[gameId];
        if (idx == 0) return;
        uint256 len = openGameIds.length;
        require(idx <= len, "Invalid index");

        uint256 lastId = openGameIds[len - 1];
        openGameIds[idx - 1] = lastId;
        gameIdToOpenIndex[lastId] = idx;
        gameIdToOpenIndex[gameId] = 0;
        openGameIds.pop();
    }

    function _findPlayerIndex(Game storage g, address player) internal view returns (uint8) {
        for (uint8 i = 0; i < 4; i++) {
            if (g.players[i] == player) return i;
        }
        revert("Not a player");
    }

    function _isPlayer(Game storage g, address addr) internal view returns (bool) {
        for (uint256 i = 0; i < 4; i++) {
            if (g.players[i] == addr) return true;
        }
        return false;
    }

    receive() external payable {}
}

// ========== INTERFACE ==========

interface ICLAWToken {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function retrieveFrom(address account, uint256 amount) external;
}
