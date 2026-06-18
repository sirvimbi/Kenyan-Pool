export const BALL_VALUES: Record<number, number> = {
  3:6, 4:4, 5:5, 6:6, 7:7, 8:8, 9:9, 10:10, 11:11, 12:12, 13:13, 14:14, 15:15
};
export const BALL_SEQUENCE = [3,4,5,6,7,8,9,10,11,12,13,14,15];
export const STARTING_BALANCE = 10000;
export const TURN_DURATION = 60;

// Table: WPA 9-foot, 50"×100" playing surface → ~127×254 cm
export const TABLE_W = 127;
export const TABLE_L = 254;
export const BALL_R = 2.85;       // WPA ball 57mm diameter
export const CUSHION = 5;

// Playable half-extents (ball centers)
export const HW = TABLE_W/2 - CUSHION - BALL_R;
export const HL = TABLE_L/2 - CUSHION - BALL_R;

// 6 standard pockets: 4 corners + 2 side centers
export const POCKETS = [
  { x: -TABLE_W/2, z: -TABLE_L/2, r: BALL_R*1.8 }, // corner
  { x:  TABLE_W/2, z: -TABLE_L/2, r: BALL_R*1.8 }, // corner
  { x: -TABLE_W/2, z:  0,         r: BALL_R*2.1 }, // side
  { x:  TABLE_W/2, z:  0,         r: BALL_R*2.1 }, // side
  { x: -TABLE_W/2, z:  TABLE_L/2, r: BALL_R*1.8 }, // corner
  { x:  TABLE_W/2, z:  TABLE_L/2, r: BALL_R*1.8 }, // corner
];

// Kenyan cushion layout: balls placed ON the rails
const RX = TABLE_W/2 - CUSHION - BALL_R - 1;
const RZ = TABLE_L/2 - CUSHION - BALL_R - 1;
export const CUSHION_POSITIONS: Record<number,[number,number]> = {
  3:  [ 0,   0  ],
  4:  [-32,  -RZ], 15: [ 32, -RZ],
  6:  [-32,   RZ], 13: [ 32,  RZ],
  7:  [-RX,  -84], 8: [-RX, -28], 11: [-RX, 28], 12: [-RX, 84],
  9:  [ RX,  -84], 10:[ RX, -28], 14: [ RX, 28],  5: [ RX, 84],
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
  | 'aiming'     // player rotates aim
  | 'powering'   // holding mouse, charging power
  | 'simulating' // balls moving
  | 'evaluating' // brief pause showing result
  | 'roundEnd';  // game over

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
