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
