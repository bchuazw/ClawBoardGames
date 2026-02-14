import { expect } from "chai";
import { ethers } from "hardhat";
import { MonopolySettlement, CLAWToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("MonopolySettlement", function () {
  let settlement: MonopolySettlement;
  let clawToken: CLAWToken;
  let owner: HardhatEthersSigner;
  let gm: HardhatEthersSigner;
  let platformFee: HardhatEthersSigner;
  let players: HardhatEthersSigner[];
  let playerAddrs: [string, string, string, string];

  const ENTRY_FEE = ethers.parseEther("0.001");
  const secrets = [
    ethers.randomBytes(32),
    ethers.randomBytes(32),
    ethers.randomBytes(32),
    ethers.randomBytes(32),
  ];
  const commitHashes = secrets.map(s => ethers.keccak256(ethers.solidityPacked(["bytes32"], [s])));

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    gm = signers[1];
    platformFee = signers[2];
    players = signers.slice(3, 7);
    playerAddrs = [
      await players[0].getAddress(),
      await players[1].getAddress(),
      await players[2].getAddress(),
      await players[3].getAddress(),
    ] as [string, string, string, string];

    // Deploy CLAW token
    const CLAWFactory = await ethers.getContractFactory("CLAWToken");
    clawToken = await CLAWFactory.deploy(await owner.getAddress());
    await clawToken.waitForDeployment();

    // Deploy Settlement
    const SettlementFactory = await ethers.getContractFactory("MonopolySettlement");
    settlement = await SettlementFactory.deploy(
      await platformFee.getAddress(),
      await gm.getAddress(),
      await clawToken.getAddress(),
    );
    await settlement.waitForDeployment();

    // Authorize settlement as minter
    await clawToken.setMinter(await settlement.getAddress(), true);
  });

  describe("createGame", function () {
    it("should create a game and emit event", async function () {
      await expect(settlement.createGame(playerAddrs))
        .to.emit(settlement, "GameCreated")
        .withArgs(0, playerAddrs);

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(2); // DEPOSITING (OPEN=1)
      expect(game.depositCount).to.equal(0);
    });

    it("should reject duplicate players", async function () {
      const duped: [string, string, string, string] = [playerAddrs[0], playerAddrs[0], playerAddrs[2], playerAddrs[3]];
      await expect(settlement.createGame(duped)).to.be.revertedWith("Duplicate player");
    });

    it("should reject zero address", async function () {
      const withZero: [string, string, string, string] = [ethers.ZeroAddress, playerAddrs[1], playerAddrs[2], playerAddrs[3]];
      await expect(settlement.createGame(withZero)).to.be.revertedWith("Zero address");
    });
  });

  describe("depositAndCommit", function () {
    beforeEach(async function () {
      await settlement.createGame(playerAddrs);
    });

    it("should accept deposit + commit", async function () {
      await expect(
        settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE })
      ).to.emit(settlement, "DepositAndCommit");

      const game = await settlement.getGame(0);
      expect(game.depositCount).to.equal(1);
      expect(game.status).to.equal(2); // DEPOSITING
    });

    it("should reject wrong ETH amount", async function () {
      await expect(
        settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ethers.parseEther("0.002") })
      ).to.be.revertedWith("Wrong amount");
    });

    it("should reject non-player", async function () {
      await expect(
        settlement.connect(owner).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE })
      ).to.be.revertedWith("Not a player");
    });

    it("should reject double deposit", async function () {
      await settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE });
      await expect(
        settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE })
      ).to.be.revertedWith("Already deposited");
    });

    it("should transition to REVEALING after 4 deposits", async function () {
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }
      const game = await settlement.getGame(0);
      expect(game.status).to.equal(3); // REVEALING (OPEN=1, DEPOSITING=2)
      expect(game.depositCount).to.equal(4);
    });
  });

  describe("revealSeed", function () {
    beforeEach(async function () {
      await settlement.createGame(playerAddrs);
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }
    });

    it("should accept valid reveal", async function () {
      await expect(
        settlement.connect(players[0]).revealSeed(0, secrets[0])
      ).to.emit(settlement, "SeedRevealed");
    });

    it("should reject wrong secret", async function () {
      await expect(
        settlement.connect(players[0]).revealSeed(0, ethers.randomBytes(32))
      ).to.be.revertedWith("Hash mismatch");
    });

    it("should reject double reveal", async function () {
      await settlement.connect(players[0]).revealSeed(0, secrets[0]);
      await expect(
        settlement.connect(players[0]).revealSeed(0, secrets[0])
      ).to.be.revertedWith("Already revealed");
    });

    it("should start game after 4 reveals + mint CLAW", async function () {
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).revealSeed(0, secrets[i]);
      }
      const game = await settlement.getGame(0);
      expect(game.status).to.equal(4); // STARTED
      expect(game.diceSeed).to.not.equal(ethers.ZeroHash);

      // Each player should have 1500 CLAW
      for (let i = 0; i < 4; i++) {
        const bal = await clawToken.balanceOf(playerAddrs[i]);
        expect(bal).to.equal(ethers.parseEther("1500"));
      }
    });
  });

  describe("settleGame + withdraw", function () {
    beforeEach(async function () {
      await settlement.createGame(playerAddrs);
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).revealSeed(0, secrets[i]);
      }
    });

    it("GM should settle game", async function () {
      const logHash = ethers.keccak256(ethers.toUtf8Bytes("game-log"));
      await expect(
        settlement.connect(gm).settleGame(0, playerAddrs[0], logHash)
      ).to.emit(settlement, "GameSettled");

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(5); // SETTLED
      expect(game.winner).to.equal(playerAddrs[0]);
    });

    it("non-GM should not settle", async function () {
      const logHash = ethers.keccak256(ethers.toUtf8Bytes("game-log"));
      await expect(
        settlement.connect(players[0]).settleGame(0, playerAddrs[0], logHash)
      ).to.be.revertedWith("Not GM");
    });

    it("winner should withdraw 80%, platform gets 20%", async function () {
      const logHash = ethers.keccak256(ethers.toUtf8Bytes("game-log"));
      await settlement.connect(gm).settleGame(0, playerAddrs[0], logHash);

      const winnerBalBefore = await ethers.provider.getBalance(playerAddrs[0]);
      const platformBalBefore = await ethers.provider.getBalance(await platformFee.getAddress());

      const tx = await settlement.connect(players[0]).withdraw(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const winnerBalAfter = await ethers.provider.getBalance(playerAddrs[0]);
      const platformBalAfter = await ethers.provider.getBalance(await platformFee.getAddress());

      const expectedWinnerShare = (ENTRY_FEE * 4n * 8000n) / 10000n; // 0.0032 ETH
      const expectedPlatformShare = ENTRY_FEE * 4n - expectedWinnerShare; // 0.0008 ETH

      expect(winnerBalAfter - winnerBalBefore + gasUsed).to.equal(expectedWinnerShare);
      expect(platformBalAfter - platformBalBefore).to.equal(expectedPlatformShare);
    });

    it("should reject double withdraw", async function () {
      const logHash = ethers.keccak256(ethers.toUtf8Bytes("game-log"));
      await settlement.connect(gm).settleGame(0, playerAddrs[0], logHash);
      await settlement.connect(players[0]).withdraw(0);
      await expect(
        settlement.connect(players[0]).withdraw(0)
      ).to.be.revertedWith("Already paid");
    });
  });

  describe("checkpoint", function () {
    beforeEach(async function () {
      await settlement.createGame(playerAddrs);
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).revealSeed(0, secrets[i]);
      }
    });

    it("GM should write checkpoint", async function () {
      await expect(
        settlement.connect(gm).checkpoint(0, 1, 12345n, 67890n, 11111n)
      ).to.emit(settlement, "CheckpointWritten").withArgs(0, 1);

      const cp = await settlement.getCheckpoint(0);
      expect(cp.round).to.equal(1);
      expect(cp.playersPacked).to.equal(12345n);
    });

    it("non-GM should not write checkpoint", async function () {
      await expect(
        settlement.connect(players[0]).checkpoint(0, 1, 0n, 0n, 0n)
      ).to.be.revertedWith("Not GM");
    });
  });

  describe("voidGame", function () {
    beforeEach(async function () {
      await settlement.createGame(playerAddrs);
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }
      // Only 2 players reveal
      await settlement.connect(players[0]).revealSeed(0, secrets[0]);
      await settlement.connect(players[1]).revealSeed(0, secrets[1]);
    });

    it("should not void before deadline", async function () {
      await expect(settlement.voidGame(0)).to.be.revertedWith("Cannot void");
    });

    it("should void after deadline and refund", async function () {
      // Fast forward 3 minutes
      await ethers.provider.send("evm_increaseTime", [180]);
      await ethers.provider.send("evm_mine", []);

      const balBefore = await ethers.provider.getBalance(playerAddrs[2]);
      await settlement.voidGame(0);

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(6); // VOIDED

      // Check all players received refund
      const balAfter = await ethers.provider.getBalance(playerAddrs[2]);
      expect(balAfter - balBefore).to.equal(ENTRY_FEE);
    });
  });

  describe("cancelGame (partial deposit timeout)", function () {
    it("should cancel after deposit timeout and refund", async function () {
      await settlement.createGame(playerAddrs);
      // Only 2 players deposit
      await settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE });
      await settlement.connect(players[1]).depositAndCommit(0, commitHashes[1], { value: ENTRY_FEE });

      // Should not cancel before timeout
      await expect(settlement.cancelGame(0)).to.be.revertedWith("Cannot cancel");

      // Fast forward 11 minutes
      await ethers.provider.send("evm_increaseTime", [660]);
      await ethers.provider.send("evm_mine", []);

      const bal0Before = await ethers.provider.getBalance(playerAddrs[0]);
      await settlement.cancelGame(0);

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(6); // VOIDED

      const bal0After = await ethers.provider.getBalance(playerAddrs[0]);
      expect(bal0After - bal0Before).to.equal(ENTRY_FEE);
    });
  });

  describe("emergencyVoid (GM never settled)", function () {
    beforeEach(async function () {
      await settlement.createGame(playerAddrs);
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }
      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).revealSeed(0, secrets[i]);
      }
    });

    it("should not emergency void before 24h", async function () {
      await expect(settlement.emergencyVoid(0)).to.be.revertedWith("Cannot emergency void");
    });

    it("should emergency void after 24h and refund all", async function () {
      // Fast forward 25 hours
      await ethers.provider.send("evm_increaseTime", [90000]);
      await ethers.provider.send("evm_mine", []);

      const bal0Before = await ethers.provider.getBalance(playerAddrs[0]);
      await settlement.emergencyVoid(0);

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(6); // VOIDED

      const bal0After = await ethers.provider.getBalance(playerAddrs[0]);
      expect(bal0After - bal0Before).to.equal(ENTRY_FEE);
    });
  });

  describe("createOpenGame + open deposit flow", function () {
    it("should create open game and emit OpenGameCreated", async function () {
      await expect(settlement.createOpenGame()).to.emit(settlement, "OpenGameCreated").withArgs(0);

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(1); // OPEN
      expect(game.depositCount).to.equal(0);
      expect(game.players[0]).to.equal(ethers.ZeroAddress);
      expect(game.players[1]).to.equal(ethers.ZeroAddress);

      const openIds = await settlement.getOpenGameIds();
      expect(openIds.length).to.equal(1);
      expect(openIds[0]).to.equal(0);
    });

    it("should allow any address to deposit into open game (first 4 get slots)", async function () {
      await settlement.createOpenGame();

      for (let i = 0; i < 4; i++) {
        await settlement.connect(players[i]).depositAndCommit(0, commitHashes[i], { value: ENTRY_FEE });
      }

      const game = await settlement.getGame(0);
      expect(game.status).to.equal(3); // REVEALING
      expect(game.depositCount).to.equal(4);
      expect(game.players[0]).to.equal(playerAddrs[0]);
      expect(game.players[1]).to.equal(playerAddrs[1]);
      expect(game.players[2]).to.equal(playerAddrs[2]);
      expect(game.players[3]).to.equal(playerAddrs[3]);

      const openIds = await settlement.getOpenGameIds();
      expect(openIds.length).to.equal(0);
    });

    it("should reject non-player deposit on fixed game", async function () {
      await settlement.createGame(playerAddrs);
      await expect(
        settlement.connect(owner).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE })
      ).to.be.revertedWith("Not a player");
    });

    it("should reject double deposit in open game", async function () {
      await settlement.createOpenGame();
      await settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE });
      await expect(
        settlement.connect(players[0]).depositAndCommit(0, commitHashes[0], { value: ENTRY_FEE })
      ).to.be.revertedWith("Already deposited");
    });
  });
});
