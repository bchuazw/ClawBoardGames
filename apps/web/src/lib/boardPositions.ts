// Board position data for 3D rendering
// Maps Monopoly position (0-39) to 3D coordinates and tile metadata
// Board scaled 1.2x for breathing room between corners and tiles

export interface TileInfo {
  position: number;
  name: string;
  shortName: string;
  group: number; // 0=special, 1-8=color, 9=railroad, 10=utility
  isCorner: boolean;
  price: number;
  type: 'property' | 'railroad' | 'utility' | 'tax' | 'chance' | 'community' | 'corner';
}

// 3D coordinates for each board position [x, y, z]
// Board centered at origin, y=0 is board surface, 1.2-unit spacing
export const BOARD_POSITIONS: [number, number, number][] = [
  // Bottom edge: Go (right) to Jail (left)
  [6, 0, 6],       // 0:  Go
  [4.8, 0, 6],     // 1:  Mediterranean
  [3.6, 0, 6],     // 2:  Community Chest
  [2.4, 0, 6],     // 3:  Baltic
  [1.2, 0, 6],     // 4:  Income Tax
  [0, 0, 6],       // 5:  Reading Railroad
  [-1.2, 0, 6],    // 6:  Oriental
  [-2.4, 0, 6],    // 7:  Chance
  [-3.6, 0, 6],    // 8:  Vermont
  [-4.8, 0, 6],    // 9:  Connecticut
  [-6, 0, 6],      // 10: Jail

  // Left edge: bottom to top
  [-6, 0, 4.8],    // 11: St. Charles
  [-6, 0, 3.6],    // 12: Electric Company
  [-6, 0, 2.4],    // 13: States
  [-6, 0, 1.2],    // 14: Virginia
  [-6, 0, 0],      // 15: Pennsylvania Railroad
  [-6, 0, -1.2],   // 16: St. James
  [-6, 0, -2.4],   // 17: Community Chest
  [-6, 0, -3.6],   // 18: Tennessee
  [-6, 0, -4.8],   // 19: New York
  [-6, 0, -6],     // 20: Free Parking

  // Top edge: left to right
  [-4.8, 0, -6],   // 21: Kentucky
  [-3.6, 0, -6],   // 22: Chance
  [-2.4, 0, -6],   // 23: Indiana
  [-1.2, 0, -6],   // 24: Illinois
  [0, 0, -6],      // 25: B&O Railroad
  [1.2, 0, -6],    // 26: Atlantic
  [2.4, 0, -6],    // 27: Ventnor
  [3.6, 0, -6],    // 28: Water Works
  [4.8, 0, -6],    // 29: Marvin Gardens
  [6, 0, -6],      // 30: Go To Jail

  // Right edge: top to bottom
  [6, 0, -4.8],    // 31: Pacific
  [6, 0, -3.6],    // 32: North Carolina
  [6, 0, -2.4],    // 33: Community Chest
  [6, 0, -1.2],    // 34: Pennsylvania Ave
  [6, 0, 0],       // 35: Short Line Railroad
  [6, 0, 1.2],     // 36: Chance
  [6, 0, 2.4],     // 37: Park Place
  [6, 0, 3.6],     // 38: Luxury Tax
  [6, 0, 4.8],     // 39: Boardwalk
];

