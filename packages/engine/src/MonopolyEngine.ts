import {
  NUM_PLAYERS, BOARD_SIZE, STARTING_CASH, GO_SALARY, JAIL_POSITION,
  GO_TO_JAIL_POSITION, JAIL_FEE, MAX_JAIL_TURNS, MAX_DOUBLES_BEFORE_JAIL,
  MAX_ROUNDS, GameStatus, Phase, TileType, CardEffect,
  PlayerState, PropertyState, AuctionState, DiceRoll,
  GameState, GameAction, GameEvent, GameSnapshot,
} from "./types";
import {
  TILES, PROPERTY_TILES, GROUP_SIZES, TileDef,
  getRailroadRent, getUtilityRent, getTaxAmount,
  CHANCE_CARDS, COMMUNITY_CARDS,
} from "./BoardData";
import { DiceDeriver } from "./DiceDeriver";

export class MonopolyEngine {
  state: GameState;
  events: GameEvent[] = [];
  private dice: DiceDeriver;
  private chanceIndex = 0;
  private communityIndex = 0;
  private chanceDeck: number[]; // shuffled indices
  private communityDeck: number[];

  constructor(
    addresses: [string, string, string, string],
    diceSeed: string,
  ) {
    this.dice = new DiceDeriver(diceSeed);

    // Shuffle decks deterministically from seed
    this.chanceDeck = this.shuffleDeck(CHANCE_CARDS.length, diceSeed + "01");
    this.communityDeck = this.shuffleDeck(COMMUNITY_CARDS.length, diceSeed + "02");

    // Initialize player states
    const players: PlayerState[] = addresses.map((addr, i) => ({
      index: i,
      address: addr,
      alive: true,
      inJail: false,
      jailTurns: 0,
      position: 0,
      cash: STARTING_CASH,
      doublesCount: 0,
    }));

    // Initialize property states
    const properties: PropertyState[] = [];
    for (let i = 0; i < PROPERTY_TILES.length; i++) {
      properties.push({ index: i, owner: -1, mortgaged: false });
    }

    // Initialize auction
    const auction: AuctionState = {
      active: false,
      propertyIndex: -1,
      highBidder: -1,
      highBid: 0,
      currentBidder: -1,
      playersActed: new Set(),
    };

    this.state = {
      status: GameStatus.STARTED,
      phase: Phase.TURN_START,
      players,
      properties,
      auction,
      currentPlayerIndex: 0,
      currentTurn: 0,
      currentRound: 0,
      aliveCount: NUM_PLAYERS,
      lastDice: null,
      winner: -1,
      freedFromJailThisTurn: false,
    };

    this.emit({ type: "gameStarted" });
    this.emit({ type: "turnStarted", player: 0, turn: 0 });
  }

  // ========== PUBLIC API ==========

  /**
   * Get the list of legal actions for the current player.
   */
  getLegalActions(): GameAction[] {
    if (this.state.status !== GameStatus.STARTED) return [];

    const player = this.currentPlayer();
    if (!player.alive) return [];

    const actions: GameAction[] = [];

    // If auction is active, only auction actions for the current bidder
    if (this.state.auction.active) {
      const bidder = this.state.players[this.state.auction.currentBidder];
      if (bidder && bidder.alive && !this.state.auction.playersActed.has(bidder.index)) {
        const minBid = this.state.auction.highBid + 1;
        if (bidder.cash >= minBid) {
          actions.push({ type: "bid", amount: minBid });
        }
        actions.push({ type: "passBid" });
      }
      return actions;
    }

    switch (this.state.phase) {
      case Phase.TURN_START:
        if (player.inJail) {
          actions.push({ type: "payJailFee" });
          actions.push({ type: "rollDice" }); // try to roll doubles
        } else {
          actions.push({ type: "rollDice" });
        }
        break;

      case Phase.BUY_DECISION: {
        const tile = TILES[player.position];
        const prop = tile.propertyIndex >= 0 ? this.state.properties[tile.propertyIndex] : null;
        if (prop && prop.owner === -1 && player.cash >= tile.price) {
          actions.push({ type: "buyProperty" });
        }
        actions.push({ type: "declineBuy" });
        break;
      }

      case Phase.POST_TURN:
        // Allow mortgage/unmortgage before ending turn
        for (const prop of this.state.properties) {
          if (prop.owner === player.index && !prop.mortgaged) {
            actions.push({ type: "mortgageProperty", propertyIndex: prop.index });
          }
          if (prop.owner === player.index && prop.mortgaged) {
            const tile = PROPERTY_TILES[prop.index];
            const cost = Math.floor(tile.mortgageValue * 1.1);
            if (player.cash >= cost) {
              actions.push({ type: "unmortgageProperty", propertyIndex: prop.index });
            }
          }
        }
        actions.push({ type: "endTurn" });
        break;
    }

    return actions;
  }

