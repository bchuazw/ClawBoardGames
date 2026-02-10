import { TileType, CardEffect, CardData, NUM_PROPERTIES } from "./types";

// ========== TILE DEFINITIONS ==========

export interface TileDef {
  position: number;
  name: string;
  type: TileType;
  propertyIndex: number; // -1 if not a property
  group: number; // 0 = non-property, 1-8 = color, 9 = railroad, 10 = utility
  price: number;
  baseRent: number;
  mortgageValue: number;
}

// Classic 40-tile Monopoly board
export const TILES: TileDef[] = [
  { position: 0,  name: "Go",                  type: TileType.GO,           propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 1,  name: "Mediterranean Ave",   type: TileType.PROPERTY,     propertyIndex: 0,  group: 1,  price: 60,  baseRent: 2,   mortgageValue: 30 },
  { position: 2,  name: "Community Chest",      type: TileType.COMMUNITY,    propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 3,  name: "Baltic Ave",           type: TileType.PROPERTY,     propertyIndex: 1,  group: 1,  price: 60,  baseRent: 4,   mortgageValue: 30 },
  { position: 4,  name: "Income Tax",           type: TileType.TAX,          propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 5,  name: "Reading Railroad",     type: TileType.RAILROAD,     propertyIndex: 2,  group: 9,  price: 200, baseRent: 25,  mortgageValue: 100 },
  { position: 6,  name: "Oriental Ave",         type: TileType.PROPERTY,     propertyIndex: 3,  group: 2,  price: 100, baseRent: 6,   mortgageValue: 50 },
  { position: 7,  name: "Chance",               type: TileType.CHANCE,       propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 8,  name: "Vermont Ave",          type: TileType.PROPERTY,     propertyIndex: 4,  group: 2,  price: 100, baseRent: 6,   mortgageValue: 50 },
  { position: 9,  name: "Connecticut Ave",      type: TileType.PROPERTY,     propertyIndex: 5,  group: 2,  price: 120, baseRent: 8,   mortgageValue: 60 },
  { position: 10, name: "Jail / Just Visiting", type: TileType.JAIL,         propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 11, name: "St. Charles Place",    type: TileType.PROPERTY,     propertyIndex: 6,  group: 3,  price: 140, baseRent: 10,  mortgageValue: 70 },
  { position: 12, name: "Electric Company",     type: TileType.UTILITY,      propertyIndex: 7,  group: 10, price: 150, baseRent: 4,   mortgageValue: 75 },
  { position: 13, name: "States Ave",           type: TileType.PROPERTY,     propertyIndex: 8,  group: 3,  price: 140, baseRent: 10,  mortgageValue: 70 },
  { position: 14, name: "Virginia Ave",         type: TileType.PROPERTY,     propertyIndex: 9,  group: 3,  price: 160, baseRent: 12,  mortgageValue: 80 },
  { position: 15, name: "Pennsylvania Railroad",type: TileType.RAILROAD,     propertyIndex: 10, group: 9,  price: 200, baseRent: 25,  mortgageValue: 100 },
  { position: 16, name: "St. James Place",      type: TileType.PROPERTY,     propertyIndex: 11, group: 4,  price: 180, baseRent: 14,  mortgageValue: 90 },
  { position: 17, name: "Community Chest",      type: TileType.COMMUNITY,    propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 18, name: "Tennessee Ave",        type: TileType.PROPERTY,     propertyIndex: 12, group: 4,  price: 180, baseRent: 14,  mortgageValue: 90 },
  { position: 19, name: "New York Ave",         type: TileType.PROPERTY,     propertyIndex: 13, group: 4,  price: 200, baseRent: 16,  mortgageValue: 100 },
  { position: 20, name: "Free Parking",         type: TileType.FREE_PARKING, propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 21, name: "Kentucky Ave",         type: TileType.PROPERTY,     propertyIndex: 14, group: 5,  price: 220, baseRent: 18,  mortgageValue: 110 },
  { position: 22, name: "Chance",               type: TileType.CHANCE,       propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 23, name: "Indiana Ave",          type: TileType.PROPERTY,     propertyIndex: 15, group: 5,  price: 220, baseRent: 18,  mortgageValue: 110 },
  { position: 24, name: "Illinois Ave",         type: TileType.PROPERTY,     propertyIndex: 16, group: 5,  price: 240, baseRent: 20,  mortgageValue: 120 },
  { position: 25, name: "B&O Railroad",         type: TileType.RAILROAD,     propertyIndex: 17, group: 9,  price: 200, baseRent: 25,  mortgageValue: 100 },
  { position: 26, name: "Atlantic Ave",         type: TileType.PROPERTY,     propertyIndex: 18, group: 6,  price: 260, baseRent: 22,  mortgageValue: 130 },
  { position: 27, name: "Ventnor Ave",          type: TileType.PROPERTY,     propertyIndex: 19, group: 6,  price: 260, baseRent: 22,  mortgageValue: 130 },
  { position: 28, name: "Water Works",          type: TileType.UTILITY,      propertyIndex: 20, group: 10, price: 150, baseRent: 4,   mortgageValue: 75 },
  { position: 29, name: "Marvin Gardens",       type: TileType.PROPERTY,     propertyIndex: 21, group: 6,  price: 280, baseRent: 24,  mortgageValue: 140 },
  { position: 30, name: "Go To Jail",           type: TileType.GO_TO_JAIL,   propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 31, name: "Pacific Ave",          type: TileType.PROPERTY,     propertyIndex: 22, group: 7,  price: 300, baseRent: 26,  mortgageValue: 150 },
  { position: 32, name: "North Carolina Ave",   type: TileType.PROPERTY,     propertyIndex: 23, group: 7,  price: 300, baseRent: 26,  mortgageValue: 150 },
  { position: 33, name: "Community Chest",      type: TileType.COMMUNITY,    propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 34, name: "Pennsylvania Ave",     type: TileType.PROPERTY,     propertyIndex: 24, group: 7,  price: 320, baseRent: 28,  mortgageValue: 160 },
  { position: 35, name: "Short Line Railroad",  type: TileType.RAILROAD,     propertyIndex: 25, group: 9,  price: 200, baseRent: 25,  mortgageValue: 100 },
  { position: 36, name: "Chance",               type: TileType.CHANCE,       propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 37, name: "Park Place",           type: TileType.PROPERTY,     propertyIndex: 26, group: 8,  price: 350, baseRent: 35,  mortgageValue: 175 },
  { position: 38, name: "Luxury Tax",           type: TileType.TAX,          propertyIndex: -1, group: 0,  price: 0,   baseRent: 0,   mortgageValue: 0 },
  { position: 39, name: "Boardwalk",            type: TileType.PROPERTY,     propertyIndex: 27, group: 8,  price: 400, baseRent: 50,  mortgageValue: 200 },
];

