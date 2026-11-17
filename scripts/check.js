// Geometry sanity check for every model: finite values, valid indices, outward winding (positive volume),
// 7 unique colourways each, and a material for every mesh part. Run: node scripts/check.js
const C = require('../src/core.js');
let fail = 0; const ids = new Set(), bad = m => { fail++; console.log('FAIL', m); };
for (const sp of C.SPORTS) {
  if (sp.styles.length !== 7) bad(sp.id + ' has ' + sp.styles.length + ' styles');
  for (const s of sp.styles) { if (ids.has(s.id)) bad('duplicate style id ' + s.id); ids.add(s.id); }
  const lo = {}, hi = {}; for (const s of sp.sliders) { lo[s.key] = s.min / s.k; hi[s.key] = s.max / s.k; }
  const variants = sp.sliders.length ? [{}, lo, hi] : [{}], row = [];
  for (const d of ['low', 'mid', 'high']) for (const v of variants) {
    const r = sp.build(Object.assign({}, sp.defaults, v), d);
    if (v === variants[0]) row.push(r.tris);
    for (const p of r.parts) {
      const P = p.positions, I = p.indices; let vol = 0;
      for (const a of [P, p.normals, p.uvs]) for (const x of a) if (!isFinite(x)) { bad(sp.id + ' ' + p.name + ' non-finite'); break; }
      for (let k = 0; k < I.length; k += 3) {
        const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
        if (Math.max(I[k], I[k + 1], I[k + 2]) >= P.length / 3) bad(sp.id + ' index out of range');
        vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
      }
      if (vol <= 0) bad(sp.id + ' ' + p.name + ' ' + d + ' inverted winding');
    }
    for (const s of sp.styles) { const m = sp.mats(s, r.dims); for (const p of r.parts) if (!m[p.material]) bad(sp.id + ' missing material ' + p.material); }
  }
  console.log(sp.id.padEnd(16), 'tris low/mid/high', row.join(' / '));
}
console.log(C.SPORTS.length + ' models, ' + ids.size + ' colourways, ' + (fail ? fail + ' FAILURES' : 'all checks passed'));
process.exit(fail ? 1 : 0);
