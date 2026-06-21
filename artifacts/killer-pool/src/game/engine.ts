import * as THREE from 'three';
import {
  BallState, PlayerConfig, PlayerState, Vec2, ShotResult, HUDState, GamePhase,
  TABLE_W, TABLE_L, BALL_R, CUSHION, CUSHION_POSITIONS, BALL_SEQUENCE, BALL_COLORS,
  BALL_VALUES, STARTING_BALANCE, TURN_DURATION, HW, HL
} from './types';
import { stepPhysics, allStopped, shotVelocity } from './physics';
import { sound } from './sound';
import {
  createPlayers, getNextTarget, evaluateShot, applyResult,
  updateBench, getWinners, calcPayout
} from './rules';
import { computeAIShot } from './ai';

const CUE_LEN   = 145;
const CUE_TILT  = 0.16; // ≈9° butt-up tilt so the stick clears the rails
const TABLE_TH  = 8;   // table frame thickness (top)
const LEG_H     = 78;  // legs drop below Y=0

type EventHandler = (data?: unknown) => void;

// ─────────────────────────────────────────────
//  Ball texture generator
// ─────────────────────────────────────────────
function makeBallTexture(num: number): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const isStripe = num >= 9;
  const col = BALL_COLORS[num] || '#ffffff';

  // Base
  if (num === 0) {
    ctx.fillStyle = '#F0EEE8';
    ctx.fillRect(0, 0, W, H);
    // subtle ivory gradient
    const g = ctx.createRadialGradient(W*0.4, H*0.35, 0, W/2, H/2, W/2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(200,195,180,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (isStripe) {
    ctx.fillStyle = '#F0EEE8'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col;
    ctx.fillRect(0, H*0.27, W, H*0.46);
    // Edge fade
    const gTop = ctx.createLinearGradient(0, H*0.27, 0, H*0.37);
    gTop.addColorStop(0, 'rgba(255,255,255,0.6)');
    gTop.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gTop; ctx.fillRect(0, H*0.27, W, H*0.1);
    const gBot = ctx.createLinearGradient(0, H*0.63, 0, H*0.73);
    gBot.addColorStop(0, 'rgba(255,255,255,0)');
    gBot.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.fillStyle = gBot; ctx.fillRect(0, H*0.63, W, H*0.1);
  } else {
    ctx.fillStyle = col; ctx.fillRect(0, 0, W, H);
    // subtle gradient to add depth
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Number circles
  if (num > 0) {
    for (const cx of [W * 0.25, W * 0.75]) {
      ctx.beginPath();
      ctx.arc(cx, H / 2, W * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = `bold ${Math.round(W * 0.14)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), cx, H / 2 + 2);
    }
  }

  // Gloss highlight
  const gloss = ctx.createRadialGradient(W*0.38, H*0.32, 0, W*0.38, H*0.32, W*0.28);
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
  gloss.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────────────────────────────────────
//  Wood + felt texture generators
// ─────────────────────────────────────────────
function makeWoodTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3A1F0A'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    const x = (i / 60) * W + (Math.random()-0.5)*6;
    ctx.strokeStyle = `rgba(${50+Math.random()*30},${25+Math.random()*15},${5+Math.random()*5},0.3)`;
    ctx.lineWidth = 2 + Math.random() * 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random()-0.5)*20, H); ctx.stroke();
  }
  const g = ctx.createLinearGradient(0,0,W,0);
  g.addColorStop(0,'rgba(80,40,10,0.2)'); g.addColorStop(0.5,'rgba(255,200,100,0.08)'); g.addColorStop(1,'rgba(0,0,0,0.3)');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3,1);
  return t;
}

function makeFeltTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1A7238'; ctx.fillRect(0,0,W,H);
  // Fine felt weave
  for (let i=0; i<4000; i++) {
    const bright = Math.random() > 0.5;
    ctx.fillStyle = bright
      ? `rgba(80,180,100,${0.06+Math.random()*0.08})`
      : `rgba(5,30,15,${0.05+Math.random()*0.07})`;
    ctx.fillRect(Math.random()*W, Math.random()*H, 1+Math.random(), 1+Math.random());
  }
  // Subtle directional sheen
  const g = ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,'rgba(255,255,255,0.06)');
  g.addColorStop(0.5,'rgba(255,255,255,0.0)');
  g.addColorStop(1,'rgba(0,0,0,0.1)');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,8);
  return t;
}

function makeFloorTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1C1008'; ctx.fillRect(0,0,W,H);
  const cols = 8, rows = 16;
  const tw = W/cols, th = H/rows;
  for (let r=0; r<rows; r++) {
    for (let col=0; col<cols; col++) {
      const even = (r+col)%2===0;
      const x = col*tw, y = r*th;
      ctx.fillStyle = even ? '#231508' : '#1A100A';
      ctx.fillRect(x+1, y+1, tw-2, th-2);
      ctx.strokeStyle = 'rgba(100,60,20,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x+1, y+1, tw-2, th-2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6,6);
  return t;
}

function makeSkylineTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  // Night sky gradient
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#050215'); sky.addColorStop(0.6,'#0D0520'); sky.addColorStop(1,'#1A0A30');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);
  // Stars
  for (let i=0;i<200;i++) {
    const sz = Math.random()*1.5;
    ctx.fillStyle = `rgba(255,255,255,${0.3+Math.random()*0.7})`;
    ctx.fillRect(Math.random()*W, Math.random()*H*0.6, sz, sz);
  }
  // Buildings silhouette
  const buildings: {x:number,w:number,h:number,windows:{x:number,y:number,lit:boolean}[]}[] = [];
  let bx = 0;
  while (bx < W) {
    const bw = 30 + Math.random()*60;
    const bh = 60 + Math.random()*(H*0.55);
    const wins: {x:number,y:number,lit:boolean}[] = [];
    for (let wy=H-bh+5; wy<H-8; wy+=14) {
      for (let wx=bx+4; wx<bx+bw-4; wx+=10) {
        wins.push({x:wx, y:wy, lit: Math.random()<0.6});
      }
    }
    buildings.push({x:bx, w:bw, h:bh, windows:wins});
    bx += bw + Math.random()*8;
  }
  for (const b of buildings) {
    ctx.fillStyle = '#080415';
    ctx.fillRect(b.x, H-b.h, b.w, b.h);
    for (const w of b.windows) {
      if (w.lit) {
        ctx.fillStyle = Math.random()>0.7
          ? `rgba(255,${160+Math.random()*80},0,${0.7+Math.random()*0.3})`
          : `rgba(200,210,255,${0.5+Math.random()*0.5})`;
        ctx.fillRect(w.x, w.y, 6, 8);
      }
    }
  }
  // Neon reflections on glass
  const neonCols = ['rgba(0,255,100,0.08)','rgba(255,50,150,0.08)','rgba(0,150,255,0.06)'];
  for (const nc of neonCols) {
    ctx.fillStyle = nc;
    ctx.fillRect(0, H*0.85, W, H*0.15);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─────────────────────────────────────────────
//  GameEngine class
// ─────────────────────────────────────────────
export class GameEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private canvas!: HTMLCanvasElement;
  private raycaster = new THREE.Raycaster();
  private tablePlane = new THREE.Plane(new THREE.Vector3(0,1,0), -BALL_R);

  private ballMeshes = new Map<number, THREE.Mesh>();
  private cueGroup!: THREE.Group;
  private cueHolder!: THREE.Group;
  private cueMesh!: THREE.Mesh;
  private cueGhostLine!: THREE.Line;
  private tableGroup!: THREE.Group;

  private balls: BallState[] = [];
  private players: PlayerState[] = [];
  private currentPlayerIndex = 0;
  private targetBall = 3;
  private phase: GamePhase = 'aiming';
  private timeLeft = TURN_DURATION;
  private lastTimerTick = 0;
  private prizePool = 0;
  private stake = 100;

  private aimAngle = 0;   // radians, in XZ plane
  private power = 0;
  private isPowering = false;
  private powerStart = 0;
  private mousePos = new THREE.Vector2();

  private firstHit: number | null = null;
  private pottedInShot: number[] = [];
  private cuePottedInShot = false;
  private shotResult: ShotResult | null = null;

  private camMode: 'overhead'|'cinematic'|'aim' = 'overhead';
  private camTargetPos = new THREE.Vector3();
  private camTargetLook = new THREE.Vector3();

  private rafId = 0;
  private lastTime = 0;

  private events = new Map<string, EventHandler[]>();
  private aiThinkTimeout: ReturnType<typeof setTimeout> | null = null;
  private evalTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── init ──
  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const w = canvas.clientWidth, h = canvas.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference:'high-performance' });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;           // shadows off — diffused table lighting
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 2.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060410);
    this.scene.fog = new THREE.FogExp2(0x060410, 0.0012);

    this.camera = new THREE.PerspectiveCamera(58, w/h, 0.5, 4000);
    this.camera.position.set(0, 280, 90);
    this.camera.lookAt(0, 0, 0);

    this.setupLights();
    this.buildRoom();
    this.buildTable();

    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup',   this.onMouseUp);
    window.addEventListener('resize',    this.onResize);

    this.gameLoop(0);
  }

  startGame(configs: PlayerConfig[], stake: number) {
    this.stake = stake;
    this.prizePool = Math.floor(stake * configs.length * 0.9);
    this.players = createPlayers(configs, stake);
    this.currentPlayerIndex = 0;
    this.targetBall = 3;
    this.phase = 'aiming';
    this.timeLeft = TURN_DURATION;
    this.lastTimerTick = performance.now();
    this.shotResult = null;

    // Reset balls
    this.balls = [
      { number: 0, pos: { x: 0, z: -47 }, vel: { x:0, z:0 }, isPotted: false }
    ];
    for (const n of BALL_SEQUENCE) {
      const [x, z] = CUSHION_POSITIONS[n];
      this.balls.push({ number: n, pos: { x, z }, vel: { x:0, z:0 }, isPotted: false });
    }

    this.buildBalls();
    this.buildCue();
    this.setCam('overhead', true);
    this.emitHUD();
  }

  // ── scene building ──
  private setupLights() {
    // Ambient — visible but not blinding
    const amb = new THREE.AmbientLight(0xC8B8FF, 1.8);
    this.scene.add(amb);

    // Hemisphere fill
    const hemi = new THREE.HemisphereLight(0xD0C0FF, 0x282030, 1.4);
    this.scene.add(hemi);

    // ── Table fill lights — NO shadows, diffused grid ────────────────────
    const TABLE_FILL_Y = 160;
    const tableFillPositions: [number, number, number][] = [
      [  0,  TABLE_FILL_Y,   0],
      [-45,  TABLE_FILL_Y, -55],
      [ 45,  TABLE_FILL_Y, -55],
      [-45,  TABLE_FILL_Y,  55],
      [ 45,  TABLE_FILL_Y,  55],
    ];
    for (const [x, y, z] of tableFillPositions) {
      const pl = new THREE.PointLight(0xFFEEDD, 280, 340, 1.0);
      pl.position.set(x, y, z);
      this.scene.add(pl);
    }

    // 2 overhead SpotLights matching the hanging LED bar fixtures (no shadows)
    for (const lx of [-46, 46]) {
      const spot = new THREE.SpotLight(0xFFEDD0, 420, 550, Math.PI / 5, 0.28, 0.9);
      spot.position.set(lx, 200, 0);
      spot.target.position.set(lx, 0, 0);
      this.scene.add(spot, spot.target);
    }

    // ── Purple / Magenta LED cove strip lights along ceiling edges ────────
    const EDGE = 390;
    const NEON_Y = 295;
    const coveStrips: [number, number, number, number, number][] = [
      [0xBB00FF,    0, NEON_Y, -EDGE,   10],
      [0xFF00BB,    0, NEON_Y,  EDGE,   10],
      [0xCC00EE, -EDGE, NEON_Y,    0,    8],
      [0xFF00CC,  EDGE, NEON_Y,    0,    8],
      [0xDD00DD, -EDGE*0.65, NEON_Y, -EDGE*0.65, 4],
      [0xDD00DD,  EDGE*0.65, NEON_Y, -EDGE*0.65, 4],
      [0xDD00DD, -EDGE*0.65, NEON_Y,  EDGE*0.65, 4],
      [0xDD00DD,  EDGE*0.65, NEON_Y,  EDGE*0.65, 4],
    ];
    for (const [color, x, y, z, intensity] of coveStrips) {
      const pl = new THREE.PointLight(color, intensity, 600, 1.4);
      pl.position.set(x, y, z);
      this.scene.add(pl);
    }

    // Neon sign accent lights
    const signFills: [number, number, number, number, number][] = [
      [0x00FF88, -280, 80, -200, 5],
      [0xFF2090,  280, 80, -200, 5],
      [0x4488FF,    0, 60,  260, 3],
    ];
    for (const [color, x, y, z, intensity] of signFills) {
      const pl = new THREE.PointLight(color, intensity, 350, 1.5);
      pl.position.set(x, y, z);
      this.scene.add(pl);
    }
  }

  private buildRoom() {
    const room = new THREE.Group();
    const ROOM   = 420;
    const CEIL_Y = 310;
    const FLOOR_Y = -(LEG_H + TABLE_TH);
    const WALL_H = CEIL_Y - FLOOR_Y;

    // ── Floor ────────────────────────────────────────────────
    const floorTex = makeFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM*2.2, ROOM*2.2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.88, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI/2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    room.add(floor);

    // ── Ceiling — very dark ───────────────────────────────────
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM*2.2, ROOM*2.2),
      new THREE.MeshStandardMaterial({ color: 0x050308, roughness: 1 })
    );
    ceiling.rotation.x = Math.PI/2;
    ceiling.position.y = CEIL_Y;
    room.add(ceiling);

    // ── Walls: two-tone — warm amber lower + very dark upper ──
    const wallDefs = [
      { pos: [    0, 0, -ROOM], ry: 0 },           // North
      { pos: [    0, 0,  ROOM], ry: Math.PI },     // South
      { pos: [-ROOM, 0,     0], ry:  Math.PI/2 },  // West
      { pos: [ ROOM, 0,     0], ry: -Math.PI/2 },  // East
    ];
    for (const { pos, ry } of wallDefs) {
      const midY = FLOOR_Y + WALL_H * 0.5;
      // Lower warm panel (like image 1 — amber/brown under neon strip)
      const lower = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM*2.1, WALL_H * 0.52),
        new THREE.MeshStandardMaterial({ color: 0x1C0D06, roughness: 0.9 })
      );
      lower.rotation.y = ry;
      lower.position.set(pos[0], FLOOR_Y + WALL_H * 0.26, pos[2]);
      room.add(lower);

      // Upper dark panel
      const upper = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM*2.1, WALL_H * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x08060F, roughness: 0.95 })
      );
      upper.rotation.y = ry;
      upper.position.set(pos[0], midY + WALL_H * 0.26, pos[2]);
      room.add(upper);
    }

    // ── LED Cove Strips (emissive meshes) — ref image 1 signature ──
    // Continuous bright purple/magenta strip at all 4 ceiling edges
    const ledPurple  = new THREE.MeshBasicMaterial({ color: 0xCC00FF });
    const ledMagenta = new THREE.MeshBasicMaterial({ color: 0xFF00CC });
    const STRIP_T = 4, STRIP_D = 9;
    const cy = CEIL_Y - STRIP_T * 0.5 - 1;

    // N wall (purple)
    const stripN = new THREE.Mesh(new THREE.BoxGeometry(ROOM*2-10, STRIP_T, STRIP_D), ledPurple);
    stripN.position.set(0, cy, -(ROOM - STRIP_D*0.5));
    room.add(stripN);
    // S wall (magenta)
    const stripS = new THREE.Mesh(new THREE.BoxGeometry(ROOM*2-10, STRIP_T, STRIP_D), ledMagenta);
    stripS.position.set(0, cy, ROOM - STRIP_D*0.5);
    room.add(stripS);
    // W wall (purple)
    const stripW = new THREE.Mesh(new THREE.BoxGeometry(STRIP_D, STRIP_T, ROOM*2-10), ledPurple);
    stripW.position.set(-(ROOM - STRIP_D*0.5), cy, 0);
    room.add(stripW);
    // E wall (magenta)
    const stripE = new THREE.Mesh(new THREE.BoxGeometry(STRIP_D, STRIP_T, ROOM*2-10), ledMagenta);
    stripE.position.set(ROOM - STRIP_D*0.5, cy, 0);
    room.add(stripE);

    // ── Hanging LED bar fixtures above the table (warm white linear) ──
    const warmWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFF0D8 });
    const metalBlack = new THREE.MeshStandardMaterial({ color:0x0E0E0E, roughness:0.4, metalness:0.9 });
    for (const lx of [-46, 46]) {
      // Housing
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(10, 7, TABLE_L * 0.82),
        metalBlack
      );
      housing.position.set(lx, CEIL_Y - 45, 0);
      room.add(housing);
      // Glowing diffuser panel
      const diffuser = new THREE.Mesh(
        new THREE.BoxGeometry(8, 2, TABLE_L * 0.80),
        warmWhiteMat
      );
      diffuser.position.set(lx, CEIL_Y - 49, 0);
      room.add(diffuser);
      // Thin hanging rod
      const rodH = CEIL_Y - (CEIL_Y - 45) - 3.5;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, rodH, 5),
        metalBlack
      );
      rod.position.set(lx, CEIL_Y - rodH * 0.5, 0);
      room.add(rod);
    }

    // ── Nairobi skyline window on north wall ──────────────────
    const skyTex = makeSkylineTexture();
    const window3d = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 160),
      new THREE.MeshBasicMaterial({ map: skyTex })
    );
    window3d.position.set(0, FLOOR_Y + WALL_H * 0.55, -ROOM + 1);
    room.add(window3d);

    const frameMat = new THREE.MeshStandardMaterial({ color:0x0D0D0D, roughness:0.4, metalness:0.6 });
    const fH = new THREE.Mesh(new THREE.BoxGeometry(340, 5, 3), frameMat);
    fH.position.set(0, FLOOR_Y + WALL_H*0.55 + 82, -ROOM+1); room.add(fH);
    const fH2 = fH.clone(); fH2.position.y -= 164; room.add(fH2);
    const fV = new THREE.Mesh(new THREE.BoxGeometry(5, 165, 3), frameMat);
    fV.position.set(-170, FLOOR_Y + WALL_H*0.55, -ROOM+1); room.add(fV);
    const fV2 = fV.clone(); fV2.position.x = 170; room.add(fV2);

    // ── Neon signs ────────────────────────────────────────────
    this.addNeonSign(room, 'KILLER POOL',   -165, FLOOR_Y + WALL_H*0.82, -ROOM+2, 0x00FF88, 1.2);
    this.addNeonSign(room, 'NAIROBI NIGHTS', 155, FLOOR_Y + WALL_H*0.78, -ROOM+2, 0xFF2090, 0.9);
    this.addNeonSign(room, 'BILLIARDS',      -ROOM+2, FLOOR_Y+WALL_H*0.42, 0, 0x44AAFF, 1.0, Math.PI/2);

    // ── Bar counter + stools (south wall) ─────────────────────
    const barY = FLOOR_Y + 56;
    const barTop = new THREE.Mesh(
      new THREE.BoxGeometry(320, 6, 55),
      new THREE.MeshStandardMaterial({ color:0x140804, roughness:0.3, metalness:0.15 })
    );
    barTop.position.set(0, barY, ROOM - 58);
    room.add(barTop);
    const barFront = new THREE.Mesh(
      new THREE.BoxGeometry(320, 60, 8),
      new THREE.MeshStandardMaterial({ color:0x0C0502, roughness:0.7 })
    );
    barFront.position.set(0, barY - 33, ROOM - 35);
    room.add(barFront);

    for (let sx = -2; sx <= 2; sx++) {
      const stool = new THREE.Group();
      const seat = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 9, 3, 14),
        new THREE.MeshStandardMaterial({ color:0x1A0808, roughness:0.4 })
      );
      seat.position.y = 3; stool.add(seat);
      const sLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 46, 8),
        new THREE.MeshStandardMaterial({ color:0x0E0E0E, roughness:0.3, metalness:0.85 })
      );
      sLeg.position.y = -20; stool.add(sLeg);
      stool.position.set(sx * 62, barY - 20, ROOM - 65);
      room.add(stool);
    }

    this.scene.add(room);
  }

  private addNeonSign(
    parent: THREE.Group, text: string,
    x: number, y: number, z: number,
    color: number, scale = 1, rotY = 0
  ) {
    const W = Math.max(120, text.length * 18) * scale;
    const H = 28 * scale;
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'transparent';
    ctx.clearRect(0,0,1024,128);
    const hex = '#'+color.toString(16).padStart(6,'0');
    ctx.shadowColor = hex;
    ctx.shadowBlur = 20;
    ctx.fillStyle = hex;
    ctx.font = `bold ${70*scale}px 'Bebas Neue', Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    mesh.position.set(x, y, z);
    if (rotY) mesh.rotation.y = rotY;
    parent.add(mesh);
  }

  private buildTable() {
    this.tableGroup = new THREE.Group();
    const woodTex = makeWoodTexture();
    const feltTex = makeFeltTexture();

    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex, roughness: 0.35, metalness: 0.08, color: 0x0D0808
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltTex, roughness: 0.88, metalness: 0.0, color: 0x1A7238,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // DoubleSide so extruded cheek pieces are visible from all angles
    const cushMat = new THREE.MeshStandardMaterial({
      color: 0x165028, roughness: 0.82, side: THREE.DoubleSide
    });

    // ── Playing surface ───────────────────────────────────────────
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_L), feltMat);
    surf.rotation.x = -Math.PI/2;
    surf.receiveShadow = true;
    this.tableGroup.add(surf);

    // ── Cushion geometry constants ────────────────────────────────
    const CD = CUSHION;                              // cushion depth = 5 cm
    const CH = BALL_R * 1.82;                        // cushion height ≈ 5.2 cm (1⅞" + cloth)
    const CY = CH / 2;                               // Y-centre for box geometry

    // Pocket geometry (WPA 7-ft specs):
    //   Side pocket 104° cut: each face at (180-104)/2 = 38° from ⊥ → taper = CD·tan38° ≈ 3.9 cm
    //   Corner pocket   angled chamfer facings pulled back behind the pocket hole
    const SH  = 6.9;                                 // side pocket half-mouth (> side pocket radius so the nose clears the hole)
    const CC  = 6.5;                                 // corner clearance (> corner pocket radius so noses clear the hole)
    const ST  = CD * Math.tan(38 * Math.PI / 180);  // side taper depth ≈ 3.9 cm
    const SE  = SH + ST;                             // side box-segment end (leaves room for the chamfer)

    // Helper: extrude an angled chamfer triangle upward by CH.
    // Points are given as 3D [x, z]; shape uses shapeY = −(3D z).
    const addChamfer = (pts: [number, number][], mat: THREE.Material) => {
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: CH, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.tableGroup.add(new THREE.Mesh(geo, mat));
    };

    // ── Long rails (left x = −TW/2 ± CD, right x = +TW/2 ± CD) ─
    for (const side of [-1, 1] as const) {
      const IX = side * TABLE_W / 2;           // inner face X
      const OX = side * (TABLE_W / 2 + CD);    // outer face X

      // Straight segments: from corner-clearance to side-pocket chamfer.
      const cornerZ  = TABLE_L / 2 - CC;       // long rail ends here (corner clearance)
      const segLen   = cornerZ - SE;            // segment length
      const segMidZ  = (cornerZ + SE) / 2;
      const segMidX  = IX + side * CD / 2;

      for (const zSign of [-1, 1] as const) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(CD, CH, segLen), cushMat);
        seg.position.set(segMidX, CY, zSign * segMidZ);
        this.tableGroup.add(seg);
      }

      // ── Side pocket angled chamfers (one each side of the pocket gap) ──
      // Nose at (IX, ±SH) sits at the mouth; the facing angles back to the box end
      // at (OX, ±SE), opening a funnel toward the pocket without covering it.
      for (const pSign of [-1, 1] as const) {
        addChamfer([
          [IX, pSign * SH],   // inner nose at pocket mouth
          [IX, pSign * SE],   // inner, box-segment end
          [OX, pSign * SE],   // outer, box-segment end
        ], cushMat);
      }

      // ── Corner pocket angled chamfers (long-rail side) ──
      // Long-rail nose at (IX, ±cornerZ) angles back to the outer table corner,
      // framing the pocket mouth without intruding into the hole.
      for (const cSign of [-1, 1] as const) {
        addChamfer([
          [IX, cSign * cornerZ],          // inner nose
          [OX, cSign * cornerZ],          // outer at nose z
          [OX, cSign * (TABLE_L / 2)],    // outer corner
        ], cushMat);
      }
    }

    // ── Short rails (north z = −TL/2, south z = +TL/2) ───────────
    for (const end of [-1, 1] as const) {
      const IZ = end * TABLE_L / 2;             // inner face Z
      const OZ = end * (TABLE_L / 2 + CD);      // outer face Z

      // Main segment between the two corner clearances
      const shortLen = TABLE_W - 2 * CC;
      const sr = new THREE.Mesh(new THREE.BoxGeometry(shortLen, CH, CD), cushMat);
      sr.position.set(0, CY, IZ + end * CD / 2);
      this.tableGroup.add(sr);

      // ── Corner pocket angled chamfers (short-rail side) ──
      // Short-rail nose at (±(TW/2−CC), IZ) angles back to the outer table corner.
      for (const cSide of [-1, 1] as const) {
        const nx = cSide * (TABLE_W / 2 - CC);  // short-rail nose x
        addChamfer([
          [nx, IZ],                       // inner nose
          [nx, OZ],                       // outer at nose x
          [cSide * (TABLE_W / 2), OZ],    // outer corner
        ], cushMat);
      }
    }

    // ── Outer wood rail frame ─────────────────────────────────────
    const RAIL_W = CD + 4;
    const railY  = -TABLE_TH / 2 + CD * 0.6;
    const nsRail = () => new THREE.BoxGeometry(TABLE_W + RAIL_W * 2, TABLE_TH, RAIL_W);
    const ewRail = () => new THREE.BoxGeometry(RAIL_W, TABLE_TH, TABLE_L + RAIL_W * 2);
    for (const end of [-1, 1]) {
      const r = new THREE.Mesh(nsRail(), woodMat.clone());
      r.position.set(0, railY, end * (TABLE_L / 2 + RAIL_W / 2));
      this.tableGroup.add(r);
    }
    for (const side of [-1, 1]) {
      const r = new THREE.Mesh(ewRail(), woodMat.clone());
      r.position.set(side * (TABLE_W / 2 + RAIL_W / 2), railY, 0);
      this.tableGroup.add(r);
    }

    // Table body slab (below playing surface)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE_W + RAIL_W * 2 + 4, 10, TABLE_L + RAIL_W * 2 + 4),
      woodMat.clone()
    );
    body.position.set(0, -TABLE_TH - 5, 0);
    this.tableGroup.add(body);

    // ── Pocket holes (dark discs + leather rings) ─────────────────
    const pocketMat = new THREE.MeshBasicMaterial({ color: 0x020102 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1A0A04, roughness: 0.6 });
    const pocketDefs: [number, number, boolean][] = [
      [-TABLE_W/2, -TABLE_L/2, true],  [-TABLE_W/2, 0, false],
      [-TABLE_W/2,  TABLE_L/2, true],  [ TABLE_W/2,-TABLE_L/2, true],
      [ TABLE_W/2, 0, false],           [ TABLE_W/2,  TABLE_L/2, true],
    ];
    for (const [px, pz, isCorner] of pocketDefs) {
      const r = isCorner ? BALL_R * 2.02 : BALL_R * 2.27;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 24), pocketMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(px, 0.05, pz);
      this.tableGroup.add(hole);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 2, 24), leatherMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(px, 0.1, pz);
      this.tableGroup.add(ring);
    }

    // ── Table legs ────────────────────────────────────────────────
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0E0A0A, roughness: 0.25, metalness: 0.55 });
    const legDefs: [number,number][] = [
      [-TABLE_W/2 + 5, -(TABLE_L/2 - 5)],
      [ TABLE_W/2 - 5, -(TABLE_L/2 - 5)],
      [-TABLE_W/2 + 5,   TABLE_L/2 - 5],
      [ TABLE_W/2 - 5,   TABLE_L/2 - 5],
    ];
    for (const [lx, lz] of legDefs) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(8, LEG_H, 8), legMat);
      leg.position.set(lx, -(LEG_H / 2 + TABLE_TH), lz);
      this.tableGroup.add(leg);
    }

    // Aprons (skirt panels between legs)
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x0B0808, roughness: 0.4, metalness: 0.3 });
    const apronDefs: [number,number,number,number,number,number][] = [
      [TABLE_W - 10, 22, 6,  0,               -(LEG_H*0.6+TABLE_TH), -(TABLE_L/2+2)],
      [TABLE_W - 10, 22, 6,  0,               -(LEG_H*0.6+TABLE_TH),  TABLE_L/2+2],
      [6, 22, TABLE_L - 10, -(TABLE_W/2 + 2), -(LEG_H*0.6+TABLE_TH), 0],
      [6, 22, TABLE_L - 10,  TABLE_W/2 + 2,   -(LEG_H*0.6+TABLE_TH), 0],
    ];
    for (const [w,h,d,px,py,pz] of apronDefs) {
      const ap = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), apronMat);
      ap.position.set(px, py, pz);
      this.tableGroup.add(ap);
    }

    this.scene.add(this.tableGroup);
  }

  private buildBalls() {
    // Remove existing ball meshes
    for (const mesh of this.ballMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.ballMeshes.clear();

    for (const b of this.balls) {
      const geo = new THREE.SphereGeometry(BALL_R, 32, 32);
      const tex = makeBallTexture(b.number);
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        roughness: 0.08,
        metalness: 0.0,
        reflectivity: 0.8,
        clearcoat: 0.7,
        clearcoatRoughness: 0.04,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.position.set(b.pos.x, BALL_R, b.pos.z);
      this.scene.add(mesh);
      this.ballMeshes.set(b.number, mesh);
    }
  }

  private buildCue() {
    // Remove old
    if (this.cueGroup) { this.scene.remove(this.cueGroup); }
    this.cueGroup = new THREE.Group();

    // Cue body — cylinder lying along local +Z so rotation.y = aimAngle lines it up.
    // tip (narrow 0.35) at +Z, butt (wide 1.4) at −Z (behind ball, toward player).
    const cueGeo = new THREE.CylinderGeometry(0.35, 1.4, CUE_LEN, 12);
    cueGeo.rotateX(Math.PI/2); // lie along Z axis
    const cueMat = new THREE.MeshStandardMaterial({ color:0xC89050, roughness:0.25, metalness:0.05 });
    this.cueMesh = new THREE.Mesh(cueGeo, cueMat);
    this.cueMesh.castShadow = true;

    // Cue tip (blue chalk) — at +Z end of cylinder (the narrow/tip end)
    const tipGeo = new THREE.CylinderGeometry(0.34, 0.38, 2, 8);
    tipGeo.rotateX(Math.PI/2);
    const tip = new THREE.Mesh(tipGeo,
      new THREE.MeshStandardMaterial({ color:0x1A6080, roughness:0.6 }));
    tip.position.z = CUE_LEN/2 + 1;
    this.cueMesh.add(tip);

    // Wrap ring (decorative) — near the butt (−Z) end
    const wrapGeo = new THREE.CylinderGeometry(1.6, 1.6, 8, 12);
    wrapGeo.rotateX(Math.PI/2);
    const wrap = new THREE.Mesh(wrapGeo,
      new THREE.MeshStandardMaterial({ color:0x1A0A00, roughness:0.3 }));
    wrap.position.z = -CUE_LEN/2 + 18;
    this.cueMesh.add(wrap);

    // Holder pivots at the ball so a downward tilt raises the butt while the
    // tip stays at ball height (keeps the long stick clear of the cushions).
    this.cueHolder = new THREE.Group();
    this.cueHolder.add(this.cueMesh);
    this.cueGroup.add(this.cueHolder);

    // Aim guide line — points in +Z (shot direction, toward mouse/target)
    const pts = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,200)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    this.cueGhostLine = new THREE.Line(lineGeo,
      new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.18 }));
    this.cueGroup.add(this.cueGhostLine);

    this.scene.add(this.cueGroup);
  }

  // ── cue positioning ──
  private updateCue() {
    if (!this.cueGroup) return;
    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall || cueBall.isPotted) { this.cueGroup.visible = false; return; }

    const isPowering = this.isPowering;
    const isActive = (this.phase === 'aiming' || this.phase === 'powering') &&
      !this.currentPlayer?.isAI;

    this.cueGroup.visible = isActive;
    if (!isActive) return;

    // Position group at cue ball centre height
    const cueY = BALL_R;
    this.cueGroup.position.set(cueBall.pos.x, cueY, cueBall.pos.z);
    // rotation.y = aimAngle → local +Z points toward mouse/target (shot direction).
    this.cueGroup.rotation.y = this.aimAngle;

    // The stick lives BEHIND the ball (the −Z side, opposite the shot direction).
    // Tip (narrow, local +Z end) sits just behind the ball; butt (wide) trails away
    // in −Z. A slight downward tilt at the holder raises the butt above the rails
    // while the tip stays at ball height, so the stick clears the cushions.
    this.cueHolder.rotation.x = CUE_TILT;
    const backswing = isPowering ? (this.power / 100) * 14 : 0;
    const tipDist = BALL_R + 1.5 + backswing;
    this.cueMesh.position.z = -(tipDist + CUE_LEN / 2);
  }

  // ── ball mesh sync ──
  private syncBallMeshes() {
    for (const b of this.balls) {
      const mesh = this.ballMeshes.get(b.number);
      if (!mesh) continue;
      if (b.isPotted) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.set(b.pos.x, BALL_R, b.pos.z);
        // Spin animation
        const spd = Math.hypot(b.vel.x, b.vel.z);
        if (spd > 0.1) {
          const spinAxis = new THREE.Vector3(b.vel.z, 0, -b.vel.x).normalize();
          mesh.rotateOnWorldAxis(spinAxis, spd * 0.03);
        }
      }
    }
  }

  // ── input ──
  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'aiming' && this.phase !== 'powering') return;
    if (this.currentPlayer?.isAI) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mousePos.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const tablePos = this.getTableIntersect();
    if (!tablePos) return;

    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall) return;

    const dx = tablePos.x - cueBall.pos.x;
    const dz = tablePos.z - cueBall.pos.z;
    this.aimAngle = Math.atan2(dx, dz); // toward mouse
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.phase !== 'aiming') return;
    if (this.currentPlayer?.isAI) return;
    this.phase = 'powering';
    this.isPowering = true;
    this.powerStart = performance.now();
    this.power = 0;
    this.emitHUD();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.phase !== 'powering') return;
    this.isPowering = false;
    const held = (performance.now() - this.powerStart) / 1000;
    this.power = Math.min(100, held * 60);
    this.executeShot();
  };

  private onResize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private getTableIntersect(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mousePos, this.camera);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.tablePlane, target);
    return hit ? target : null;
  }

  // ── shooting ──
  private executeShot() {
    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall || cueBall.isPotted) return;

    this.phase = 'simulating';
    this.firstHit = null;
    this.pottedInShot = [];
    this.cuePottedInShot = false;

    // Reset firstContactGiven flags
    for (const b of this.balls) { b.firstContactGiven = false; }

    // aimAngle points FROM ball TOWARD mouse/target. Ball travels in that direction.
    const shootAngle = this.aimAngle;
    const dir: Vec2 = { x: Math.sin(shootAngle), z: Math.cos(shootAngle) };
    const vel = shotVelocity(dir, this.power);
    cueBall.vel = vel;
    sound.cueStrike(this.power / 100);

    this.cueGroup.visible = false;
    this.setCam(this.camMode === 'overhead' ? 'overhead' : 'cinematic', false);
    this.emitHUD();
  }

  // ── turn management ──
  private get currentPlayer(): PlayerState | null {
    return this.players[this.currentPlayerIndex] ?? null;
  }

  private startTurn() {
    if (this.phase === 'roundEnd') return;

    this.targetBall = getNextTarget(this.balls);
    if (this.targetBall < 0) { this.endRound(); return; }

    // Check if all active players are benched
    const active = this.players.filter(p => !p.isBenched);
    if (active.length === 0) { this.endRound(); return; }

    // Skip benched players
    let tries = 0;
    while (this.players[this.currentPlayerIndex]?.isBenched && tries < this.players.length) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      tries++;
    }

    this.phase = 'aiming';
    this.power = 0;
    this.isPowering = false;
    this.shotResult = null;
    this.timeLeft = TURN_DURATION;
    this.lastTimerTick = performance.now();

    // Place cue ball if potted
    const cueBall = this.balls.find(b => b.number === 0);
    if (cueBall && cueBall.isPotted) {
      cueBall.isPotted = false;
      cueBall.pos = { x: 0, z: -60 };
      cueBall.vel = { x: 0, z: 0 };
      const mesh = this.ballMeshes.get(0);
      if (mesh) { mesh.visible = true; mesh.position.set(0, BALL_R, -60); }
    }

    if (this.currentPlayer?.isAI) {
      this.setCam('cinematic', false);
      this.aiThinkTimeout = setTimeout(() => this.doAIShot(), 1200);
    } else {
      this.setCam('overhead', false);
    }

    this.emitHUD();
  }

  private doAIShot() {
    const cueBall = this.balls.find(b => b.number === 0);
    const target = this.balls.find(b => b.number === this.targetBall);
    if (!cueBall || !target) return;

    const result = computeAIShot(cueBall, target, this.balls);
    this.power = result.power;
    // aimAngle = shoot direction (toward target), same convention as human aiming
    const angle = Math.atan2(result.direction.x, result.direction.z);
    this.aimAngle = angle;

    this.executeShot();
  }

  private onShotFinished() {
    const result = evaluateShot({
      cueBallPotted: this.cuePottedInShot,
      firstHit: this.firstHit,
      pottedInShot: this.pottedInShot,
      targetBall: this.targetBall,
    });

    this.shotResult = result;
    this.players[this.currentPlayerIndex] = applyResult(
      this.players[this.currentPlayerIndex], result, this.balls
    );
    this.players = updateBench(this.players, this.balls);

    // Advance target
    if (result.type === 'success' || result.type === 'carom') {
      this.targetBall = getNextTarget(this.balls);
    }

    this.phase = 'evaluating';
    this.emitHUD();

    const extraTurn = result.extraTurn;
    const target = getNextTarget(this.balls);

    this.evalTimeout = setTimeout(() => {
      this.shotResult = null;
      if (target < 0) {
        this.endRound();
        return;
      }
      if (!extraTurn) {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      }
      this.startTurn();
    }, 2000);
  }

  skipTurn() {
    if (this.phase !== 'aiming' && this.phase !== 'powering') return;
    this.shotResult = { type:'miss', pottedBalls:[], scoreChange:0, message:'Turn forfeited', extraTurn:false };
    this.phase = 'evaluating';
    this.isPowering = false;
    this.emitHUD();
    this.evalTimeout = setTimeout(() => {
      this.shotResult = null;
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      this.startTurn();
    }, 1500);
  }

  private endRound() {
    this.phase = 'roundEnd';
    const winners = getWinners(this.players);
    const payout = calcPayout(this.stake, this.players.length, winners.length);
    for (const w of winners) {
      const idx = this.players.indexOf(w);
      this.players[idx] = { ...w, balance: w.balance + payout.perWinner };
    }
    if (this.cueGroup) this.cueGroup.visible = false;
    this.setCam('cinematic', false);
    this.emit('roundEnd', { players: this.players, winners, payout });
    this.emitHUD();
  }

  // ── camera ──
  setCam(mode: 'overhead'|'cinematic'|'aim', immediate = false) {
    this.camMode = mode;
    if (mode === 'overhead') {
      this.camTargetPos.set(0, 300, 80);
      this.camTargetLook.set(0, 0, 0);
    } else if (mode === 'cinematic') {
      const angle = (Date.now() * 0.0001) % (Math.PI * 2);
      this.camTargetPos.set(Math.cos(angle)*220, 160, Math.sin(angle)*180 + 50);
      this.camTargetLook.set(0, 0, 0);
    } else {
      const cueBall = this.balls.find(b => b.number === 0);
      if (cueBall) {
        const backDir = { x: Math.sin(this.aimAngle), z: Math.cos(this.aimAngle) };
        this.camTargetPos.set(
          cueBall.pos.x + backDir.x * 100,
          90,
          cueBall.pos.z + backDir.z * 100
        );
        this.camTargetLook.set(cueBall.pos.x, BALL_R, cueBall.pos.z);
      }
    }
    if (immediate) {
      this.camera.position.copy(this.camTargetPos);
      this.camera.lookAt(this.camTargetLook);
    }
  }

  cycleCam() {
    const modes: ('overhead'|'cinematic'|'aim')[] = ['overhead','cinematic','aim'];
    const idx = modes.indexOf(this.camMode);
    this.setCam(modes[(idx+1) % modes.length], false);
    this.emitHUD();
  }

  // ── event system ──
  on(event: string, handler: EventHandler) {
    if (!this.events.has(event)) this.events.set(event, []);
    this.events.get(event)!.push(handler);
  }
  off(event: string, handler: EventHandler) {
    const arr = this.events.get(event);
    if (arr) this.events.set(event, arr.filter(h => h !== handler));
  }
  emit(event: string, data?: unknown) {
    this.events.get(event)?.forEach(h => h(data));
  }

  private emitHUD() {
    const hud: HUDState = {
      players:              [...this.players],
      currentPlayerIndex:   this.currentPlayerIndex,
      targetBall:           this.targetBall,
      timeLeft:             Math.ceil(this.timeLeft),
      power:                Math.round(this.power),
      phase:                this.phase,
      prizePool:            this.prizePool,
      shotResult:           this.shotResult,
      stake:                this.stake,
      camMode:              this.camMode,
    };
    this.emit('hud', hud);
  }

  // ── main loop ──
  private gameLoop = (time: number) => {
    this.rafId = requestAnimationFrame(this.gameLoop);
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    if (this.phase === 'simulating') {
      const firstContact = (hitter: number, hit: number) => {
        if (hitter === 0 && this.firstHit === null) {
          this.firstHit = hit;
        }
      };
      const onBallCollision = (impactSpeed: number) => sound.ballClick(impactSpeed);
      const potted = stepPhysics(this.balls, dt, firstContact, onBallCollision);
      for (const n of potted) {
        if (n === 0) this.cuePottedInShot = true;
        else {
          if (!this.pottedInShot.includes(n)) this.pottedInShot.push(n);
          sound.pocketDrop();
        }
      }
      if (allStopped(this.balls)) {
        this.onShotFinished();
      }
    }

    // Timer (only when game is active)
    if (this.players.length > 0 && (this.phase === 'aiming' || this.phase === 'powering')) {
      const now = performance.now();
      const elapsed = (now - this.lastTimerTick) / 1000;
      if (elapsed >= 1) {
        this.timeLeft = Math.max(0, this.timeLeft - Math.floor(elapsed));
        this.lastTimerTick = now;
        if (this.timeLeft <= 0 && !this.currentPlayer?.isAI) {
          this.skipTurn();
        }
        this.emitHUD();
      }
    }

    // Power charging
    if (this.phase === 'powering' && this.isPowering) {
      const held = (performance.now() - this.powerStart) / 1000;
      this.power = Math.min(100, held * 60);
      this.emitHUD();
    }

    // Cinematic cam slow rotation
    if (this.phase === 'simulating' || this.phase === 'evaluating') {
      this.setCam('cinematic', false);
    }

    // Camera smooth follow
    this.camera.position.lerp(this.camTargetPos, 0.06);
    const lookTarget = new THREE.Vector3().lerpVectors(
      this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(100).add(this.camera.position),
      this.camTargetLook,
      0.06
    );
    this.camera.lookAt(this.camTargetLook);

    this.syncBallMeshes();
    this.updateCue();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.rafId);
    if (this.aiThinkTimeout) clearTimeout(this.aiThinkTimeout);
    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
      this.canvas.removeEventListener('mousedown', this.onMouseDown);
      this.canvas.removeEventListener('mouseup',   this.onMouseUp);
    }
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) this.renderer.dispose();
  }
}
