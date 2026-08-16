import { BallState, Vec2, BALL_R, CUSHION, TABLE_W, TABLE_L, HW, HL, POCKETS } from './types';

const FRICTION   = 0.9878;
const MIN_SPEED  = 0.04;
const CUSH_COR   = 0.72;
const BALL_COR   = 0.93;
const SUBSTEPS   = 6;

export function shotVelocity(dir: Vec2, power: number): Vec2 {
  const scale = power * 3.2;
  return { x: dir.x * scale, z: dir.z * scale };
}

export function stepPhysics(
  balls: BallState[], dt: number,
  onFirstContact: (hitter: number, hit: number) => void,
  onBallCollision?: (impactSpeed: number) => void,
  onCushion?: (ballNumber: number, x: number, z: number) => void
): number[] {
  const subDt = dt / SUBSTEPS;
  const pottedNow: number[] = [];
  let collisionSounded = false;

  for (let s = 0; s < SUBSTEPS; s++) {
    const active = balls.filter(b => !b.isPotted);
    for (const b of active) {
      b.pos.x += b.vel.x * subDt;
      b.pos.z += b.vel.z * subDt;
      const spd = Math.hypot(b.vel.x, b.vel.z);
      if (b.spin) {
        const spinFriction = Math.pow(0.99, subDt * 60);
        if (spd > 0.1) {
          const followFactor = 0.15;
          b.vel.x += (b.vel.x / spd) * b.spin.z * followFactor * subDt * 60;
          b.vel.z += (b.vel.z / spd) * b.spin.z * followFactor * subDt * 60;
        }
        b.spin.x *= spinFriction;
        b.spin.z *= spinFriction;
        if (Math.abs(b.spin.x) < 0.01 && Math.abs(b.spin.z) < 0.01) delete b.spin;
      }
      if (spd > MIN_SPEED) {
        const f = Math.pow(FRICTION, subDt * 60);
        b.vel.x *= f;
        b.vel.z *= f;
      } else {
        b.vel.x = 0;
        b.vel.z = 0;
      }
    }

    for (const b of active) {
      let bounced = false;
      const sideSpinFactor = 0.45;
      if (b.pos.x < -HW) {
        b.pos.x = -HW;
        if (b.vel.x < 0) { b.vel.x = -b.vel.x * CUSH_COR; if (b.spin) b.vel.z += b.spin.x * Math.abs(b.vel.x) * sideSpinFactor; bounced = true; }
      }
      if (b.pos.x > HW) {
        b.pos.x = HW;
        if (b.vel.x > 0) { b.vel.x = -b.vel.x * CUSH_COR; if (b.spin) b.vel.z -= b.spin.x * Math.abs(b.vel.x) * sideSpinFactor; bounced = true; }
      }
      if (b.pos.z < -HL) {
        b.pos.z = -HL;
        if (b.vel.z < 0) { b.vel.z = -b.vel.z * CUSH_COR; if (b.spin) b.vel.x -= b.spin.x * Math.abs(b.vel.z) * sideSpinFactor; bounced = true; }
      }
      if (b.pos.z > HL) {
        b.pos.z = HL;
        if (b.vel.z > 0) { b.vel.z = -b.vel.z * CUSH_COR; if (b.spin) b.vel.x += b.spin.x * Math.abs(b.vel.z) * sideSpinFactor; bounced = true; }
      }
      if (bounced && onCushion) onCushion(b.number, b.pos.x, b.pos.z);
    }

    for (let i = 0; i < active.length - 1; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b2 = active[j];
        const dx = b2.pos.x - a.pos.x, dz = b2.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = BALL_R * 2;
        if (d < minD && d > 0.001) {
          if (a.number === 0 && !b2.firstContactGiven) { b2.firstContactGiven = true; onFirstContact(0, b2.number); }
          else if (b2.number === 0 && !a.firstContactGiven) { a.firstContactGiven = true; onFirstContact(0, a.number); }
          const nx = dx / d, nz = dz / d;
          const overlap = minD - d;
          a.pos.x -= nx * overlap * 0.5; a.pos.z -= nz * overlap * 0.5;
          b2.pos.x += nx * overlap * 0.5; b2.pos.z += nz * overlap * 0.5;
          const dvx = b2.vel.x - a.vel.x, dvz = b2.vel.z - a.vel.z;
          const dot = dvx * nx + dvz * nz;
          if (dot < 0) {
            const imp = dot * BALL_COR;
            a.vel.x += imp * nx; a.vel.z += imp * nz;
            b2.vel.x -= imp * nx; b2.vel.z -= imp * nz;
            if (a.number === 0 && a.spin) {
              const spd2 = Math.hypot(a.vel.x, a.vel.z);
              if (spd2 > 0.5) { a.vel.x += (a.vel.x / spd2) * a.spin.z * 0.8; a.vel.z += (a.vel.z / spd2) * a.spin.z * 0.8; }
            } else if (b2.number === 0 && b2.spin) {
              const spd2 = Math.hypot(b2.vel.x, b2.vel.z);
              if (spd2 > 0.5) { b2.vel.x += (b2.vel.x / spd2) * b2.spin.z * 0.8; b2.vel.z += (b2.vel.z / spd2) * b2.spin.z * 0.8; }
            }
            if (!collisionSounded && onBallCollision) { collisionSounded = true; onBallCollision(Math.abs(dot)); }
          }
        }
      }
    }

    for (const b of active) {
      for (const p of POCKETS) {
        if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < p.r) {
          b.isPotted = true;
          b.vel = { x: 0, z: 0 };
          delete b.spin;
          if (!pottedNow.includes(b.number)) pottedNow.push(b.number);
          break;
        }
      }
    }
  }
  return pottedNow;
}

export function allStopped(balls: BallState[]): boolean {
  return balls.every(b => b.isPotted || (Math.abs(b.vel.x) < MIN_SPEED && Math.abs(b.vel.z) < MIN_SPEED));
}