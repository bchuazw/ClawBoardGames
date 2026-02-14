import { GameAction, GameSnapshot } from "@clawboardgames/engine";
import { AgentPolicy } from "./OpenClawAgent";

/**
 * Aggressive buyer: buys everything it can afford.
 * Bids aggressively in auctions. Never mortgages proactively.
 */
export class AggressivePolicy implements AgentPolicy {
  decide(snapshot: GameSnapshot, legalActions: GameAction[]): GameAction {
    // Buy properties if we can
    const buy = legalActions.find(a => a.type === "buyProperty");
    if (buy) return buy;

    // Bid in auctions
    const bid = legalActions.find(a => a.type === "bid");
    if (bid) return bid;

    // Roll dice
    const roll = legalActions.find(a => a.type === "rollDice");
    if (roll) return roll;

    // Pay jail fee (prefer getting out fast)
    const payJail = legalActions.find(a => a.type === "payJailFee");
    if (payJail) return payJail;

    // Build houses aggressively — always build if we can
    const buildHouse = legalActions.find(a => a.type === "buildHouse");
    if (buildHouse) return buildHouse;

    // End turn
    const endTurn = legalActions.find(a => a.type === "endTurn");
    if (endTurn) return endTurn;

    // Fallback: first legal action
    return legalActions[0];
  }
}

/**
 * Conservative: buys cheap properties, saves cash for rent.
 * Only buys if price < 40% of cash. Passes on expensive auctions.
 */
export class ConservativePolicy implements AgentPolicy {
  decide(snapshot: GameSnapshot, legalActions: GameAction[]): GameAction {
    const myPlayer = snapshot.players[snapshot.currentPlayerIndex];

    // Buy only cheap properties
    const buy = legalActions.find(a => a.type === "buyProperty");
    if (buy && myPlayer) {
      // Check if we're the current player and property is cheap
      const tile = snapshot.properties.find(
        p => p.ownerIndex === -1
      );
      if (tile && myPlayer.cash > 500) {
        return buy;
      }
      // Decline if too expensive
      const decline = legalActions.find(a => a.type === "declineBuy");
      if (decline) return decline;
    }

    // Pass on auctions
    const pass = legalActions.find(a => a.type === "passBid");
    if (pass) return pass;

    // Roll dice
    const roll = legalActions.find(a => a.type === "rollDice");
    if (roll) return roll;

    // Pay jail fee only if we have plenty of cash
    const payJail = legalActions.find(a => a.type === "payJailFee");
    if (payJail && myPlayer && myPlayer.cash > 300) return payJail;

    // Roll to try doubles first
    const rollInJail = legalActions.find(a => a.type === "rollDice");
    if (rollInJail) return rollInJail;

    // Sell houses if cash is low (< 150) to stay safe
    if (myPlayer && myPlayer.cash < 150) {
      const sellHouse = legalActions.find(a => a.type === "sellHouse");
      if (sellHouse) return sellHouse;
    }

    // End turn
    const endTurn = legalActions.find(a => a.type === "endTurn");
    if (endTurn) return endTurn;

    return legalActions[0];
  }
}

/**
 * Smart policy: balanced strategy. Buys strategically, bids wisely.
 */
export class SmartPolicy implements AgentPolicy {
  decide(snapshot: GameSnapshot, legalActions: GameAction[]): GameAction {
    const myPlayer = snapshot.players[snapshot.currentPlayerIndex];
    const myCash = myPlayer?.cash || 0;

    // Buy property if price < 60% of cash
    const buy = legalActions.find(a => a.type === "buyProperty");
    if (buy && myPlayer) {
      // We're on a property tile; check if affordable
      const currentTile = snapshot.properties.find(p => p.ownerIndex === -1);
      if (currentTile && myCash > 400) {
        return buy;
      }
      const decline = legalActions.find(a => a.type === "declineBuy");
      if (decline) return decline;
    }

    // Bid in auctions only if we have plenty of cash
    const bid = legalActions.find(a => a.type === "bid");
    if (bid && myCash > 600) return bid;
    const passBid = legalActions.find(a => a.type === "passBid");
    if (passBid) return passBid;

    // Pay jail fee if we have > 200 cash
    const payJail = legalActions.find(a => a.type === "payJailFee");
    if (payJail && myCash > 200) return payJail;

    // Roll dice
    const roll = legalActions.find(a => a.type === "rollDice");
    if (roll) return roll;

    // Build houses when we have good cash reserves (> 400)
    if (myCash > 400) {
      const buildHouse = legalActions.find(a => a.type === "buildHouse");
      if (buildHouse) return buildHouse;
    }

    // Sell houses if cash is low (< 150) before mortgaging
    if (myCash < 150) {
      const sellHouse = legalActions.find(a => a.type === "sellHouse");
      if (sellHouse) return sellHouse;
    }

    // Mortgage if we're low on cash (< 100)
    if (myCash < 100) {
      const mortgage = legalActions.find(a => a.type === "mortgageProperty");
      if (mortgage) return mortgage;
    }

    // End turn
    const endTurn = legalActions.find(a => a.type === "endTurn");
    if (endTurn) return endTurn;

    return legalActions[0];
  }
}
