import {
  PlayerState, BallState, ShotResult, PlayerConfig,
  BALL_VALUES, BALL_SEQUENCE, STARTING_BALANCE
} from './types';

export function createPlayers(configs: PlayerConfig[], stake: number): PlayerState[] {
  return configs.map((c, i) => ({
    id: i,
    name: c.name,
    score: 0,
    fouls: 0,
    pots: 0,
    isAI: c.isAI,
    isBenched: false,
    balance: STARTING_BALANCE - stake,
  }));
}

export function getNextTarget(balls: BallState[]): number {
  for (const n of BALL_SEQUENCE) {
    const b = balls.find(b => b.number === n);
    if (b && !b.isPotted) return n;
  }
  return -1;
}

export function evaluateShot(params: {
  cueBallPotted: boolean;
  firstHit: number | null;
  pottedInShot: number[];
  targetBall: number;
}): ShotResult {
  const { cueBallPotted, firstHit, pottedInShot, targetBall } = params;

  if (cueBallPotted) {
    return {
      type: 'foul_scratch',
      pottedBalls: pottedInShot,
      scoreChange: -(BALL_VALUES[targetBall] ?? 0),
      message: '⚠ SCRATCH! Cue ball potted',
      extraTurn: false,
    };
  }

  if (firstHit !== null && firstHit !== targetBall) {
    const penalty = pottedInShot.reduce((s, n) => s + (BALL_VALUES[n] ?? 0), 0);
    return {
      type: 'foul_wrong',
      pottedBalls: pottedInShot,
      scoreChange: penalty > 0 ? -penalty : 0,
      message: penalty > 0 ? `⚠ FOUL  −${penalty} pts` : '⚠ FOUL — Wrong contact',
      extraTurn: false,
    };
  }

  if (!pottedInShot.includes(targetBall)) {
    return {
      type: 'miss',
      pottedBalls: [],
      scoreChange: 0,
      message: 'Miss',
      extraTurn: false,
    };
  }

  const caroms = pottedInShot.filter(n => n !== targetBall);
  const pts = BALL_VALUES[targetBall] + caroms.reduce((s, n) => s + (BALL_VALUES[n] ?? 0), 0);

  if (caroms.length > 0) {
    return {
      type: 'carom',
      pottedBalls: pottedInShot,
      scoreChange: pts,
      message: `✦ CAROM! +${pts} pts`,
      extraTurn: true,
    };
  }

  return {
    type: 'success',
    pottedBalls: pottedInShot,
    scoreChange: BALL_VALUES[targetBall],
    message: `✓ Potted #${targetBall}  +${BALL_VALUES[targetBall]} pts`,
    extraTurn: true,
  };
}

export function applyResult(
  player: PlayerState,
  result: ShotResult,
  balls: BallState[]
): PlayerState {
  const p = { ...player };
  p.score += result.scoreChange;
  if (result.scoreChange < 0) p.fouls++;
  if (result.type === 'success' || result.type === 'carom') p.pots += result.pottedBalls.length;
  return p;
}

export function updateBench(players: PlayerState[], balls: BallState[]): PlayerState[] {
  const remaining = balls
    .filter(b => !b.isPotted && b.number !== 0)
    .reduce((s, b) => s + (BALL_VALUES[b.number] ?? 0), 0);
  const leader = Math.max(...players.map(p => p.score));
  return players.map(p => ({
    ...p,
    isBenched: (p.score + remaining) < leader && leader > 0,
  }));
}

export function getWinners(players: PlayerState[]): PlayerState[] {
  const maxScore = Math.max(...players.map(p => p.score));
  return players.filter(p => p.score === maxScore);
}

export function calcPayout(stake: number, numPlayers: number, numWinners: number) {
  const pool = stake * numPlayers;
  const fee = Math.round(pool * 0.1);
  const net = pool - fee;
  return { pool, fee, net, perWinner: Math.floor(net / numWinners) };
}
