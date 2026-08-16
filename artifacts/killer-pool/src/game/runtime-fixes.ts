import * as THREE from 'three';
import { GameEngine } from './engine';

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
      this.__kenyanPoolBallInHandDirty = false;
      this.phase = 'aiming';
      this.power = 0;
      this.isPowering = false;
      this.currentSpin = { x: 0, z: 0 };
      this.updateCursor?.(false);
      const mesh = this.ballMeshes?.get?.(0);
      if (mesh) { mesh.visible = true; mesh.position.set(cue.pos.x, 2.86, cue.pos.z); }
      this.emitHUD?.();
    }
    return result;
  };
  proto.__kenyanPoolStartGamePatched = true;
}

// The original guest implementation intentionally refused to leave its local
// simulation when Firebase announced that the authoritative host had finished
// the shot. That left the guest in `simulating` until the 20s safety timeout,
// which is why the next player never received a cue. A server phase/turn change
// is authoritative: reset the local shot state immediately and enter the new
// turn.
const originalSyncState = proto.syncStateFromServer;
if (!proto.__kenyanPoolTurnSyncPatched) {
  proto.syncStateFromServer = function (state: any) {
    const previousPhase = this.phase;
    const previousPlayerIndex = this.currentPlayerIndex;
    const result = originalSyncState.call(this, state);
    const serverPlayer = state?.players?.[state.currentPlayerIndex];
    const turnChanged = previousPlayerIndex !== state?.currentPlayerIndex;
    const serverTurnPhase = state?.phase === 'aiming' || state?.phase === 'powering';
    const authoritativeHandoff = serverTurnPhase && (
      previousPhase === 'simulating' ||
      previousPhase === 'evaluating' ||
      turnChanged
    );

    if (authoritativeHandoff) {
      this.phase = state.phase;
      this.isPowering = false;
      this.evaluating = false;
      this.shotExecuted = false;
      this.simFrames = 0;
      this.physicsAccumulator = 0;
      this.power = Number(state.power) || 0;
      this.aimAngle = Number(state.aimAngle) || 0;
      this.currentSpin = { x: Number(state.spin?.x) || 0, z: Number(state.spin?.z) || 0 };
      this.isLocalTurn = !!(serverPlayer && serverPlayer.uid === this.localUid);
      this.ballInHand = !!state.ballInHand;
      this.__kenyanPoolBallInHandDirty = false;
      this.updateCursor?.(false);

      const cue = this.balls?.find((b: any) => b.number === 0);
      if (cue && this.ballInHand) {
        cue.vel = { x: 0, z: 0 };
        cue.isPotted = false;
        const mesh = this.ballMeshes?.get?.(0);
        if (mesh) {
          mesh.visible = true;
          mesh.position.set(cue.pos.x, 2.86, cue.pos.z);
        }
      }

      if (this.isLocalTurn) this.setCam?.('overhead', true);
      else this.setCam?.('cinematic', true);
      this.emitHUD?.();
    }

    return result;
  };
  proto.__kenyanPoolTurnSyncPatched = true;
}

// Publish ball-in-hand in the authoritative HUD snapshot so a guest can enter
// the same placement state without guessing from a stale cue-ball position.
const originalGetHUDState = proto.getHUDState;
if (!proto.__kenyanPoolBallInHandHudPatched) {
  proto.getHUDState = function (...args: any[]) {
    const state = originalGetHUDState.apply(this, args);
    state.ballInHand = !!this.ballInHand;
    return state;
  };
  proto.__kenyanPoolBallInHandHudPatched = true;
}

// Keep the final local ball-in-hand position authoritative until the shot is
// actually fired. This prevents a slower snapshot from putting the cue ball
// back at its old position after the player drops it.
const originalEmitHUD = proto.emitHUD;
if (!proto.__kenyanPoolBallInHandEmitPatched) {
  proto.emitHUD = function (...args: any[]) {
    const current = this.players?.[this.currentPlayerIndex];
    if (this.isDragging && this.ballInHand && current?.uid === this.localUid) {
      this.__kenyanPoolBallInHandDirty = true;
    }
    if (this.phase === 'simulating' || this.phase === 'evaluating') {
      this.__kenyanPoolBallInHandDirty = false;
    }
    return originalEmitHUD.apply(this, args);
  };
  proto.__kenyanPoolBallInHandEmitPatched = true;
}

const originalSetSpin = proto.setSpin;
if (!proto.__kenyanPoolSpinPatched) {
  proto.setSpin = function (x: number, z: number) {
    const max = 0.9;
    let sx = Number.isFinite(x) ? x : 0;
    let sz = Number.isFinite(z) ? z : 0;
    const mag = Math.hypot(sx, sz);
    if (mag > max) { sx = (sx / mag) * max; sz = (sz / mag) * max; }
    sx *= 0.55;
    sz *= 0.80;
    originalSetSpin.call(this, sx, sz);
  };
  proto.__kenyanPoolSpinPatched = true;
}

