import {
  BallState, PlayerState, HUDState, GamePhase, Vec2, ShotResult,
  stepPhysics, allStopped, evaluateShot, applyResult, updateBench,
  getNextTarget, createPlayers, CUSHION_POSITIONS, BAULK_Z, TURN_DURATION,
  BALL_R, STARTING_BALANCE, shotVelocity, computeAIShot, BALL_PAIRS_19,
  CUSHION_SEGMENTS, BALL_VALUES
} from "@workspace/game-core";

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class GameRoom {
  public id: string;
  public players: (PlayerState & { socketId?: string })[] = [];
  public balls: BallState[] = [];
  public currentPlayerIndex = 0;
  public targetBall = 3;
  public phase: GamePhase = 'aiming';
  public timeLeft = TURN_DURATION;
  public prizePool = 0;
  public stake = 100;
  public mode: 'ai' | 'pvp';
  public lastUpdate = Date.now();
  public isDestroyed = false;

  private firstHit: number | null = null;
  private pottedInShot: number[] = [];
  private cuePottedInShot = false;
  private cueLeftBoxCushion = false;
  private baulkBreakRequired = false;

  constructor(id: string, mode: 'ai' | 'pvp', stake: number) {
    this.id = id;
    this.mode = mode;
    this.stake = stake;
  }

  public addPlayer(config: { id: number, name: string, isAI: boolean, socketId?: string }) {
    // Only add if not already full
    if (this.players.length >= 5) return;

    this.players.push({
      id: config.id,
      name: config.name,
      score: 0,
      fouls: 0,
      pots: 0,
      isAI: config.isAI,
      isBenched: false,
      balance: 0, // Balance is managed via profile but kept in state for HUD
      socketId: config.socketId
    });
  }

  public initGame() {
    this.prizePool = Math.floor(this.stake * this.players.length * 0.9);
    this.balls = [{ number: 0, pos: { x: 0, z: BAULK_Z }, vel: { x: 0, z: 0 }, isPotted: false }];
    this.rackCushionBalls();
    this.startTurn();
  }

  private rackCushionBalls() {
    const [x3, z3] = CUSHION_POSITIONS[3];
    this.balls.push({ number: 3, pos: { x: x3, z: z3 }, vel: { x: 0, z: 0 }, isPotted: false });

    const pairs = shuffle(BALL_PAIRS_19.map(p => [...p] as [number, number]));
    pairs.forEach((pair, i) => {
      const slots = CUSHION_SEGMENTS[i];
      shuffle([...pair]).forEach((n, j) => {
        const [x, z] = slots[j];
        this.balls.push({ number: n, pos: { x, z }, vel: { x: 0, z: 0 }, isPotted: false });
      });
    });
  }

  public handleShot(socketId: string, aimAngle: number, power: number, spin: Vec2) {
    if (this.phase !== 'aiming') return;
    const player = this.players[this.currentPlayerIndex];
    // Allow 'ai' or correct socketId
    if (player.socketId !== socketId && socketId !== 'ai') return;

    this.phase = 'simulating';
    this.firstHit = null;
    this.pottedInShot = [];
    this.cuePottedInShot = false;
    this.cueLeftBoxCushion = false;

    const dir = { x: Math.sin(aimAngle), z: Math.cos(aimAngle) };
    const squirtFactor = 0.08;
    const squirtAngle = aimAngle - (spin.x * squirtFactor);
    const squirtDir = { x: Math.sin(squirtAngle), z: Math.cos(squirtAngle) };

    const cueBall = this.balls.find(b => b.number === 0)!;
    cueBall.vel = shotVelocity(squirtDir, power);
    cueBall.spin = { ...spin };

    this.simulatePhysics();
  }

  private simulatePhysics() {
    const dt = 1/60;
    while (!allStopped(this.balls)) {
      const potted = stepPhysics(this.balls, dt, (hitter, hit) => {
        if (hitter === 0 && this.firstHit === null) this.firstHit = hit;
      }, undefined, (num, x, z) => {
        if (num === 0 && this.firstHit === null && z > BAULK_Z) this.cueLeftBoxCushion = true;
      });

      for (const n of potted) {
        if (n === 0) this.cuePottedInShot = true;
        else if (!this.pottedInShot.includes(n)) this.pottedInShot.push(n);
      }
    }
    this.onShotFinished();
  }

  private onShotFinished() {
    const result = evaluateShot({
      cueBallPotted: this.cuePottedInShot,
      firstHit: this.firstHit,
      pottedInShot: this.pottedInShot,
      targetBall: this.targetBall,
      baulkBreakRequired: this.baulkBreakRequired,
      baulkBreakSatisfied: this.cueLeftBoxCushion,
    });

    this.players[this.currentPlayerIndex] = applyResult(this.players[this.currentPlayerIndex], result, this.balls);
    this.players = updateBench(this.players, this.balls);

    if (result.type === 'success' || result.type === 'carom') {
      this.targetBall = getNextTarget(this.balls);
    }

    if (this.targetBall < 0) {
      this.phase = 'roundEnd';
    } else {
      if (!result.extraTurn) {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      }
      this.startTurn();
    }
  }

  private startTurn() {
    this.phase = 'aiming';
    this.timeLeft = TURN_DURATION;
    this.lastUpdate = Date.now();

    const cueBall = this.balls.find(b => b.number === 0)!;
    if (cueBall.isPotted) {
      cueBall.isPotted = false;
      cueBall.vel = { x: 0, z: 0 };
      cueBall.pos = { x: 0, z: -60 };
    }

    if (this.players[this.currentPlayerIndex].isAI) {
      setTimeout(() => this.doAIShot(), 1500);
    }
  }

  private doAIShot() {
    const cueBall = this.balls.find(b => b.number === 0)!;
    const target = this.balls.find(b => b.number === this.targetBall)!;
    const result = computeAIShot(cueBall, target, this.balls);
    this.handleShot("ai", Math.atan2(result.direction.x, result.direction.z), result.power, {x:0, z:0});
  }

  public getHUDState(): HUDState {
    return {
      players: this.players,
      currentPlayerIndex: this.currentPlayerIndex,
      targetBall: this.targetBall,
      timeLeft: Math.ceil(this.timeLeft),
      aimAngle: 0,
      power: 0,
      phase: this.phase,
      prizePool: this.prizePool,
      shotResult: null,
      stake: this.stake,
      camMode: 'table-fit',
      battleMode: false,
      spin: { x: 0, z: 0 }
    };
  }

  public updateTimer() {
    if (this.phase === 'aiming') {
      const now = Date.now();
      const delta = (now - this.lastUpdate) / 1000;
      this.timeLeft -= delta;
      this.lastUpdate = now;
      if (this.timeLeft <= 0) {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.startTurn();
      }
    }
  }
}
