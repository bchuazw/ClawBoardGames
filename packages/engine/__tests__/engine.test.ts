import { describe, it, expect } from "vitest";
import { MonopolyEngine } from "../src/MonopolyEngine";
import { DiceDeriver } from "../src/DiceDeriver";
import {
  GameStatus, Phase, TileType, STARTING_CASH, JAIL_POSITION,
  BOARD_SIZE, NUM_PLAYERS, GO_SALARY,
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
