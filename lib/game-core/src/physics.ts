import { BallState, Vec2, BALL_R, HW, HL, POCKETS } from './types';

const FRICTION_PER_60HZ = 0.988;
const SPIN_FRICTION_PER_60HZ = 0.985;
const MIN_SPEED = 0.035;
const CUSH_COR = 0.68;
const BALL_COR = 0.94;
const SUBSTEPS = 6;

export function shotVelocity(dir: Vec2, power: number): Vec2 {
  const scale = power * 3.2;
  return { x: dir.x * scale, z: dir.z * scale };
}

export function stepPhysics(
  balls: BallState[],
  dt: number,
  onFirstContact: (hitter: number, hit: number) => void,
  onBallCollision?: (impactSpeed: number) => void,
  onCushion?: (ballNumber: number, x: number, z: number) => void
): number[] {
  const subDt = dt / SUBSTEPS;
  const pottedNow: number[] = [];
  let collisionSounded = false;

  const frictionFactor = Math.pow(FRICTION_PER_60HZ, subDt * 60);
  const spinFriction = Math.pow(SPIN_FRICTION_PER_60HZ, subDt * 60);

  for (let s = 0; s < SUBSTEPS; s++) {
    const active = balls.filter(b => !b.isPotted);

    for (const b of active) {
      b.pos.x += b.vel.x * subDt;
      b.pos.z += b.vel.z * subDt;
      const speed = Math.hypot(b.vel.x, b.vel.z);

      if (b.spin) {
        if (speed > 0.08 && Math.abs(b.spin.z) > 0.001) {
          const dirX = b.vel.x / speed;
          const dirZ = b.vel.z / speed;
          const transfer = b.spin.z * 0.045 * subDt * 60;
          b.vel.x += dirX * transfer;
          b.vel.z += dirZ * transfer;
        }
        b.spin.x *= spinFriction;
        b.spin.z *= spinFriction;
        if (Math.abs(b.spin.x) < 0.008 && Math.abs(b.spin.z) < 0.008) delete b.spin;
      }

      if (speed > MIN_SPEED) {
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
        if (b.vel.x < 0) { b.vel.x = -b.vel.x * CUSH_COR; if (b.spin) b.vel.z += b.spin.x * Math.abs(b.vel.x) * 0.20; bounced = true; }
      } else if (b.pos.x > HW) {
        b.pos.x = HW;
        if (b.vel.x > 0) { b.vel.x = -b.vel.x * CUSH_COR; if (b.spin) b.vel.z -= b.spin.x * Math.abs(b.vel.x) * 0.20; bounced = true; }
      }
      if (b.pos.z < -HL) {
        b.pos.z = -HL;
        if (b.vel.z < 0) { b.vel.z = -b.vel.z * CUSH_COR; if (b.spin) b.vel.x -= b.spin.x * Math.abs(b.vel.z) * 0.20; bounced = true; }
      } else if (b.pos.z > HL) {
        b.pos.z = HL;
        if (b.vel.z > 0) { b.vel.z = -b.vel.z * CUSH_COR; if (b.spin) b.vel.x += b.spin.x * Math.abs(b.vel.z) * 0.20; bounced = true; }
      }
      if (bounced && onCushion) onCushion(b.number, b.pos.x, b.pos.z);
    }

    const minD = BALL_R * 2;
    for (let i = 0; i < active.length - 1; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b = active[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minD * minD) continue;

        const d = Math.sqrt(distSq) || 0.000001;
        const nx = dx / d, nz = dz / d;
        const dvx = b.vel.x - a.vel.x, dvz = b.vel.z - a.vel.z;
        const closingSpeed = dvx * nx + dvz * nz;

        const overlap = minD - d;
        a.pos.x -= nx * overlap * 0.5; a.pos.z -= nz * overlap * 0.5;
        b.pos.x += nx * overlap * 0.5; b.pos.z += nz * overlap * 0.5;
        if (closingSpeed >= 0) continue;

        if (a.number === 0 && !b.firstContactGiven) { b.firstContactGiven = true; onFirstContact(0, b.number); }
        else if (b.number === 0 && !a.firstContactGiven) { a.firstContactGiven = true; onFirstContact(0, a.number); }

        const impulse = closingSpeed * BALL_COR;
        a.vel.x += impulse * nx; a.vel.z += impulse * nz;
        b.vel.x -= impulse * nx; b.vel.z -= impulse * nz;

        const cue = a.number === 0 ? a : b.number === 0 ? b : null;
        const object = cue === a ? b : cue === b ? a : null;
        if (cue?.spin && object) {
          const tx = -nz, tz = nx;
          const tangential = cue.spin.x * Math.abs(closingSpeed) * 0.018;
          object.vel.x += tx * tangential;
          object.vel.z += tz * tangential;
          cue.spin.x *= 0.96;
          cue.spin.z *= 0.94;
        }

        if (!collisionSounded && onBallCollision) {
          collisionSounded = true;
          onBallCollision(Math.abs(closingSpeed));
        }
      }
    }

    for (const b of active) {
      for (const p of POCKETS) {
        const dx = b.pos.x - p.x, dz = b.pos.z - p.z;
        if (dx * dx + dz * dz < p.r * p.r) {
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