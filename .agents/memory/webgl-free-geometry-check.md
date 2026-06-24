---
name: WebGL-free geometry verification
description: How to visually verify 3D table/board geometry when the headless browser has no WebGL
---

# Verifying 3D geometry without WebGL

The headless test browser AND the app_preview screenshot browser in this environment
have NO WebGL ("Error creating WebGL context"), so Three.js scenes never render for the
agent. Only 2D DOM/SVG renders.

**Technique that works:** replicate the engine's geometry math in a standalone Node script,
emit a top-down **SVG inside an HTML file** written to the artifact's `public/` dir
(served at the artifact base path), then capture it with the `screenshot` tool
(`type: app_preview`, `path: /diagram.html`). SVG is 2D so it renders fine without WebGL.
Draw cushion footprints as polygons + pocket circles + felt-edge guide lines; use zoom
panels for corners/side pockets. Delete the temp file from `public/` when done.

**Why:** lets you self-verify footprint geometry against a reference schematic and iterate
without ever seeing the real 3D render. Found while fixing killer-pool cushion/pocket layout.
