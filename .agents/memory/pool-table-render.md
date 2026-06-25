---
name: Pool table felt/pocket depth ordering
description: Why the felt uses polygonOffset and how flat decals on it must be layered
---

# Felt vs. flat decals (pocket holes, markings) — depth ordering

In the killer-pool table render, the felt playing surface uses a NEGATIVE
`polygonOffset` (factor/units around -2). **Why:** the cushion bottoms sit
coplanar with the felt at y≈0, so without the offset the felt z-fights the
cushion bases. Do not remove the felt's polygonOffset to "simplify" — it will
reintroduce that z-fighting.

**Consequence:** any flat decal laid on top of the felt (pocket discs/holes,
spots, lines) is nearly coplanar and will be COVERED by the felt unless it gets
a STRONGER negative polygonOffset than the felt (e.g. -4 vs the felt's -2).
Symptom reported by users: "the pockets/holes are covered by the playing pane."

**How to apply:** give felt decals `polygonOffset: true` with a more negative
factor/units than the felt. A fully robust alternative (no offset tuning) is to
model real cutouts in the felt geometry + a pocket cavity beneath, but boundary
pockets (centred on the table edge/corner) make Shape-with-holes triangulation
awkward, so the offset approach is the pragmatic default.

# Pocket throats: one scalloped outline shared by felt + wood frame

To make the board curve around each pocket (instead of straight rails covering
the holes) AND to surround each hole with green cloth, the felt and the wood
rail frame share ONE computed `playfield` outline (array of [x,z] points). Along
each rail it's the straight nose line; at every pocket it bows OUTWARD in a
circular arc around the hole centre (radius ≈ hole disc r + small margin).
- Felt = `ShapeGeometry(Shape(playVerts))` — green cloth fills the scallop.
- Wood frame = `ExtrudeGeometry` of an outer rectangle with `playVerts` pushed as
  a `holes[]` Path — the wood is cut to the same scallop, so it follows the rail
  angle and never covers a hole.
**Why this works (vs. the "awkward Shape-with-holes" warning above):** the wood's
hole is the WHOLE playfield outline (one simple closed loop fully interior to the
outer rect), NOT six circles straddling the table boundary — so triangulation is
clean. Mapping is `Vector2(x, -z)` then `geo.rotateX(-PI/2)` (same convention as
the cushion `addPrism`). Outer rect CCW + playVerts CW = correct hole winding.
Frame extrude spans y∈[0,TABLE_TH]; position it at `railY - TABLE_TH/2` to centre
on railY. Pocket holes are now plain black `CircleGeometry` discs (no leather
ring) sitting on the green throat. Throat radii are bounded by the outer table
edge AND must stay ≤ the cushion-nose distance or the throat pokes past the
cushions. Verify the 2D outline with a top-down SVG diagram before porting.
