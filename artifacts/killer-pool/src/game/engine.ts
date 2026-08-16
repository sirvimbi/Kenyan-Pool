import * as THREE from 'three';
import {
  BallState, PlayerConfig, PlayerState, Vec2, ShotResult, HUDState, GamePhase,
  TABLE_W, TABLE_L, BALL_R, CUSHION, CUSHION_POSITIONS, BALL_COLORS,
  CUSHION_SEGMENTS, BALL_PAIRS_19,
  BALL_VALUES, TURN_DURATION, HW, HL, PW, PL, BAULK_Z
} from '@workspace/game-core';
import { stepPhysics, allStopped, shotVelocity } from './physics';
import { sound } from './sound';
import {
  createPlayers, getNextTarget, evaluateShot, applyResult,
  updateBench, getWinners, calcPayout
} from '@workspace/game-core';
import { computeAIShot } from './ai';

const CUE_LEN   = 145;
const CUE_TILT  = 0.16;
const TABLE_TH  = 8;
const LEG_H     = 78;

type EventHandler = (data?: unknown) => void;

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
  private ballTextureCache = new Map<number, THREE.CanvasTexture>();
  private textureCache: Record<string, THREE.CanvasTexture | null> = {
    wood: null, felt: null, floor: null,
  };

  private cueGroup!: THREE.Group;
  private cueHolder!: THREE.Group;
  private cueMesh!: THREE.Mesh;
  private cueGhostLine!: THREE.Line;
  private tableGroup!: THREE.Group;

  public balls: BallState[] = [];
  private players: PlayerState[] = [];
  private currentPlayerIndex = 0;
  private targetBall = 3;
  private phase: GamePhase = 'aiming';
  private timeLeft = TURN_DURATION;
  private lastTimerTick = 0;
  private prizePool = 0;
  private stake = 100;
  private currentSpin: Vec2 = { x: 0, z: 0 };
  private aimAngle = 0;
  private power = 0;
  private isPowering = false;
  private powerStart = 0;
  private mousePos = new THREE.Vector2();
  private firstHit: number | null = null;
  private pottedInShot: number[] = [];
  private cuePottedInShot = false;
  private shotResult: ShotResult | null = null;
  private ballInHand = false;
  private isDragging = false;
  private baulkBreakRequired = false;
  private cueLeftBoxCushion = false;
  private inBattle = false;
  private battleContestants: number[] = [];
  private pendingTieWinners: PlayerState[] = [];
  private pendingBallInHand = false;
  private camMode: 'overhead'|'cinematic'|'aim'|'table-fit' = 'overhead';
  private camTargetPos = new THREE.Vector3();
  private camTargetLook = new THREE.Vector3();
  public isMobile = false;
  private touchStartPos = new THREE.Vector2();
  private lastTouchPos = new THREE.Vector2();
  private isTouchAiming = false;
  private rafId = 0;
  private events = new Map<string, EventHandler[]>();
  private aiThinkTimeout: ReturnType<typeof setTimeout> | null = null;
  private evalTimeout: ReturnType<typeof setTimeout> | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private simFrames = 0;
  private simStartTimestamp = 0;
  private shotExecuted = false;
  private minSimFrames = 20;
  private evaluating = false;
  private gameOver = false;
  private isLocalTurn = false;
  private envTime = 0;
  private flickerSigns: { mat: THREE.Material & { opacity: number }; base: number; speed: number; phase: number }[] = [];
  private discoBall?: THREE.Object3D;
  private ceilingFan?: THREE.Object3D;
  private tvScreen?: { mat: THREE.MeshBasicMaterial };
  private catEyes?: THREE.Object3D;
  private isAuthoritative = false;
  private localUid: string | null = null;
  private initialized = false;
  private lastFrameTimestamp = 0;
  private physicsAccumulator = 0;
  private readonly FIXED_DT = 0.004; // 250Hz Deterministic Step (Reduced from 500Hz for low-end device performance)

  constructor() {
    this.simStartTimestamp = performance.now();
  }

  // ── init ──
  init(canvas: HTMLCanvasElement, localUid: string | null = null) {
    if (this.initialized) return;
    this.canvas = canvas;
    this.localUid = localUid;

    const w = canvas.clientWidth || window.innerWidth || 800;
    const h = canvas.clientHeight || window.innerHeight || 600;

    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || w < 600;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = false;
    if (this.isMobile) console.log("Engine: Mobile renderer initialized", { w, h });

    // Use basic rendering defaults to ensure compatibility with mobile GPUs
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    console.log("Engine: Scene created");
    this.scene.background = new THREE.Color(0x1a0e2a);
    this.scene.fog = new THREE.FogExp2(0x1c1030, 0.0006);

    this.camera = new THREE.PerspectiveCamera(50, w/h, 0.5, 5000);
    this.setCam('table-fit', true);

    this.setupLights();
    this.buildRoom();
    this.buildTable();

    canvas.addEventListener('mousemove',  this.onMouseMove);
    canvas.addEventListener('mousedown',  this.onMouseDown);
    canvas.addEventListener('mouseup',    this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseLeave);

    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this.onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this.onTouchEnd,   { passive: false });

    window.addEventListener('mouseup',    this.onWindowMouseUp);
    window.addEventListener('resize',     this.onResize);

    this.initialized = true;
    console.log("Engine: Initialized");
    this.rafId = requestAnimationFrame(this.gameLoop);
  }

  public isInitialized() {
    return this.initialized;
  }

  public renderNow() {
    if (this.initialized && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public setAuthoritative(val: boolean) {
    this.isAuthoritative = val;
  }

  public setLocalUid(uid: string | null) {
    this.localUid = uid;
  }

  // ── Texture Generators ──
  private makeBallTexture(num: number): THREE.CanvasTexture {
    if (this.ballTextureCache.has(num)) return this.ballTextureCache.get(num)!;

    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    const isStripe = num >= 9;
    const col = BALL_COLORS[num] || '#ffffff';

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    if (!isStripe && num !== 0) {
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, W, H);
    } else if (isStripe) {
      ctx.fillStyle = col;
      ctx.fillRect(0, H * 0.25, W, H * 0.50);
    }

    if (num > 0) {
      const spotRadius = H * 0.18;
      for (const cx of [W * 0.25, W * 0.75]) {
        ctx.beginPath();
        ctx.arc(cx, H / 2, spotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${H * 0.22}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), cx, H / 2);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.flipY = false;
    tex.premultiplyAlpha = false;

    this.ballTextureCache.set(num, tex);
    return tex;
  }

  private makeWoodTexture(): THREE.CanvasTexture {
    if (this.textureCache.wood) return this.textureCache.wood;
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
    t.flipY = false;
    t.premultiplyAlpha = false;
    this.textureCache.wood = t;
    return t;
  }

  private makeFeltTexture(): THREE.CanvasTexture {
    if (this.textureCache.felt) return this.textureCache.felt;
    const W = 512, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1A7238'; ctx.fillRect(0,0,W,H);
    for (let i=0; i<4000; i++) {
      const bright = Math.random() > 0.5;
      ctx.fillStyle = bright
        ? `rgba(80,180,100,${0.06+Math.random()*0.08})`
        : `rgba(5,30,15,${0.05+Math.random()*0.07})`;
      ctx.fillRect(Math.random()*W, Math.random()*H, 1+Math.random(), 1+Math.random());
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.flipY = false;
    t.premultiplyAlpha = false;
    this.textureCache.felt = t;
    return t;
  }

  private makeFloorTexture(): THREE.CanvasTexture {
    if (this.textureCache.floor) return this.textureCache.floor;
    const W = 512, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#150c1e'; ctx.fillRect(0,0,W,H);
    const n = 4, ts = W / n;
    for (let r=0; r <n; r++) {
      for (let col=0; col <n; col++) {
        const even = (r+col)%2===0;
        ctx.fillStyle = even ? '#1a1026' : '#140b1c';
        ctx.fillRect(col*ts+1.5, r*ts+1.5, ts-3, ts-3);
      }
    }
    for (let i=0;i <700;i++) {
      const g = 40 + Math.random() * 60;
      ctx.fillStyle = `rgba(${g+Math.random()*40},${g},${g+Math.random()*50},0.25)`;
      ctx.fillRect(Math.random()*W, Math.random()*H, 1.5, 1.5);
    }
    const streaks: [string, number][] = [['255,40,180', 0.10], ['80,200,255', 0.08], ['180,60,255', 0.07]];
    for (const [rgb, a] of streaks) {
      const sx = Math.random()*W;
      const g = ctx.createLinearGradient(sx-40,0,sx+40,0);
      g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(sx-40,0,80,H);
    }
    ctx.strokeStyle = 'rgba(180,120,255,0.10)'; ctx.lineWidth = 1.5;
    for (let r=0; r <=n; r++) { ctx.beginPath(); ctx.moveTo(0,r*ts); ctx.lineTo(W,r*ts); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r*ts,0); ctx.lineTo(r*ts,H); ctx.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3,3);
    t.flipY = false;
    t.premultiplyAlpha = false;
    this.textureCache.floor = t;
    return t;
  }

  private makeGlowTexture(rgb = '255,210,150', inner = 0.85): THREE.CanvasTexture {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    g.addColorStop(0, `rgba(${rgb},${inner})`);
    g.addColorStop(0.4, `rgba(${rgb},${inner*0.4})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(0,0,S,S);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.premultiplyAlpha = false;
    return t;
  }

  private makeDartTexture(): THREE.CanvasTexture {
    const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!;
    const cx = S/2, cy = S/2;
    const rings = [110, 96, 70, 56, 16, 7];
    const colsA = ['#181818', '#E8D8B0'];
    for (let i = 0; i < rings.length; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, rings[i], 0, Math.PI*2);
      ctx.fillStyle = i === rings.length-1 ? '#C81818'
                    : i === rings.length-2 ? '#0E6E2E'
                    : colsA[i % 2];
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,120,120,0.5)'; ctx.lineWidth = 1;
    for (let a = 0; a < 20; a++) {
      const ang = (a/20)*Math.PI*2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang)*110, cy + Math.sin(ang)*110); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.premultiplyAlpha = false;
    return t;
  }

  private makeTVTexture(): THREE.CanvasTexture {
    const W = 256, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0a1a0c'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#13642f'; ctx.fillRect(20,24,W-40,H-44);
    ctx.strokeStyle = '#3a1c0a'; ctx.lineWidth = 6; ctx.strokeRect(20,24,W-40,H-44);
    const balls = [['#E8D010',70,70],['#CC0000',120,90],['#003399',150,60],['#FFFFFF',95,110]] as [string,number,number][];
    for (const [col,x,y] of balls) { ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fillStyle = col; ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,18);
    ctx.fillStyle = '#FFB020'; ctx.font = 'bold 12px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('LIVE  •  SIR VIMBI CUP', 6, 9);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.premultiplyAlpha = false;
    return t;
  }

  private makeSkylineTexture(): THREE.CanvasTexture {
    const W = 1024, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')! ;
    const sky = ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#050215'); sky.addColorStop(0.6,'#0D0520'); sky.addColorStop(1,'#1A0A30');
    ctx.fillStyle = sky; ctx.fillRect(0, 0,W,H);
    for (let i=0;i <200;i++) {
      const sz = Math.random() * 1.5;
      ctx.fillStyle = `rgba(255,255,255,${0.3+Math.random()*0.7})`;
      ctx.fillRect(Math.random() * W, Math.random() * H * 0.6, sz, sz);
    }
    const buildings: {x:number,w:number,h:number,windows:{x:number,y:number,lit:boolean}[]}[] = [];
    let bx = 0;
    while (bx < W) {
      const bw = 30 + Math.random() * 60;
      const bh = 60 + Math.random() * (H * 0.55);
      const wins: {x:number,y:number,lit:boolean}[] = [];
      for (let wy=H-bh+5; wy <H-8; wy+=14) {
        for (let wx=bx+4; wx <bx+bw-4; wx+=10) {
          wins.push({x:wx, y:wy, lit: Math.random() <0.6});
        }
      }
      buildings.push({x:bx, w:bw, h:bh, windows:wins});
      bx += bw + Math.random() * 8;
    }
    for (const b of buildings) {
      ctx.fillStyle = '#080415';
      ctx.fillRect(b.x, H-b.h, b.w, b.h);
      for (const w of b.windows) {
        if (w.lit) {
          ctx.fillStyle = Math.random() >0.7
            ? `rgba(255,${160+Math.random()*80},0,${0.7+Math.random()*0.3})`
            : `rgba(200,210,255,${0.5+Math.random()*0.5})` ;
          ctx.fillRect(w.x, w.y, 6, 8);
        }
      }
    }
    const neonCols = ['rgba(0,255,100,0.08)','rgba(255,50,150,0.08)','rgba(0,150,255,0.06)'];
    for (const nc of neonCols) {
      ctx.fillStyle = nc;
      ctx.fillRect(0, H * 0.85, W, H * 0.15);
    }
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.premultiplyAlpha = false;
    return t;
  }

  // ── Lighting and Room Building ──
  private setupLights() {
    const amb = new THREE.AmbientLight(0xC8B8FF, 1.8);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0xD0C0FF, 0x282030, 1.4);
    this.scene.add(hemi);

    if (this.isMobile) {
      // Very minimal lighting for mobile to avoid GPU limits (usually max 8-16 lights)
      const pl = new THREE.PointLight(0xFFEEDD, 500, 1500, 1.2);
      pl.position.set(0, 300, 0);
      this.scene.add(pl);
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      return;
    }

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

    for (const lx of [-46, 46]) {
      const spot = new THREE.SpotLight(0xFFEDD0, 420, 550, Math.PI / 5, 0.28, 0.9);
      spot.position.set(lx, 200, 0);
      spot.target.position.set(lx, 0, 0);
      this.scene.add(spot, spot.target);
    }

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

    const FLOOR_LVL = -(LEG_H + TABLE_TH) + 12;
    const floorWash: [number, number][] = [
      [0, -120], [0, 120], [-120, 0], [120, 0], [-120, -120], [120, 120],
    ];
    for (const [x, z] of floorWash) {
      const pl = new THREE.PointLight(0xFF9C5A, 55, 320, 1.8);
      pl.position.set(x, FLOOR_LVL, z);
      this.scene.add(pl);
    }

    const WALL_MID = -(LEG_H + TABLE_TH) + 150;
    const wallWash: [number, number, number, number, number][] = [
      [0xFFC080,  -120, WALL_MID, 320, 240],
      [0xFFC080,   120, WALL_MID, 320, 240],
      [0xFFB070,     0, WALL_MID + 90, 330, 180],
      [0xB088FF,     0, WALL_MID + 40, -320, 150],
      [0xFFB878,  -320, WALL_MID, 0, 150],
      [0x88B0FF,   320, WALL_MID, 80, 150],
    ];
    for (const [color, x, y, z, intensity] of wallWash) {
      const pl = new THREE.PointLight(color, intensity, 420, 1.6);
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

    const floorTex = this.makeFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM*2.2, ROOM*2.2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.55, color: 0x9988aa })
    );
    floor.rotation.x = -Math.PI/2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    room.add(floor);

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(440, 540),
      new THREE.MeshBasicMaterial({
        map: this.makeGlowTexture('255,180,110', 0.55), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    pool.rotation.x = -Math.PI/2;
    pool.position.set(0, FLOOR_Y + 0.6, 0);
    room.add(pool);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM*2.2, ROOM*2.2),
      new THREE.MeshStandardMaterial({ color: 0x050308, roughness: 1 })
    );
    ceiling.rotation.x = Math.PI/2;
    ceiling.position.y = CEIL_Y;
    room.add(ceiling);

    const wallDefs = [
      { pos: [    0, 0, -ROOM], ry: 0 },
      { pos: [    0, 0,  ROOM], ry: Math.PI },
      { pos: [-ROOM, 0,     0], ry:  Math.PI/2 },
      { pos: [ ROOM, 0,     0], ry: -Math.PI/2 },
    ];
    for (const { pos, ry } of wallDefs) {
      const midY = FLOOR_Y + WALL_H * 0.5;
      const lower = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM*2.1, WALL_H * 0.52),
        new THREE.MeshStandardMaterial({ color: 0x2E160B, roughness: 0.85 })
      );
      lower.rotation.y = ry;
      lower.position.set(pos[0], FLOOR_Y + WALL_H * 0.26, pos[2]);
      room.add(lower);

      const upper = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM*2.1, WALL_H * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x140A1E, roughness: 0.92 })
      );
      upper.rotation.y = ry;
      upper.position.set(pos[0], midY + WALL_H * 0.26, pos[2]);
      room.add(upper);
    }

    const ledPurple  = new THREE.MeshBasicMaterial({ color: 0xCC00FF });
    const ledMagenta = new THREE.MeshBasicMaterial({ color: 0xFF00CC });
    const STRIP_T = 4, STRIP_D = 9;
    const cy = CEIL_Y - STRIP_T * 0.5 - 1;

    const stripN = new THREE.Mesh(new THREE.BoxGeometry(ROOM*2-10, STRIP_T, STRIP_D), ledPurple);
    stripN.position.set(0, cy, -(ROOM - STRIP_D*0.5));
    room.add(stripN);
    const stripS = new THREE.Mesh(new THREE.BoxGeometry(ROOM*2-10, STRIP_T, STRIP_D), ledMagenta);
    stripS.position.set(0, cy, ROOM - STRIP_D*0.5);
    room.add(stripS);
    const stripW = new THREE.Mesh(new THREE.BoxGeometry(STRIP_D, STRIP_T, ROOM*2-10), ledPurple);
    stripW.position.set(-(ROOM - STRIP_D*0.5), cy, 0);
    room.add(stripW);
    const stripE = new THREE.Mesh(new THREE.BoxGeometry(STRIP_D, STRIP_T, ROOM*2-10), ledMagenta);
    stripE.position.set(ROOM - STRIP_D*0.5, cy, 0);
    room.add(stripE);

    const warmWhiteMat = new THREE.MeshBasicMaterial({ color: 0xFFF0D8 });
    const metalBlack = new THREE.MeshStandardMaterial({ color:0x0E0E0E, roughness:0.4, metalness:0.9 });
    for (const lx of [-46, 46]) {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(10, 7, TABLE_L * 0.82),
        metalBlack
      );
      housing.position.set(lx, CEIL_Y - 45, 0);
      room.add(housing);
      const diffuser = new THREE.Mesh(
        new THREE.BoxGeometry(8, 2, TABLE_L * 0.80),
        warmWhiteMat
      );
      diffuser.position.set(lx, CEIL_Y - 49, 0);
      room.add(diffuser);
      const rodH = CEIL_Y - (CEIL_Y - 45) - 3.5;
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, rodH, 5),
        metalBlack
      );
      rod.position.set(lx, CEIL_Y - rodH * 0.5, 0);
      room.add(rod);
    }

    const skyTex = this.makeSkylineTexture();
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

    this.addNeonSign(room, 'KILLER POOL',   -165, FLOOR_Y + WALL_H*0.82, -ROOM+2, 0x00FF88, 1.2);
    this.addNeonSign(room, 'NAIROBI NIGHTS', 155, FLOOR_Y + WALL_H*0.78, -ROOM+2, 0xFF2090, 0.9, 0, true);
    this.addNeonSign(room, 'BILLIARDS',      -ROOM+2, FLOOR_Y+WALL_H*0.42, 0, 0x44AAFF, 1.0, Math.PI/2);

    const barY = FLOOR_Y + 56;
    const barTop = new THREE.Mesh(
      new THREE.BoxGeometry(320, 6, 55),
      new THREE.MeshStandardMaterial({ color:0x140804, roughness:0.18, metalness:0.35 })
    );
    barTop.position.set(0, barY, ROOM - 58);
    room.add(barTop);
    const barFront = new THREE.Mesh(
      new THREE.BoxGeometry(320, 60, 8),
      new THREE.MeshStandardMaterial({ color:0x0C0502, roughness:0.7 })
    );
    barFront.position.set(0, barY - 33, ROOM - 35);
    room.add(barFront);
    const kick = new THREE.Mesh(
      new THREE.BoxGeometry(312, 2.5, 2),
      new THREE.MeshBasicMaterial({ color: 0xFF2090 })
    );
    kick.position.set(0, barY - 58, ROOM - 31);
    room.add(kick);

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

    this.addNeonSign(room, 'SIR VIMBI ENTERPRISES', 0, FLOOR_Y + WALL_H*0.62, ROOM - 4, 0xFFB020, 1.5, Math.PI, true);
    this.addNeonSign(room, '~ est. Nairobi ~', 0, FLOOR_Y + WALL_H*0.50, ROOM - 4, 0x39D0FF, 0.7, Math.PI);

    this.buildBackBar(room, FLOOR_Y, ROOM, barY);
    this.buildDecor(room, ROOM, FLOOR_Y, WALL_H, CEIL_Y);

    this.scene.add(room);
  }

  private buildBackBar(room: THREE.Object3D, FLOOR_Y: number, ROOM: number, barY: number) {
    const backZ = ROOM - 10;
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(300, 150, 14),
      new THREE.MeshStandardMaterial({ color: 0x100309, roughness: 0.6 })
    );
    cabinet.position.set(0, FLOOR_Y + 90, backZ + 4);
    room.add(cabinet);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(290, 96),
      new THREE.MeshBasicMaterial({ map: this.makeGlowTexture('255,120,40', 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    back.position.set(0, FLOOR_Y + 96, backZ - 3.5);
    back.rotation.y = Math.PI;
    room.add(back);

    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x1A0D06, roughness: 0.4, metalness: 0.2 });
    const bottlePalette = [0x00E0A0, 0xFF3070, 0x40A0FF, 0xFFC020, 0xC060FF, 0xFF6020, 0xE8E8E8];
    for (let s = 0; s < 3; s++) {
      const sy = FLOOR_Y + 60 + s * 32;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(280, 2, 12), shelfMat);
      shelf.position.set(0, sy, backZ - 2);
      room.add(shelf);
      for (let b = 0; b < 16; b++) {
        const col = bottlePalette[(b + s) % bottlePalette.length];
        const h = 12 + ((b * 7 + s * 5) % 9);
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(1.6, 2.0, h, 8),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, roughness: 0.25, transparent: true, opacity: 0.9 })
        );
        bottle.position.set(-135 + b * 18, sy + h / 2 + 1, backZ - 2);
        room.add(bottle);
        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.6, 0.6, 4, 6),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4 })
        );
        neck.position.set(-135 + b * 18, sy + h + 3, backZ - 2);
        room.add(neck);
      }
    }

    const bartender = new THREE.Group();
    const silMat = new THREE.MeshStandardMaterial({ color: 0x05020a, roughness: 1 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(7, 22, 4, 8), silMat);
    torso.position.y = 30; bartender.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 12), silMat);
    head.position.y = 48; bartender.add(head);
    bartender.position.set(40, barY - 56, ROOM - 78);
    room.add(bartender);

    const cat = new THREE.Group();
    const catMat = new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(3, 6, 3, 6), catMat);
    body.rotation.z = Math.PI / 2; body.position.y = 3; cat.add(body);
    const catHead = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 10), catMat);
    catHead.position.set(5, 5, 0); cat.add(catHead);
    for (const ex of [-1.2, 1.2]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 4), catMat);
      ear.position.set(5 + ex * 0.4, 8, ex); cat.add(ear);
    }
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9CFF3C });
    const eyes = new THREE.Group();
    for (const ez of [-1.1, 1.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 6), eyeMat);
      eye.position.set(7.2, 5.2, ez); eyes.add(eye);
    }
    cat.add(eyes);
    cat.position.set(-120, barY + 3, ROOM - 60);
    room.add(cat);
    this.catEyes = eyes;
  }

  private buildDecor(room: THREE.Object3D, ROOM: number, FLOOR_Y: number, WALL_H: number, CEIL_Y: number) {
    const silMat = new THREE.MeshStandardMaterial({ color: 0x06030c, roughness: 1 });
    for (const sx of [-2, 0, 1]) {
      const p = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(6, 18, 4, 8), silMat.clone());
      torso.position.y = 26; p.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(5.2, 12, 12), silMat.clone());
      head.position.y = 42; p.add(head);
      p.position.set(sx * 62, FLOOR_Y + 18, ROOM - 65);
      p.rotation.y = Math.PI;
      room.add(p);
    }

    for (const [px, pz] of [[-ROOM+50, -ROOM+50], [ROOM-50, -ROOM+50], [-ROOM+50, ROOM-90]] as [number,number][]) {
      const plant = new THREE.Group();
      const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(7, 5, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x2A1408, roughness: 0.8 })
      );
      plant.add(pot);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x1E5E2A, roughness: 0.8, side: THREE.DoubleSide });
      for (let i = 0; i < 9; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.2, 22, 4), leafMat);
        const a = (i / 9) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 4, 14, Math.sin(a) * 4);
        leaf.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
        plant.add(leaf);
      }
      plant.position.set(px, FLOOR_Y + 60, pz);
      room.add(plant);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, CEIL_Y - (FLOOR_Y + 70), 4),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
      cord.position.set(px, (CEIL_Y + FLOOR_Y + 70) / 2, pz);
      room.add(cord);
    }

    const dart = new THREE.Mesh(
      new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ map: this.makeDartTexture() })
    );
    dart.position.set(-ROOM + 2, FLOOR_Y + WALL_H * 0.42, -150);
    dart.rotation.y = Math.PI / 2;
    room.add(dart);

    const tvMat = new THREE.MeshBasicMaterial({ map: this.makeTVTexture() });
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(70, 42), tvMat);
    tv.position.set(ROOM - 2, FLOOR_Y + WALL_H * 0.55, 120);
    tv.rotation.y = -Math.PI / 2;
    room.add(tv);
    const tvFrame = new THREE.Mesh(
      new THREE.BoxGeometry(4, 50, 78),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.6 })
    );
    tvFrame.position.set(ROOM - 4, FLOOR_Y + WALL_H * 0.55, 120);
    room.add(tvFrame);
    this.tvScreen = { mat: tvMat };

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4, metalness: 0.5 });
    const photoCols = [0x6688aa, 0xaa8866, 0x88aa66];
    for (let i = 0; i < 3; i++) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 20), frameMat);
      fr.position.set(-ROOM + 2, FLOOR_Y + WALL_H * 0.34, 40 + i * 40);
      room.add(fr);
      const photo = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 22),
        new THREE.MeshStandardMaterial({ color: photoCols[i], roughness: 0.6, emissive: photoCols[i], emissiveIntensity: 0.08 })
      );
      photo.position.set(-ROOM + 3.2, FLOOR_Y + WALL_H * 0.34, 40 + i * 40);
      photo.rotation.y = Math.PI / 2;
      room.add(photo);
    }

    const disco = new THREE.Mesh(
      new THREE.IcosahedronGeometry(11, 1),
      new THREE.MeshStandardMaterial({ color: 0xC0C8D0, roughness: 0.15, metalness: 1, flatShading: true })
    );
    disco.position.set(150, CEIL_Y - 70, 150);
    room.add(disco);
    const dcord = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 4),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    dcord.position.set(150, CEIL_Y - 30, 150);
    room.add(dcord);
    this.discoBall = disco;

    const fan = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 3, 10),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.4, metalness: 0.6 }));
    fan.add(hub);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a0e06, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(34, 0.8, 7), bladeMat);
      blade.position.set(Math.cos(i * Math.PI / 2) * 19, 0, Math.sin(i * Math.PI / 2) * 19);
      blade.rotation.y = i * Math.PI / 2;
      fan.add(blade);
    }
    fan.position.set(-150, CEIL_Y - 24, 150);
    room.add(fan);
    this.ceilingFan = fan;
  }

  private addNeonSign(
    parent: THREE.Object3D, text: string,
    x: number, y: number, z: number,
    color: number, scale = 1, rotY = 0, flicker = false
  ): THREE.Mesh {
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
    tex.flipY = false;
    tex.premultiplyAlpha = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    mesh.position.set(x, y, z);
    if (rotY) mesh.rotation.y = rotY;
    parent.add(mesh);
    if (flicker) this.flickerSigns.push({ mat, base: 1, speed: 6 + Math.random()*4, phase: Math.random()*6.28 });
    return mesh;
  }

  private buildTable() {
    this.tableGroup = new THREE.Group();
    const woodTex = this.makeWoodTexture();
    const feltTex = this.makeFeltTexture();

    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex, roughness: 0.35, metalness: 0.08, color: 0x0D0808
    });
    const feltMat = new THREE.MeshStandardMaterial({
      map: feltTex, roughness: 0.88, metalness: 0.0, color: 0x1A7238,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const cushMat = new THREE.MeshStandardMaterial({
      color: 0x165028, roughness: 0.82, side: THREE.DoubleSide
    });

    const CD = CUSHION;
    const CH = 3.7;

    const Mc = 3.77;
    const Ms = 2.9;
    const Cs = CD * Math.tan(38 * Math.PI / 180);

    const rCorner = BALL_R * 2.02;
    const rSide   = rCorner;
    const Bc = 1.3, Bs = 1.3;
    const cIn   = PL - Mc - CD;
    const cTipX = PW + CD;
    const cTipZ = PL - Mc;
    const sIn   = PW - Mc - CD;
    const sTipX = PW - Mc;
    const sTipZ = PL + CD;
    const sideN = Ms + Cs;
    const TAU = Math.PI * 2;
    const angOf = (cx: number, cz: number, p: [number, number]) => Math.atan2(p[1] - cz, p[0] - cx);
    const arcInterior = (cx: number, cz: number, Pin: [number, number], Pout: [number, number], outAng: number, n: number): [number, number][] => {
      const r = Math.hypot(Pin[0] - cx, Pin[1] - cz);
      const a0 = angOf(cx, cz, Pin); const a1 = angOf(cx, cz, Pout);
      let a1u = a1; while (a1u <= a0) a1u += TAU; const midU = (a0 + a1u) / 2;
      let a1d = a1; while (a1d >= a0) a1d -= TAU; const midD = (a0 + a1d) / 2;
      const dd = (x: number, y: number) => Math.abs(((x - y) + Math.PI) % TAU - Math.PI);
      const aEnd = dd(midU, outAng) <= dd(midD, outAng) ? a1u : a1d;
      const o: [number, number][] = [];
      for (let i = 1; i < n; i++) { const a = a0 + (aEnd - a0) * (i / n); o.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
      return o;
    };
    const playfield: [number, number][] = [];
    {
      const PI = Math.PI;
      const P = (x: number, z: number) => playfield.push([x, z]);
      const arc = (cx: number, cz: number, Pin: [number, number], Pout: [number, number], out: number, n: number) => {
        for (const q of arcInterior(cx, cz, Pin, Pout, out, n)) playfield.push(q);
      };
      P(PW, -cIn);
      P(PW, -sideN);  arc(PW + Bs, 0, [PW, -sideN], [PW, sideN], 0, 16);  P(PW, sideN);
      P(PW, cIn);  P(cTipX, cTipZ);
      arc(PW + Bc, PL + Bc, [cTipX, cTipZ], [sTipX, sTipZ], PI / 4, 18);
      P(sTipX, sTipZ);  P(sIn, PL);
      P(-sIn, PL);  P(-sTipX, sTipZ);
      arc(-(PW + Bc), PL + Bc, [-sTipX, sTipZ], [-cTipX, cTipZ], 3 * PI / 4, 18);
      P(-cTipX, cTipZ);  P(-PW, cIn);
      P(-PW, sideN);  arc(-(PW + Bs), 0, [-PW, sideN], [-PW, -sideN], PI, 16);  P(-PW, -sideN);
      P(-PW, -cIn);  P(-cTipX, -cTipZ);
      arc(-(PW + Bc), -(PL + Bc), [-cTipX, -cTipZ], [-sTipX, -sTipZ], -3 * PI / 4, 18);
      P(-sTipX, -sTipZ);  P(-sIn, -PL);
      P(sIn, -PL);  P(sTipX, -sTipZ);
      arc(PW + Bc, -(PL + Bc), [sTipX, -sTipZ], [cTipX, -cTipZ], -PI / 4, 18);
      P(cTipX, -cTipZ);
    }
    const playVerts = playfield.map(([x, z]) => new THREE.Vector2(x, -z));

    const feltGeo = new THREE.ShapeGeometry(new THREE.Shape(playVerts));
    feltGeo.rotateX(-Math.PI / 2);
    const surf = new THREE.Mesh(feltGeo, feltMat);
    surf.receiveShadow = true;
    this.tableGroup.add(surf);

    const baulkGeo = new THREE.PlaneGeometry(HW * 2, 0.5);
    baulkGeo.rotateX(-Math.PI / 2);
    const baulkLine = new THREE.Mesh(baulkGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    baulkLine.position.set(0, 0.08, BAULK_Z);
    this.tableGroup.add(baulkLine);

    const addPrism = (pts: [number, number][], mat: THREE.Material) => {
      const v = pts.map(([x, z]) => new THREE.Vector2(x, -z));
      let area = 0;
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        area += a.x * b.y - b.x * a.y;
      }
      if (area < 0) v.reverse();
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(v), { steps: 1, depth: CH, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      this.tableGroup.add(new THREE.Mesh(geo, mat));
    };

    const COVER = 0.6;
    for (const side of [-1, 1] as const) {
      const IX = side * (PW - COVER);
      const OX = side * (PW + CD);
      for (const zSign of [-1, 1] as const) {
        const cornerZin = zSign * (PL - Mc - CD);
        const cornerZout = zSign * (PL - Mc);
        const sideZin    = zSign * (Ms + Cs);
        const sideZout   = zSign * Ms;
        addPrism([
          [IX, cornerZin],
          [IX, sideZin],
          [OX, sideZout],
          [OX, cornerZout],
        ], cushMat);
      }
    }

    for (const end of [-1, 1] as const) {
      const iZ = end * (PL - COVER);
      const oZ = end * (PL + CD);
      const innerX = PW - Mc - CD;
      const outerX = PW - Mc;
      addPrism([
        [-innerX, iZ],
        [ innerX, iZ],
        [ outerX, oZ],
        [-outerX, oZ],
      ], cushMat);
    }

    const RAIL_W = CD + 4;
    const railY  = -TABLE_TH / 2 + CD * 0.6;
    const OFX = TABLE_W / 2 + RAIL_W, OFZ = TABLE_L / 2 + RAIL_W;
    const frameShape = new THREE.Shape([
      new THREE.Vector2(-OFX, -OFZ), new THREE.Vector2(OFX, -OFZ),
      new THREE.Vector2(OFX, OFZ),   new THREE.Vector2(-OFX, OFZ),
    ]);
    frameShape.holes.push(new THREE.Path(playVerts));
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, { steps: 1, depth: TABLE_TH, bevelEnabled: false });
    frameGeo.rotateX(-Math.PI / 2);
    const frame = new THREE.Mesh(frameGeo, woodMat.clone());
    frame.position.y = railY - TABLE_TH / 2;
    this.tableGroup.add(frame);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE_W + RAIL_W * 2 + 4, 10, TABLE_L + RAIL_W * 2 + 4),
      woodMat.clone()
    );
    body.position.set(0, -TABLE_TH - 5, 0);
    this.tableGroup.add(body);

    const pocketMat = new THREE.MeshBasicMaterial({
      color: 0x020102,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const pocketDefs: [number, number, boolean][] = [
      [-(PW + Bc), -(PL + Bc), true],  [-(PW + Bs), 0, false],
      [-(PW + Bc),  PL + Bc, true],    [ PW + Bc, -(PL + Bc), true],
      [ PW + Bs, 0, false],            [ PW + Bc,  PL + Bc, true],
    ];
    for (const [px, pz, isCorner] of pocketDefs) {
      const r = isCorner ? rCorner : rSide;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 24), pocketMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(px, 0.05, pz);
      this.tableGroup.add(hole);
    }

    const sideArcMaxX = PW + Bs + Math.hypot(Bs, sideN);
    const coverTopY = railY + TABLE_TH / 2 - 0.1;
    const coverH = 6;
    const coverCY = coverTopY - coverH / 2;
    for (const side of [-1, 1] as const) {
      for (const zSign of [-1, 1] as const) {
        const x0 = PW + CD;
        const x1 = sideArcMaxX;
        const z0 = Ms;
        const z1 = sideN;
        const cover = new THREE.Mesh(
          new THREE.BoxGeometry(x1 - x0, coverH, z1 - z0),
          woodMat.clone()
        );
        cover.position.set(side * (x0 + x1) / 2, coverCY, zSign * (z0 + z1) / 2);
        this.tableGroup.add(cover);
      }
    }

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

  // ── Game Logic ──
  startGame(configs: PlayerConfig[], stake: number, localBalance?: number, previousScores?: Record<string, number>, localUid?: string | null) {
    console.log("Engine: startGame called", { stake, players: configs.length, localUid });
    if (localUid) this.localUid = localUid;
    this.stake = stake;
    this.prizePool = Math.floor(stake * configs.length * 0.9);

    // Hard preservation of UIDs from matching configs
    const basePlayers = createPlayers(configs, stake, localBalance);
    this.players = basePlayers.map((p, i) => ({
      ...p,
      uid: configs[i]?.uid || p.uid
    }));

    this.gameOver = false;

    if (previousScores) {
      this.players.sort((a, b) => {
        const scoreA = previousScores[a.uid || a.id] || 0;
        const scoreB = previousScores[b.uid || b.id] || 0;
        return scoreA - scoreB;
      });
      this.currentPlayerIndex = 0;
    } else {
      // AI Mode Favoring: If playing against AI, ensure the human starts first for better UX
      const aiCount = this.players.filter(p => p.isAI).length;
      const humanIndex = this.players.findIndex(p => !p.isAI);
      if (aiCount > 0 && humanIndex !== -1) {
        this.currentPlayerIndex = humanIndex;
      } else {
        this.currentPlayerIndex = Math.floor(Math.random() * this.players.length);
      }
    }

    this.inBattle = false;
    this.battleContestants = [];
    this.pendingTieWinners = [];
    this.pendingBallInHand = false;
    this.evaluating = false;

    this.balls = [
      { number: 0, pos: { x: 0, z: BAULK_Z }, vel: { x:0, z:0 }, isPotted: false }
    ];
    this.rackCushionBalls();

    this.buildBalls();
    this.buildCue();

    this.setCam('table-fit', true);

    // CRITICAL: Call startTurn() to properly initialize the first turn's state,
    // especially for AI players who need their thinking timeout initialized.
    this.startTurn();
  }

  private rackCushionBalls() {
    const [x3, z3] = CUSHION_POSITIONS[3];
    this.balls.push({ number: 3, pos: { x: x3, z: z3 }, vel: { x:0, z:0 }, isPotted: false });

    const pairs = shuffle(BALL_PAIRS_19.map(p => [...p] as [number, number]));
    pairs.forEach((pair, i) => {
      const slots = CUSHION_SEGMENTS[i];
      shuffle([...pair]).forEach((n, j) => {
        const [x, z] = slots[j];
        this.balls.push({ number: n, pos: { x, z }, vel: { x:0, z:0 }, isPotted: false });
      });
    });
  }

  private buildBalls() {
    if (!this.scene) return;
    console.log("Engine: Building balls...", this.balls.length);
    for (const mesh of this.ballMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.ballMeshes.clear();

    for (const b of this.balls) {
      const geo = new THREE.SphereGeometry(BALL_R, 32, 32);
      const tex = this.makeBallTexture(b.number);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.2,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.position.set(b.pos.x, BALL_R, b.pos.z);

      if (b.number > 0) {
        mesh.rotateX(Math.PI / 2);
        mesh.rotateZ(Math.random() * Math.PI * 2);
      }

      this.scene.add(mesh);
      this.ballMeshes.set(b.number, mesh);
    }
  }

  private buildCue() {
    if (this.cueGroup) { this.scene.remove(this.cueGroup); }
    this.cueGroup = new THREE.Group();

    const cueGeo = new THREE.CylinderGeometry(0.35, 1.4, CUE_LEN, 12);
    cueGeo.rotateX(Math.PI/2);
    const cueMat = new THREE.MeshStandardMaterial({ color:0xC89050, roughness:0.25, metalness:0.05 });
    this.cueMesh = new THREE.Mesh(cueGeo, cueMat);
    this.cueMesh.castShadow = true;

    const tipGeo = new THREE.CylinderGeometry(0.34, 0.38, 2, 8);
    tipGeo.rotateX(Math.PI/2);
    const tip = new THREE.Mesh(tipGeo,
      new THREE.MeshStandardMaterial({ color:0x1A6080, roughness:0.6 }));
    tip.position.z = CUE_LEN/2 + 1;
    this.cueMesh.add(tip);

    const wrapGeo = new THREE.CylinderGeometry(1.6, 1.6, 8, 12);
    wrapGeo.rotateX(Math.PI/2);
    const wrap = new THREE.Mesh(wrapGeo,
      new THREE.MeshStandardMaterial({ color:0x1A0A00, roughness:0.3 }));
    wrap.position.z = -CUE_LEN/2 + 18;
    this.cueMesh.add(wrap);

    this.cueHolder = new THREE.Group();
    this.cueHolder.add(this.cueMesh);
    this.cueGroup.add(this.cueHolder);

    const pts = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,200)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    this.cueGhostLine = new THREE.Line(lineGeo,
      new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0.18 }));
    this.cueGroup.add(this.cueGhostLine);

    this.scene.add(this.cueGroup);
  }

  private updateCue() {
    if (!this.cueGroup) return;
    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall || cueBall.isPotted) { this.cueGroup.visible = false; return; }

    const isActive = (this.phase === 'aiming' || this.phase === 'powering') && !this.isDragging;

    const curPlayer = this.players[this.currentPlayerIndex];
    const isMyTurn = !!(curPlayer && curPlayer.uid === this.localUid);

    // Show cue if it's aiming phase AND (it's my turn OR it's an AI turn)
    // This allows players to see the AI aim.
    this.cueGroup.visible = isActive && (isMyTurn || curPlayer?.isAI);
    if (!this.cueGroup.visible) return;

    const cueY = BALL_R;
    this.cueGroup.position.set(cueBall.pos.x, cueY, cueBall.pos.z);
    this.cueGroup.rotation.y = this.aimAngle;

    this.cueHolder.rotation.x = CUE_TILT;
    const backswing = this.isPowering ? (this.power / 100) * 14 : 0;
    const tipDist = BALL_R + 1.5 + backswing;
    this.cueMesh.position.z = -(tipDist + CUE_LEN / 2);
  }

  private syncBallMeshes() {
    for (const b of this.balls) {
      const mesh = this.ballMeshes.get(b.number);
      if (!mesh) continue;
      if (b.isPotted) {
        mesh.visible = false;
      } else {
        mesh.visible = true;
        mesh.position.set(b.pos.x, BALL_R, b.pos.z);
        const spd = Math.hypot(b.vel.x, b.vel.z);
        if (spd > 0.3) {
          const spinAxis = new THREE.Vector3(b.vel.z, 0, -b.vel.x).normalize();
          mesh.rotateOnWorldAxis(spinAxis, spd * 0.035);
        }
      }
    }
  }

  // ── Input ──
  private onMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'aiming' && this.phase !== 'powering') return;
    const curPlayer = this.players[this.currentPlayerIndex];
    if (!curPlayer) return;
    if (this.localUid !== null && curPlayer.uid !== this.localUid) return;
    if (curPlayer.isAI) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mousePos.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const tablePos = this.getTableIntersect();
    if (!tablePos) return;

    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall) return;

    if (this.isDragging) {
      const p = this.clampToBox(tablePos.x, tablePos.z);
      cueBall.pos = { x: p.x, z: p.z };

      // Ball-in-hand placement is local input. Emit HUD so the
      // network layer can publish the current cue-ball position.
      this.emitHUD();

      this.updateCursor(true);
      return;
    }

    const dx = tablePos.x - cueBall.pos.x;
    const dz = tablePos.z - cueBall.pos.z;
    this.aimAngle = Math.atan2(dx, dz);

    if (this.ballInHand && this.phase === 'aiming') {
      this.updateCursor(this.isOverCueBall(tablePos, cueBall));
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.phase !== 'aiming') return;
    e.preventDefault();

    const curPlayer = this.players[this.currentPlayerIndex];
    if (!curPlayer) return;

    if (this.localUid !== null && curPlayer.uid !== this.localUid) return;
    if (curPlayer.isAI) return;

    if (this.ballInHand) {
      const cueBall = this.balls.find(b => b.number === 0);
      const tablePos = this.getTableIntersect();
      if (cueBall && tablePos && this.isOverCueBall(tablePos, cueBall)) {
        this.isDragging = true;
        this.updateCursor(true);
        return;
      }
    }

    this.phase = 'powering';
    this.isPowering = true;
    this.powerStart = performance.now();
    this.power = 0;
    this.emitHUD();
  };

  private onMouseUp = (e: MouseEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.updateCursor(false);

      // Publish the final dropped position immediately.
      this.emitHUD();
      return;
    }
    if (this.phase !== 'powering') return;
    if (this.localUid !== null && this.currentPlayer?.uid !== this.localUid) return;

    console.log("Engine: Desktop shot released. Power:", this.power);
    e.preventDefault();
    e.stopPropagation();

    this.isPowering = false;
    const held = (performance.now() - this.powerStart) / 1000;
    this.power = Math.min(100, held * 80);
    this.executeShot();
  };

  private isOverCueBall(tablePos: THREE.Vector3, cueBall: BallState): boolean {
    const d = Math.hypot(tablePos.x - cueBall.pos.x, tablePos.z - cueBall.pos.z);
    return d < BALL_R * 2.4;
  }

  private clampToBox(x: number, z: number): Vec2 {
    let cx = Math.max(-HW, Math.min(HW, x));
    let cz = Math.max(-HL, Math.min(BAULK_Z, z));
    for (const b of this.balls) {
      if (b.number === 0 || b.isPotted) continue;
      const dx = cx - b.pos.x, dz = cz - b.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = BALL_R * 2 + 0.1;
      if (d > 0.001 && d < minD) {
        const push = (minD - d);
        cx += (dx / d) * push;
        cz += (dz / d) * push;
        cx = Math.max(-HW, Math.min(HW, cx));
        cz = Math.max(-HL, Math.min(BAULK_Z, cz));
      }
    }
    return { x: cx, z: cz };
  }

  private updateCursor(grab: boolean) {
    this.canvas.style.cursor = grab ? (this.isDragging ? 'grabbing' : 'grab') : 'default';
  }

  private onWindowMouseUp = (e: MouseEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.updateCursor(false);
      return;
    }

    // Safety: If we were powering but the mouseup happened outside the canvas,
    // fire the shot anyway.
    if (this.phase === 'powering') {
      this.onMouseUp(e);
    }
  };

  private onMouseLeave = () => {
    if (!this.isDragging) this.updateCursor(false);
  };

  private onResize = () => {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || w < 600;
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.camMode === 'table-fit') {
      this.setCam('table-fit', true);
    }
  };

  private getTouchPos(e: TouchEvent): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    return new THREE.Vector2(
      ((touch.clientX - rect.left) / rect.width) * 2 - 1,
      -((touch.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private onTouchStart = (e: TouchEvent) => {
    if (this.phase !== 'aiming') return;
    const curPlayer = this.players[this.currentPlayerIndex];
    if (!curPlayer) return;
    if (this.localUid !== null && curPlayer.uid !== this.localUid) return;
    if (curPlayer.isAI) return;
    e.preventDefault();
    const pos = this.getTouchPos(e);
    this.mousePos.copy(pos);
    this.touchStartPos.copy(pos);
    this.lastTouchPos.copy(pos);
    const tablePos = this.getTableIntersect();
    if (!tablePos) return;
    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall) return;
    if (this.ballInHand && this.isOverCueBall(tablePos, cueBall)) {
      this.isDragging = true;
    } else {
      this.isTouchAiming = true;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.currentPlayer?.isAI) return;
    if (this.phase !== 'aiming' && !this.isDragging) return;
    e.preventDefault();
    const pos = this.getTouchPos(e);
    this.mousePos.copy(pos);
    const tablePos = this.getTableIntersect();
    if (!tablePos) return;
    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall) return;
    if (this.isDragging) {
      const p = this.clampToBox(tablePos.x, tablePos.z);
      cueBall.pos = { x: p.x, z: p.z };

      // Keep mobile ball-in-hand position synchronized while dragging.
      this.emitHUD();
    } else if (this.isTouchAiming) {
      const deltaX = pos.x - this.lastTouchPos.x;
      this.aimAngle -= deltaX * 3;
      this.lastTouchPos.copy(pos);
    }
  };

  private onTouchEnd = () => {
    if (this.isDragging) {
      this.isDragging = false;

      // Commit the final mobile drop position.
      this.emitHUD();
      return;
    }
    this.isTouchAiming = false;
  };

  private getTableIntersect(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mousePos, this.camera);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.tablePlane, target);
    return hit ? target : null;
  }

  // ── Shooting ──
  public setPower(p: number) {
    this.power = Math.max(0, Math.min(100, p));
    this.emitHUD();
  }

  public fireShot() {
    if (this.phase === 'aiming') {
      this.executeShot();
    }
  }

  public setSpin(x: number, z: number) {
    this.currentSpin = { x, z };
    this.emitHUD();
  }

  public syncStateFromServer(state: HUDState) {
    if (this.isAuthoritative) return;

    const oldPhase = this.phase;

    // If we were simulating but the server has moved on to evaluating or aiming,
    // we must snap to the server state immediately.
    const serverMovedOn = (oldPhase === 'simulating' && (state.phase === 'evaluating' || state.phase === 'aiming'));

    if (this.phase === 'simulating' && state.phase === 'simulating' && !serverMovedOn) return;

    // Update basic state
    this.currentPlayerIndex = state.currentPlayerIndex;
    this.targetBall = state.targetBall;

    // Do NOT overwrite phase if we are locally powering or simulating a shot, as it interrupts logic
    const isLocalBusy = (this.phase === 'simulating' || this.phase === 'powering' || this.isPowering);
    if (!(isLocalBusy && state.phase === 'aiming')) {
      this.phase = state.phase;
    }

    // CLEANUP: If the phase moved from simulating to something else (e.g. host finished),
    // we must ensure all balls stop moving locally.
    if (oldPhase === 'simulating' && this.phase !== 'simulating') {
      for (const b of this.balls) {
        b.vel = { x: 0, z: 0 };
      }
      this.onShotFinished();
    }

    this.timeLeft = state.timeLeft;

    // PRIZE POOL: Ensure it's always synced from server as source of truth
    if (typeof state.prizePool === 'number') {
      if (this.prizePool !== state.prizePool && state.prizePool > 0) {
        console.log("Engine: Synced prizePool from server:", state.prizePool);
      }
      this.prizePool = state.prizePool;
    }

    const serverCurPlayer = state.players[state.currentPlayerIndex];
    const isMyTurnOnServer = !!(serverCurPlayer && serverCurPlayer.uid === this.localUid);

    // CRITICAL: Always populate players if they are missing
    if (this.players.length === 0 || !isMyTurnOnServer) {
      this.players = state.players;
      this.power = state.power;
      this.aimAngle = state.aimAngle;
      this.currentSpin = { ...state.spin };
    } else {
      // When it's our turn, only update other players' stats to avoid jitter
      const localUid = this.localUid;
      this.players = state.players.map((sp) => {
        const localP = this.players.find(lp => lp.uid === sp.uid);
        if (localP && sp.uid === localUid) {
          return { ...localP, score: sp.score, pots: sp.pots, fouls: sp.fouls, balance: sp.balance };
        }
        return sp;
      });
    }

    // GUEST ROBUSTNESS: If server says simulating and we haven't fired locally, force start.
    // This handles cases where the phase transition update was delayed or missed.
    const isSimulatingOnServer = state.phase === 'simulating';
    const isSimulatingLocally = oldPhase === 'simulating'; // Check against oldPhase to avoid bypass

    if (isSimulatingOnServer && !isSimulatingLocally && !isMyTurnOnServer) {
      this.executeShot(true);
    }

    this.isLocalTurn = !!(isMyTurnOnServer && (this.phase === 'aiming' || this.phase === 'powering'));
    this.emitHUD();
  }

  public syncAimFromServer(aim: { aimAngle: number, power: number, spin: Vec2 & { pos?: Vec2 } }) {
    if (this.isAuthoritative) return;
    const curPlayer = this.players[this.currentPlayerIndex];
    if (curPlayer && curPlayer.uid === this.localUid) return;
    this.aimAngle = aim.aimAngle;
    this.power = aim.power;
    this.currentSpin = { x: aim.spin.x, z: aim.spin.z };
    if (aim.spin.pos) {
      const cueBall = this.balls.find(b => b.number === 0);
      if (cueBall) {
        cueBall.pos = { ...aim.spin.pos };
      }
    }
    this.emitHUD();
  }

  // Sync balls from server without resetting positions
  public syncBallsFromServer(serverBalls: BallState[]) {
    // If we are the Host, we only sync if not in active simulation to avoid position glitches
    if (this.isAuthoritative && this.phase === 'simulating') return;
    if (!serverBalls || serverBalls.length === 0) return;

    serverBalls.forEach(sb => {
      const b = this.balls.find(ball => ball.number === sb.number);
      if (b) {
        // While the local player has ball-in-hand, the local cue-ball
        // position is authoritative. The host may still be broadcasting
        // the previous rack position; never let that stale snapshot
        // overwrite a position the player is currently placing.
        if (
          b.number === 0 &&
          this.ballInHand &&
          this.isLocalTurn &&
          this.phase === 'aiming'
        ) {
          return;
        }

        // Tighter threshold (1.0cm) during simulation ensures Guests follow Host pots accurately.
        const threshold = (this.phase === 'simulating') ? 1.0 : 0.05;
        const dist = Math.hypot(b.pos.x - sb.pos.x, b.pos.z - sb.pos.z);

        if (dist > threshold || b.isPotted !== sb.isPotted) {
          // Absolute snap if drifted or state (pot) changed
          b.pos = { ...sb.pos };
          b.vel = { ...sb.vel };
          b.isPotted = sb.isPotted;
        } else if (dist > 0.005) {
          // GUEST SYNC TUNING:
          // During simulation, we use a gentler lerp (15%) to avoid "yanking" the balls
          // out of their deterministic trajectories due to network jitter.
          // When aiming (stopped), we use a stronger lerp (40%) to ensure perfect alignment.
          const isMoving = this.phase === 'simulating';
          const lerpFactor = isMoving ? 0.15 : 0.4;

          b.pos.x += (sb.pos.x - b.pos.x) * lerpFactor;
          b.pos.z += (sb.pos.z - b.pos.z) * lerpFactor;

          b.vel.x += (sb.vel.x - b.vel.x) * lerpFactor;
          b.vel.z += (sb.vel.z - b.vel.z) * lerpFactor;
        }
      } else {
        this.balls.push({ ...sb });
      }
    });

    // Ensure meshes exist if we have balls and are initialized
    if (this.initialized && this.ballMeshes.size === 0 && this.balls.length > 0) {
      console.log("Engine: Force building meshes in syncBallsFromServer");
      this.buildBalls();
      this.buildCue();
    }
  }

  public remoteShot(
    aimAngle: number,
    power: number,
    spin: Vec2 & { pos?: Vec2 }
  ) {
    this.phase = 'aiming';
    this.aimAngle = aimAngle;
    this.power = power;
    this.currentSpin = {
      x: spin.x,
      z: spin.z
    };

    // The guest's final ball-in-hand position is part of the
    // authoritative shot command. Apply it BEFORE physics starts.
    const cueBall = this.balls.find(b => b.number === 0);

    if (cueBall && spin.pos) {
      const placed = this.clampToBox(spin.pos.x, spin.pos.z);

      cueBall.pos = {
        x: placed.x,
        z: placed.z
      };
      cueBall.vel = { x: 0, z: 0 };
      cueBall.isPotted = false;

      const mesh = this.ballMeshes.get(0);
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(placed.x, BALL_R, placed.z);
      }
    }

    this.executeShot(true);
  }

  private executeShot(isRemote = false) {
    if (this.shotExecuted) return;
    this.shotExecuted = true;
    this.evaluating = false;
    const cueBall = this.balls.find(b => b.number === 0);
    if (!cueBall || cueBall.isPotted) {
      this.shotExecuted = false;
      return;
    }
    if (!this.cueGroup) this.buildCue();
    this.phase = 'simulating';
    this.simFrames = 0;
    this.simStartTimestamp = performance.now(); // TRACK SHOT DURATION
    this.firstHit = null;
    this.pottedInShot = [];
    this.cuePottedInShot = false;
    this.cueLeftBoxCushion = false;
    this.ballInHand = false;
    this.isDragging = false;
    this.updateCursor(false);
    if (!isRemote) {
      this.emit('shot:fired', {
        aimAngle: this.aimAngle,
        power: this.power,
        spin: {
          ...this.currentSpin,
          pos: {
            x: cueBall.pos.x,
            z: cueBall.pos.z
          }
        }
      });
    }
    for (const b of this.balls) { b.firstContactGiven = false; }
    const shootAngle = this.aimAngle;
    const squirtFactor = 0.08;
    const squirtAngle = shootAngle - (this.currentSpin.x * squirtFactor);
    const squirtDir: Vec2 = { x: Math.sin(squirtAngle), z: Math.cos(squirtAngle) };
    const vel = shotVelocity(squirtDir, this.power);
    cueBall.vel = vel;
    cueBall.spin = { ...this.currentSpin };
    sound.cueStrike(this.power / 100);
    this.cueGroup.visible = false;
    this.setCam(this.camMode === 'overhead' ? 'overhead' : 'cinematic', false);
    this.emitHUD();
    setTimeout(() => {
      this.shotExecuted = false;
    }, 100);
  }

  // ── Turn Management ──
  private get currentPlayer(): PlayerState | null {
    return this.players[this.currentPlayerIndex] ?? null;
  }

  private startTurn() {
    if (this.phase === 'roundEnd' || this.gameOver) return;
    this.shotExecuted = false;
    this.evaluating = false;
    if (this.aiThinkTimeout) {
      clearTimeout(this.aiThinkTimeout);
      this.aiThinkTimeout = null;
    }

    if (this.inBattle) {
      this.targetBall = 1;
    } else {
      this.targetBall = getNextTarget(this.balls);
      if (this.targetBall < 0) { this.endRound(); return; }

      const active = this.players.filter(p => !p.isBenched);
      if (active.length === 0) { this.endRound(); return; }

      // Skip benched players
      let tries = 0;
      while (this.players[this.currentPlayerIndex]?.isBenched && tries < this.players.length) {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        tries++;
      }
    }

    this.phase = 'aiming';
    this.power = 0;
    this.isPowering = false;
    this.currentSpin = { x: 0, z: 0 };
    this.shotResult = null;
    this.timeLeft = TURN_DURATION;
    this.lastTimerTick = performance.now();

    this.ballInHand = false;
    this.isDragging = false;
    this.baulkBreakRequired = false;
    this.updateCursor(false);

    const curPlayer = this.players[this.currentPlayerIndex];
    this.isLocalTurn = !!(curPlayer && curPlayer.uid === this.localUid);
    console.log(`Engine: startTurn, isLocalTurn: ${this.isLocalTurn} player: ${curPlayer?.name} (UID: ${curPlayer?.uid}) local: ${this.localUid}`);

    const cueBall = this.balls.find(b => b.number === 0);
    const forceInHand = this.pendingBallInHand;
    this.pendingBallInHand = false;

    if (cueBall && (cueBall.isPotted || forceInHand)) {
      cueBall.isPotted = false;
      cueBall.vel = { x: 0, z: 0 };
      const placed = this.clampToBox(0, -60);
      cueBall.pos = { x: placed.x, z: placed.z };
      const mesh = this.ballMeshes.get(0);
      if (mesh) { mesh.visible = true; mesh.position.set(placed.x, BALL_R, placed.z); }
      this.ballInHand = true;
      const target = this.balls.find(b => b.number === this.targetBall);
      this.baulkBreakRequired = !!target && !target.isPotted && target.pos.z <= BAULK_Z;
    }

    if (curPlayer?.isAI) {
      console.log("Engine: startTurn - setting AI think timeout for", curPlayer.name);

      // Pre-calculate AI shot immediately so the cue stick is visible while "thinking"
      const cueBall = this.balls.find(b => b.number === 0);
      const target = this.balls.find(b => b.number === this.targetBall);
      if (cueBall && target) {
        if (this.baulkBreakRequired) {
          const dz = (PL - cueBall.pos.z);
          const dx = target.pos.x - cueBall.pos.x;
          this.aimAngle = Math.atan2(dx * 0.4, dz);
          this.power = 62;
        } else {
          const result = computeAIShot(cueBall, target, this.balls);
          this.aimAngle = Math.atan2(result.direction.x, result.direction.z);
          this.power = result.power;
        }
      }

      this.setCam('cinematic', false);
      this.aiThinkTimeout = setTimeout(() => this.doAIShot(), 1200);
    } else if (this.isLocalTurn) {
      this.setCam('overhead', false);
    } else {
      this.setCam('cinematic', false);
    }
    this.emitHUD();
  }

  private doAIShot() {
    const curPlayer = this.players[this.currentPlayerIndex];
    if (!curPlayer || !curPlayer.isAI || this.phase !== 'aiming') {
      console.warn("Engine: doAIShot aborted - not AI turn or phase mismatch", { phase: this.phase, isAI: curPlayer?.isAI });
      return;
    }

    // Shot is already calculated in startTurn to make the cue stick visible while "thinking"
    this.executeShot();
  }

  private onShotFinished() {
    if (this.evaluating || this.gameOver) return;

    // Safety: Zero out all ball velocities to stop any residual movement/spinning
    for (const b of this.balls) {
      b.vel = { x: 0, z: 0 };
    }

    if (!this.isAuthoritative) {
      this.phase = 'evaluating';
      return;
    }

    this.evaluating = true;
    if (this.inBattle) { this.onBattleShotFinished(); return; }

    console.log(`Engine: Shot finished. Evaluating... (Host: ${this.isAuthoritative})`);

    const result = evaluateShot({
      cueBallPotted: this.cuePottedInShot,
      firstHit: this.firstHit,
      pottedInShot: this.pottedInShot,
      targetBall: this.targetBall,
      baulkBreakRequired: this.baulkBreakRequired,
      baulkBreakSatisfied: this.cueLeftBoxCushion,
    });

    this.shotResult = result;
    this.players[this.currentPlayerIndex] = applyResult(
      this.players[this.currentPlayerIndex], result, this.balls
    );
    this.players = updateBench(this.players, this.balls);

    if (result.type === 'success' || result.type === 'carom') {
      this.targetBall = getNextTarget(this.balls);
    }
    this.phase = 'evaluating';
    this.emitHUD();

    const extraTurn = result.extraTurn;
    const target = getNextTarget(this.balls);

    this.evalTimeout = setTimeout(() => {
      this.shotResult = null;
      this.evaluating = false;
      if (target < 0 || this.isLeaderUncatchable()) {
        this.endRound();
        return;
      }
      if (!extraTurn) {
        // CRITICAL: Only advance player if authoritative.
        // Guests adopt the player index from the server sync.
        if (this.isAuthoritative) {
          let nextPlayer = (this.currentPlayerIndex + 1) % this.players.length;
          let attempts = 0;
          while (this.players[nextPlayer]?.isBenched && attempts < this.players.length) {
            nextPlayer = (nextPlayer + 1) % this.players.length;
            attempts++;
          }
          this.currentPlayerIndex = nextPlayer;
          console.log(`Engine: Advancing to player ${this.currentPlayerIndex} ${this.players[this.currentPlayerIndex]?.name}`);
        }
      }
      this.startTurn();
    }, 100);
  }

  private isLeaderUncatchable(): boolean {
    if (this.players.length < 2) return false;
    const remaining = this.balls
      .filter(b => !b.isPotted && b.number !== 0)
      .reduce((s, b) => s + (BALL_VALUES[b.number] ?? 0), 0);
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    const leader = sorted[0];
    const runnerUp = sorted[1];
    return leader.score > runnerUp.score + remaining;
  }

  skipTurn() {
    if (this.phase !== 'aiming' && this.phase !== 'powering') return;
    if (!this.players[this.currentPlayerIndex]) return;
    const targetVal = BALL_VALUES[this.targetBall] ?? 0;
    this.shotResult = {
      type: 'miss',
      pottedBalls: [],
      scoreChange: -targetVal,
      message: `Turn forfeited! -${targetVal} pts`,
      extraTurn: false
    };
    this.players[this.currentPlayerIndex].score -= targetVal;
    this.phase = 'evaluating';
    this.isPowering = false;
    this.ballInHand = false;
    this.isDragging = false;
    this.updateCursor(false);
    this.emitHUD();
    this.evalTimeout = setTimeout(() => {
      this.shotResult = null;
      if (this.isAuthoritative) {
        let nextPlayer = (this.currentPlayerIndex + 1) % this.players.length;
        let attempts = 0;
        while (this.players[nextPlayer]?.isBenched && attempts < this.players.length) {
          nextPlayer = (nextPlayer + 1) % this.players.length;
          attempts++;
        }
        this.currentPlayerIndex = nextPlayer;
      }
      this.startTurn();
    }, 500);
  }

  private endRound() {
    this.phase = 'roundEnd';
    this.gameOver = true;
    const winners = getWinners(this.players);
    if (winners.length > 1) {
      this.pendingTieWinners = winners;
      this.ballInHand = false;
      this.isDragging = false;
      this.updateCursor(false);
      if (this.cueGroup) this.cueGroup.visible = false;
      this.setCam('cinematic', false);
      this.emit('tieBreak', { players: [...this.players], tied: winners });
      this.emitHUD();
      return;
    }
    this.finishGame(winners);
  }

  private finishGame(winners: PlayerState[]) {
    this.phase = 'roundEnd';
    this.gameOver = true;
    this.inBattle = false;
    const winnerIds = new Set(winners.map(w => w.id));
    const payout = calcPayout(this.stake, this.players.length, winners.length);
    this.players = this.players.map(p =>
      winnerIds.has(p.id) ? { ...p, balance: p.balance + payout.perWinner } : p
    );
    const finalWinners = this.players.filter(p => winnerIds.has(p.id));
    if (this.cueGroup) this.cueGroup.visible = false;
    this.setCam('cinematic', false);
    this.emit('roundEnd', { players: [...this.players], winners: finalWinners, payout });
    this.emitHUD();
  }

  chooseSplit() {
    if (this.pendingTieWinners.length === 0) return;
    const winners = this.pendingTieWinners;
    this.pendingTieWinners = [];
    this.finishGame(winners);
  }

  chooseBattle() {
    if (this.pendingTieWinners.length === 0) return;
    const contestants = this.pendingTieWinners;
    this.pendingTieWinners = [];
    this.startBattle(contestants);
  }

  private startBattle(contestants: PlayerState[]) {
    this.battleContestants = contestants
      .map(c => this.players.findIndex(p => p.id === c.id))
      .filter(i => i >= 0)
      .sort((a, b) => a - b);
    if (this.battleContestants.length < 2) {
      this.finishGame(contestants);
      return;
    }
    this.inBattle = true;
    this.gameOver = false;
    this.phase = 'aiming';
    this.currentPlayerIndex = this.battleContestants[0];
    const [bx, bz] = CUSHION_POSITIONS[3];
    this.balls = [
      { number: 0, pos: { x: 0, z: BAULK_Z }, vel: { x:0, z:0 }, isPotted: false },
      { number: 1, pos: { x: bx, z: bz },     vel: { x:0, z:0 }, isPotted: false },
    ];
    this.buildBalls();
    this.buildCue();
    this.targetBall = 1;
    this.pendingBallInHand = true;
    this.shotResult = null;
    this.emit('battleStart', { contestants: this.battleContestants.map(i => this.players[i]) });
    this.startTurn();
  }

  private nextContestant(): number {
    if (this.battleContestants.length === 0) return this.currentPlayerIndex;
    const pos = this.battleContestants.indexOf(this.currentPlayerIndex);
    return this.battleContestants[(pos + 1) % this.battleContestants.length];
  }

  private onBattleShotFinished() {
    const pottedOne = this.pottedInShot.includes(1);
    const scratched = this.cuePottedInShot;
    const won = pottedOne && !scratched;
    this.shotResult = won
      ? { type:'success', pottedBalls:[1], scoreChange:0, message:'✓ Potted the 1 — WINNER!', extraTurn:false }
      : scratched
        ? { type:'foul_scratch', pottedBalls:[], scoreChange:0, message:'⚠ Scratch — opponent gets ball-in-hand', extraTurn:false }
        : { type:'miss', pottedBalls:[], scoreChange:0, message:'Miss — opponent to play', extraTurn:false };
    this.phase = 'evaluating';
    this.emitHUD();
    this.evalTimeout = setTimeout(() => {
      this.shotResult = null;
      this.evaluating = false;
      if (won) {
        this.finishGame([this.players[this.currentPlayerIndex]]);
        return;
      }
      this.currentPlayerIndex = this.nextContestant();
      this.startTurn();
    }, 500);
  }

  // ── Camera ──
  setCam(mode: 'overhead'|'cinematic'|'aim'|'table-fit', immediate = false) {
    const isAutoChange = !immediate && (mode === 'cinematic' || mode === 'overhead');
    if (this.camMode === 'table-fit' && isAutoChange) return;
    this.camMode = mode;
    if (mode === 'overhead') {
      this.camera.up.set(0, 1, 0);
      this.camTargetPos.set(0, 300, 10);
      this.camTargetLook.set(0, 0, 0);
    } else if (mode === 'table-fit') {
      const canvas = this.canvas;
      if (!canvas) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const aspect = w / h;
      const fovY = this.camera.fov * Math.PI / 180;
      const margin = 20;
      const distZ = (PL + margin) / Math.tan(fovY / 2);
      const distX = (PW + margin) / (aspect * Math.tan(fovY / 2));
      const dist = Math.max(distX, distZ, 200);
      this.camera.up.set(0, 0, -1);
      this.camTargetPos.set(0, dist, 0);
      this.camTargetLook.set(0, 0, 0);
    } else if (mode === 'cinematic') {
      this.camera.up.set(0, 1, 0);
      const angle = (Date.now() * 0.0001) % (Math.PI * 2);
      this.camTargetPos.set(Math.cos(angle)*220, 160, Math.sin(angle)*180 + 50);
      this.camTargetLook.set(0, 0, 0);
    } else {
      this.camera.up.set(0, 1, 0);
      const cueBall = this.balls.find(b => b.number === 0);
      if (cueBall) {
        const backDir = { x: Math.sin(this.aimAngle), z: Math.cos(this.aimAngle) };
        this.camTargetPos.set(cueBall.pos.x + backDir.x * 100, 90, cueBall.pos.z + backDir.z * 100);
        this.camTargetLook.set(cueBall.pos.x, BALL_R, cueBall.pos.z);
      }
    }
    if (immediate) {
      this.camera.position.copy(this.camTargetPos);
      this.camera.lookAt(this.camTargetLook);
    }
  }

  cycleCam() {
    const modes: ('overhead'|'cinematic'|'aim'|'table-fit')[] = ['overhead','cinematic','aim','table-fit'];
    const idx = modes.indexOf(this.camMode);
    this.setCam(modes[(idx+1) % modes.length], true);
    this.emitHUD();
  }

  // ── Event System ──
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

  public getHUDState(): HUDState {
    return {
      players:              this.players.map(p => ({
        ...p,
        uid: p.uid || '',
        score: p.score || 0,
        pots: p.pots || 0,
        fouls: p.fouls || 0,
        balance: p.balance || 0
      })),
      currentPlayerIndex:   this.currentPlayerIndex || 0,
      targetBall:           this.targetBall || 3,
      timeLeft:             Math.max(0, Math.ceil(this.timeLeft || 0)),
      power:                Math.round(this.power || 0),
      phase:                this.phase || 'aiming',
      prizePool:            this.prizePool || 0,
      shotResult:           this.shotResult,
      stake:                this.stake || 100,
      camMode:              this.camMode || 'table-fit',
      battleMode:           !!this.inBattle,
      spin:                 { x: this.currentSpin.x || 0, z: this.currentSpin.z || 0 },
      aimAngle:             this.aimAngle || 0,
    };
  }

  private emitHUD() {
    this.emit('hud', this.getHUDState());
  }

  private updateHUDTimer(dt: number) {
    if (this.isAuthoritative && this.players.length > 0 && (this.phase === 'aiming' || this.phase === 'powering')) {
      const now = performance.now();
      // Use real elapsed time to avoid drift
      const totalElapsed = (now - this.lastTimerTick) / 1000;

      if (totalElapsed >= 1.0) {
        const secondsToDrop = Math.floor(totalElapsed);
        this.timeLeft = Math.max(0, this.timeLeft - secondsToDrop);

        // Advance the reference point by exactly the number of seconds we dropped
        // to preserve the sub-second remainder and prevent drift.
        this.lastTimerTick += secondsToDrop * 1000;

        if (this.timeLeft <= 0 && this.phase === 'aiming') {
          this.skipTurn();
        }
        this.emitHUD();
      }
    }
  }

  // ── Main Loop ──
  private gameLoop = (timestamp: number) => {
    this.rafId = requestAnimationFrame(this.gameLoop);

    if (!this.lastFrameTimestamp) this.lastFrameTimestamp = timestamp;
    let dt = (timestamp - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = timestamp;

    // Cap dt to avoid massive jumps after tab focus or lag spikes
    if (dt > 0.1) dt = 0.1;

    // Update turn timer
    this.updateHUDTimer(dt);

    if (this.phase === 'simulating') {
      const firstContact = (hitter: number, hit: number) => {
        if (hitter === 0 && this.firstHit === null) {
          this.firstHit = hit;
        }
      };
      const onBallCollision = (impactSpeed: number) => sound.ballClick(impactSpeed);
      const onCushion = (ballNumber: number, _x: number, z: number) => {
        if (ballNumber === 0 && this.firstHit === null && z > BAULK_Z) {
          this.cueLeftBoxCushion = true;
        }
      };

      // FIXED STEP ACCUMULATOR: Ensures identical trajectories on every device
      this.physicsAccumulator += dt;

      // PERFORMANCE FIX: Limit max steps per frame to prevent UI freezing on low-end devices.
      // This will cause "slow motion" rather than "freezing" if hardware is extremely slow.
      const MAX_STEPS = 12;
      let stepsDone = 0;

      while (this.physicsAccumulator >= this.FIXED_DT && stepsDone < MAX_STEPS) {
        const potted = stepPhysics(this.balls, this.FIXED_DT, firstContact, onBallCollision, onCushion);
        this.physicsAccumulator -= this.FIXED_DT;
        this.simFrames++;
        stepsDone++;

        for (const n of potted) {
          if (n === 0) this.cuePottedInShot = true;
          else {
            if (!this.pottedInShot.includes(n)) this.pottedInShot.push(n);
            sound.pocketDrop();
          }
        }
      }

      // REAL-TIME BROADCAST: If Host, emit HUD periodically so React effect can sync balls
      if (this.isAuthoritative && this.simFrames % 10 === 0) {
        this.emitHUD();
      }

      const elapsed = (performance.now() - this.simStartTimestamp) / 1000;

      // GUEST SYNC FIX: If we are not authoritative (Guest), we MUST NOT end simulation
      // until the Server phase actually changes. This prevents the "freeze" where
      // the Guest thinks balls stopped locally but the Host is still moving them.
      const shouldFinishLocally = this.isAuthoritative
        ? (allStopped(this.balls) || elapsed > 15)
        : (this.phase !== 'simulating'); // Wait for syncStateFromServer to flip our phase

      if (this.simFrames > 30 && (shouldFinishLocally || elapsed > 20)) {
        if (elapsed > 20) console.warn("Engine: Simulation timed out, forcing finish.");
        this.onShotFinished();
      }
    }

    if (this.phase === 'powering' && this.isPowering) {
      const held = (performance.now() - this.powerStart) / 1000;
      this.power = Math.min(100, held * 80);
      this.emitHUD();
    }

    if (this.phase === 'simulating' || this.phase === 'evaluating') {
      this.setCam('cinematic', false);
    }

    this.camera.position.lerp(this.camTargetPos, 0.06);
    this.camera.lookAt(this.camTargetLook);

    // Ensure meshes exist if Guest receives balls before scene is ready
    if (this.initialized && this.ballMeshes.size === 0 && this.balls.length > 0) {
      this.buildBalls();
      this.buildCue();
    }

    this.updateEnvironment(dt);
    this.syncBallMeshes();
    this.updateCue();
    this.renderer.render(this.scene, this.camera);
  };

  private updateEnvironment(dt: number) {
    this.envTime += dt;
    const t = this.envTime;
    for (const s of this.flickerSigns) {
      const wobble = 0.88 + 0.12 * Math.sin(t * s.speed + s.phase);
      const dip = Math.sin(t * 17 + s.phase) > 0.985 ? 0.45 : 1;
      s.mat.opacity = s.base * wobble * dip;
    }
    if (this.discoBall) this.discoBall.rotation.y += dt * 0.5;
    if (this.ceilingFan) this.ceilingFan.rotation.y += dt * 0.9;
    if (this.catEyes) {
      this.catEyes.scale.y = Math.sin(t * 0.7) > 0.97 ? 0.15 : 1;
    }
    if (this.tvScreen) {
      this.tvScreen.mat.color.setScalar(0.85 + 0.15 * Math.abs(Math.sin(t * 9)));
    }
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    if (this.timerId) clearInterval(this.timerId);
    if (this.aiThinkTimeout) clearTimeout(this.aiThinkTimeout);
    if (this.evalTimeout) clearTimeout(this.evalTimeout);
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove',  this.onMouseMove);
      this.canvas.removeEventListener('mousedown',  this.onMouseDown);
      this.canvas.removeEventListener('mouseup',    this.onMouseUp);
      this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
      this.canvas.removeEventListener('touchstart', this.onTouchStart);
      this.canvas.removeEventListener('touchmove',  this.onTouchMove);
      this.canvas.removeEventListener('touchend',   this.onTouchEnd);
    }
    window.removeEventListener('mouseup', this.onWindowMouseUp);
    window.removeEventListener('resize',  this.onResize);
    if (this.renderer) this.renderer.dispose();
    this.initialized = false;
  }
}
