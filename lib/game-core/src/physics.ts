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
  balls: BallState[],
  dt: number,
  onFirstContact: (hitter: number, hit: number) => void,
  onBallCollision?: (impactSpeed: number) => void,
  onCushion?: (ballNumber: number, x: number, z: number) => void
): number[] {
  const subDt = dt / SUBSTEPS;
  const pottedNow: number[] = [];
  let collisionSounded = false; // fire at most once per stepPhysics call

  for (let s = 0; s < SUBSTEPS; s++) {
    const active = balls.filter(b => !b.isPotted);

    // Move + friction
    for (const b of active) {
      b.pos.x += b.vel.x * subDt;
      b.pos.z += b.vel.z * subDt;
      const spd = Math.hypot(b.vel.x, b.vel.z);

      // Apply spin effects (Follow/Draw)
      if (b.spin) {
        // Friction slowly converts spin into velocity or just dies
        const spinFriction = Math.pow(0.99, subDt * 60);

        if (spd > 0.1) {
          // Topspin (Follow) pushes forward, Backspin (Draw) pulls back
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

    // Cushion bounce
    for (const b of active) {
      let bounced = false;
      const sideSpinFactor = 0.45; // How much sidespin affects bounce angle

      if (b.pos.x < -HW) {
        b.pos.x = -HW;
        if (b.vel.x < 0) {
          b.vel.x = -b.vel.x * CUSH_COR;
          if (b.spin) b.vel.z += b.spin.x * Math.abs(b.vel.x) * sideSpinFactor;
          bounced = true;
        }
      }
      if (b.pos.x >  HW) {
        b.pos.x =  HW;
        if (b.vel.x > 0) {
          b.vel.x = -b.vel.x * CUSH_COR;
          if (b.spin) b.vel.z -= b.spin.x * Math.abs(b.vel.x) * sideSpinFactor;
          bounced = true;
        }
      }
      if (b.pos.z < -HL) {
        b.pos.z = -HL;
        if (b.vel.z < 0) {
          b.vel.z = -b.vel.z * CUSH_COR;
          if (b.spin) b.vel.x -= b.spin.x * Math.abs(b.vel.z) * sideSpinFactor;
          bounced = true;
        }
      }
      if (b.pos.z >  HL) {
        b.pos.z =  HL;
        if (b.vel.z > 0) {
          b.vel.z = -b.vel.z * CUSH_COR;
          if (b.spin) b.vel.x += b.spin.x * Math.abs(b.vel.z) * sideSpinFactor;
          bounced = true;
        }
      }
      if (bounced && onCushion) onCushion(b.number, b.pos.x, b.pos.z);
    }

    // Ball-ball collisions
    for (let i = 0; i < active.length - 1; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i], b2 = active[j];
        const dx = b2.pos.x - a.pos.x;
        const dz = b2.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = BALL_R * 2;
        if (d < minD && d > 0.001) {
          // First contact callback (for foul detection)
          if (a.number === 0 && !b2.firstContactGiven) {
            b2.firstContactGiven = true;
            onFirstContact(0, b2.number);
          } else if (b2.number === 0 && !a.firstContactGiven) {
            a.firstContactGiven = true;
            onFirstContact(0, a.number);
          }

          const nx = dx / d, nz = dz / d;
          const overlap = minD - d;
          a.pos.x -= nx * overlap * 0.5;
          a.pos.z -= nz * overlap * 0.5;
          b2.pos.x += nx * overlap * 0.5;
          b2.pos.z += nz * overlap * 0.5;

          const dvx = b2.vel.x - a.vel.x;
          const dvz = b2.vel.z - a.vel.z;
          const dot = dvx * nx + dvz * nz;
          if (dot < 0) {
            const imp = dot * BALL_COR;
            a.vel.x += imp * nx; a.vel.z += imp * nz;
            b2.vel.x -= imp * nx; b2.vel.z -= imp * nz;

            // Collision-induced spin reaction (English/Follow/Draw)
            // If it's the cue ball, spin affects the direction after hit
            if (a.number === 0 && a.spin) {
              const spd = Math.hypot(a.vel.x, a.vel.z);
              if (spd > 0.5) {
                const reactionFactor = 0.8;
                // Backspin (z < 0) pulls back, Topspin (z > 0) pushes forward
                a.vel.x += (a.vel.x / spd) * a.spin.z * reactionFactor;
                a.vel.z += (a.vel.z / spd) * a.spin.z * reactionFactor;
              }
            } else if (b2.number === 0 && b2.spin) {
              const spd = Math.hypot(b2.vel.x, b2.vel.z);
              if (spd > 0.5) {
                const reactionFactor = 0.8;
                b2.vel.x += (b2.vel.x / spd) * b2.spin.z * reactionFactor;
                b2.vel.z += (b2.vel.z / spd) * b2.spin.z * reactionFactor;
              }
            }

            if (!collisionSounded && onBallCollision) {
              collisionSounded = true;
              onBallCollision(Math.abs(dot));
            }
          }
        }
      }
    }

    // Pocket detection
    for (const b of active) {
      for (const p of POCKETS) {
        const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
        if (d < p.r) {
          b.isPotted = true;
          b.vel = { x: 0, z: 0 };
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