export const TILE_DATA: TileInfo[] = [
  { position: 0,  name: 'Go',                shortName: 'GO',       group: 0,  isCorner: true,  price: 0,   type: 'corner' },
  { position: 1,  name: 'Mediterranean Ave', shortName: 'MED',      group: 1,  isCorner: false, price: 60,  type: 'property' },
  { position: 2,  name: 'Community Chest',   shortName: 'CC',       group: 0,  isCorner: false, price: 0,   type: 'community' },
  { position: 3,  name: 'Baltic Ave',        shortName: 'BAL',      group: 1,  isCorner: false, price: 60,  type: 'property' },
  { position: 4,  name: 'Income Tax',        shortName: 'TAX',      group: 0,  isCorner: false, price: 0,   type: 'tax' },
  { position: 5,  name: 'Reading Railroad',  shortName: 'RR',       group: 9,  isCorner: false, price: 200, type: 'railroad' },
  { position: 6,  name: 'Oriental Ave',      shortName: 'ORI',      group: 2,  isCorner: false, price: 100, type: 'property' },
  { position: 7,  name: 'Chance',            shortName: '?',        group: 0,  isCorner: false, price: 0,   type: 'chance' },
  { position: 8,  name: 'Vermont Ave',       shortName: 'VER',      group: 2,  isCorner: false, price: 100, type: 'property' },
  { position: 9,  name: 'Connecticut Ave',   shortName: 'CON',      group: 2,  isCorner: false, price: 120, type: 'property' },
  { position: 10, name: 'Jail',              shortName: 'JAIL',     group: 0,  isCorner: true,  price: 0,   type: 'corner' },
  { position: 11, name: 'St. Charles Place', shortName: 'STC',      group: 3,  isCorner: false, price: 140, type: 'property' },
  { position: 12, name: 'Electric Company',  shortName: 'ELEC',     group: 10, isCorner: false, price: 150, type: 'utility' },
  { position: 13, name: 'States Ave',        shortName: 'STA',      group: 3,  isCorner: false, price: 140, type: 'property' },
  { position: 14, name: 'Virginia Ave',      shortName: 'VIR',      group: 3,  isCorner: false, price: 160, type: 'property' },
  { position: 15, name: 'Penn Railroad',     shortName: 'PRR',      group: 9,  isCorner: false, price: 200, type: 'railroad' },
  { position: 16, name: 'St. James Place',   shortName: 'STJ',      group: 4,  isCorner: false, price: 180, type: 'property' },
  { position: 17, name: 'Community Chest',   shortName: 'CC',       group: 0,  isCorner: false, price: 0,   type: 'community' },
  { position: 18, name: 'Tennessee Ave',     shortName: 'TEN',      group: 4,  isCorner: false, price: 180, type: 'property' },
  { position: 19, name: 'New York Ave',      shortName: 'NY',       group: 4,  isCorner: false, price: 200, type: 'property' },
  { position: 20, name: 'Free Parking',      shortName: 'FP',       group: 0,  isCorner: true,  price: 0,   type: 'corner' },
  { position: 21, name: 'Kentucky Ave',      shortName: 'KEN',      group: 5,  isCorner: false, price: 220, type: 'property' },
  { position: 22, name: 'Chance',            shortName: '?',        group: 0,  isCorner: false, price: 0,   type: 'chance' },
  { position: 23, name: 'Indiana Ave',       shortName: 'IND',      group: 5,  isCorner: false, price: 220, type: 'property' },
  { position: 24, name: 'Illinois Ave',      shortName: 'ILL',      group: 5,  isCorner: false, price: 240, type: 'property' },
  { position: 25, name: 'B&O Railroad',      shortName: 'B&O',      group: 9,  isCorner: false, price: 200, type: 'railroad' },
  { position: 26, name: 'Atlantic Ave',      shortName: 'ATL',      group: 6,  isCorner: false, price: 260, type: 'property' },
  { position: 27, name: 'Ventnor Ave',       shortName: 'VEN',      group: 6,  isCorner: false, price: 260, type: 'property' },
  { position: 28, name: 'Water Works',       shortName: 'WW',       group: 10, isCorner: false, price: 150, type: 'utility' },
  { position: 29, name: 'Marvin Gardens',    shortName: 'MAR',      group: 6,  isCorner: false, price: 280, type: 'property' },
  { position: 30, name: 'Go To Jail',        shortName: 'GTJ',      group: 0,  isCorner: true,  price: 0,   type: 'corner' },
  { position: 31, name: 'Pacific Ave',       shortName: 'PAC',      group: 7,  isCorner: false, price: 300, type: 'property' },
  { position: 32, name: 'North Carolina Ave',shortName: 'NC',       group: 7,  isCorner: false, price: 300, type: 'property' },
  { position: 33, name: 'Community Chest',   shortName: 'CC',       group: 0,  isCorner: false, price: 0,   type: 'community' },
  { position: 34, name: 'Pennsylvania Ave',  shortName: 'PA',       group: 7,  isCorner: false, price: 320, type: 'property' },
  { position: 35, name: 'Short Line RR',     shortName: 'SLR',      group: 9,  isCorner: false, price: 200, type: 'railroad' },
  { position: 36, name: 'Chance',            shortName: '?',        group: 0,  isCorner: false, price: 0,   type: 'chance' },
  { position: 37, name: 'Park Place',        shortName: 'PP',       group: 8,  isCorner: false, price: 350, type: 'property' },
  { position: 38, name: 'Luxury Tax',        shortName: 'LTX',      group: 0,  isCorner: false, price: 0,   type: 'tax' },
  { position: 39, name: 'Boardwalk',         shortName: 'BW',       group: 8,  isCorner: false, price: 400, type: 'property' },
];

// Property group colors
export const GROUP_COLORS: Record<number, string> = {
  0:  '#1a2a1a',
  1:  '#8B4513',
  2:  '#4fc3f7',
  3:  '#E91E63',
  4:  '#FF9800',
  5:  '#f44336',
  6:  '#FFEB3B',
  7:  '#4CAF50',
  8:  '#1565C0',
  9:  '#78909C',
  10: '#B0BEC5',
};

export const PLAYER_COLORS = ['#FF9100', '#E040FB', '#00B8D4', '#76FF03'];
export const PLAYER_NAMES = ['Rex', 'Whiskers', 'Bruno', 'Fiona'];
export const PLAYER_ANIMALS = ['dog', 'cat', 'bear', 'fox'] as const;
export const PLAYER_EMOJIS = ['\u{1F415}', '\u{1F431}', '\u{1F43B}', '\u{1F98A}'];
export const PLAYER_LABELS = ['P0', 'P1', 'P2', 'P3'];

// Token positional offsets so 4 tokens on same tile don't overlap
export const TOKEN_OFFSETS: [number, number, number][] = [
  [-0.22, 0, -0.22],
  [0.22, 0, -0.22],
  [-0.22, 0, 0.22],
  [0.22, 0, 0.22],
];

// Jail cell offset for players who are IN jail (relative to jail tile center)
export const JAIL_CELL_OFFSETS: [number, number, number][] = [
  [0.1, 0, 0.15],
  [0.3, 0, 0.15],
  [0.1, 0, 0.35],
  [0.3, 0, 0.35],
];

// Property index (0-27) to tile position (0-39) mapping
export const PROPERTY_TO_TILE: number[] = [
  1, 3, 5, 6, 8, 9,
  11, 12, 13, 14, 15,
  16, 18, 19,
  21, 23, 24, 25,
  26, 27, 28, 29,
  31, 32, 34, 35,
  37, 39,
];

export function getTileEdge(position: number): 'bottom' | 'left' | 'top' | 'right' | 'corner' {
  if ([0, 10, 20, 30].includes(position)) return 'corner';
  if (position < 10) return 'bottom';
  if (position < 20) return 'left';
  if (position < 30) return 'top';
  return 'right';
}
