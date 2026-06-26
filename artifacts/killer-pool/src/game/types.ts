export const BALL_VALUES: Record<number, number> = {
  3:6, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9, 10:10, 11:11, 12:12, 13:13, 14:14, 15:15
};
export const BALL_SEQUENCE = [3,4,5,6,7,8,9,10,11,12,13,14,15];
export const STARTING_BALANCE = 10000;
export const TURN_DURATION = 60;

// Table: 7-Foot (Bar/Home Standard) — 78" × 39" playing surface = 198 × 99 cm
export const TABLE_W = 99.1;   // playing surface width  (nose-to-nose, short side)
export const TABLE_L = 198.1;  // playing surface length (nose-to-nose, long side)
export const BALL_R  = 2.86;   // 57.2 mm diameter / 2
export const CUSHION = 5;      // cushion depth: nose → outer base (sits over the rail)

// Cushion NOSE line = edge of the rolling area; cushions extend outward over the
// rails. Nose-to-nose rolling area is TABLE_W × TABLE_L = 99.1 × 198.1 cm (WPA 7ft).
export const PW = TABLE_W / 2;   // 49.55  nose half-width
export const PL = TABLE_L / 2;   // 99.05  nose half-length

// Playable half-extents (ball centres must stay inside)
export const HW = PW - BALL_R;   // ≈ 46.69
export const HL = PL - BALL_R;   // ≈ 96.19

// Pocket mouth widths (WPA spec):
//   Corner: 4.5"–4.625" = 11.43–11.75 cm  → capture radius = 5.8 cm
//   Side  : 5"–5.125"   = 12.7–13.01 cm   → capture radius = 6.5 cm
export const POCKETS = [
  { x: -PW, z: -PL, r: 5.8 },  // corner
  { x:  PW, z: -PL, r: 5.8 },  // corner
  { x: -PW, z:  0,  r: 6.5 },  // side
  { x:  PW, z:  0,  r: 6.5 },  // side
  { x: -PW, z:  PL, r: 5.8 },  // corner
  { x:  PW, z:  PL, r: 5.8 },  // corner
];

// Kenyan cushion layout: balls placed ON the rails (ball edge exactly on the nose
// line = bounce plane, so they touch the cushion face with no overlap).
const RX = PW - BALL_R;  // long-rail  ball centre x = HW ≈ 41.64
const RZ = PL - BALL_R;  // short-rail ball centre z = HL ≈ 90.14

export const CUSHION_POSITIONS: Record<number,[number,number]> = {
  3:  [ 0,   43  ],              // one long-rail ball-gap up-table, opposite the cue ball
  // Short (end) rails — 2 balls each, spread ≈ TABLE_W/4
  4:  [-24,  -RZ], 15: [ 24, -RZ],
  6:  [-24,   RZ], 13: [ 24,  RZ],
  // Long rails — 4 balls each, evenly spaced
  7:  [-RX,  -65], 8: [-RX, -22], 11: [-RX, 22], 12: [-RX, 65],
  9:  [ RX,  -65], 10:[ RX, -22], 14: [ RX, 22],  5: [ RX, 65],
};

// Standard American pool colours. Solids 3-7 share their hue with stripes 11-15;
// 8 is black. 9 (yellow) and 10 (blue) follow standard pool. Deep/saturated and
// hue-separated so neighbouring colours (red / orange / brown) read distinctly.
export const BALL_COLORS: Record<number, string> = {
  0:  '#FFFFFF',
  3:  '#C30010', 4:  '#4A008F', 5:  '#E25A00', 6:  '#00592B',
  7:  '#5A2310', 8:  '#000000', 9:  '#E8B400', 10: '#002E8A',
  11: '#C30010', 12: '#4A008F', 13: '#E25A00', 14: '#00592B', 15: '#5A2310',
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
