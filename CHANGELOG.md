# Changelog

## Unreleased

- Downloads work in any browser: the current style downloads as one `.glb`, OBJ as its own ZIP, and the per-model and all-196 ZIPs show progress.
- OBJ export gives every material a texture, so Unity no longer puts the frame paint on plain-colour parts such as strings and butt caps.
- Ball textures are anti-aliased (2×2 supersampling) at 1024×512; baseball and tennis-ball seams render about six times faster.
- README in English, Traditional Chinese, Simplified Chinese and Japanese with rendered images; CONTRIBUTING and a CI workflow.

## 0.1.0 — 2026-11-17

- First version: 28 procedural models, 7 colourways each (196 total).
- Rackets and paddles: tennis, soft tennis, squash, badminton, pickleball, table tennis (shakehand, penhold).
- Bats, cues, clubs and sticks: baseball bat, softball bat, pool cue, golf iron, golf putter, woodball mallet, gateball mallet, field hockey stick, bowling pin.
- Balls: basketball, volleyball, football, dodgeball, baseball, tennis ball, shuttlecock, pickleball, table tennis ball, bowling ball, pool ball set, pétanque set.
- Three detail levels, adjustable dimensions on rackets and bats, GLB and OBJ export.
