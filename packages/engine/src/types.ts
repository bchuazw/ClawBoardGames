// ========== GAME TYPES ==========

export const NUM_PLAYERS = 4;
export const BOARD_SIZE = 40;
export const NUM_PROPERTIES = 28;
export const STARTING_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_POSITION = 10;
export const GO_TO_JAIL_POSITION = 30;
export const JAIL_FEE = 50;
export const INCOME_TAX = 200;
export const LUXURY_TAX = 100;
export const MAX_JAIL_TURNS = 3;
export const MAX_DOUBLES_BEFORE_JAIL = 3;
export const MAX_ROUNDS = 200; // Game ends after 200 rounds, richest player wins

// ========== ENUMS ==========

export enum TileType {
  GO = "GO",
  PROPERTY = "PROPERTY",
  RAILROAD = "RAILROAD",
  UTILITY = "UTILITY",
  TAX = "TAX",
  CHANCE = "CHANCE",
  COMMUNITY = "COMMUNITY",
  JAIL = "JAIL",
  GO_TO_JAIL = "GO_TO_JAIL",
  FREE_PARKING = "FREE_PARKING",
}

export enum CardEffect {
  GAIN_MONEY = "GAIN_MONEY",
  PAY_MONEY = "PAY_MONEY",
  MOVE_TO = "MOVE_TO",
  GO_TO_JAIL = "GO_TO_JAIL",
  ADVANCE_TO_GO = "ADVANCE_TO_GO",
  PAY_EACH_PLAYER = "PAY_EACH_PLAYER",
  COLLECT_FROM_EACH = "COLLECT_FROM_EACH",
}

export enum GameStatus {
  WAITING = "WAITING",
  STARTED = "STARTED",
  ENDED = "ENDED",
}

export enum Phase {
  TURN_START = "TURN_START",
  MOVE_RESOLVED = "MOVE_RESOLVED",
  BUY_DECISION = "BUY_DECISION",
  AUCTION = "AUCTION",
  POST_TURN = "POST_TURN",
}

// ========== STRUCTS ==========

export interface PlayerState {
  index: number;
  address: string;
  alive: boolean;
  inJail: boolean;
  jailTurns: number;
  position: number; // 0..39
  cash: number;
  doublesCount: number;
}

export interface PropertyState {
  index: number; // 0..27
  owner: number; // player index, or -1 if unowned
  mortgaged: boolean;
  houses: number; // 0–4 (color properties only; always 0 for railroads/utilities)
}

export interface AuctionState {
  active: boolean;
  propertyIndex: number;
  highBidder: number; // player index, or -1
  highBid: number;
  currentBidder: number; // whose turn it is to bid (-1 if not started)
  playersActed: Set<number>; // players who have bid/passed
}

export interface DiceRoll {
  d1: number;
  d2: number;
  sum: number;
  isDoubles: boolean;
}

export interface CardData {
  effect: CardEffect;
  amount: number; // positive = gain, negative = pay
  moveTo: number; // tile position for MOVE_TO
  description: string;
}

export interface GameState {
  status: GameStatus;
  phase: Phase;
  players: PlayerState[];
  properties: PropertyState[];
  auction: AuctionState;
  currentPlayerIndex: number;
  currentTurn: number;
  currentRound: number;
  aliveCount: number;
  lastDice: DiceRoll | null;
  winner: number; // player index, or -1
  freedFromJailThisTurn: boolean;
}

// ========== ACTIONS ==========

export type GameAction =
  | { type: "rollDice" }
  | { type: "payJailFee" }
  | { type: "buyProperty" }
  | { type: "declineBuy" }
  | { type: "bid"; amount: number }
  | { type: "passBid" }
  | { type: "endTurn" }
  | { type: "mortgageProperty"; propertyIndex: number }
  | { type: "unmortgageProperty"; propertyIndex: number }
  | { type: "buildHouse"; propertyIndex: number }
  | { type: "sellHouse"; propertyIndex: number };

// ========== EVENTS ==========

export type GameEvent =
  | { type: "gameStarted" }
  | { type: "turnStarted"; player: number; turn: number }
  | { type: "diceRolled"; player: number; d1: number; d2: number; isDoubles: boolean }
  | { type: "playerMoved"; player: number; from: number; to: number; passedGo: boolean }
  | { type: "passedGo"; player: number; amount: number }
  | { type: "landedOnGo"; player: number; amount: number }
  | { type: "propertyBought"; player: number; propertyIndex: number; price: number; tileName: string }
  | { type: "propertyDeclined"; player: number; propertyIndex: number; tileName: string }
  | { type: "rentPaid"; from: number; to: number; amount: number }
  | { type: "taxPaid"; player: number; amount: number }
  | { type: "cardDrawn"; player: number; deck: "chance" | "community"; description: string }
  | { type: "cashChange"; player: number; amount: number; reason: string }
  | { type: "sentToJail"; player: number }
  | { type: "freedFromJail"; player: number; method: "doubles" | "fee" | "maxTurns" }
  | { type: "stayedInJail"; player: number }
  | { type: "auctionStarted"; propertyIndex: number; tileName: string }
  | { type: "bidPlaced"; player: number; propertyIndex: number; amount: number }
  | { type: "auctionEnded"; winner: number; propertyIndex: number; amount: number; tileName: string; highBid?: number }
  | { type: "auctionEndedNoBids"; propertyIndex: number; tileName: string }
  | { type: "propertyMortgaged"; player: number; propertyIndex: number; value: number }
  | { type: "propertyUnmortgaged"; player: number; propertyIndex: number; cost: number }
  | { type: "autoMortgage"; player: number; propertyIndex: number; value: number }
  | { type: "playerBankrupt"; player: number; creditor: number }
  | { type: "houseBuilt"; player: number; propertyIndex: number; newCount: number; tileName: string }
  | { type: "houseSold"; player: number; propertyIndex: number; newCount: number; tileName: string }
  | { type: "turnEnded"; player: number }
  | { type: "gameEnded"; winner: number };

export interface GameSnapshot {
  status: string;
  phase: string;
  turn: number;
  round: number;
  currentPlayerIndex: number;
  aliveCount: number;
  players: Array<{
    index: number;
    address: string;
    cash: number;
    position: number;
    tileName: string;
    inJail: boolean;
    jailTurns: number;
    alive: boolean;
  }>;
  properties: Array<{
    index: number;
    tileName: string;
    ownerIndex: number;
    mortgaged: boolean;
    houses: number;
  }>;
  lastDice: DiceRoll | null;
  auction: {
    active: boolean;
    propertyIndex: number;
    highBidder: number;
    highBid: number;
  } | null;
  winner: number;
}