  /**
   * Execute a game action. Returns array of events generated.
   */
  executeAction(action: GameAction): GameEvent[] {
    const prevEvents = this.events.length;
    const player = this.currentPlayer();

    if (this.state.status !== GameStatus.STARTED) {
      throw new Error("Game not started");
    }
    if (!player.alive) {
      throw new Error("Current player is not alive");
    }

    switch (action.type) {
      case "rollDice":
        this.handleRollDice(player);
        break;
      case "payJailFee":
        this.handlePayJailFee(player);
        break;
      case "buyProperty":
        this.handleBuyProperty(player);
        break;
      case "declineBuy":
        this.handleDeclineBuy(player);
        break;
      case "bid":
        this.handleBid(player, action.amount);
        break;
      case "passBid":
        this.handlePassBid(player);
        break;
      case "endTurn":
        this.handleEndTurn(player);
        break;
      case "mortgageProperty":
        this.handleMortgage(player, action.propertyIndex);
        break;
      case "unmortgageProperty":
        this.handleUnmortgage(player, action.propertyIndex);
        break;
      default:
        throw new Error(`Unknown action: ${(action as any).type}`);
    }

    return this.events.slice(prevEvents);
  }

  /**
   * Return a snapshot of the game state suitable for sending to agents.
   */
  getSnapshot(): GameSnapshot {
    return {
      status: this.state.status,
      phase: this.state.phase,
      turn: this.state.currentTurn,
      round: this.state.currentRound,
      currentPlayerIndex: this.state.currentPlayerIndex,
      aliveCount: this.state.aliveCount,
      players: this.state.players.map(p => ({
        index: p.index,
        address: p.address,
        cash: p.cash,
        position: p.position,
        tileName: TILES[p.position].name,
        inJail: p.inJail,
        jailTurns: p.jailTurns,
        alive: p.alive,
      })),
      properties: this.state.properties.map(p => ({
        index: p.index,
        tileName: PROPERTY_TILES[p.index].name,
        ownerIndex: p.owner,
        mortgaged: p.mortgaged,
      })),
      lastDice: this.state.lastDice,
      auction: this.state.auction.active ? {
        active: true,
        propertyIndex: this.state.auction.propertyIndex,
        highBidder: this.state.auction.highBidder,
        highBid: this.state.auction.highBid,
      } : null,
      winner: this.state.winner,
    };
  }

  /**
   * Auto-play: pick a reasonable action for timeout / AFK agents.
   * Buys properties if affordable, bids in auctions, rolls dice, etc.
   */
  autoPlay(): GameEvent[] {
    const actions = this.getLegalActions();
    if (actions.length === 0) return [];

    // In auction: bid if we can afford it, otherwise pass
    if (this.state.auction.active) {
      const bidAction = actions.find(a => a.type === "bid");
      const bidder = this.state.players[this.state.auction.currentBidder];
      // Bid if property price is less than half our cash
      if (bidAction && bidder) {
        const tile = PROPERTY_TILES[this.state.auction.propertyIndex];
        if (tile && bidder.cash > tile.price * 0.5) {
          return this.executeAction(bidAction);
        }
      }
      const passAction = actions.find(a => a.type === "passBid");
      if (passAction) return this.executeAction(passAction);
    }

    // Buy property if we can afford it and it costs < 60% of our cash
    const buyAction = actions.find(a => a.type === "buyProperty");
    if (buyAction) {
      const player = this.currentPlayer();
      const tile = TILES[player.position];
      if (player.cash >= tile.price && tile.price < player.cash * 0.6) {
        return this.executeAction(buyAction);
      }
      // Decline if too expensive relative to cash
      const declineAction = actions.find(a => a.type === "declineBuy");
      if (declineAction) return this.executeAction(declineAction);
    }

    // Priority-based for other actions
    const priority = ["endTurn", "rollDice", "declineBuy", "payJailFee"];
    for (const p of priority) {
      const a = actions.find(a => a.type === p);
      if (a) return this.executeAction(a);
    }

    // Fallback: first action
    return this.executeAction(actions[0]);
  }