const originalExecuteShot = proto.executeShot;
if (!proto.__kenyanPoolExecutePatched) {
  proto.executeShot = function (isRemote = false) {
    this.__kenyanPoolBallInHandDirty = false;
    const result = originalExecuteShot.call(this, isRemote);
    const cue = this.balls?.find((b: any) => b.number === 0);
    if (cue && !cue.isPotted) {
      const speed = Math.hypot(cue.vel?.x || 0, cue.vel?.z || 0);
      if (speed > 0) cue.vel = { x: Math.sin(this.aimAngle) * speed, z: Math.cos(this.aimAngle) * speed };
    }
    return result;
  };
  proto.__kenyanPoolExecutePatched = true;
}

const originalSyncAim = proto.syncAimFromServer;
if (!proto.__kenyanPoolAimSyncPatched) {
  proto.syncAimFromServer = function (aim: any) {
    const current = this.players?.[this.currentPlayerIndex];
    if (aim?.uid && current?.uid && aim.uid !== current.uid) return;
    const result = originalSyncAim.call(this, aim);
    const pos = aim?.spin?.pos ?? aim?.pos;
    if (pos && current && current.uid !== this.localUid && this.phase === 'aiming') {
      const cue = this.balls?.find((b: any) => b.number === 0);
      if (cue) {
        cue.pos = { x: pos.x, z: pos.z };
        cue.vel = { x: 0, z: 0 };
        cue.isPotted = false;
        this.ballInHand = true;
        const mesh = this.ballMeshes?.get?.(0);
        if (mesh) { mesh.visible = true; mesh.position.set(cue.pos.x, 2.86, cue.pos.z); }
      }
    }
    return result;
  };
  proto.__kenyanPoolAimSyncPatched = true;
}

const originalSyncBalls = proto.syncBallsFromServer;
if (!proto.__kenyanPoolBallSyncPatched) {
  proto.syncBallsFromServer = function (serverBalls: any[]) {
    const current = this.players?.[this.currentPlayerIndex];
    const preserveLocalCue = !!(
      Array.isArray(serverBalls) &&
      this.phase === 'aiming' &&
      this.ballInHand &&
      this.__kenyanPoolBallInHandDirty &&
      current?.uid === this.localUid
    );
    if (preserveLocalCue) {
      return originalSyncBalls.call(this, serverBalls.filter((b: any) => b.number !== 0));
    }
    return originalSyncBalls.call(this, serverBalls);
  };
  proto.__kenyanPoolBallSyncPatched = true;
}

if (!proto.__kenyanPoolVisualPhysicsPatched) {
  proto.syncBallMeshes = function () {
    const now = performance.now();
    const previous = this.__kenyanPoolLastBallVisualTime ?? now;
    const dt = Math.min(0.05, Math.max(1 / 240, (now - previous) / 1000));
    this.__kenyanPoolLastBallVisualTime = now;
    const radius = 2.86;
    for (const b of this.balls || []) {
      const mesh = this.ballMeshes?.get?.(b.number);
      if (!mesh) continue;
      if (b.isPotted) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(b.pos.x, radius, b.pos.z);
      const speed = Math.hypot(b.vel.x, b.vel.z);
      if (speed > 0.01) {
        const rollAngle = (speed * dt) / radius;
        const axis = new THREE.Vector3(b.vel.z, 0, -b.vel.x);
        if (axis.lengthSq() > 0) { axis.normalize(); mesh.rotateOnWorldAxis(axis, rollAngle); }
      }
      const sideSpin = b.spin?.x || 0;
      if (Math.abs(sideSpin) > 0.005) mesh.rotation.y += sideSpin * dt * 0.8;
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
      /* Do NOT rotate, shrink or letterbox the game canvas. The Three.js
         camera remains portrait-oriented; only the pull-to-shoot control
         changes orientation in landscape. */
      #main-canvas { width: 100% !important; height: 100% !important; left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important; transform: none !important; }
      .mobile-power-wrap { position: fixed !important; right: max(10px, env(safe-area-inset-right)) !important; top: 50% !important; left: auto !important; bottom: auto !important; transform: translateY(-50%) rotate(90deg) !important; transform-origin: center !important; z-index: 2500 !important; width: 58px !important; height: min(72vh, 360px) !important; }
      .mobile-power-bar { height: 100% !important; width: 28px !important; }
      .mobile-power-label { writing-mode: horizontal-tb !important; transform: none !important; white-space: nowrap !important; }
    }
    @media (orientation: portrait) and (max-width: 900px) {
      #main-canvas { transform: none !important; left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; }
      .mobile-power-wrap { position: fixed !important; z-index: 2500 !important; transform: translateY(-50%) !important; }
    }
  `;
  document.head.appendChild(style);
}

if (typeof window !== 'undefined') {
  const notifyViewport = () => window.dispatchEvent(new Event('resize'));
  window.addEventListener('orientationchange', notifyViewport, { passive: true });
}
