import { BallState, Vec2, BALL_R, POCKETS, HW, HL } from './types';

function dot(a: Vec2, b: Vec2) { return a.x*b.x + a.z*b.z; }
function norm(v: Vec2): Vec2 { const d = Math.hypot(v.x, v.z)||1; return {x:v.x/d, z:v.z/d}; }
function sub(a: Vec2, b: Vec2): Vec2 { return {x:a.x-b.x, z:a.z-b.z}; }
function add(a: Vec2, b: Vec2): Vec2 { return {x:a.x+b.x, z:a.z+b.z}; }
function scale(v: Vec2, s: number): Vec2 { return {x:v.x*s, z:v.z*s}; }
function len(v: Vec2) { return Math.hypot(v.x, v.z); }

function ghostBallPos(target: Vec2, pocket: Vec2): Vec2 {
  const d = norm(sub(target, pocket));
  return add(target, scale(d, BALL_R * 2));
}

export interface AIResult {
  direction: Vec2; // shoot direction (normalized) = direction ball will travel
  power: number;   // 0-100
}

export function computeAIShot(
  cueBall: BallState,
  targetBall: BallState,
  allBalls: BallState[]
): AIResult {
  if (targetBall.isPotted) {
    return { direction: { x: 0, z: 1 }, power: 15 };
  }

  // Try each pocket — find best ghost ball angle
  let bestAngle = 0;
  let bestPower = 30;
  let bestScore = -Infinity;

  for (const pocket of POCKETS) {
    const pockVec = { x: pocket.x, z: pocket.z };
    const ghost = ghostBallPos(targetBall.pos, pockVec);

    // Direction from cue to ghost ball
    const toGhost = sub(ghost, cueBall.pos);
    const dist = len(toGhost);
    if (dist < 1) continue;

    const dir = norm(toGhost);

    // Heuristic: prefer shots where cue-to-ghost line is clear and short
    const clearance = checkLineClear(cueBall.pos, ghost, targetBall, allBalls);
    const score = clearance / (1 + dist * 0.01);

    if (score > bestScore) {
      bestScore = score;
      bestAngle = Math.atan2(dir.z, dir.x);
      bestPower = Math.min(85, 30 + dist * 0.3);
    }
  }

  // Add small difficulty-appropriate imprecision
  const noise = (Math.random() - 0.5) * 0.06;
  const angle = bestAngle + noise;

  return {
    direction: { x: Math.cos(angle), z: Math.sin(angle) },
    power: bestPower + (Math.random() - 0.5) * 10,
  };
}

function checkLineClear(from: Vec2, to: Vec2, skipBall: BallState, balls: BallState[]): number {
  const dir = norm(sub(to, from));
  const dist = len(sub(to, from));
  let score = 1.0;
  for (const b of balls) {
    if (b.isPotted || b.number === 0 || b === skipBall) continue;
    // Project ball onto line
    const rel = sub(b.pos, from);
    const proj = dot(rel, dir);
    if (proj < 0 || proj > dist) continue;
    const perpDist = Math.hypot(
      rel.x - dir.x * proj,
      rel.z - dir.z * proj
    );
    if (perpDist < BALL_R * 2.2) {
      score *= 0.3; // blocked
    }
  }
  return score;
}
