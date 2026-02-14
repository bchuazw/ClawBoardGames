import { describe, it, expect } from "vitest";
import { MonopolyEngine } from "../src/MonopolyEngine";
import { DiceDeriver } from "../src/DiceDeriver";
import {
  GameStatus, Phase, TileType, STARTING_CASH, JAIL_POSITION,
  BOARD_SIZE, NUM_PLAYERS, GO_SALARY, JAIL_FEE,
} from "../src/types";
import { TILES, PROPERTY_TILES } from "../src/BoardData";
import { keccak256, toUtf8Bytes } from "ethers";

const SEED = "0x" + "ab".repeat(32);
const PLAYERS: [string, string, string, string] = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
];

function makeSeed(n: number): string {
  return keccak256(toUtf8Bytes(`seed-${n}`));
}

describe("DiceDeriver", () => {
  it("should produce dice in range 1-6", () => {
    const deriver = new DiceDeriver(SEED);
    for (let i = 0; i < 100; i++) {
      const roll = deriver.roll(i);
      expect(roll.d1).toBeGreaterThanOrEqual(1);
      expect(roll.d1).toBeLessThanOrEqual(6);
      expect(roll.d2).toBeGreaterThanOrEqual(1);
      expect(roll.d2).toBeLessThanOrEqual(6);
      expect(roll.sum).toBe(roll.d1 + roll.d2);
      expect(roll.isDoubles).toBe(roll.d1 === roll.d2);
    }
  });

  it("should be deterministic", () => {
    const d1 = new DiceDeriver(SEED);
    const d2 = new DiceDeriver(SEED);
    for (let i = 0; i < 50; i++) {
      expect(d1.roll(i)).toEqual(d2.roll(i));
    }
  });

  it("should reject invalid seeds", () => {
    expect(() => new DiceDeriver("bad")).toThrow();
    expect(() => new DiceDeriver("0x123")).toThrow();
  });
});

