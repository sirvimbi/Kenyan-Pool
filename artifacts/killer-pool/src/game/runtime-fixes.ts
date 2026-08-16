import { GameEngine } from './engine';

/**
 * Runtime hardening for the browser client.
 *
 * Kept separate from the large Three.js engine so the gameplay fixes are easy
 * to review and do not disturb the deterministic physics implementation.
 */
const proto = GameEngine.prototype as any;

// 1) Every fresh rack starts with cue-ball-in-hand. The player can place the
// cue ball anywhere inside the legal baulk box before the first shot.
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

// 2) Normalize English and make the response less exaggerated on devices
// where touch input can report slightly different pointer deltas.
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

    // Side English is deliberately gentler because the engine also models
    // squirt. This keeps the cue-ball launch close to the player's visible aim.
    sx *= 0.55;
    sz *= 0.80;
    originalSetSpin.call(this, sx, sz);
  };
  proto.__kenyanPoolSpinPatched = true;
}

// 3) Keep shot direction faithful to the displayed aim. The old implementation
// applied a relatively large instantaneous squirt correction, which could make
// a shot visibly leave the cue in a direction the player did not select.
const originalExecuteShot = proto.executeShot;
if (!proto.__kenyanPoolExecutePatched) {
  proto.executeShot = function (isRemote = false) {
    if (this.currentSpin) {
      this.currentSpin = {
        x: this.currentSpin.x * 0.45,
        z: this.currentSpin.z
      };
    }
    return originalExecuteShot.call(this, isRemote);
  };
  proto.__kenyanPoolExecutePatched = true;
}

// 4) A remote ball-in-hand placement is authoritative until the shot begins.
// This prevents a normal rack snapshot from moving the cue ball back to its
// old position between drag/drop and fire.
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
        const filtered = serverBalls.filter((b: any) => b.number !== 0);
        return originalSyncBalls.call(this, filtered);
      }
    }
    return originalSyncBalls.call(this, serverBalls);
  };
  proto.__kenyanPoolBallSyncPatched = true;
}

// 5) Landscape-safe mobile power meter. The component keeps its existing DOM
// and behavior; this only changes its placement when the viewport rotates.
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
      .mobile-power-bar {
        height: 100% !important;
        width: 28px !important;
      }
      .mobile-power-label {
        writing-mode: vertical-rl !important;
        transform: rotate(180deg) !important;
        white-space: nowrap !important;
      }
    }
    @media (orientation: portrait) and (max-width: 900px) {
      .mobile-power-wrap {
        position: fixed !important;
        z-index: 2500 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// Re-render layout after rotation even on browsers that do not emit a normal
// resize event immediately.
if (typeof window !== 'undefined') {
  const notifyViewport = () => window.dispatchEvent(new Event('resize'));
  window.addEventListener('orientationchange', notifyViewport, { passive: true });
}
