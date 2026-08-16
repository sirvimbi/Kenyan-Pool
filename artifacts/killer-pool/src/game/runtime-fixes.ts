import { GameEngine } from './engine';

/**
 * Runtime hardening for the browser client.
 *
 * Kept separate from the large Three.js engine so the gameplay fixes are easy
 * to review and do not disturb the deterministic physics implementation.
 */
const proto = GameEngine.prototype as any;

const originalStartGame = proto.startGame;
if (!proto.__kenyanPoolStartGamePatched) {
  proto.startGame = function (...args: any[]) {
    const result = originalStartGame.apply(this, args);
    const cue = this.balls?.find((b: any) => b.number === 0);
    const player = this.players?.[this.currentPlayerIndex];
    if (cue && player && !this.gameOver) {
      cue.isPotted = false;
      cue.vel = { x: 0, z: 0 };
      this.ballInHand = true;
      this.isDragging = false;
      this.phase = 'aiming';
      this.power = 0;
      this.isPowering = false;
      this.currentSpin = { x: 0, z: 0 };
      this.updateCursor?.(false);
      const mesh = this.ballMeshes?.get?.(0);
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(cue.pos.x, 2.86, cue.pos.z);
      }
      this.emitHUD?.();
    }
    return result;
  };
  proto.__kenyanPoolStartGamePatched = true;
}

const originalSetSpin = proto.setSpin;
if (!proto.__kenyanPoolSpinPatched) {
  proto.setSpin = function (x: number, z: number) {
    const max = 0.9;
    let sx = Number.isFinite(x) ? x : 0;
    let sz = Number.isFinite(z) ? z : 0;
    const mag = Math.hypot(sx, sz);
    if (mag > max) {
      sx = (sx / mag) * max;
      sz = (sz / mag) * max;
    }
    sx *= 0.55;
    sz *= 0.80;
    originalSetSpin.call(this, sx, sz);
  };
  proto.__kenyanPoolSpinPatched = true;
}

const originalExecuteShot = proto.executeShot;
if (!proto.__kenyanPoolExecutePatched) {
  proto.executeShot = function (isRemote = false) {
    if (this.currentSpin) {
      this.currentSpin = { x: this.currentSpin.x * 0.45, z: this.currentSpin.z };
    }
    return originalExecuteShot.call(this, isRemote);
  };
  proto.__kenyanPoolExecutePatched = true;
}

const originalSyncAim = proto.syncAimFromServer;
if (!proto.__kenyanPoolAimSyncPatched) {
  proto.syncAimFromServer = function (aim: any) {
    const result = originalSyncAim.call(this, aim);
    if (aim?.pos) {
      const current = this.players?.[this.currentPlayerIndex];
      if (current && current.uid !== this.localUid && this.phase === 'aiming') {
        const cue = this.balls?.find((b: any) => b.number === 0);
        if (cue) {
          cue.pos = { x: aim.pos.x, z: aim.pos.z };
          cue.vel = { x: 0, z: 0 };
          cue.isPotted = false;
          this.ballInHand = true;
          const mesh = this.ballMeshes?.get?.(0);
          if (mesh) {
            mesh.visible = true;
            mesh.position.set(cue.pos.x, 2.86, cue.pos.z);
          }
        }
      }
    }
    return result;
  };
  proto.__kenyanPoolAimSyncPatched = true;
}

const originalSyncBalls = proto.syncBallsFromServer;
if (!proto.__kenyanPoolBallSyncPatched) {
  proto.syncBallsFromServer = function (serverBalls: any[]) {
    if (Array.isArray(serverBalls) && this.phase === 'aiming') {
      const current = this.players?.[this.currentPlayerIndex];
      const cue = this.balls?.find((b: any) => b.number === 0);
      if (current && cue && this.ballInHand) {
        return originalSyncBalls.call(this, serverBalls.filter((b: any) => b.number !== 0));
      }
    }
    return originalSyncBalls.call(this, serverBalls);
  };
  proto.__kenyanPoolBallSyncPatched = true;
}

// Ball rolling is based on physical distance travelled rather than velocity per
// animation frame. The old implementation therefore looked roughly twice as
// fast on 120-Hz devices as on 60-Hz devices.
if (!proto.__kenyanPoolVisualPhysicsPatched) {
  proto.syncBallMeshes = function () {
    const now = performance.now();
    const previous = this.__kenyanPoolLastBallVisualTime ?? now;
    const dt = Math.min(0.05, Math.max(1 / 240, (now - previous) / 1000));
    this.__kenyanPoolLastBallVisualTime = now;

    for (const b of this.balls || []) {
      const mesh = this.ballMeshes?.get?.(b.number);
      if (!mesh) continue;
      if (b.isPotted) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      mesh.position.set(b.pos.x, 2.86, b.pos.z);

      const speed = Math.hypot(b.vel.x, b.vel.z);
      if (speed > 0.01) {
        const rollAngle = (speed * dt) / 2.86;
        const axis = mesh.position.clone().set(b.vel.z, 0, -b.vel.x);
        if (axis.lengthSq() > 0) {
          axis.normalize();
          mesh.rotateOnWorldAxis(axis, rollAngle);
        }
      }

      // Side English produces a small yaw component which decays in physics.
      const sideSpin = b.spin?.x || 0;
      if (Math.abs(sideSpin) > 0.005) {
        mesh.rotation.y += sideSpin * dt * 0.8;
      }
    }
  };
  proto.__kenyanPoolVisualPhysicsPatched = true;
}

if (typeof document !== 'undefined' && !document.getElementById('kenyan-pool-runtime-style')) {
  const style = document.createElement('style');
  style.id = 'kenyan-pool-runtime-style';
  style.textContent = `
    .mobile-power-wrap { touch-action: none; }
    @media (orientation: landscape) and (max-width: 900px) {
      .mobile-power-wrap {
        position: fixed !important;
        right: max(10px, env(safe-area-inset-right)) !important;
        top: 50% !important;
        left: auto !important;
        bottom: auto !important;
        transform: translateY(-50%) !important;
        z-index: 2500 !important;
        width: 58px !important;
        height: min(72vh, 360px) !important;
      }
      .mobile-power-bar { height: 100% !important; width: 28px !important; }
      .mobile-power-label {
        writing-mode: vertical-rl !important;
        transform: rotate(180deg) !important;
        white-space: nowrap !important;
      }
    }
    @media (orientation: portrait) and (max-width: 900px) {
      .mobile-power-wrap { position: fixed !important; z-index: 2500 !important; }
    }
  `;
  document.head.appendChild(style);
}

if (typeof window !== 'undefined') {
  const notifyViewport = () => window.dispatchEvent(new Event('resize'));
  window.addEventListener('orientationchange', notifyViewport, { passive: true });
}