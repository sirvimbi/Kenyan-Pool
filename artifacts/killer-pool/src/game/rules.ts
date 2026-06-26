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

  if (cueBallPotted) {
    // Potting object balls together with the cue ball: award the potted value
    // minus the target ball's value, then play passes to the next player.
    const potValue = pottedInShot.reduce((s, n) => s + (BALL_VALUES[n] ?? 0), 0);
    const targetVal = BALL_VALUES[targetBall] ?? 0;
    const change = potValue - targetVal;
    return {
      type: 'foul_scratch',
      pottedBalls: pottedInShot,
      scoreChange: change,
      message: potValue > 0
        ? `⚠ SCRATCH — +${potValue} −${targetVal} = ${change >= 0 ? '+' : ''}${change} pts`
        : '⚠ SCRATCH! Cue ball potted',
      extraTurn: false,
    };
  }

  // Baulk rule: with ball-in-hand and the target ball inside the box, the cue
  // ball must leave the box and strike a cushion outside it before contacting
  // any ball. Failing that is a foul (and any pots are forfeited).
  if (baulkBreakRequired && !baulkBreakSatisfied) {
    const penalty = pottedInShot.reduce((s, n) => s + (BALL_VALUES[n] ?? 0), 0);
    return {
      type: 'foul_baulk',
      pottedBalls: pottedInShot,
      scoreChange: penalty > 0 ? -penalty : 0,
      message: '⚠ FOUL — Must leave the box & hit a cushion first',
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

  // Legal contact (target ball hit first). Any balls potted score their full
  // value and the player continues — even if the target itself wasn't potted.
  if (pottedInShot.length === 0) {
    return {
      type: 'miss',
      pottedBalls: [],
      scoreChange: 0,
      message: 'Miss',
      extraTurn: false,
    };
  }

  const pts = pottedInShot.reduce((s, n) => s + (BALL_VALUES[n] ?? 0), 0);
  const onlyTarget = pottedInShot.length === 1 && pottedInShot[0] === targetBall;

  if (onlyTarget) {
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
  if (result.type === 'foul_scratch' || result.type === 'foul_wrong' || result.type === 'foul_baulk') p.fouls++;
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
