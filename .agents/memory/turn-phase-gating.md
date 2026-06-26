---
name: Turn/phase gating in the game engine
description: startTurn() early-returns when phase==='roundEnd'; any code that restarts play must reset phase first.
---

The engine's `startTurn()` begins with an early return when `this.phase === 'roundEnd'`.

**Rule:** any flow that re-enters live play after the round has ended (e.g. the sudden-death battle started from a tie-break) must set `this.phase` to an active phase (e.g. `'aiming'`) *before* calling `startTurn()`, or the turn silently never starts.

**Why:** `endRound()` sets `phase='roundEnd'`. The tie-break path keeps the engine alive (it emits `tieBreak` instead of paying out), so when the player later chooses the battle, phase is still `roundEnd` and `startTurn()` no-ops — the battle is dead on arrival.

**How to apply:** when adding any post-round continuation (rematch-in-place, sudden death, overtime), reset phase before `startTurn()`, and guard for too-few participants (fall back to `finishGame`).
