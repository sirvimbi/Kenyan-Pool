---
name: Pool table dimension model (Option B)
description: How the killer-pool table geometry is parameterized — felt = rolling area, noses at edge, visual-only pocket recess
---

# Killer-pool table dimension model

The table is built around the **nose-to-nose rolling area** as the primary spec
(WPA 7ft = 99.1 × 198.1 cm), using "Option B":

- `TABLE_W` / `TABLE_L` (types.ts) ARE the rolling area = the felt PlaneGeometry.
- Cushion nose line = felt edge: `PW = TABLE_W/2`, `PL = TABLE_L/2`.
- Cushions extend **outward** from the nose over the rails to `±(PW+CD)`, `CD=5`.
  (They do NOT sit inward on the felt — an earlier attempt put noses at
  `TABLE_W/2 - CUSHION`, which shrank the rolling area; that was wrong.)
- `CH` (engine.ts) = cushion nose height above the bed = 3.7 cm (WPA), NOT a
  ball-radius multiple.

**Mouth-width formulas** (engine.ts cushion cutbacks, verified):
- Corner mouth = `(Mc + CD)·√2`  (Mc=3.77, CD=5 → 12.40 cm; spec 12.1–12.7).
- Side mouth   = `2·(Ms + Cs)`, `Cs = CD·tan38°` (Ms=2.9 → 13.61 cm; spec 13.3–14.0).
To retune a mouth, solve these for Mc/Ms — don't eyeball the polygon points.

**Visual vs physics pocket centers are intentionally decoupled.**
**Why:** recessing the *physics* capture centers outward past the nose line makes
balls uncapturable (bounce clamps ball center at `PW-BALL_R`, so it can't reach a
center at `PW+B`). So: physics+AI `POCKETS` stay at the nose corners/edges
(`±PW/±PL`, `±PW/0`); only the rendered hole discs are pushed out by `Bc/Bs≈1.3cm`
for the "recessed" look. Keep this split if asked to move pockets.

**Balls touch the cushions for free:** start positions use `RX=PW-BALL_R`,
`RZ=PL-BALL_R`, so they track the nose line wherever it moves. `HW/HL = PW/PL -
BALL_R` (physics bounce) and ai.ts import the same — change dimensions only via
the `PW/PL` derivation, never hardcode.
