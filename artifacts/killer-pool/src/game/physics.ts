import { BallState, Vec2, BALL_R, CUSHION, TABLE_W, TABLE_L, HW, HL, POCKETS } from './types';

const FRICTION   = 0.988;
const MIN_SPEED  = 0.28;
const CUSH_COR   = 0.68;
const BALL_COR   = 0.94;

export function shotVelocity(dir: Vec2, power: number): Vec2 {
  const scale = power * 4.5;
  return { x: dir.x * scale, z: dir.z * scale };
}

/** Executes exactly ONE physics step. Must be called with a constant dt. */
export function stepPhysics(
  balls: BallState[],
  fixedDt: number,
  onFirstContact: (hitter: number, hit: number) => void,
  onBallCollision?: (impactSpeed: number) => void,
  onCushion?: (ballNumber: number, x: number, z: number) => void
): number[] {
  const pottedNow: number[] = [];
  const active = balls.filter(b => !b.isPotted);
  const frictionFactor = Math.pow(FRICTION, fixedDt * 60);
  const spinFriction = Math.pow(0.98, fixedDt * 60);

  for (const b of active) {
    b.pos.x += b.vel.x * fixedDt;
    b.pos.z += b.vel.z * fixedDt;
    const spd = Math.hypot(b.vel.x, b.vel.z);
    if (b.spin) {
      if (spd > 0.1) {
        const followFactor = 0.12;
        const normX = b.vel.x / spd;
        const normZ = b.vel.z / spd;
        b.vel.x += normX * b.spin.z * followFactor * fixedDt * 60;
        b.vel.z += normZ * b.spin.z * followFactor * fixedDt * 60;
      }
      b.spin.x *= spinFriction;
      b.spin.z *= spinFriction;
      if (Math.abs(b.spin.x) < 0.01 && Math.abs(b.spin.z) < 0.01) delete b.spin;
    }
    if (spd > MIN_SPEED) {
      b.vel.x *= frictionFactor;
      b.vel.z *= frictionFactor;
    } else {
      b.vel.x = 0;
      b.vel.z = 0;
    }
  }

  for (const b of active) {
    let bounced = false;
    if (b.pos.x < -HW) {
      b.pos.x = -HW;
      if (b.vel.x < 0) { b.vel.x = -b.vel.x * CUSH_COR; bounced = true; }
    } else if (b.pos.x > HW) {
      b.pos.x = HW;
      if (b.vel.x > 0) { b.vel.x = -b.vel.x * CUSH_COR; bounced = true; }
    }
    if (b.pos.z < -HL) {
      b.pos.z = -HL;
      if (b.vel.z < 0) { b.vel.z = -b.vel.z * CUSH_COR; bounced = true; }
    } else if (b.pos.z > HL) {
      b.pos.z = HL;
      if (b.vel.z > 0) { b.vel.z = -b.vel.z * CUSH_COR; bounced = true; }
    }
    if (bounced && onCushion) onCushion(b.number, b.pos.x, b.pos.z);
  }

  const minD = BALL_R * 2;
  for (let i = 0; i < active.length - 1; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b2 = active[j];
      const dx = b2.pos.x - a.pos.x;
      const dz = b2.pos.z - a.pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minD * minD) {
        const d = Math.sqrt(distSq);
        const nx = dx / (d || 1), nz = dz / (d || 1);
        const dvx = b2.vel.x - a.vel.x;
        const dvz = b2.vel.z - a.vel.z;
        const dot = dvx * nx + dvz * nz;
        if (dot < 0) {
          if (a.number === 0 && !b2.firstContactGiven) {
            b2.firstContactGiven = true;
            onFirstContact(0, b2.number);
          } else if (b2.number === 0 && !a.firstContactGiven) {
            a.firstContactGiven = true;
            onFirstContact(0, a.number);
          }
          const overlap = minD - d;
          a.pos.x -= nx * overlap * 0.5;
          a.pos.z -= nz * overlap * 0.5;
          b2.pos.x += nx * overlap * 0.5;
          b2.pos.z += nz * overlap * 0.5;
          const imp = dot * BALL_COR;
          a.vel.x += imp * nx; a.vel.z += imp * nz;
          b2.vel.x -= imp * nx; b2.vel.z -= imp * nz;
          if (onBallCollision) onBallCollision(Math.abs(dot));
        }
      }
    }
  }

  for (const b of active) {
    for (const p of POCKETS) {
      const dx = b.pos.x - p.x;
      const dz = b.pos.z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) {
        b.isPotted = true;
        b.vel = { x: 0, z: 0 };
        delete b.spin;
        if (!pottedNow.includes(b.number)) pottedNow.push(b.number);
        break;
      }
    }
  }
  return pottedNow;
}

export function allStopped(balls: BallState[]): boolean {
  return balls.every(b => b.isPotted || (Math.abs(b.vel.x) < MIN_SPEED && Math.abs(b.vel.z) < MIN_SPEED));
}