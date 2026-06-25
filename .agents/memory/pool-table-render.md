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

# Corner throats: route the outline THROUGH the cushion mouth tips

If the playfield outline arcs around a pocket from points found by intersecting a
fixed-radius throat circle with the straight rail (nose) line, it leaves a flat
wood WEDGE between where the cushion mitre ends and where the arc starts — a sharp
corner that looks wrong and can obstruct a ball. **Fix:** make the outline route
inner-end → cushion long-rail mouth tip → arc → cushion short-rail mouth tip →
inner-end at each corner (sides arc directly between the two cushion noses). The
cushion MITRE faces become the outline edges, so the wood is cut flush behind the
angled rail and only the mitred cushion is seen leading into the pocket. Derive
each arc radius from its endpoint (`Math.hypot(Pin−centre)`) so it passes exactly
through the mouth tips — do NOT pass a fixed throat radius. Corner throat radius
ends up ≈ tip-to-hole-centre distance; confirm it still exceeds the hole disc
radius (it does for the WPA dims, ~0.5cm green ring).

# Rail flicker = wood frame inner wall coplanar with cushion nose face

The wood frame's inner vertical wall (the extrude hole edge) runs along the nose
line (x=±PW on long rails, z=±PL on short rails). The cushion prisms' inner
(playing) face is at the SAME nose line. Two coplanar vertical faces → z-fight →
the rail "flickers" at grazing angles and the felt near the rail drops out.
**Fix:** overhang the cushion inner faces inward by a small COVER (~0.6cm):
`IX = side*(PW-COVER)`, `iZ = end*(PL-COVER)`. The cushion face then sits in
front of the wood wall and hides it; the felt's negative polygonOffset handles
the overhang underside. **Why not move the wood instead:** offsetting the wood
hole outward opens gaps at the pocket throats (felt smaller than the hole) — the
cushion overhang is local and leaves felt+wood sharing one outline. Physics is
unaffected (physics/ai read PW/PL/HW/HL from types.ts; cushions are visual only).