  // ========== SERIALIZATION ==========

  /**
   * Pack entire state into a compact form for on-chain checkpoint.
   * Returns { playersPacked, propertiesPacked, metaPacked } as bigints.
   */
  packForCheckpoint(): { playersPacked: bigint; propertiesPacked: bigint; metaPacked: bigint } {
    // playersPacked: 4 players * 64 bits each = 256 bits
    // Each player: position(6) + cash(20) + alive(1) + inJail(1) + jailTurns(2) = 30 bits (pad to 64)
    let playersPacked = 0n;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const p = this.state.players[i];
      let slot = 0n;
      slot |= BigInt(p.position) & 0x3Fn;            // 6 bits
      slot |= (BigInt(p.cash) & 0xFFFFFn) << 6n;     // 20 bits (max ~1M)
      slot |= (p.alive ? 1n : 0n) << 26n;            // 1 bit
      slot |= (p.inJail ? 1n : 0n) << 27n;           // 1 bit
      slot |= (BigInt(p.jailTurns) & 0x3n) << 28n;   // 2 bits
      playersPacked |= slot << (BigInt(i) * 64n);
    }

    // propertiesPacked: 28 properties * 4 bits each = 112 bits
    // Each property: owner(3, -1=7 means unowned) + mortgaged(1) = 4 bits
    let propertiesPacked = 0n;
    for (let i = 0; i < this.state.properties.length; i++) {
      const prop = this.state.properties[i];
      let slot = 0n;
      const ownerBits = prop.owner === -1 ? 7 : prop.owner; // 3 bits
      slot |= BigInt(ownerBits) & 0x7n;
      slot |= (prop.mortgaged ? 1n : 0n) << 3n;
      propertiesPacked |= slot << (BigInt(i) * 4n);
    }

    // metaPacked: currentPlayerIndex(2) + currentTurn(16) + currentRound(16) + aliveCount(3) + status(3) + phase(3)
    let metaPacked = 0n;
    metaPacked |= BigInt(this.state.currentPlayerIndex) & 0x3n;
    metaPacked |= (BigInt(this.state.currentTurn) & 0xFFFFn) << 2n;
    metaPacked |= (BigInt(this.state.currentRound) & 0xFFFFn) << 18n;
    metaPacked |= (BigInt(this.state.aliveCount) & 0x7n) << 34n;