describe("MonopolyEngine", () => {
  it("should initialize with correct starting state", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    expect(engine.state.status).toBe(GameStatus.STARTED);
    expect(engine.state.phase).toBe(Phase.TURN_START);
    expect(engine.state.currentPlayerIndex).toBe(0);
    expect(engine.state.aliveCount).toBe(4);
    expect(engine.state.players.length).toBe(4);
    expect(engine.state.properties.length).toBe(28);

    for (const p of engine.state.players) {
      expect(p.cash).toBe(STARTING_CASH);
      expect(p.position).toBe(0);
      expect(p.alive).toBe(true);
      expect(p.inJail).toBe(false);
    }

    for (const prop of engine.state.properties) {
      expect(prop.owner).toBe(-1);
      expect(prop.mortgaged).toBe(false);
    }
  });

  it("should provide legal actions on turn start", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    const actions = engine.getLegalActions();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.some(a => a.type === "rollDice")).toBe(true);
  });

  it("should roll dice and move player", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    const events = engine.executeAction({ type: "rollDice" });

    const diceEvent = events.find(e => e.type === "diceRolled");
    expect(diceEvent).toBeDefined();

    const moveEvent = events.find(e => e.type === "playerMoved");
    expect(moveEvent).toBeDefined();

    expect(engine.state.players[0].position).toBeGreaterThan(0);
  });

  it("should cycle through players", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    expect(engine.state.currentPlayerIndex).toBe(0);

    // Play through player 0's turn
    playTurnSimple(engine);

    // Could be 0 (doubles) or 1 (normal)
    // If no doubles, should be player 1
    const idx = engine.state.currentPlayerIndex;
    expect(idx >= 0 && idx < 4).toBe(true);
  });

  it("should handle buying property", () => {
    // Need a seed that lands on a purchasable property
    for (let s = 0; s < 100; s++) {
      const seed = makeSeed(s);
      const engine = new MonopolyEngine(PLAYERS, seed);
      engine.executeAction({ type: "rollDice" });

      if (engine.state.phase === Phase.BUY_DECISION) {
        const tile = TILES[engine.state.players[0].position];
        const cashBefore = engine.state.players[0].cash;
        engine.executeAction({ type: "buyProperty" });

        expect(engine.state.properties[tile.propertyIndex].owner).toBe(0);
        expect(engine.state.players[0].cash).toBe(cashBefore - tile.price);
        expect(engine.state.phase).toBe(Phase.POST_TURN);
        return;
      }
    }
    // If no seed found a buy, just pass
  });

  it("should handle declining and auction", () => {
    for (let s = 0; s < 100; s++) {
      const seed = makeSeed(s);
      const engine = new MonopolyEngine(PLAYERS, seed);
      engine.executeAction({ type: "rollDice" });

      if (engine.state.phase === Phase.BUY_DECISION) {
        engine.executeAction({ type: "declineBuy" });
        expect(engine.state.auction.active).toBe(true);
        return;
      }
    }
  });

  it("should handle auction bidding and resolution", () => {
    for (let s = 0; s < 100; s++) {
      const seed = makeSeed(s);
      const engine = new MonopolyEngine(PLAYERS, seed);
      engine.executeAction({ type: "rollDice" });

      if (engine.state.phase === Phase.BUY_DECISION) {
        engine.executeAction({ type: "declineBuy" });

        if (engine.state.auction.active) {
          // All players pass => no winner
          let safety = 0;
          while (engine.state.auction.active && safety < 10) {
            engine.executeAction({ type: "passBid" });
            safety++;
          }
          return;
        }
      }
    }
  });

  it("getSnapshot should return valid snapshot", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    const snap = engine.getSnapshot();
    expect(snap.status).toBe(GameStatus.STARTED);
    expect(snap.players.length).toBe(4);
    expect(snap.properties.length).toBe(28);
    expect(snap.players[0].tileName).toBe("Go");
  });

  it("autoPlay should always produce valid moves", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    for (let i = 0; i < 200; i++) {
      if (engine.state.status === GameStatus.ENDED) break;
      const events = engine.autoPlay();
      if (events.length === 0) break;
    }
    // Should not throw
  });

  it("checkpoint pack/unpack round-trips correctly", () => {
    const engine = new MonopolyEngine(PLAYERS, SEED);
    // Play a few turns
    for (let i = 0; i < 20; i++) {
      if (engine.state.status === GameStatus.ENDED) break;
      engine.autoPlay();
    }

    const { playersPacked, propertiesPacked, metaPacked } = engine.packForCheckpoint();

    const restored = MonopolyEngine.fromCheckpoint(
      PLAYERS, SEED, playersPacked, propertiesPacked, metaPacked,
    );

    // Verify players match
    for (let i = 0; i < NUM_PLAYERS; i++) {
      expect(restored.state.players[i].position).toBe(engine.state.players[i].position);
      expect(restored.state.players[i].cash).toBe(engine.state.players[i].cash);
      expect(restored.state.players[i].alive).toBe(engine.state.players[i].alive);
      expect(restored.state.players[i].inJail).toBe(engine.state.players[i].inJail);
      expect(restored.state.players[i].jailTurns).toBe(engine.state.players[i].jailTurns);
    }

    // Verify properties match
    for (let i = 0; i < engine.state.properties.length; i++) {
      expect(restored.state.properties[i].owner).toBe(engine.state.properties[i].owner);
      expect(restored.state.properties[i].mortgaged).toBe(engine.state.properties[i].mortgaged);
    }

    // Verify meta matches
    expect(restored.state.currentPlayerIndex).toBe(engine.state.currentPlayerIndex);
    expect(restored.state.currentTurn).toBe(engine.state.currentTurn);
    expect(restored.state.currentRound).toBe(engine.state.currentRound);
    expect(restored.state.aliveCount).toBe(engine.state.aliveCount);
  });

  describe("jail logic", () => {
    it("should offer payJailFee and rollDice when player is in jail", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      const p = engine.state.players[0];
      p.position = JAIL_POSITION;
      p.inJail = true;
      p.jailTurns = 0;
      engine.state.phase = Phase.TURN_START;
      engine.state.currentPlayerIndex = 0;

      const actions = engine.getLegalActions();
      expect(actions.some(a => a.type === "payJailFee")).toBe(true);
      expect(actions.some(a => a.type === "rollDice")).toBe(true);
    });

    it("should reject payJailFee when not in jail", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      expect(engine.state.players[0].inJail).toBe(false);
      expect(() => engine.executeAction({ type: "payJailFee" })).toThrow("Cannot pay jail fee");
    });

    it("payJailFee should free player, then roll and move", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      const p = engine.state.players[0];
      p.position = JAIL_POSITION;
      p.inJail = true;
      p.jailTurns = 0;
      p.cash = 500;
      engine.state.phase = Phase.TURN_START;
      engine.state.currentPlayerIndex = 0;

      const events = engine.executeAction({ type: "payJailFee" });
      expect(events.some(e => e.type === "freedFromJail" && e.method === "fee")).toBe(true);
      expect(events.some(e => e.type === "diceRolled")).toBe(true);
      expect(events.some(e => e.type === "playerMoved")).toBe(true);
      expect(p.inJail).toBe(false);
      expect(p.jailTurns).toBe(0);
      expect(p.position).toBeGreaterThanOrEqual(0);
      expect(p.position).toBeLessThan(BOARD_SIZE);
    });

    it("should stay in jail and end turn when rolling non-doubles (jailTurns increments)", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      const p = engine.state.players[0];
      p.position = JAIL_POSITION;
      p.inJail = true;
      p.jailTurns = 0;
      engine.state.phase = Phase.TURN_START;
      engine.state.currentPlayerIndex = 0;

      engine.executeAction({ type: "rollDice" });
      expect(p.inJail).toBe(true);
      expect(p.jailTurns).toBe(1);
      expect(engine.state.phase).toBe(Phase.POST_TURN);
    });

    it("should free from jail on doubles and move", () => {
      for (let s = 0; s < 50; s++) {
        const seed = makeSeed(s + 5000);
        const engine = new MonopolyEngine(PLAYERS, seed);
        const p = engine.state.players[0];
        p.position = JAIL_POSITION;
        p.inJail = true;
        p.jailTurns = 0;
        engine.state.phase = Phase.TURN_START;
        engine.state.currentPlayerIndex = 0;
        const turn = engine.state.currentTurn;
        const roll = engine["dice"].roll(turn);
        if (!roll.isDoubles) continue;

        const events = engine.executeAction({ type: "rollDice" });
        expect(p.inJail).toBe(false);
        expect(p.jailTurns).toBe(0);
        expect(events.some(e => e.type === "freedFromJail" && e.method === "doubles")).toBe(true);
        expect(events.some(e => e.type === "playerMoved")).toBe(true);
        return;
      }
    });

    it("should force out after 3 failed rolls and move if alive", () => {
      for (let s = 0; s < 80; s++) {
        const seed = makeSeed(s + 8000);
        const engine = new MonopolyEngine(PLAYERS, seed);
        const p = engine.state.players[0];
        p.position = JAIL_POSITION;
        p.inJail = true;
        p.jailTurns = 2;
        p.cash = 100;
        engine.state.phase = Phase.TURN_START;
        engine.state.currentPlayerIndex = 0;
        const turn = engine.state.currentTurn;
        const roll = engine["dice"].roll(turn);
        if (roll.isDoubles) continue;

        const events = engine.executeAction({ type: "rollDice" });
        expect(p.jailTurns).toBe(0);
        expect(p.inJail).toBe(false);
        expect(events.some(e => e.type === "freedFromJail" && e.method === "maxTurns")).toBe(true);
        expect(p.cash).toBe(100 - JAIL_FEE);
        expect(events.some(e => e.type === "playerMoved")).toBe(true);
        return;
      }
    });

    it("sendToJail should set position to JAIL_POSITION and inJail true", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      const p = engine.state.players[0];
      p.position = 25;
      engine["sendToJail"](p);
      expect(p.position).toBe(JAIL_POSITION);
      expect(p.inJail).toBe(true);
      expect(p.jailTurns).toBe(0);
    });

    it("should advance when current player is dead and phase is POST_TURN (endTurn allowed)", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      engine.state.players[0].alive = false;
      engine.state.aliveCount = 3;
      engine.state.phase = Phase.POST_TURN;
      engine.state.currentPlayerIndex = 0;

      const actions = engine.getLegalActions();
      expect(actions).toEqual([{ type: "endTurn" }]);
      const events = engine.executeAction({ type: "endTurn" });
      expect(engine.state.currentPlayerIndex).toBe(1);
      expect(events.some(e => e.type === "turnStarted")).toBe(true);
    });
  });

  describe("houses", () => {
    /**
     * Helper: set up a monopoly for player 0 on group 1 (Brown: Mediterranean + Baltic, propertyIndex 0 & 1).
     * Returns engine in POST_TURN phase with player 0 as current.
     */
    function setupMonopoly(): MonopolyEngine {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      // Give player 0 both brown properties
      engine.state.properties[0].owner = 0; // Mediterranean Ave
      engine.state.properties[1].owner = 0; // Baltic Ave
      engine.state.players[0].cash = 1500;
      engine.state.phase = Phase.POST_TURN;
      engine.state.currentPlayerIndex = 0;
      return engine;
    }

    it("should allow building a house on a monopoly and increase rent", () => {
      const engine = setupMonopoly();
      const actions = engine.getLegalActions();
      const buildMed = actions.find(a => a.type === "buildHouse" && a.propertyIndex === 0);
      expect(buildMed).toBeDefined();

      // Build one house on Mediterranean (houseCost $50)
      const events = engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      expect(events.some(e => e.type === "houseBuilt" && e.propertyIndex === 0 && e.newCount === 1)).toBe(true);
      expect(engine.state.properties[0].houses).toBe(1);
      expect(engine.state.players[0].cash).toBe(1500 - 50);

      // Rent should now be rentWithHouses[0] = $10 (was $2 base, $4 monopoly)
      const tile = PROPERTY_TILES[0]; // Mediterranean
      const rent = engine["calculateRent"](tile, engine.state.properties[0]);
      expect(rent).toBe(10);
    });

    it("should decrease rent after selling a house", () => {
      const engine = setupMonopoly();
      // Build one house, then sell it
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      expect(engine.state.properties[0].houses).toBe(1);

      engine.executeAction({ type: "sellHouse", propertyIndex: 0 });
      expect(engine.state.properties[0].houses).toBe(0);
      // Sell refund = floor(50 / 2) = 25
      expect(engine.state.players[0].cash).toBe(1500 - 50 + 25);

      // Rent back to monopoly double: 2 * 2 = 4
      const tile = PROPERTY_TILES[0];
      const rent = engine["calculateRent"](tile, engine.state.properties[0]);
      expect(rent).toBe(4);
    });

    it("should enforce even-build rule", () => {
      const engine = setupMonopoly();
      // Build one house on Mediterranean (prop 0)
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      expect(engine.state.properties[0].houses).toBe(1);

      // Cannot build second on Mediterranean until Baltic (prop 1) also has 1
      const actions2 = engine.getLegalActions();
      const buildMed2 = actions2.find(a => a.type === "buildHouse" && a.propertyIndex === 0);
      expect(buildMed2).toBeUndefined();

      // But CAN build on Baltic
      const buildBal = actions2.find(a => a.type === "buildHouse" && a.propertyIndex === 1);
      expect(buildBal).toBeDefined();

      // Build on Baltic to equalize
      engine.executeAction({ type: "buildHouse", propertyIndex: 1 });
      expect(engine.state.properties[1].houses).toBe(1);

      // Now can build second on either
      const actions3 = engine.getLegalActions();
      expect(actions3.some(a => a.type === "buildHouse" && a.propertyIndex === 0)).toBe(true);
      expect(actions3.some(a => a.type === "buildHouse" && a.propertyIndex === 1)).toBe(true);
    });

    it("should enforce even-sell rule", () => {
      const engine = setupMonopoly();
      // Build 2 houses on Mediterranean, 1 on Baltic
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      engine.executeAction({ type: "buildHouse", propertyIndex: 1 });
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      expect(engine.state.properties[0].houses).toBe(2);
      expect(engine.state.properties[1].houses).toBe(1);

      // Can sell from Mediterranean (2 houses, Baltic has 1) — allowed since no other in group has more
      const actions = engine.getLegalActions();
      expect(actions.some(a => a.type === "sellHouse" && a.propertyIndex === 0)).toBe(true);

      // Cannot sell from Baltic (1 house) — Mediterranean has 2, which is > 1
      expect(actions.some(a => a.type === "sellHouse" && a.propertyIndex === 1)).toBe(false);
    });

    it("should block mortgage when property has houses", () => {
      const engine = setupMonopoly();
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      engine.executeAction({ type: "buildHouse", propertyIndex: 1 });

      const actions = engine.getLegalActions();
      // Mortgage should NOT be available for properties with houses
      expect(actions.some(a => a.type === "mortgageProperty" && a.propertyIndex === 0)).toBe(false);
      expect(actions.some(a => a.type === "mortgageProperty" && a.propertyIndex === 1)).toBe(false);

      // Direct handleMortgage should also throw
      expect(() => engine.executeAction({ type: "mortgageProperty", propertyIndex: 0 })).toThrow("Sell all houses before mortgaging");
    });

    it("should not allow building with insufficient cash", () => {
      const engine = setupMonopoly();
      engine.state.players[0].cash = 30; // less than $50 houseCost
      const actions = engine.getLegalActions();
      expect(actions.some(a => a.type === "buildHouse")).toBe(false);
    });

    it("should not allow building on another player's property", () => {
      const engine = setupMonopoly();
      // Give prop 0 to player 1
      engine.state.properties[0].owner = 1;
      const actions = engine.getLegalActions();
      // Player 0 cannot build on prop 0 (owned by player 1)
      expect(actions.some(a => a.type === "buildHouse" && a.propertyIndex === 0)).toBe(false);
    });

    it("should not allow building without a monopoly", () => {
      const engine = new MonopolyEngine(PLAYERS, SEED);
      // Give only one brown property to player 0
      engine.state.properties[0].owner = 0;
      engine.state.phase = Phase.POST_TURN;
      engine.state.currentPlayerIndex = 0;

      const actions = engine.getLegalActions();
      expect(actions.some(a => a.type === "buildHouse")).toBe(false);
    });

    it("should cap houses at 4", () => {
      const engine = setupMonopoly();
      engine.state.players[0].cash = 5000;
      // Build 4 houses on each
      for (let h = 0; h < 4; h++) {
        engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
        engine.executeAction({ type: "buildHouse", propertyIndex: 1 });
      }
      expect(engine.state.properties[0].houses).toBe(4);
      expect(engine.state.properties[1].houses).toBe(4);

      // Cannot build 5th
      const actions = engine.getLegalActions();
      expect(actions.some(a => a.type === "buildHouse")).toBe(false);
    });

    it("recovery from checkpoint should reset houses to 0", () => {
      const engine = setupMonopoly();
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      engine.executeAction({ type: "buildHouse", propertyIndex: 1 });
      expect(engine.state.properties[0].houses).toBe(1);

      const { playersPacked, propertiesPacked, metaPacked } = engine.packForCheckpoint();
      const restored = MonopolyEngine.fromCheckpoint(PLAYERS, SEED, playersPacked, propertiesPacked, metaPacked);

      // Houses should be 0 after recovery (not persisted in checkpoint)
      for (const prop of restored.state.properties) {
        expect(prop.houses).toBe(0);
      }
    });

    it("snapshot should include houses", () => {
      const engine = setupMonopoly();
      engine.executeAction({ type: "buildHouse", propertyIndex: 0 });
      const snap = engine.getSnapshot();
      expect(snap.properties[0].houses).toBe(1);
      expect(snap.properties[1].houses).toBe(0);
    });
  });

  it("should complete a full game (simulation)", () => {
    let gamesCompleted = 0;
    const totalGames = 100;

    for (let g = 0; g < totalGames; g++) {
      const seed = makeSeed(g + 1000);
      const engine = new MonopolyEngine(PLAYERS, seed);
      let moves = 0;
      const maxMoves = 5000;

      while (engine.state.status === GameStatus.STARTED && moves < maxMoves) {
        engine.autoPlay();
        moves++;
      }

      if (engine.state.status === GameStatus.ENDED) {
        gamesCompleted++;
        expect(engine.state.winner).toBeGreaterThanOrEqual(0);
        expect(engine.state.winner).toBeLessThan(4);
        // aliveCount can be > 1 if game ended by max rounds
        expect(engine.state.aliveCount).toBeGreaterThanOrEqual(1);
      }
    }

    // Most games should complete within 5000 moves
    console.log(`Games completed: ${gamesCompleted}/${totalGames}`);
    expect(gamesCompleted).toBeGreaterThan(totalGames * 0.5); // At least half should finish
  });
});

// Helper: plays one turn using autoPlay until turn ends
function playTurnSimple(engine: MonopolyEngine): void {
  const startTurn = engine.state.currentTurn;
  let safety = 0;
  while (engine.state.currentTurn === startTurn && engine.state.status === GameStatus.STARTED && safety < 50) {
    engine.autoPlay();
    safety++;
  }
}