// Build lookup: propertyIndex -> TileDef
export const PROPERTY_TILES: TileDef[] = TILES.filter(t => t.propertyIndex >= 0)
  .sort((a, b) => a.propertyIndex - b.propertyIndex);

// Group sizes: group -> count of properties in that group
export const GROUP_SIZES: Record<number, number> = {
  1: 2,  // Brown
  2: 3,  // Light Blue
  3: 3,  // Pink
  4: 3,  // Orange
  5: 3,  // Red
  6: 3,  // Yellow
  7: 3,  // Green
  8: 2,  // Dark Blue
  9: 4,  // Railroads
  10: 2, // Utilities
};

// ========== RENT CALCULATIONS ==========

export function getRailroadRent(numOwned: number): number {
  if (numOwned === 1) return 25;
  if (numOwned === 2) return 50;
  if (numOwned === 3) return 100;
  if (numOwned === 4) return 200;
  return 0;
}

export function getUtilityRent(numOwned: number, diceSum: number): number {
  if (numOwned === 1) return diceSum * 4;
  if (numOwned === 2) return diceSum * 10;
  return 0;
}

export function getTaxAmount(position: number): number {
  if (position === 4) return 200;  // Income Tax
  if (position === 38) return 100; // Luxury Tax
  return 0;
}

// ========== CARDS ==========

export const CHANCE_CARDS: CardData[] = [
  { effect: CardEffect.ADVANCE_TO_GO,    amount: 0,    moveTo: 0,  description: "Advance to Go. Collect $200." },
  { effect: CardEffect.GAIN_MONEY,        amount: 150,  moveTo: 0,  description: "Bank pays you dividend of $150." },
  { effect: CardEffect.PAY_MONEY,         amount: -50,  moveTo: 0,  description: "Speeding fine: $50." },
  { effect: CardEffect.MOVE_TO,           amount: 0,    moveTo: 24, description: "Advance to Illinois Ave." },
  { effect: CardEffect.MOVE_TO,           amount: 0,    moveTo: 11, description: "Advance to St. Charles Place." },
  { effect: CardEffect.GO_TO_JAIL,        amount: 0,    moveTo: 10, description: "Go to Jail. Do not pass Go." },
  { effect: CardEffect.GAIN_MONEY,        amount: 50,   moveTo: 0,  description: "Building loan matures. Collect $50." },
  { effect: CardEffect.PAY_EACH_PLAYER,   amount: -50,  moveTo: 0,  description: "Pay each player $50." },
];

export const COMMUNITY_CARDS: CardData[] = [
  { effect: CardEffect.ADVANCE_TO_GO,     amount: 0,    moveTo: 0,  description: "Advance to Go. Collect $200." },
  { effect: CardEffect.GAIN_MONEY,         amount: 200,  moveTo: 0,  description: "Bank error in your favor. Collect $200." },
  { effect: CardEffect.PAY_MONEY,          amount: -50,  moveTo: 0,  description: "Doctor's fee. Pay $50." },
  { effect: CardEffect.GAIN_MONEY,         amount: 100,  moveTo: 0,  description: "Life insurance matures. Collect $100." },
  { effect: CardEffect.PAY_MONEY,          amount: -100, moveTo: 0,  description: "Hospital fees. Pay $100." },
  { effect: CardEffect.GO_TO_JAIL,         amount: 0,    moveTo: 10, description: "Go to Jail. Do not pass Go." },
  { effect: CardEffect.COLLECT_FROM_EACH,  amount: 50,   moveTo: 0,  description: "Grand Opera opening. Collect $50 from each player." },
  { effect: CardEffect.GAIN_MONEY,         amount: 25,   moveTo: 0,  description: "Receive consultancy fee: $25." },
];