    return { playersPacked, propertiesPacked, metaPacked };
  }

  /**
   * Restore state from a checkpoint. Used for crash recovery.
   */
  static fromCheckpoint(
    addresses: [string, string, string, string],
    diceSeed: string,
    playersPacked: bigint,
    propertiesPacked: bigint,
    metaPacked: bigint,
  ): MonopolyEngine {
    const engine = new MonopolyEngine(addresses, diceSeed);

    // Unpack players
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const slot = (playersPacked >> (BigInt(i) * 64n)) & 0xFFFFFFFFFFFFFFFFn;
      engine.state.players[i].position = Number(slot & 0x3Fn);
      engine.state.players[i].cash = Number((slot >> 6n) & 0xFFFFFn);
      engine.state.players[i].alive = ((slot >> 26n) & 1n) === 1n;
      engine.state.players[i].inJail = ((slot >> 27n) & 1n) === 1n;
      engine.state.players[i].jailTurns = Number((slot >> 28n) & 0x3n);
    }

    // Unpack properties
    for (let i = 0; i < engine.state.properties.length; i++) {
      const slot = (propertiesPacked >> (BigInt(i) * 4n)) & 0xFn;
      const ownerBits = Number(slot & 0x7n);
      engine.state.properties[i].owner = ownerBits === 7 ? -1 : ownerBits;
      engine.state.properties[i].mortgaged = ((slot >> 3n) & 1n) === 1n;
    }

    // Unpack meta
    engine.state.currentPlayerIndex = Number(metaPacked & 0x3n);
    engine.state.currentTurn = Number((metaPacked >> 2n) & 0xFFFFn);
    engine.state.currentRound = Number((metaPacked >> 18n) & 0xFFFFn);
    engine.state.aliveCount = Number((metaPacked >> 34n) & 0x7n);
    engine.state.phase = Phase.TURN_START;
    engine.state.status = engine.state.aliveCount <= 1 ? GameStatus.ENDED : GameStatus.STARTED;

    return engine;
  }

  // ========== PRIVATE: ACTION HANDLERS ==========

  private handleRollDice(player: PlayerState): void {
    if (this.state.phase !== Phase.TURN_START) {
      throw new Error("Cannot roll dice in this phase");
    }

    const roll = this.dice.roll(this.state.currentTurn);
    this.state.lastDice = roll;
    this.emit({ type: "diceRolled", player: player.index, d1: roll.d1, d2: roll.d2, isDoubles: roll.isDoubles });

    // Jail logic
    if (player.inJail) {
      if (roll.isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        player.doublesCount = 0;
        this.state.freedFromJailThisTurn = true;
        this.emit({ type: "freedFromJail", player: player.index, method: "doubles" });
        this.movePlayer(player, roll.sum);
      } else {
        player.jailTurns++;
        if (player.jailTurns >= MAX_JAIL_TURNS) {
          // Forced out after 3 failed attempts
          this.payAmount(player, JAIL_FEE, "jail fee (forced)");
          player.inJail = false;
          player.jailTurns = 0;
          this.state.freedFromJailThisTurn = true;
          this.emit({ type: "freedFromJail", player: player.index, method: "maxTurns" });
          if (player.alive) {
            this.movePlayer(player, roll.sum);
          }
        } else {
          // Stay in jail, end turn
          this.state.phase = Phase.POST_TURN;
        }
      }
      return;
    }

    // Normal movement - check for 3 doubles = jail
    if (roll.isDoubles) {
      player.doublesCount++;
      if (player.doublesCount >= MAX_DOUBLES_BEFORE_JAIL) {
        this.sendToJail(player);
        this.state.phase = Phase.POST_TURN;
        return;
      }
    }

    this.movePlayer(player, roll.sum);
  }

  private handlePayJailFee(player: PlayerState): void {
    if (!player.inJail || this.state.phase !== Phase.TURN_START) {
      throw new Error("Cannot pay jail fee");
    }
    this.payAmount(player, JAIL_FEE, "jail fee (voluntary)");
    if (!player.alive) return;
    player.inJail = false;
    player.jailTurns = 0;
    this.state.freedFromJailThisTurn = true;
    this.emit({ type: "freedFromJail", player: player.index, method: "fee" });

    // Now roll and move
    const roll = this.dice.roll(this.state.currentTurn);
    this.state.lastDice = roll;
    this.emit({ type: "diceRolled", player: player.index, d1: roll.d1, d2: roll.d2, isDoubles: roll.isDoubles });
    this.movePlayer(player, roll.sum);
  }

  private handleBuyProperty(player: PlayerState): void {
    if (this.state.phase !== Phase.BUY_DECISION) {
      throw new Error("Cannot buy property in this phase");
    }
    const tile = TILES[player.position];
    const prop = this.state.properties[tile.propertyIndex];
    if (prop.owner !== -1) throw new Error("Property already owned");
    if (player.cash < tile.price) throw new Error("Not enough cash");

    player.cash -= tile.price;
    prop.owner = player.index;
    this.emit({ type: "propertyBought", player: player.index, propertyIndex: prop.index, price: tile.price });
    this.state.phase = Phase.POST_TURN;
  }

  private handleDeclineBuy(player: PlayerState): void {
    if (this.state.phase !== Phase.BUY_DECISION) {
      throw new Error("Cannot decline buy in this phase");
    }
    const tile = TILES[player.position];
    this.emit({ type: "propertyDeclined", player: player.index, propertyIndex: tile.propertyIndex });
    this.startAuction(tile.propertyIndex);
  }

  private handleBid(_player: PlayerState, amount: number): void {
    if (!this.state.auction.active) throw new Error("No active auction");

    const auction = this.state.auction;
    const bidder = this.state.players[auction.currentBidder];
    if (amount <= auction.highBid) throw new Error("Bid too low");
    if (amount > bidder.cash) throw new Error("Not enough cash for bid");

    auction.highBid = amount;
    auction.highBidder = bidder.index;
    auction.playersActed.add(bidder.index);
    this.emit({ type: "bidPlaced", player: bidder.index, propertyIndex: auction.propertyIndex, amount });

    this.advanceAuctionBidder();
  }

  private handlePassBid(_player: PlayerState): void {
    if (!this.state.auction.active) throw new Error("No active auction");

    const auction = this.state.auction;
    auction.playersActed.add(auction.currentBidder);
    this.advanceAuctionBidder();
  }

  private handleEndTurn(player: PlayerState): void {
    if (this.state.phase !== Phase.POST_TURN) {
      throw new Error("Cannot end turn in this phase");
    }

    this.emit({ type: "turnEnded", player: player.index });

    // Check for doubles (extra turn) - but not if freed from jail this turn
    if (this.state.lastDice?.isDoubles && !this.state.freedFromJailThisTurn && player.alive && !player.inJail) {
      player.doublesCount = player.doublesCount; // keep count
      this.state.phase = Phase.TURN_START;
      this.state.currentTurn++;
      this.emit({ type: "turnStarted", player: player.index, turn: this.state.currentTurn });
      return;
    }

    player.doublesCount = 0;
    this.advanceToNextPlayer();
  }

  private handleMortgage(player: PlayerState, propertyIndex: number): void {
    if (this.state.phase !== Phase.POST_TURN) {
      throw new Error("Can only mortgage during post-turn");
    }
    const prop = this.state.properties[propertyIndex];
    if (prop.owner !== player.index) throw new Error("Not your property");
    if (prop.mortgaged) throw new Error("Already mortgaged");

    const tile = PROPERTY_TILES[propertyIndex];
    prop.mortgaged = true;
    player.cash += tile.mortgageValue;
    this.emit({ type: "propertyMortgaged", player: player.index, propertyIndex, value: tile.mortgageValue });
  }

  private handleUnmortgage(player: PlayerState, propertyIndex: number): void {
    if (this.state.phase !== Phase.POST_TURN) {
      throw new Error("Can only unmortgage during post-turn");
    }
    const prop = this.state.properties[propertyIndex];
    if (prop.owner !== player.index) throw new Error("Not your property");
    if (!prop.mortgaged) throw new Error("Not mortgaged");

    const tile = PROPERTY_TILES[propertyIndex];
    const cost = Math.floor(tile.mortgageValue * 1.1);
    if (player.cash < cost) throw new Error("Not enough cash to unmortgage");

    prop.mortgaged = false;
    player.cash -= cost;
    this.emit({ type: "propertyUnmortgaged", player: player.index, propertyIndex, cost });
  }

  // ========== PRIVATE: GAME LOGIC ==========

  private movePlayer(player: PlayerState, spaces: number): void {
    const oldPos = player.position;
    const newPos = (oldPos + spaces) % BOARD_SIZE;
    const passedGo = newPos < oldPos && spaces > 0;

    player.position = newPos;
    this.emit({ type: "playerMoved", player: player.index, from: oldPos, to: newPos, passedGo });

    if (passedGo) {
      player.cash += GO_SALARY;
      this.emit({ type: "passedGo", player: player.index, amount: GO_SALARY });
    }

    this.resolvePosition(player);
  }

  private resolvePosition(player: PlayerState): void {
    const tile = TILES[player.position];

    switch (tile.type) {
      case TileType.GO:
        // Landing exactly on Go: already collected salary if passed, nothing extra
        this.state.phase = Phase.POST_TURN;
        break;

      case TileType.PROPERTY:
      case TileType.RAILROAD:
      case TileType.UTILITY:
        this.resolvePropertyLanding(player, tile);
        break;

      case TileType.TAX:
        this.payAmount(player, getTaxAmount(player.position), "tax");
        if (player.alive) {
          this.emit({ type: "taxPaid", player: player.index, amount: getTaxAmount(player.position) });
          this.state.phase = Phase.POST_TURN;
        }
        break;

      case TileType.CHANCE:
        this.drawCard(player, "chance");
        break;

      case TileType.COMMUNITY:
        this.drawCard(player, "community");
        break;

      case TileType.GO_TO_JAIL:
        this.sendToJail(player);
        this.state.phase = Phase.POST_TURN;
        break;

      case TileType.JAIL:
      case TileType.FREE_PARKING:
        this.state.phase = Phase.POST_TURN;
        break;
    }
  }

  private resolvePropertyLanding(player: PlayerState, tile: TileDef): void {
    const prop = this.state.properties[tile.propertyIndex];

    if (prop.owner === -1) {
      // Unowned: buy or auction
      this.state.phase = Phase.BUY_DECISION;
    } else if (prop.owner === player.index) {
      // Own property: nothing
      this.state.phase = Phase.POST_TURN;
    } else if (prop.mortgaged) {
      // Mortgaged: no rent
      this.state.phase = Phase.POST_TURN;
    } else {
      // Pay rent
      const rent = this.calculateRent(tile, prop);
      const owner = this.state.players[prop.owner];
      this.payRent(player, owner, rent);
      if (player.alive) {
        this.state.phase = Phase.POST_TURN;
      }
    }
  }

  private calculateRent(tile: TileDef, prop: PropertyState): number {
    if (tile.type === TileType.RAILROAD) {
      const rrOwned = this.countGroupOwned(prop.owner, 9);
      return getRailroadRent(rrOwned);
    }
    if (tile.type === TileType.UTILITY) {
      const utilOwned = this.countGroupOwned(prop.owner, 10);
      const diceSum = this.state.lastDice?.sum || 7;
      return getUtilityRent(utilOwned, diceSum);
    }
    // Color property: base rent * 2 if monopoly
    let rent = tile.baseRent;
    if (this.hasMonopoly(prop.owner, tile.group)) {
      rent *= 2;
    }
    return rent;
  }

  private countGroupOwned(ownerIndex: number, group: number): number {
    let count = 0;
    for (const prop of this.state.properties) {
      const pt = PROPERTY_TILES[prop.index];
      if (pt.group === group && prop.owner === ownerIndex && !prop.mortgaged) {
        count++;
      }
    }
    return count;
  }

  private hasMonopoly(ownerIndex: number, group: number): boolean {
    const totalInGroup = GROUP_SIZES[group] || 0;
    return this.countGroupOwned(ownerIndex, group) === totalInGroup;
  }

  private payRent(from: PlayerState, to: PlayerState, amount: number): void {
    if (amount <= 0) return;

    if (from.cash >= amount) {
      from.cash -= amount;
      to.cash += amount;
      this.emit({ type: "rentPaid", from: from.index, to: to.index, amount });
    } else {
      // Try auto-mortgage to cover
      this.autoMortgage(from, amount);
      if (from.cash >= amount) {
        from.cash -= amount;
        to.cash += amount;
        this.emit({ type: "rentPaid", from: from.index, to: to.index, amount });
      } else {
        // Bankrupt: pay what we can, then die
        const paid = from.cash;
        to.cash += paid;
        from.cash = 0;
        if (paid > 0) {
          this.emit({ type: "rentPaid", from: from.index, to: to.index, amount: paid });
        }
        this.declareBankruptcy(from, to.index);
      }
    }
  }

  private payAmount(player: PlayerState, amount: number, reason: string): void {
    if (amount <= 0) return;

    if (player.cash >= amount) {
      player.cash -= amount;
      this.emit({ type: "cashChange", player: player.index, amount: -amount, reason });
    } else {
      this.autoMortgage(player, amount);
      if (player.cash >= amount) {
        player.cash -= amount;
        this.emit({ type: "cashChange", player: player.index, amount: -amount, reason });
      } else {
        const lost = player.cash;
        player.cash = 0;
        this.emit({ type: "cashChange", player: player.index, amount: -lost, reason });
        this.declareBankruptcy(player, -1); // bank is creditor
      }
    }
  }

  private autoMortgage(player: PlayerState, needed: number): void {
    // Sort properties by mortgage value ascending (mortgage cheapest first)
    const ownedProps = this.state.properties
      .filter(p => p.owner === player.index && !p.mortgaged)
      .sort((a, b) => PROPERTY_TILES[a.index].mortgageValue - PROPERTY_TILES[b.index].mortgageValue);

    for (const prop of ownedProps) {
      if (player.cash >= needed) break;
      const tile = PROPERTY_TILES[prop.index];
      prop.mortgaged = true;
      player.cash += tile.mortgageValue;
      this.emit({ type: "autoMortgage", player: player.index, propertyIndex: prop.index, value: tile.mortgageValue });
    }
  }

  private declareBankruptcy(player: PlayerState, creditor: number): void {
    if (!player.alive) return; // guard against double bankruptcy
    player.alive = false;
    this.state.aliveCount--;
    this.emit({ type: "playerBankrupt", player: player.index, creditor });

    // Transfer properties to creditor (or unown if bank)
    for (const prop of this.state.properties) {
      if (prop.owner === player.index) {
        prop.owner = creditor >= 0 ? creditor : -1;
        prop.mortgaged = false; // unmortgage on transfer
      }
    }

    // Check win condition
    if (this.state.aliveCount <= 1) {
      const winner = this.state.players.find(p => p.alive);
      if (winner) {
        this.state.winner = winner.index;
        this.state.status = GameStatus.ENDED;
        this.emit({ type: "gameEnded", winner: winner.index });
      }
    } else {
      this.state.phase = Phase.POST_TURN;
    }
  }

  private drawCard(player: PlayerState, deck: "chance" | "community"): void {
    const cards = deck === "chance" ? CHANCE_CARDS : COMMUNITY_CARDS;
    const indices = deck === "chance" ? this.chanceDeck : this.communityDeck;
    const idxRef = deck === "chance" ? "chanceIndex" : "communityIndex";

    const cardIdx = indices[this[idxRef] % indices.length];
    this[idxRef]++;
    const card = cards[cardIdx];

    this.emit({ type: "cardDrawn", player: player.index, deck, description: card.description });

    switch (card.effect) {
      case CardEffect.GAIN_MONEY:
        player.cash += card.amount;
        this.emit({ type: "cashChange", player: player.index, amount: card.amount, reason: card.description });
        this.state.phase = Phase.POST_TURN;
        break;

      case CardEffect.PAY_MONEY:
        this.payAmount(player, Math.abs(card.amount), card.description);
        if (player.alive) this.state.phase = Phase.POST_TURN;
        break;

      case CardEffect.MOVE_TO: {
        const oldPos = player.position;
        const newPos = card.moveTo;
        const passedGo = newPos < oldPos;
        player.position = newPos;
        this.emit({ type: "playerMoved", player: player.index, from: oldPos, to: newPos, passedGo });
        if (passedGo) {
          player.cash += GO_SALARY;
          this.emit({ type: "passedGo", player: player.index, amount: GO_SALARY });
        }
        this.resolvePosition(player);
        break;
      }

      case CardEffect.GO_TO_JAIL:
        this.sendToJail(player);
        this.state.phase = Phase.POST_TURN;
        break;

      case CardEffect.ADVANCE_TO_GO: {
        const oldPos = player.position;
        player.position = 0;
        player.cash += GO_SALARY;
        this.emit({ type: "playerMoved", player: player.index, from: oldPos, to: 0, passedGo: true });
        this.emit({ type: "passedGo", player: player.index, amount: GO_SALARY });
        this.state.phase = Phase.POST_TURN;
        break;
      }

      case CardEffect.PAY_EACH_PLAYER: {
        const perPlayer = Math.abs(card.amount);
        const alivePlayers = this.state.players.filter(p => p.alive && p.index !== player.index);
        const total = perPlayer * alivePlayers.length;
        this.payAmount(player, total, card.description);
        if (player.alive) {
          for (const p of alivePlayers) {
            p.cash += perPlayer;
          }
        }
        if (player.alive) this.state.phase = Phase.POST_TURN;
        break;
      }

      case CardEffect.COLLECT_FROM_EACH: {
        const perPlayer = card.amount;
        const alivePlayers = this.state.players.filter(p => p.alive && p.index !== player.index);
        let totalCollected = 0;
        for (const p of alivePlayers) {
          const taken = Math.min(p.cash, perPlayer);
          p.cash -= taken;
          player.cash += taken;
          totalCollected += taken;
        }
        this.emit({ type: "cashChange", player: player.index, amount: totalCollected, reason: card.description });
        this.state.phase = Phase.POST_TURN;
        break;
      }
    }
  }

  private sendToJail(player: PlayerState): void {
    player.position = JAIL_POSITION;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0;
    this.emit({ type: "sentToJail", player: player.index });
  }

  // ========== PRIVATE: AUCTION ==========

  private startAuction(propertyIndex: number): void {
    // First bidder is the next alive player after the current player
    const firstBidder = this.nextAliveBidder(this.state.currentPlayerIndex);
    this.state.auction = {
      active: true,
      propertyIndex,
      highBidder: -1,
      highBid: 0,
      currentBidder: firstBidder,
      playersActed: new Set(),
    };
    this.emit({ type: "auctionStarted", propertyIndex });
  }

  private advanceAuctionBidder(): void {
    const auction = this.state.auction;
    const alivePlayers = this.state.players.filter(p => p.alive);
    const allActed = alivePlayers.every(p => auction.playersActed.has(p.index));

    if (allActed) {
      this.resolveAuction();
      return;
    }

    // Move to next alive player who hasn't acted
    let next = (auction.currentBidder + 1) % NUM_PLAYERS;
    let safety = 0;
    while (safety < NUM_PLAYERS) {
      if (this.state.players[next].alive && !auction.playersActed.has(next)) {
        auction.currentBidder = next;
        return;
      }
      next = (next + 1) % NUM_PLAYERS;
      safety++;
    }

    // Shouldn't reach here, but resolve if it does
    this.resolveAuction();
  }

  private resolveAuction(): void {
    const auction = this.state.auction;

    if (auction.highBidder === -1) {
      auction.active = false;
      this.emit({ type: "auctionEndedNoBids", propertyIndex: auction.propertyIndex });
      this.state.phase = Phase.POST_TURN;
      return;
    }

    const winner = this.state.players[auction.highBidder];
    const prop = this.state.properties[auction.propertyIndex];
    winner.cash -= auction.highBid;
    prop.owner = winner.index;
    this.emit({ type: "auctionEnded", winner: winner.index, propertyIndex: auction.propertyIndex, amount: auction.highBid });

    auction.active = false;
    this.state.phase = Phase.POST_TURN;
  }

  private nextAliveBidder(after: number): number {
    let next = (after + 1) % NUM_PLAYERS;
    let safety = 0;
    while (!this.state.players[next].alive && safety < NUM_PLAYERS) {
      next = (next + 1) % NUM_PLAYERS;
      safety++;
    }
    return next;
  }

  // ========== PRIVATE: TURN MANAGEMENT ==========

  private advanceToNextPlayer(): void {
    if (this.state.status === GameStatus.ENDED) return;

    let next = (this.state.currentPlayerIndex + 1) % NUM_PLAYERS;

    // Track if we've completed a round
    if (next <= this.state.currentPlayerIndex) {
      this.state.currentRound++;
    }

    // Max rounds check: richest alive player wins
    if (this.state.currentRound >= MAX_ROUNDS) {
      this.endByMaxRounds();
      return;
    }

    // Skip dead players
    let attempts = 0;
    while (!this.state.players[next].alive && attempts < NUM_PLAYERS) {
      next = (next + 1) % NUM_PLAYERS;
      attempts++;
    }

    if (attempts >= NUM_PLAYERS) {
      return;
    }

    this.state.currentPlayerIndex = next;
    this.state.currentTurn++;
    this.state.phase = Phase.TURN_START;
    this.state.lastDice = null;
    this.state.freedFromJailThisTurn = false;

    this.emit({ type: "turnStarted", player: next, turn: this.state.currentTurn });
  }

  private endByMaxRounds(): void {
    // Calculate net worth: cash + unmortgaged property values + mortgaged value / 2
    let bestPlayer = -1;
    let bestWorth = -1;
    for (const p of this.state.players) {
      if (!p.alive) continue;
      let worth = p.cash;
      for (const prop of this.state.properties) {
        if (prop.owner === p.index) {
          const tile = PROPERTY_TILES[prop.index];
          worth += prop.mortgaged ? Math.floor(tile.mortgageValue / 2) : tile.price;
        }
      }
      if (worth > bestWorth) {
        bestWorth = worth;
        bestPlayer = p.index;
      }
    }
    this.state.winner = bestPlayer;
    this.state.status = GameStatus.ENDED;
    this.emit({ type: "gameEnded", winner: bestPlayer });
  }

  // ========== PRIVATE: HELPERS ==========

  private currentPlayer(): PlayerState {
    return this.state.players[this.state.currentPlayerIndex];
  }

  private emit(event: GameEvent): void {
    this.events.push(event);
  }

  private shuffleDeck(size: number, seedStr: string): number[] {
    // Simple deterministic shuffle using the seed
    const indices = Array.from({ length: size }, (_, i) => i);
    // Use a simple hash-based shuffle
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
    }
    for (let i = indices.length - 1; i > 0; i--) {
      hash = ((hash << 5) - hash + i) | 0;
      const j = Math.abs(hash) % (i + 1);
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }
}
