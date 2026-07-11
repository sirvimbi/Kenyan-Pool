import {
  PlayerState, BallState, ShotResult, PlayerConfig,
  BALL_VALUES, BALL_SEQUENCE, STARTING_BALANCE
} from './types';

// `localBalance` is the signed-in player's persistent play-money balance read
// from their profile. Player 0 ("You") plays from that balance; everyone else
// (AI / pass-and-play seats) uses the default grubstake. Each seat pays the
// stake up front into the pot.
export function createPlayers(
  configs: PlayerConfig[],
  stake: number,
  localBalance?: number,
): PlayerState[] {
  return configs.map((c, i) => ({
    id: i,
    name: c.name,
    score: 0,
    fouls: 0,
    pots: 0,
    isAI: c.isAI,
    uid: c.uid,
    isBenched: false,
    balance: (i === 0 && localBalance != null ? localBalance : STARTING_BALANCE) - stake,
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
  baulkBreakRequired?: boolean;
  baulkBreakSatisfied?: boolean;
}): ShotResult {
  const {
    cueBallPotted, firstHit, pottedInShot, targetBall,
    baulkBreakRequired = false, baulkBreakSatisfied = false,
  } = params;

  const targetVal = BALL_VALUES[targetBall] ?? 0;

  // RULE: If player misses target or pots cue ball, target points deducted.
  if (cueBallPotted) {
    return {
      type: 'foul_scratch',
      pottedBalls: pottedInShot,
      scoreChange: -targetVal,
      message: `⚠ SCRATCH! -${targetVal} pts`,
      extraTurn: false,
    };
  }

  // Baulk rule foul
  if (baulkBreakRequired && !baulkBreakSatisfied) {
    return {
      type: 'foul_baulk',
      pottedBalls: pottedInShot,
      scoreChange: -targetVal,
      message: `⚠ FOUL — Must leave box & hit cushion first. -${targetVal} pts`,
      extraTurn: false,
    };
  }

  // RULE: Missing target ball or hitting another ball first is a foul -> deduct target points once.
  if (firstHit === null || firstHit !== targetBall) {
    return {
      type: 'foul_wrong',
      pottedBalls: pottedInShot,
      scoreChange: -targetVal,
      message: firstHit === null ? `⚠ MISSED TARGET! -${targetVal} pts` : `⚠ WRONG BALL! -${targetVal} pts`,
      extraTurn: false,
    };
  }

  // Legal contact (target ball hit first).
  if (pottedInShot.length === 0) {
    // RULE: If player hits target but no pot, no miss prompt needed, just end turn.
    return {
      type: 'miss',
      pottedBalls: [],
      scoreChange: 0,
      message: '', // Empty message to avoid showing prompt
      extraTurn: false,
    };
  }

  // RULE: If player hits target then pots another ball, ported ball points awarded and continue turn.
  const pts = pottedInShot.reduce((s, n) => s + (BALL_VALUES[n] ?? 0), 0);
  const targetPotted = pottedInShot.includes(targetBall);

  if (targetPotted && pottedInShot.length === 1) {
    return {
      type: 'success',
      pottedBalls: pottedInShot,
      scoreChange: pts,
      message: `✓ Potted #${targetBall}  +${pts} pts`,
      extraTurn: true,
    };
  }

  return {
    type: 'carom',
    pottedBalls: pottedInShot,
    scoreChange: pts,
    message: `✦ CAROM! +${pts} pts`,
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
  if (result.type.startsWith('foul')) p.fouls++;
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
