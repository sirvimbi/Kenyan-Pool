export const BALL_VALUES: Record<number, number> = {
  3:6, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9, 10:10, 11:11, 12:12, 13:13, 14:14, 15:15
};
export const BALL_SEQUENCE = [3,4,5,6,7,8,9,10,11,12,13,14,15];
export const STARTING_BALANCE = 10000;
export const TURN_DURATION = 60;

// Table: 7-Foot (Bar/Home Standard) — 78" × 39" playing surface = 198 × 99 cm
export const TABLE_W = 99;   // width  (short dimension)
export const TABLE_L = 198;  // length (long  dimension)
export const BALL_R  = 2.86; // 57.2 mm diameter / 2
export const CUSHION = 5;    // rail cushion depth (cm)

// Playable half-extents (ball centres must stay inside)
export const HW = TABLE_W / 2 - CUSHION - BALL_R;   // ≈ 41.64
export const HL = TABLE_L / 2 - CUSHION - BALL_R;   // ≈ 90.14

// Pocket mouth widths (WPA spec):
//   Corner: 4.5"–4.625" = 11.43–11.75 cm  → capture radius = 5.8 cm
//   Side  : 5"–5.125"   = 12.7–13.01 cm   → capture radius = 6.5 cm
export const POCKETS = [
  { x: -TABLE_W/2, z: -TABLE_L/2, r: 5.8 },  // corner
  { x:  TABLE_W/2, z: -TABLE_L/2, r: 5.8 },  // corner
  { x: -TABLE_W/2, z:  0,         r: 6.5 },  // side
  { x:  TABLE_W/2, z:  0,         r: 6.5 },  // side
  { x: -TABLE_W/2, z:  TABLE_L/2, r: 5.8 },  // corner
  { x:  TABLE_W/2, z:  TABLE_L/2, r: 5.8 },  // corner
];

// Kenyan cushion layout: balls placed ON the rails (touching cushion face)
const RX = TABLE_W/2 - CUSHION - BALL_R - 0.5;  // long-rail  ball centre x ≈ 41.14
const RZ = TABLE_L/2 - CUSHION - BALL_R - 0.5;  // short-rail ball centre z ≈ 90.64

export const CUSHION_POSITIONS: Record<number,[number,number]> = {
  3:  [ 0,    0  ],              // centre spot
  // Short (end) rails — 2 balls each, spread ≈ TABLE_W/4
  4:  [-24,  -RZ], 15: [ 24, -RZ],
  6:  [-24,   RZ], 13: [ 24,  RZ],
  // Long rails — 4 balls each, evenly spaced
  7:  [-RX,  -65], 8: [-RX, -22], 11: [-RX, 22], 12: [-RX, 65],
  9:  [ RX,  -65], 10:[ RX, -22], 14: [ RX, 22],  5: [ RX, 65],
};

export const BALL_COLORS: Record<number, string> = {
  0:  '#F8F5E8',
  3:  '#E83028', 4:  '#E8C010', 5:  '#E06820', 6: '#1A8A3A',
  7:  '#7A1020', 8:  '#181818', 9:  '#E8D010', 10:'#1262C0',
  11: '#E83028', 12: '#E8C010', 13: '#E06820', 14:'#1A8A3A', 15:'#7A1020',
};

export interface Vec2 { x: number; z: number; }

export interface BallState {
  number: number;
  pos: Vec2;
  vel: Vec2;
  isPotted: boolean;
  firstContactGiven?: boolean;
}

export interface PlayerConfig {
  name: string;
  isAI: boolean;
}

export interface PlayerState {
  id: number;
  name: string;
  score: number;
  fouls: number;
  pots: number;
  isAI: boolean;
  isBenched: boolean;
  balance: number;
}

export type GamePhase =
  | 'aiming'
  | 'powering'
  | 'simulating'
  | 'evaluating'
  | 'roundEnd';

export interface ShotResult {
  type: 'success'|'carom'|'foul_wrong'|'foul_scratch'|'miss';
  pottedBalls: number[];
  scoreChange: number;
  message: string;
  extraTurn: boolean;
}

export interface HUDState {
  players: PlayerState[];
  currentPlayerIndex: number;
  targetBall: number;
  timeLeft: number;
  power: number;
  phase: GamePhase;
  prizePool: number;
  shotResult: ShotResult | null;
  stake: number;
  camMode: 'overhead'|'cinematic'|'aim';
}
