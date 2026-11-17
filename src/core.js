/* RacketCore: pure-JS procedural sports-equipment geometry (meters, Y-up). */
(function (root) {
  const TEX = { x0: -0.15, w: 0.30, y0: 0, h: 0.70 }; // planar paint-map window (front projection)
  const DETAIL = {
    low: { hoop: 32, sec: 8, arm: 8, str: 4, seg: 12 },
    mid: { hoop: 64, sec: 12, arm: 16, str: 5, seg: 20 },
    high: { hoop: 128, sec: 20, arm: 32, str: 8, seg: 32 }
  };
  const mk = (prefix, keys, rows) => rows.map(r => {
    const o = { id: prefix + '_' + r[0], label: r[1] };
    keys.forEach((k, i) => { o[k] = r[i + 2]; });
    if (!o.sw) {
      const sw = [], add = v => { if (typeof v === 'string' && v[0] === '#' && sw.indexOf(v) < 0 && sw.length < 3) sw.push(v); };
      keys.forEach(k => { const v = o[k]; if (Array.isArray(v)) v.forEach(add); else add(v); });
      o.sw = sw;
    }
    return o;
  });
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function hoopPt(g, t) { const s = Math.sin(t), c = Math.cos(t); return [g.rx * s * (1 + g.e * c), g.yc + g.ry * c]; }
  function hoopTan(g, t) {
    const dx = g.rx * (Math.cos(t) + g.e * Math.cos(2 * t)), dy = -g.ry * Math.sin(t), l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }
  function eggMax(e) { let m = 0; for (let i = 0; i <= 200; i++) { const t = Math.PI * i / 200; m = Math.max(m, Math.sin(t) * (1 + e * Math.cos(t))); } return m; }
  function MeshB() { this.p = []; this.uv = []; this.i = []; }
  MeshB.prototype.count = function () { return this.p.length / 3; };
  MeshB.prototype.vert = function (x, y, z, u, v) { this.p.push(x, y, z); this.uv.push(u, v); return this.p.length / 3 - 1; };
  MeshB.prototype.tri = function (a, b, c) { this.i.push(a, b, c); };

  function finish(mb, flat) {
    let p = mb.p, uv = mb.uv, idx = mb.i;
    if (flat) {
      const np = [], nuv = [], ni = [];
      for (let k = 0; k < idx.length; k++) {
        const a = idx[k];
        np.push(p[3 * a], p[3 * a + 1], p[3 * a + 2]); nuv.push(uv[2 * a], uv[2 * a + 1]); ni.push(k);
      }
      p = np; uv = nuv; idx = ni;
    }
    const nrm = new Float32Array(p.length);
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { nrm[q] += nx; nrm[q + 1] += ny; nrm[q + 2] += nz; }
    }
    for (let k = 0; k < nrm.length; k += 3) {
      const l = Math.hypot(nrm[k], nrm[k + 1], nrm[k + 2]) || 1;
      nrm[k] /= l; nrm[k + 1] /= l; nrm[k + 2] /= l;
    }
    return { positions: Array.from(p), uvs: Array.from(uv), normals: Array.from(nrm), indices: Array.from(idx) };
  }
  function concat(list) {
    const o = { positions: [], uvs: [], normals: [], indices: [] };
    for (const m of list) {
      const base = o.positions.length / 3;
      for (const v of m.positions) o.positions.push(v);
      for (const v of m.uvs) o.uvs.push(v);
      for (const v of m.normals) o.normals.push(v);
      for (const v of m.indices) o.indices.push(v + base);
    }
    return o;
  }
  function pack(name, material, m) {
    const nv = m.positions.length / 3;
    return {
      name, material,
      positions: new Float32Array(m.positions), uvs: new Float32Array(m.uvs), normals: new Float32Array(m.normals),
      indices: nv < 65536 ? new Uint16Array(m.indices) : new Uint32Array(m.indices)
    };
  }


  function weld(m) {
    const P = m.positions, N = m.normals, map = new Map();
    for (let i = 0; i < P.length; i += 3) {
      const k = Math.round(P[i] * 1e5) + ',' + Math.round(P[i + 1] * 1e5) + ',' + Math.round(P[i + 2] * 1e5);
      let a = map.get(k); if (!a) { a = [0, 0, 0, []]; map.set(k, a); }
      a[0] += N[i]; a[1] += N[i + 1]; a[2] += N[i + 2]; a[3].push(i);
    }
    map.forEach(a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; for (const i of a[3]) { N[i] = a[0] / l; N[i + 1] = a[1] / l; N[i + 2] = a[2] / l; } });
    return m;
  }
  const smooth = mb => weld(finish(mb, false));

  /* Sweep a closed cross-section (unit, CCW in the N/Z plane) along a path lying in the XY plane. */
  function sweep(mb, path, sec, o) {
    o = o || {};
    const n = path.length, m = sec.length, closed = !!o.closed, cols = o.seam ? m + 1 : m, base = mb.count();
    const planar = (x, y) => [(x - TEX.x0) / TEX.w, (y - TEX.y0) / TEX.h];
    const put = (x, y, z, t) => { if (o.xf) { const q = o.xf(x, y, z); x = q[0]; y = q[1]; z = q[2]; } return mb.vert(x, y, z, t[0], t[1]); };
    for (let i = 0; i < n; i++) {
      const a = path[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)], b = path[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = -ty, ny = tx, P = path[i], z0 = P.z || 0;
      for (let j = 0; j < cols; j++) {
        const s = sec[j % m];
        const x = P.x + nx * s[0] * P.w / 2, y = P.y + ny * s[0] * P.w / 2, z = z0 + s[1] * P.d / 2;
        put(x, y, z, o.uv ? o.uv(i / Math.max(n - 1, 1), j / m, i) : planar(x, y));
      }
    }
    const rings = closed ? n : n - 1;
    for (let i = 0; i < rings; i++) {
      const i2 = (i + 1) % n;
      for (let j = 0; j < m; j++) {
        const j2 = o.seam ? j + 1 : (j + 1) % m;
        const A = base + i * cols + j, B = base + i * cols + j2, C = base + i2 * cols + j, D = base + i2 * cols + j2;
        mb.tri(A, B, C); mb.tri(B, D, C);
      }
    }
    const cap = (ri, flip) => {
      const P = path[ri], c = put(P.x, P.y, P.z || 0, o.uv ? o.uv(ri / Math.max(n - 1, 1), 0.5, ri) : planar(P.x, P.y));
      for (let j = 0; j < m; j++) {
        const j2 = o.seam ? j + 1 : (j + 1) % m, A = base + ri * cols + j, B = base + ri * cols + j2;
        if (flip) mb.tri(c, B, A); else mb.tri(c, A, B);
      }
    };
    if (o.capStart) cap(0, true);
    if (o.capEnd) cap(n - 1, false);
  }

  /* Surface of revolution around +Y. prof = [[r, y], ...]; surface faces to the right of the profile direction. u = angle, v = o.v(i) or height. */
  function lathe(mb, prof, seg, o) {
    o = o || {};
    const n = prof.length, base = mb.count(), cols = seg + 1;
    let y0 = Infinity, y1 = -Infinity; for (const p of prof) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) {
      const a = j / seg * Math.PI * 2, r = prof[i][0];
      let x = r * Math.cos(a), y = prof[i][1], z = -r * Math.sin(a);
      if (o.xf) { const q = o.xf(x, y, z); x = q[0]; y = q[1]; z = q[2]; }
      mb.vert(x, y, z, o.solid ? 0.5 : j / seg, o.solid ? 0.5 : (o.v ? o.v(i, prof[i]) : (prof[i][1] - y0) / ((y1 - y0) || 1)));
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const A = base + i * cols + j, B = base + i * cols + j + 1, C = base + (i + 1) * cols + j, D = C + 1;
      if (prof[i][0] > 1e-9) mb.tri(A, B, C);
      if (prof[i + 1][0] > 1e-9) mb.tri(B, D, C);
    }
  }
  function sphere(mb, R, lon, lat, o) {
    const prof = [];
    for (let i = 0; i <= lat; i++) { const f = Math.PI * i / lat; prof.push([i === 0 || i === lat ? 0 : R * Math.sin(f), -R * Math.cos(f)]); }
    lathe(mb, prof, lon, Object.assign({ v: i => i / lat }, o || {}));
  }
  /* Catmull-Rom through profile points; a point repeated twice makes a hard corner. */
  function curve(pts, sub) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        const f = d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
        out.push([Math.max(f(0), 0), f(1)]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  /* Prism from a star-shaped XY outline between z0 and z1 (flat faces, smooth walls). */
  function extrude(mb, pts, z0, z1, o) {
    o = o || {};
    let area = 0, cx = 0, cy = 0; const n = pts.length;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; cx += a[0]; cy += a[1]; }
    if (area < 0) pts = pts.slice().reverse();
    cx /= n; cy /= n;
    const uv = (x, y) => o.solid ? [0.5, 0.5] : [(x - TEX.x0) / TEX.w, (y - TEX.y0) / TEX.h];
    const put = (x, y, z) => { const t = uv(x, y); if (o.xf) { const q = o.xf(x, y, z); x = q[0]; y = q[1]; z = q[2]; } return mb.vert(x, y, z, t[0], t[1]); };
    for (const z of [z1, z0]) {
      const c = put(cx, cy, z), b = mb.count();
      for (const p of pts) put(p[0], p[1], z);
      for (let i = 0; i < n; i++) { const A = b + i, B = b + (i + 1) % n; if (z === z1) mb.tri(c, A, B); else mb.tri(c, B, A); }
    }
    const w = mb.count();
    for (const p of pts) { put(p[0], p[1], z0); put(p[0], p[1], z1); }
    for (let i = 0; i < n; i++) { const A = w + 2 * i, B = w + 2 * ((i + 1) % n); mb.tri(A, B, B + 1); mb.tri(A, B + 1, A + 1); }
  }
  const rotZ = (deg, px, py) => { const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180); return (x, y, z) => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c, z]; };
  const total = parts => { let t = 0; for (const p of parts) t += p.indices.length / 3; return t; };

  /* ---------- canvas texture helpers ---------- */
  function drawGrip(ctx, W, H, color) {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    const step = H / 9;
    for (const [col, off, lw] of [['rgba(0,0,0,0.22)', 0, 3], ['rgba(255,255,255,0.14)', 4, 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      for (let y = -step; y < H + 2 * step; y += step) { ctx.beginPath(); ctx.moveTo(0, y + off); ctx.lineTo(W, y + off - step); ctx.stroke(); }
    }
  }
  /* Horizontal colour bands along v (0 = bottom). list = [[v0, v1, colour, 'g' for grip-tape lines], ...] */
  function drawBands(ctx, W, H, list) {
    for (const b of list) {
      const y1 = Math.round(H * (1 - b[1])), y0 = Math.round(H * (1 - b[0]));
      ctx.fillStyle = b[2]; ctx.fillRect(0, y1, W, y0 - y1);
      if (b[3] === 'g') {
        ctx.save(); ctx.beginPath(); ctx.rect(0, y1, W, y0 - y1); ctx.clip();
        const step = W * 0.9;
        for (const [col, off] of [['rgba(0,0,0,0.25)', 0], ['rgba(255,255,255,0.15)', 3]]) {
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          for (let y = y1 - step; y < y0 + 2 * step; y += step) { ctx.beginPath(); ctx.moveTo(0, y + off); ctx.lineTo(W, y + off - step); ctx.stroke(); }
        }
        ctx.restore();
      }
    }
  }
  const bandMat = (list, rough, metal, w) => ({ draw: (c, W, H) => drawBands(c, W, H, list), size: [w || 64, 1024], rough: rough, metal: metal || 0 });
  /* Per-pixel equirect texture for spheres: fn(direction, sampleIndex, sampleCount) -> [r, g, b].
     Each pixel averages a 2x2 grid of samples so hard-edged patterns (seams, panels) are anti-aliased.
     The sample index lets expensive, colour-independent lookups be cached across colourways. */
  function pix(ctx, W, H, fn) {
    const im = ctx.createImageData(W, H), D = im.data, n = 4 * W * H; let k = 0, q = 0; const d = [0, 0, 0], O = [0.25, 0.75];
    const cosA = new Float64Array(2 * W), sinA = new Float64Array(2 * W);
    for (let i = 0; i < 2 * W; i++) { const a = Math.PI * (i + 0.5) / W; cosA[i] = Math.cos(a); sinA[i] = Math.sin(a); }
    for (let py = 0; py < H; py++) {
      const rows = O.map(o => { const f = Math.PI * (1 - (py + o) / H); return [Math.sin(f), Math.cos(f)]; });
      for (let px = 0; px < W; px++) {
        let r = 0, g = 0, b = 0;
        for (const [sf, cf] of rows) for (let j = 0; j < 2; j++) {
          const i = 2 * px + j; d[0] = sf * cosA[i]; d[1] = -cf; d[2] = -sf * sinA[i];
          const c = fn(d, q++, n); r += c[0]; g += c[1]; b += c[2];
        }
        D[k++] = r / 4; D[k++] = g / 4; D[k++] = b / 4; D[k++] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
  }
  const pixMat = (fn, rough, metal, size) => ({ draw: (c, W, H) => pix(c, W, H, fn), size: size || [1024, 512], rough: rough, metal: metal || 0 });
  function superSection(m) {
    const s = [];
    for (let j = 0; j < m; j++) {
      const a = j / m * Math.PI * 2, c = Math.cos(a), q = Math.sin(a);
      s.push([Math.sign(c) * Math.sqrt(Math.abs(c)), Math.sign(q) * Math.sqrt(Math.abs(q))]);
    }
    return s;
  }
  function circleSection(m) { const s = []; for (let j = 0; j < m; j++) { const a = j / m * Math.PI * 2; s.push([Math.cos(a), Math.sin(a)]); } return s; }
  const OCT = (k => [[1, k], [k, 1], [-k, 1], [-1, k], [-1, -k], [-k, -1], [k, -1], [1, -k]])(0.45);


  /* ---------------- Strung rackets with a throat: tennis, soft tennis, squash ---------------- */
  const RK = ['p', 'grip', 'butt', 'strings', 'rough', 'metal'];
  const TENNIS_DEFAULTS = { length: 0.685, headW: 0.26, headL: 0.335, beam: 0.023, frameW: 0.012, mains: 16, crosses: 19, egg: 0.07 };
  const TENNIS_STYLES = mk('racket', RK, [
    ['oneside_pian', '半邊撞色', ['split', '#efe6d6', '#f0705f'], '#efe6d6', '#f0705f', '#f3efe4', 0.45, 0],
    ['grinder_pan', '鋼灰深藍', ['lower', '#8590a8', '#252f4d'], '#252f4d', '#8590a8', '#d9dde6', 0.5, 0.15],
    ['angle_vera', '白金飾線', ['stripe', '#f1eee6', '#d8a92f', '#d8a92f'], '#f1eee6', '#d8a92f', '#f5f2ea', 0.4, 0],
    ['center_zheng', '海軍藍白', ['stripe', '#2b3a70', '#f4f5f7'], '#f4f5f7', '#f4f5f7', '#e6e9f2', 0.4, 0.1],
    ['drop_gui', '紫配螢光綠', ['tri', '#7a4be0', '#b9f23c', '#35245f'], '#35245f', '#b9f23c', '#ece6ff', 0.45, 0],
    ['serve_pao', '紅黑漸層', ['grad', '#e2232e', '#1b1b1f'], '#f2f2f0', '#1b1b1f', '#f2f2f0', 0.4, 0.05],
    ['king_rayne', '皇家金紫', ['lower', '#d9a521', '#3a2460', '#d9a521', 0.012], '#3a2460', '#d9a521', '#f3e6b8', 0.28, 0.85]
  ]);
  const SOFT_DEFAULTS = { length: 0.69, headW: 0.228, headL: 0.30, beam: 0.019, frameW: 0.010, mains: 16, crosses: 17, egg: 0.05 };
  const SOFT_STYLES = mk('softtennis', RK, [
    ['sky', '天空藍白', ['stripe', '#f4f6f8', '#3aa0e8', '#3aa0e8'], '#f4f6f8', '#3aa0e8', '#f4f6f8', 0.4, 0],
    ['lime_black', '黑配萊姆', ['lower', '#1c1d21', '#b9f23c'], '#1c1d21', '#b9f23c', '#f2f2f0', 0.4, 0.05],
    ['sunrise', '日出橘黃', ['grad', '#ffb22e', '#e8472b'], '#f4f5f7', '#e8472b', '#fff6e0', 0.4, 0],
    ['mint', '薄荷綠白', ['split', '#f4f6f4', '#3fc9a0'], '#f4f6f4', '#3fc9a0', '#effaf5', 0.45, 0],
    ['rose_navy', '玫瑰深藍', ['tri', '#1d2a55', '#f0569a', '#1d2a55'], '#f4f5f7', '#f0569a', '#fde8f1', 0.4, 0.05],
    ['silver', '銀白飾線', ['stripe', '#c9ced6', '#1c1d21'], '#1c1d21', '#c9ced6', '#f2f2f0', 0.3, 0.6],
    ['violet', '紫羅蘭', ['top', '#f2eefc', '#7a4be0'], '#7a4be0', '#f2eefc', '#f2eefc', 0.4, 0]
  ]);
  const SQUASH_DEFAULTS = { length: 0.686, headW: 0.215, beam: 0.019, frameW: 0.0095, mains: 14, crosses: 18, egg: 0.85, throat: 'tear', hoopBot: 0.265, myLo: 0.14 };
  const SQUASH_STYLES = mk('squash', RK, [
    ['carbon_red', '碳黑紅', ['top', '#1c1d21', '#e2232e'], '#1c1d21', '#e2232e', '#f2f2f0', 0.35, 0.3],
    ['ice', '冰藍', ['grad', '#bfeaf7', '#1f6fd0'], '#f4f5f7', '#1f6fd0', '#e9f7fd', 0.35, 0.1],
    ['volt', '螢光黃', ['split', '#d7f531', '#17181c'], '#17181c', '#d7f531', '#17181c', 0.4, 0],
    ['orange', '亮橘黑', ['stripe', '#17181c', '#f08a24', '#f08a24'], '#17181c', '#f08a24', '#f4f4f2', 0.4, 0.1],
    ['white_gold', '白金', ['stripe', '#f1eee6', '#d8a92f'], '#f1eee6', '#d8a92f', '#f5f2ea', 0.35, 0.1],
    ['teal', '青綠', ['top', '#0b3d3a', '#16c7b0'], '#f4f5f7', '#16c7b0', '#e6fbf7', 0.4, 0.1],
    ['magenta', '洋紅紫', ['grad', '#f0447a', '#3b1d6b'], '#3b1d6b', '#f0447a', '#fde8f1', 0.4, 0.1]
  ]);

  function racketDims(P) {
    const w = P.frameW, tear = P.throat === 'tear', xmax = P.headW / 2 - w / 2;
    const hoopBot = tear ? P.hoopBot : P.length - P.headL, ry = (P.length - hoopBot) / 2 - w / 2;
    return {
      w, d: P.beam, xmax, rx: xmax / eggMax(P.egg), ry, yc: P.length - ry - w / 2, e: P.egg, hoopBot, L: P.length, tear,
      buttTop: 0.016, gripTop: 0.198, shaftBase: 0.204, shaftTop: tear ? hoopBot + 0.03 : 0.25, armEndY: 0.236, t0: 140 * Math.PI / 180
    };
  }
  function armPath(g, n, side) {
    const p0 = hoopPt(g, g.t0), t = hoopTan(g, g.t0);
    const p3 = [g.w / 2 + 0.001, g.armEndY];
    const p1 = [p0[0] + t[0] * 0.06, p0[1] + t[1] * 0.06], p2 = [p3[0], p3[1] + 0.07];
    const out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, v = 1 - u;
      const b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
      out.push({ x: side * (b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0]), y: b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1], w: g.w, d: g.d });
    }
    return out;
  }
  function stringLayout(g, P, mx, my) {
    mx = mx || 0.024; my = my || 0.028;
    const out = { mains: [], crosses: [] };
    const fx = t => g.rx * Math.sin(t) * (1 + g.e * Math.cos(t));
    const half = (g.xmax || g.rx) - mx;
    for (let k = 0; k < P.mains; k++) {
      const x = P.mains > 1 ? -half + 2 * half * k / (P.mains - 1) : 0, ax = Math.abs(x), ys = [];
      const N = 400; let prev = fx(0) - ax;
      for (let i = 1; i <= N; i++) {
        const t = Math.PI * i / N, cur = fx(t) - ax;
        if ((prev < 0) !== (cur < 0)) { const tt = Math.PI * (i - 1 + prev / (prev - cur)) / N; ys.push(g.yc + g.ry * Math.cos(tt)); }
        prev = cur;
      }
      if (ys.length >= 2) out.mains.push({ x, y0: Math.min(ys[0], ys[ys.length - 1]), y1: Math.max(ys[0], ys[ys.length - 1]) });
    }
    const lo = g.yc - g.ry + (P.myLo || my), hi = g.yc + g.ry - my;
    for (let k = 0; k < P.crosses; k++) {
      const y = P.crosses > 1 ? lo + (hi - lo) * k / (P.crosses - 1) : g.yc;
      const x = fx(Math.acos((y - g.yc) / g.ry));
      out.crosses.push({ y, x0: -x, x1: x });
    }
    return out;
  }
  const racketBuilder = DEF => function (params, detail) {
    const P = Object.assign({}, DEF, params || {}), D = DETAIL[detail] || DETAIL.mid, g = racketDims(P);
    const sec = superSection(D.sec);
    const fr = new MeshB(), hoop = [];
    for (let i = 0; i < D.hoop; i++) { const p = hoopPt(g, i / D.hoop * Math.PI * 2); hoop.push({ x: p[0], y: p[1], w: g.w, d: g.d }); }
    sweep(fr, hoop, sec, { closed: true });
    const shaft = new MeshB();
    if (g.tear) {
      sweep(shaft, [
        { x: 0, y: g.shaftBase, w: 0.0305, d: 0.0275 }, { x: 0, y: g.shaftBase + 0.02, w: 0.021, d: Math.max(g.d, 0.02) + 0.001 },
        { x: 0, y: g.hoopBot + 0.012, w: 0.02, d: g.d + 0.001 }, { x: 0, y: g.shaftTop + 0.012, w: 0.024, d: g.d + 0.0005 }
      ], OCT, { capEnd: true });
    } else {
      sweep(fr, armPath(g, D.arm, 1), sec, { capStart: true, capEnd: true });
      sweep(fr, armPath(g, D.arm, -1), sec, { capStart: true, capEnd: true });
      sweep(shaft, [
        { x: 0, y: g.shaftBase, w: 0.0305, d: 0.0275 }, { x: 0, y: g.shaftBase + 0.018, w: 2 * g.w + 0.005, d: Math.max(g.d, 0.02) + 0.001 },
        { x: 0, y: g.shaftTop, w: 2 * g.w + 0.004, d: g.d + 0.0005 }
      ], OCT, { capEnd: true });
    }
    const grip = new MeshB();
    sweep(grip, [{ x: 0, y: g.buttTop, w: 0.0338, d: 0.0298 }, { x: 0, y: g.gripTop, w: 0.0318, d: 0.0282 }], OCT, { seam: true, uv: (r, s) => [s, r] });
    const butt = new MeshB(), solid = () => [0.5, 0.5];
    sweep(butt, [
      { x: 0, y: 0, w: 0.035, d: 0.031 }, { x: 0, y: 0.0025, w: 0.0395, d: 0.0355 },
      { x: 0, y: 0.013, w: 0.0395, d: 0.0355 }, { x: 0, y: g.buttTop, w: 0.0345, d: 0.0305 }
    ], OCT, { capStart: true, uv: solid });
    sweep(butt, [{ x: 0, y: g.gripTop - 0.001, w: 0.0335, d: 0.0298 }, { x: 0, y: g.shaftBase + 0.001, w: 0.0335, d: 0.0298 }], OCT, { capStart: true, capEnd: true, uv: solid });
    const st = new MeshB(), r = 0.0007, cs = circleSection(D.str), lay = stringLayout(g, P);
    for (const s of lay.mains) sweep(st, [{ x: s.x, y: s.y0, z: r, w: 2 * r, d: 2 * r }, { x: s.x, y: s.y1, z: r, w: 2 * r, d: 2 * r }], cs, { uv: solid });
    for (const s of lay.crosses) sweep(st, [{ x: s.x0, y: s.y, z: -r, w: 2 * r, d: 2 * r }, { x: s.x1, y: s.y, z: -r, w: 2 * r, d: 2 * r }], cs, { uv: solid });
    const parts = [
      pack('Frame', 'paint', concat([finish(fr, false), finish(shaft, true)])),
      pack('Grip', 'grip', finish(grip, true)), pack('ButtCap', 'butt', finish(butt, true)), pack('Strings', 'strings', finish(st, false))
    ];
    return { parts, tris: total(parts), dims: g, params: P };
  };

  /* ---------------- Paint maps (front-projected colour layout, drawn on a 2D canvas) ---------------- */
  function kit(ctx, W, H, g) {
    const X = x => (x - TEX.x0) / TEX.w * W, Y = y => (1 - (y - TEX.y0) / TEX.h) * H, L = TEX.x0, R = TEX.x0 + TEX.w;
    const k = { X, Y, L, R };
    k.rect = (x0, y0, x1, y1, col) => { ctx.fillStyle = col; ctx.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1)); };
    k.all = col => k.rect(L, 0, R, TEX.h, col);
    k.band = (y0, y1, col) => k.rect(L, y0, R, y1, col);
    k.poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.closePath(); ctx.fill(); };
    k.line = (pts, widthM, col) => { ctx.strokeStyle = col; ctx.lineWidth = widthM / TEX.w * W; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))); ctx.stroke(); };
    k.disc = (cx, cy, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(X(cx), Y(cy), r / TEX.w * W, r / TEX.h * H, 0, 0, Math.PI * 2); ctx.fill(); };
    k.grad = (stops) => { const gr = ctx.createLinearGradient(0, Y(stops[0][0]), 0, Y(stops[stops.length - 1][0])); const a = stops[0][0], b = stops[stops.length - 1][0]; stops.forEach(s => gr.addColorStop((s[0] - a) / (b - a), s[1])); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); };
    k.stripe = (a0, a1, widthM, col) => {
      for (const side of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 60; i++) { const t = (a0 + (a1 - a0) * i / 60) * Math.PI / 180, p = hoopPt(g, t), tn = hoopTan(g, t); pts.push([side * (p[0] - tn[1] * g.w / 2), p[1] + tn[0] * g.w / 2]); }
        k.line(pts, widthM, col);
      }
    };
    return k;
  }
  function paintFrame(ctx, W, H, s, g) {
    const K = kit(ctx, W, H, g), p = s.p, a = p[1], b = p[2], c = p[3];
    switch (p[0]) {
      case 'split': K.all(a); K.rect(0, g.shaftTop, K.R, TEX.h, b); break;
      case 'lower': K.all(a); K.band(0, g.hoopBot + (p[4] || 0), b); if (c) K.band(0.262, 0.27, c); break;
      case 'stripe': K.all(a); K.stripe(g.tear ? 12 : 20, g.tear ? 100 : 130, 0.006, b); if (c) K.band(0.262, 0.269, c); break;
      case 'tri': K.all(a); K.band(0, g.hoopBot, b); K.band(0, 0.272, c); break;
      case 'grad': K.grad([[g.yc - 0.01, a], [g.yc - 0.09, b]]); break;
      case 'top': K.all(a); K.band(g.yc + g.ry * 0.4, TEX.h, b); break;
      default: K.all(a || '#dddddd');
    }
  }
  const gripMat = col => ({ draw: (c, W, H) => drawGrip(c, W, H, col), size: [128, 512], rough: 0.92, metal: 0, wrap: true });
  const racketMats = (s, g) => ({
    paint: { draw: (c, W, H) => paintFrame(c, W, H, s, g), size: [1024, 2048], rough: s.rough, metal: s.metal },
    grip: gripMat(s.grip), butt: { color: s.butt, rough: 0.5, metal: s.metal }, strings: { color: s.strings, rough: 0.6, metal: 0 }
  });
  /* ---------------- Badminton ---------------- */
  const BADMINTON_DEFAULTS = { length: 0.675, headW: 0.19, headL: 0.245, beam: 0.010, frameW: 0.007, mains: 22, crosses: 21, egg: 0.10 };
  const BADMINTON_STYLES = [
    { id: 'badminton_smash_red', label: '殺球紅黑', grip: '#1b1b1f', butt: '#e2232e', strings: '#f4f4f2', rough: 0.35, metal: 0.1, sw: ['#e2232e', '#17181c'] },
    { id: 'badminton_ice_blue', label: '冰藍白', grip: '#f3f6f9', butt: '#22b8e6', strings: '#e9f7fd', rough: 0.35, metal: 0.05, sw: ['#f3f6f9', '#22b8e6'] },
    { id: 'badminton_volt', label: '螢光黃黑', grip: '#17181c', butt: '#d7f531', strings: '#f4f4f2', rough: 0.4, metal: 0.05, sw: ['#d7f531', '#17181c'] },
    { id: 'badminton_navy_gold', label: '海軍金', grip: '#1d2a55', butt: '#d8a92f', strings: '#f3e6b8', rough: 0.3, metal: 0.4, sw: ['#1d2a55', '#d8a92f'] },
    { id: 'badminton_sakura', label: '櫻花粉白', grip: '#f48fb1', butt: '#faf6f4', strings: '#fff3f7', rough: 0.4, metal: 0.0, sw: ['#faf6f4', '#f48fb1'] },
    { id: 'badminton_carbon', label: '碳黑銀', grip: '#26282d', butt: '#c9ced6', strings: '#d9dde6', rough: 0.3, metal: 0.55, sw: ['#26282d', '#c9ced6'] },
    { id: 'badminton_aurora', label: '極光青紫', grip: '#f4f5f7', butt: '#7a4be0', strings: '#ece6ff', rough: 0.35, metal: 0.15, sw: ['#16c7b0', '#7a4be0', '#f4f5f7'] }
  ];
  function buildBadminton(params, detail) {
    const P = Object.assign({}, BADMINTON_DEFAULTS, params || {}), D = DETAIL[detail] || DETAIL.mid, w = P.frameW;
    const g = { w, d: P.beam, rx: P.headW / 2 - w / 2, ry: P.headL / 2 - w / 2, yc: P.length - P.headL / 2, e: P.egg,
      hoopBot: P.length - P.headL, L: P.length, buttTop: 0.014, gripTop: 0.165, coneTop: 0.215 };
    const fr = new MeshB(), hoop = [];
    for (let i = 0; i < D.hoop; i++) { const p = hoopPt(g, i / D.hoop * Math.PI * 2); hoop.push({ x: p[0], y: p[1], w: g.w, d: g.d }); }
    sweep(fr, hoop, superSection(D.sec), { closed: true });
    sweep(fr, [{ x: 0, y: g.coneTop - 0.012, w: 0.0072, d: 0.0072 }, { x: 0, y: g.hoopBot + 0.003, w: 0.0072, d: 0.0072 }], circleSection(Math.max(D.sec, 8)), {});
    const hard = new MeshB();
    sweep(hard, [{ x: 0, y: 0.168, w: 0.0262, d: 0.0242 }, { x: 0, y: 0.178, w: 0.024, d: 0.022 }, { x: 0, y: g.coneTop, w: 0.0098, d: 0.0098 }], OCT, { capEnd: true });
    sweep(hard, [
      { x: 0, y: g.hoopBot - 0.03, w: 0.0088, d: 0.0088 }, { x: 0, y: g.hoopBot - 0.008, w: 0.016, d: g.d + 0.001 },
      { x: 0, y: g.hoopBot + 0.004, w: 0.03, d: g.d + 0.0005 }
    ], OCT, { capStart: true, capEnd: true });

    const grip = new MeshB();
    sweep(grip, [{ x: 0, y: g.buttTop, w: 0.0258, d: 0.0238 }, { x: 0, y: g.gripTop, w: 0.0248, d: 0.0228 }], OCT, { seam: true, uv: (r, s) => [s, r] });
    const butt = new MeshB(), solid = () => [0.5, 0.5];
    sweep(butt, [{ x: 0, y: 0, w: 0.026, d: 0.024 }, { x: 0, y: 0.002, w: 0.0295, d: 0.0275 }, { x: 0, y: 0.011, w: 0.0295, d: 0.0275 }, { x: 0, y: g.buttTop, w: 0.0262, d: 0.0242 }], OCT, { capStart: true, uv: solid });
    sweep(butt, [{ x: 0, y: g.gripTop - 0.001, w: 0.0266, d: 0.0246 }, { x: 0, y: 0.169, w: 0.0266, d: 0.0246 }], OCT, { capStart: true, capEnd: true, uv: solid });

    const st = new MeshB(), r = 0.00035, cs = circleSection(Math.min(D.str, 5)), lay = stringLayout(g, P, 0.012, 0.014);
    for (const s of lay.mains) sweep(st, [{ x: s.x, y: s.y0, z: r, w: 2 * r, d: 2 * r }, { x: s.x, y: s.y1, z: r, w: 2 * r, d: 2 * r }], cs, { uv: solid });
    for (const s of lay.crosses) sweep(st, [{ x: s.x0, y: s.y, z: -r, w: 2 * r, d: 2 * r }, { x: s.x1, y: s.y, z: -r, w: 2 * r, d: 2 * r }], cs, { uv: solid });

    const parts = [
      pack('Frame', 'paint', concat([finish(fr, false), finish(hard, true)])),
      pack('Grip', 'grip', finish(grip, true)), pack('ButtCap', 'butt', finish(butt, true)), pack('Strings', 'strings', finish(st, false))
    ];
    let tris = 0; for (const p of parts) tris += p.indices.length / 3;
    return { parts, tris, dims: g, params: P };
  }

  /* ---------------- Pickleball ---------------- */
  const PICKLE_DEFAULTS = { faceW: 0.20, faceL: 0.275, corner: 0.045, thick: 0.014 };
  const PICKLE_STYLES = [
    { id: 'paddle_split_coral', label: '斜切珊瑚', grip: '#efe6d6', butt: '#f0705f', edge: '#f0705f', rough: 0.7, metal: 0, sw: ['#efe6d6', '#f0705f'] },
    { id: 'paddle_court_blue', label: '球場藍綠', grip: '#f4f5f7', butt: '#1f5fa8', edge: '#f4f5f7', rough: 0.7, metal: 0, sw: ['#1f5fa8', '#2e9d6a', '#f4f5f7'] },
    { id: 'paddle_volt_stripe', label: '螢光斜紋', grip: '#17181c', butt: '#d7f531', edge: '#d7f531', rough: 0.65, metal: 0, sw: ['#17181c', '#d7f531'] },
    { id: 'paddle_sunset', label: '夕陽漸層', grip: '#f4f5f7', butt: '#5b2a9d', edge: '#3b1d6b', rough: 0.7, metal: 0, sw: ['#ffb22e', '#f0447a', '#5b2a9d'] },
    { id: 'paddle_target', label: '靶心紅藍', grip: '#1d2a55', butt: '#e2232e', edge: '#1d2a55', rough: 0.7, metal: 0, sw: ['#f4f2ec', '#e2232e', '#1d2a55'] },
    { id: 'paddle_chevron_teal', label: '青綠 V 紋', grip: '#f4f5f7', butt: '#0b3d3a', edge: '#0b3d3a', rough: 0.7, metal: 0, sw: ['#12897f', '#f4f5f7', '#0b3d3a'] },
    { id: 'paddle_royal_gold', label: '皇家金紫', grip: '#3a2460', butt: '#d9a521', edge: '#d9a521', rough: 0.45, metal: 0.35, sw: ['#3a2460', '#d9a521'] }
  ];
  function paddleOutline(g, n) {
    const hw = g.hw, top = g.top, bot = g.bot, rT = g.rT, rB = g.rB, pts = [[0, top]];
    const arc = (cx, cy, r, a0, a1) => { for (let i = 0; i <= 48; i++) { const a = (a0 + (a1 - a0) * i / 48) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
    arc(hw - rT, top - rT, rT, 90, 0); arc(hw - rB, bot + rB, rB, 0, -90);
    arc(-hw + rB, bot + rB, rB, -90, -180); arc(-hw + rT, top - rT, rT, 180, 90); pts.push([0, top]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1], out = []; let k = 1;
    for (let i = 0; i < n; i++) {
      const s = total * i / n;
      while (k < cum.length - 1 && cum[k] < s) k++;
      const seg = cum[k] - cum[k - 1] || 1, f = (s - cum[k - 1]) / seg;
      out.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f]);
    }
    return out;
  }
  function buildPickle(params, detail) {
    const P = Object.assign({}, PICKLE_DEFAULTS, params || {}), D = DETAIL[detail] || DETAIL.mid;
    const hw = P.faceW / 2, bot = 0.125, top = bot + P.faceL;
    const rT = Math.min(P.corner, hw - 0.002, P.faceL / 2 - 0.01), rB = Math.min(0.072, hw - 0.022, P.faceL - rT - 0.01);
    const g = { hw, bot, top, rT, rB, fc: (bot + top) / 2, t: P.thick, L: top, buttTop: 0.014, gripTop: 0.118 };
    const out = paddleOutline(g, Math.round(D.hoop * 1.5)), n = out.length;
    const uvp = (x, y) => [(x - TEX.x0) / TEX.w, (y - TEX.y0) / TEX.h];

    const face = new MeshB();
    for (const z of [g.t / 2, -g.t / 2]) {
      const c = face.vert(0, g.fc, z, ...uvp(0, g.fc)), b = face.count();
      for (const p of out) face.vert(p[0], p[1], z, ...uvp(p[0], p[1]));
      for (let i = 0; i < n; i++) { const A = b + i, B = b + (i + 1) % n; if (z > 0) face.tri(c, B, A); else face.tri(c, A, B); }
    }
    const solid = () => [0.5, 0.5];
    const edge = new MeshB();
    sweep(edge, out.map(p => ({ x: p[0], y: p[1], w: 0.007, d: g.t + 0.003 })), superSection(D.sec), { closed: true, uv: solid });
    const neck = new MeshB();
    sweep(neck, [
      { x: 0, y: g.gripTop + 0.004, w: 0.0325, d: 0.0285 }, { x: 0, y: bot + 0.006, w: 0.04, d: g.t + 0.0045 },
      { x: 0, y: bot + 0.03, w: 0.058, d: g.t + 0.002 }
    ], OCT, { capStart: true, capEnd: true, uv: solid });

    const grip = new MeshB();
    sweep(grip, [{ x: 0, y: g.buttTop, w: 0.0318, d: 0.0282 }, { x: 0, y: g.gripTop, w: 0.031, d: 0.0275 }], OCT, { seam: true, uv: (r, s) => [s, r] });
    const butt = new MeshB();
    sweep(butt, [{ x: 0, y: 0, w: 0.033, d: 0.029 }, { x: 0, y: 0.0025, w: 0.037, d: 0.033 }, { x: 0, y: 0.011, w: 0.037, d: 0.033 }, { x: 0, y: g.buttTop, w: 0.0325, d: 0.0288 }], OCT, { capStart: true, uv: solid });
    sweep(butt, [{ x: 0, y: g.gripTop - 0.001, w: 0.0335, d: 0.0295 }, { x: 0, y: g.gripTop + 0.005, w: 0.0335, d: 0.0295 }], OCT, { capStart: true, capEnd: true, uv: solid });

    const parts = [
      pack('Face', 'paint', finish(face, true)),
      pack('EdgeGuard', 'edge', concat([finish(edge, false), finish(neck, true)])),
      pack('Grip', 'grip', finish(grip, true)), pack('ButtCap', 'butt', finish(butt, true))
    ];
    let tris = 0; for (const p of parts) tris += p.indices.length / 3;
    return { parts, tris, dims: g, params: P };
  }

  function paintBadminton(ctx, W, H, s, g) {
    const K = kit(ctx, W, H, g), cone = 0.222;
    switch (s.id) {
      case 'badminton_smash_red': K.grad([[g.yc + 0.02, '#e2232e'], [g.yc - 0.07, '#17181c']]); K.band(0, cone, '#e2232e'); break;
      case 'badminton_ice_blue': K.all('#f3f6f9'); K.stripe(25, 125, 0.004, '#22b8e6'); K.band(0.30, 0.33, '#22b8e6'); K.band(0, cone, '#22b8e6'); break;
      case 'badminton_volt': K.all('#17181c'); K.band(g.yc + g.ry * 0.45, TEX.h, '#d7f531'); K.band(cone, g.hoopBot - 0.03, '#d7f531'); break;
      case 'badminton_navy_gold': K.all('#1d2a55'); K.stripe(22, 128, 0.004, '#d8a92f'); K.band(g.hoopBot - 0.03, g.hoopBot - 0.0005, '#d8a92f'); K.band(0.25, 0.262, '#d8a92f'); break;
      case 'badminton_sakura': K.all('#faf6f4'); K.rect(0, g.hoopBot, K.R, TEX.h, '#f48fb1'); K.band(0, cone, '#f48fb1'); break;
      case 'badminton_carbon': K.all('#26282d'); K.stripe(18, 62, 0.004, '#c9ced6'); K.band(0.235, 0.245, '#c9ced6'); K.band(g.hoopBot - 0.05, g.hoopBot - 0.04, '#c9ced6'); break;
      case 'badminton_aurora': K.grad([[g.L, '#7a4be0'], [g.hoopBot, '#16c7b0']]); K.band(0, cone, '#7a4be0'); break;
      default: K.all('#dddddd');
    }
  }
  function paintPickle(ctx, W, H, s, g) {
    const K = kit(ctx, W, H, g), c = g.fc;
    switch (s.id) {
      case 'paddle_split_coral': K.all('#efe6d6'); K.poly([[K.L, g.bot + 0.02], [K.R, c + 0.07], [K.R, 0], [K.L, 0]], '#f0705f'); break;
      case 'paddle_court_blue':
        K.all('#1f5fa8'); K.band(c + 0.045, TEX.h, '#2e9d6a');
        K.line([[K.L, c + 0.045], [K.R, c + 0.045]], 0.005, '#f4f5f7'); K.line([[0, 0], [0, c + 0.045]], 0.005, '#f4f5f7'); break;
      case 'paddle_volt_stripe':
        K.all('#17181c');
        for (const o of [-0.075, 0, 0.075]) K.poly([[K.L, c + o - 0.12], [K.R, c + o + 0.12], [K.R, c + o + 0.145], [K.L, c + o - 0.095]], '#d7f531');
        break;
      case 'paddle_sunset': K.grad([[g.top, '#ffb22e'], [c, '#f0447a'], [g.bot, '#5b2a9d']]); break;
      case 'paddle_target':
        K.all('#f4f2ec');
        [[0.078, '#1d2a55'], [0.06, '#f4f2ec'], [0.044, '#e2232e'], [0.024, '#f4f2ec'], [0.01, '#1d2a55']].forEach(r => K.disc(0, c + 0.015, r[0], r[1]));
        break;
      case 'paddle_chevron_teal':
        K.all('#12897f');
        [[-0.085, '#0b3d3a'], [-0.045, '#f4f5f7'], [-0.005, '#0b3d3a'], [0.035, '#f4f5f7']].forEach(v => K.line([[K.L, c + v[0] + 0.11], [0, c + v[0]], [K.R, c + v[0] + 0.11]], 0.014, v[1]));
        break;
      case 'paddle_royal_gold':
        K.all('#3a2460');
        K.poly([[0, c + 0.1], [0.07, c], [0, c - 0.1], [-0.07, c]], '#d9a521'); K.poly([[0, c + 0.078], [0.054, c], [0, c - 0.078], [-0.054, c]], '#3a2460');
        K.poly([[0, c + 0.04], [0.028, c], [0, c - 0.04], [-0.028, c]], '#d9a521'); break;
      default: K.all('#dddddd');
    }
  }

  /* ---------------- Table tennis ---------------- */
  const TT_KEYS = ['rubberA', 'rubberB', 'wood', 'handle'];
  const ttRows = [
    ['classic_red', '經典紅黑', '#d3202b', '#17181c', '#d9b382', '#7a4a2a'],
    ['blue', '海藍黑', '#1f6fd0', '#17181c', '#e0c08f', '#1d2a55'],
    ['green', '草綠黑', '#1faa59', '#17181c', '#d9b382', '#2b5a3a'],
    ['pink', '桃粉黑', '#f0569a', '#17181c', '#e6cda4', '#8a2f5a'],
    ['violet', '紫羅蘭黑', '#7a4be0', '#17181c', '#d9b382', '#35245f'],
    ['all_black', '雙面黑', '#1b1b1f', '#17181c', '#b98b5a', '#c7262f'],
    ['orange', '復古橘黑', '#f08a24', '#17181c', '#caa06a', '#5a3a1f']
  ];
  const ttBuilder = S => function (params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, n = Math.round(D.hoop * 1.25), yc = S.hl - 0.012 + S.ry, out = [];
    for (let i = 0; i < n; i++) { const t = -i / n * Math.PI * 2; out.push([S.rx * Math.sin(t), yc + S.ry * Math.cos(t)]); }
    const cut = S.hl + S.cut, rub = out.filter(p => p[1] >= cut);
    const wood = new MeshB(), ra = new MeshB(), rb = new MeshB(), h = new MeshB();
    extrude(wood, out, -0.003, 0.003, { solid: true });
    extrude(ra, rub, 0.003, 0.0052, { solid: true }); extrude(rb, rub, -0.0052, -0.003, { solid: true });
    sweep(h, S.handle.map(p => ({ x: 0, y: p[0], w: p[1], d: p[2] })), OCT, { capStart: true, capEnd: true, uv: () => [0.5, 0.5] });
    const parts = [pack('Blade', 'wood', finish(wood, false)), pack('RubberFront', 'rubberA', finish(ra, false)), pack('RubberBack', 'rubberB', finish(rb, false)), pack('Handle', 'handle', finish(h, true))];
    return { parts, tris: total(parts), dims: {}, params: {} };
  };
  const ttMats = s => ({ wood: { color: s.wood, rough: 0.7 }, rubberA: { color: s.rubberA, rough: 0.85 }, rubberB: { color: s.rubberB, rough: 0.85 }, handle: { color: s.handle, rough: 0.6 } });
  const TT_SHAKE = { rx: 0.075, ry: 0.079, hl: 0.10, cut: 0.016, handle: [[0, 0.034, 0.024], [0.03, 0.029, 0.023], [0.072, 0.027, 0.022], [0.1, 0.030, 0.0205], [0.114, 0.035, 0.015]] };
  const TT_PEN = { rx: 0.075, ry: 0.076, hl: 0.078, cut: 0.008, handle: [[0, 0.031, 0.027], [0.045, 0.026, 0.026], [0.076, 0.033, 0.023], [0.09, 0.037, 0.014]] };

  /* ---------------- Lathe sticks: bats, cue ---------------- */
  const stickPart = (name, mat, prof, D, o) => { const m = new MeshB(); lathe(m, prof, D.seg, o); return pack(name, mat, smooth(m)); };
  const BAT_KEYS = ['barrel', 'handle', 'ring', 'knob', 'rough', 'metal'];
  const BAT_DEFAULTS = { length: 0.84, barrel: 0.066 };
  const BAT_STYLES = mk('bat', BAT_KEYS, [
    ['maple', '原木楓', '#d9b382', '#d9b382', '#1b1b1f', '#d9b382', 0.55, 0],
    ['ebony', '黑檀', '#1c1d21', '#1c1d21', '#d8a92f', '#1c1d21', 0.4, 0],
    ['two_tone', '黑柄原木', '#d9b382', '#1c1d21', '#f4f5f7', '#1c1d21', 0.5, 0],
    ['flame', '火焰紅', '#c7262f', '#1c1d21', '#f4f5f7', '#c7262f', 0.4, 0],
    ['navy', '海軍藍', '#1d2a55', '#e6cda4', '#f4f5f7', '#1d2a55', 0.45, 0],
    ['ash', '白蠟木', '#eadcc0', '#eadcc0', '#c7262f', '#eadcc0', 0.6, 0],
    ['walnut', '胡桃金', '#6b4226', '#6b4226', '#d8a92f', '#d8a92f', 0.45, 0]
  ]);
  const SB_DEFAULTS = { length: 0.86, barrel: 0.057 };
  const SB_STYLES = mk('softball_bat', BAT_KEYS, [
    ['silver_blue', '銀藍', '#c9ced6', '#1f6fd0', '#1f6fd0', '#1c1d21', 0.3, 0.8],
    ['hot_pink', '亮粉黑', '#f0569a', '#17181c', '#f4f5f7', '#17181c', 0.35, 0.6],
    ['volt', '螢光黃黑', '#d7f531', '#17181c', '#17181c', '#17181c', 0.35, 0.5],
    ['crimson', '深紅白', '#b3202a', '#f4f5f7', '#f4f5f7', '#b3202a', 0.3, 0.7],
    ['teal', '青綠白', '#16a596', '#f4f5f7', '#0b3d3a', '#0b3d3a', 0.3, 0.7],
    ['black_gold', '黑金', '#1c1d21', '#d8a92f', '#d8a92f', '#d8a92f', 0.3, 0.75],
    ['purple', '紫銀', '#6a3fd0', '#c9ced6', '#c9ced6', '#35245f', 0.3, 0.7]
  ]);
  const batBuilder = (DEF, soft) => function (params, detail) {
    const P = Object.assign({}, DEF, params || {}), D = DETAIL[detail] || DETAIL.mid, L = P.length, R = P.barrel / 2;
    const hr = soft ? 0.011 : 0.0125, kr = soft ? 0.021 : 0.025, t0 = soft ? 0.36 * L : 0.34 * L, t1 = soft ? 0.58 * L : 0.72 * L;
    const pts = [[0, 0], [kr * 0.9, 0.001], [kr, 0.007], [kr * 0.85, 0.016], [hr, 0.026], [hr, t0 * 0.6], [hr * 1.04, t0],
      [hr + (R - hr) * 0.5, (t0 + t1) / 2], [R, t1], [R, L - 0.03], [R * 0.97, L - 0.012], [R * 0.75, L - 0.003], [0, L]];
    const prof = curve(pts, detail === 'low' ? 2 : detail === 'high' ? 6 : 4);
    const parts = [stickPart('Bat', 'body', prof, D, { v: (i, p) => p[1] / L })];
    return { parts, tris: total(parts), dims: { L, t0, t1 }, params: P };
  };
  const batMats = soft => (s, g) => {
    const L = g.L, v = y => y / L;
    return { body: bandMat([[0, 1, s.barrel], [0, v(0.028), s.knob], [v(0.028), v(g.t0 * 0.85), s.handle, soft ? 'g' : ''],
      [v(g.t0 * 0.85), v(g.t0 * 0.85 + 0.012), s.ring], [v(g.t1 - 0.02), v(g.t1 - 0.008), s.ring], [v(g.t1 + 0.004), v(g.t1 + 0.01), s.ring],
      [v(L - 0.02), 1, soft ? s.knob : s.barrel]], s.rough, s.metal) };
  };

  const CUE_STYLES = mk('cue', ['butt', 'wrap', 'fore', 'shaft', 'ring'], [
    ['classic', '經典楓木', '#1c1d21', '#2b2b2f', '#b5793f', '#ead9b5', '#c9ced6'],
    ['rosewood', '玫瑰木', '#5a1f1f', '#17181c', '#7a2e22', '#ead9b5', '#d8a92f'],
    ['ocean', '海洋藍', '#1d2a55', '#f4f5f7', '#1f6fd0', '#ead9b5', '#c9ced6'],
    ['jade', '翡翠綠', '#0b3d3a', '#17181c', '#16a596', '#ead9b5', '#d8a92f'],
    ['snow', '雪白', '#f4f5f7', '#c9ced6', '#f4f5f7', '#ead9b5', '#1c1d21'],
    ['carbon', '碳纖黑', '#17181c', '#26282d', '#17181c', '#2a2c31', '#c7262f'],
    ['sunset', '夕陽橘紫', '#3b1d6b', '#17181c', '#f08a24', '#ead9b5', '#f0447a']
  ]);
  function buildCue(params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, L = 1.47;
    const prof = [[0, 0], [0.0135, 0.0005], [0.0145, 0.004], [0.0145, 0.02], [0.0132, 0.42], [0.0105, 0.74], [0.0066, 1.445], [0.0066, 1.468], [0.0055, 1.47], [0, 1.47]];
    const parts = [stickPart('Cue', 'body', prof, D, { v: (i, p) => p[1] / L })];
    return { parts, tris: total(parts), dims: { L }, params: {} };
  }
  const cueMats = s => { const v = y => y / 1.47; return { body: bandMat([[0, 1, s.shaft], [0, v(0.012), '#17181c'], [v(0.012), v(0.12), s.butt], [v(0.12), v(0.128), s.ring], [v(0.128), v(0.42), s.wrap, 'g'],
    [v(0.42), v(0.428), s.ring], [v(0.428), v(0.73), s.fore], [v(0.73), v(0.745), s.ring], [v(1.445), v(1.462), '#f4f2ea'], [v(1.462), 1, '#2f6fb5']], 0.45, 0) }; };

  /* ---------------- Golf ---------------- */
  const GOLF_KEYS = ['grip', 'cap', 'head', 'shaft', 'ring', 'metal'];
  const golfRows = [
    ['steel', '經典鋼', '#1c1d21', '#c9ced6', '#c9ced6', '#c9ced6', '#c7262f', 0.9],
    ['black', '消光黑', '#1c1d21', '#c7262f', '#26282d', '#3a3d44', '#c7262f', 0.7],
    ['gold', '香檳金', '#f4f5f7', '#d8a92f', '#d8b65a', '#c9ced6', '#d8a92f', 0.9],
    ['blue', '寶藍', '#1f6fd0', '#f4f5f7', '#c9ced6', '#c9ced6', '#1f6fd0', 0.9],
    ['copper', '古銅', '#5a3a1f', '#b87333', '#b87333', '#c9ced6', '#5a3a1f', 0.85],
    ['white', '珍珠白', '#f4f5f7', '#1c1d21', '#e9ebef', '#c9ced6', '#1c1d21', 0.5],
    ['volt', '螢光綠黑', '#17181c', '#b9f23c', '#26282d', '#3a3d44', '#b9f23c', 0.7]
  ];
  const golfBuilder = putter => function (params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, top = putter ? 0.83 : 0.925, gl = 0.27, gr = putter ? 0.0145 : 0.0135;
    const grip = stickPart('Grip', 'grip', [[0, 0], [gr * 0.9, 0.0005], [gr, 0.006], [gr * 0.82, gl], [0.0078, gl + 0.002]], D, { v: (i, p) => p[1] / gl });
    const shaft = stickPart('Shaft', 'shaft', [[0.0076, gl - 0.005], [0.0048, top - 0.04], [0.0068, top - 0.038], [0.0068, top + 0.004], [0, top + 0.004]], D, { v: (i, p) => (p[1] - gl) / (top - gl) });
    const head = new MeshB();
    if (putter) {
      sweep(head, [{ x: -0.03, y: top + 0.012, w: 0.024, d: 0.026 }, { x: 0.08, y: top + 0.012, w: 0.024, d: 0.026 }], OCT, { capStart: true, capEnd: true, uv: () => [0.5, 0.5], xf: rotZ(20, 0, top) });
    } else {
      extrude(head, [[-0.008, 0], [-0.012, 0.02], [-0.004, 0.03], [0.06, 0.03], [0.073, 0.02], [0.075, -0.022], [0.064, -0.03], [0, -0.004]].map(p => [p[0], p[1] + top]), -0.008, 0.006, { solid: true, xf: rotZ(28, 0, top) });
    }
    const parts = [grip, shaft, pack('Head', 'head', putter ? finish(head, true) : finish(head, false))];
    return { parts, tris: total(parts), dims: {}, params: {} };
  };
  const golfMats = s => ({
    grip: bandMat([[0, 1, s.grip, 'g'], [0, 0.03, s.cap], [0.96, 1, s.cap]], 0.9, 0),
    shaft: bandMat([[0, 1, s.shaft], [0.9, 0.925, s.ring], [0.925, 1, '#17181c']], 0.3, s.metal),
    head: { color: s.head, rough: 0.3, metal: s.metal }
  });

  /* ---------------- Mallets: woodball, gateball ---------------- */
  const MALLET_KEYS = ['grip', 'shaft', 'head', 'cap', 'ring', 'metal'];
  const WOODBALL_STYLES = mk('woodball', MALLET_KEYS, [
    ['natural', '原木', '#1c1d21', '#c79a5e', '#d9b382', '#17181c', '#7a4a2a', 0],
    ['mahogany', '桃花心木', '#17181c', '#7a2e22', '#8a3a28', '#17181c', '#d8a92f', 0],
    ['forest', '森林綠', '#0b3d3a', '#c79a5e', '#d9b382', '#1faa59', '#1faa59', 0],
    ['ocean', '海洋藍', '#1d2a55', '#c79a5e', '#e0c08f', '#1f6fd0', '#1f6fd0', 0],
    ['cherry', '櫻桃紅', '#c7262f', '#eadcc0', '#eadcc0', '#c7262f', '#c7262f', 0],
    ['ebony', '黑檀金', '#17181c', '#1c1d21', '#26282d', '#d8a92f', '#d8a92f', 0],
    ['bamboo', '竹青', '#3a5a2a', '#d8c98a', '#e3d59a', '#3a5a2a', '#3a5a2a', 0]
  ]);
  const GATEBALL_STYLES = mk('gateball', MALLET_KEYS, [
    ['red', '紅隊', '#17181c', '#c9ced6', '#f4f5f7', '#c7262f', '#c7262f', 0.6],
    ['white', '白隊', '#1d2a55', '#c9ced6', '#1d2a55', '#f4f5f7', '#f4f5f7', 0.6],
    ['gold', '金銅', '#17181c', '#d8b65a', '#5a3a1f', '#d8a92f', '#d8a92f', 0.7],
    ['sky', '天藍', '#f4f5f7', '#c9ced6', '#3aa0e8', '#f4f5f7', '#1d2a55', 0.6],
    ['violet', '紫', '#17181c', '#c9ced6', '#7a4be0', '#f4f5f7', '#f4f5f7', 0.6],
    ['green', '草綠', '#17181c', '#c9ced6', '#1faa59', '#f4f5f7', '#0b3d3a', 0.6],
    ['carbon', '碳黑橘', '#17181c', '#3a3d44', '#26282d', '#f08a24', '#f08a24', 0.5]
  ]);
  const malletBuilder = wood => function (params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, top = wood ? 0.865 : 0.79, gl = wood ? 0.26 : 0.22, sr = wood ? 0.0095 : 0.0075;
    const grip = stickPart('Grip', 'grip', [[0, 0], [0.0135, 0.0005], [0.0145, 0.006], [0.0128, gl], [sr, gl + 0.003]], D, { v: (i, p) => p[1] / gl });
    const shaft = stickPart('Shaft', 'shaft', [[sr, gl - 0.004], [sr, top + 0.004]], D, { solid: true });
    const hy = top + (wood ? 0.012 : 0.006), xf = (x, y, z) => [y, hy - x, z];
    const hp = wood
      ? curve([[0, -0.105], [0.03, -0.1045], [0.033, -0.098], [0.033, -0.084], [0.0312, -0.082], [0.0312, 0.0], [0.03, 0.03], [0.022, 0.062], [0.018, 0.085], [0.021, 0.097], [0.0225, 0.106], [0, 0.108]], detail === 'low' ? 1 : 3)
      : [[0, -0.12], [0.021, -0.12], [0.0225, -0.117], [0.0225, 0.117], [0.021, 0.12], [0, 0.12]];
    const a = hp[0][1], b = hp[hp.length - 1][1];
    const head = stickPart('Head', 'head', hp, D, { xf, v: (i, p) => (p[1] - a) / (b - a) });
    const parts = [grip, shaft, head];
    return { parts, tris: total(parts), dims: {}, params: {} };
  };
  const malletMats = wood => s => ({
    grip: bandMat([[0, 1, s.grip, 'g'], [0, 0.035, s.ring], [0.96, 1, s.ring]], 0.9, 0),
    shaft: { color: s.shaft, rough: wood ? 0.6 : 0.3, metal: s.metal },
    head: wood ? bandMat([[0, 1, s.head], [0, 0.105, s.cap], [0.105, 0.125, s.ring], [0.5, 0.52, s.ring], [0.93, 1, s.ring]], 0.55, 0)
      : bandMat([[0, 1, s.head], [0, 0.07, s.cap], [0.93, 1, s.cap], [0.07, 0.085, s.ring], [0.915, 0.93, s.ring], [0.49, 0.51, s.ring]], 0.4, 0.1)
  });

  /* ---------------- Field hockey stick ---------------- */
  const HOCKEY_STYLES = mk('hockey', ['grip', 'shaft', 'head', 'ring'], [
    ['carbon_red', '碳黑紅', '#c7262f', '#17181c', '#17181c', '#c7262f'],
    ['ice', '冰藍白', '#f4f5f7', '#f4f5f7', '#3aa0e8', '#1d2a55'],
    ['volt', '螢光黃', '#17181c', '#17181c', '#d7f531', '#d7f531'],
    ['wood', '原木', '#1c1d21', '#d9b382', '#c79a5e', '#f4f5f7'],
    ['pink', '粉白', '#f0569a', '#f4f5f7', '#f0569a', '#17181c'],
    ['navy_gold', '海軍金', '#d8a92f', '#1d2a55', '#1d2a55', '#d8a92f'],
    ['teal', '青綠', '#f4f5f7', '#0b3d3a', '#16c7b0', '#f4f5f7']
  ]);
  function buildHockey(params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, R = 0.05, top = 0.82, path = [];
    const add = (x, y, w, d) => path.push({ x, y, w, d });
    add(0, 0, 0.026, 0.024); add(0, 0.006, 0.03, 0.027); add(0, 0.3, 0.03, 0.027); add(0, 0.6, 0.034, 0.024); add(0, top, 0.044, 0.022);
    const n = D.arm;
    for (let i = 1; i <= n; i++) { const a = (180 - 150 * i / n) * Math.PI / 180, f = i / n; add(R + R * Math.cos(a), top + R * Math.sin(a), 0.044 + 0.004 * f, 0.022 - 0.002 * f); }
    const e = path[path.length - 1], ta = (30 - 90) * Math.PI / 180;
    add(e.x + 0.022 * Math.cos(ta), e.y + 0.022 * Math.sin(ta), 0.044, 0.019); add(e.x + 0.034 * Math.cos(ta), e.y + 0.034 * Math.sin(ta), 0.03, 0.015);
    let len = 0; path[0].v = 0;
    for (let i = 1; i < path.length; i++) { len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); path[i].v = len; }
    path.forEach(p => { p.v /= len; });
    const m = new MeshB();
    sweep(m, path, superSection(Math.max(D.sec, 8)), { seam: true, capStart: true, capEnd: true, uv: (r, s, i) => [s, path[i].v] });
    const parts = [pack('Stick', 'body', smooth(m))];
    return { parts, tris: total(parts), dims: { top: top / len }, params: {} };
  }
  const hockeyMats = (s, g) => ({ body: bandMat([[0, 1, s.shaft], [0, 0.3, s.grip, 'g'], [0.3, 0.315, s.ring], [0.55, 0.62, s.ring], [0.64, 0.655, s.ring], [g.top - 0.03, 1, s.head], [g.top - 0.045, g.top - 0.03, s.ring]], 0.45, 0.05) });

  /* ---------------- Balls ---------------- */
  const ballBuilder = (R, name) => function (params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, lon = 2 * Math.round(D.seg * 0.8), m = new MeshB();
    sphere(m, R, lon, lon / 2);
    const parts = [pack(name || 'Ball', 'ball', smooth(m))];
    return { parts, tris: total(parts), dims: { R }, params: {} };
  };
  const C3 = (s, keys) => keys.map(k => rgb(s[k]));
  const fnBasket = s => { const [a, b, l] = C3(s, ['a', 'b', 'line']), w = 0.022; return d => (Math.abs(d[1]) < w || Math.abs(d[2]) < w || Math.abs(Math.abs(d[0]) - 0.64) < w) ? l : (Math.abs(d[0]) > 0.64 ? b : a); };
  const fnVolley = s => {
    const cols = C3(s, ['a', 'b', 'c']), l = rgb(s.line);
    return d => {
      const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]); let u, w, f;
      if (ax >= ay && ax >= az) { u = d[1] / ax; w = d[2] / ax; f = 0; } else if (ay >= az) { u = d[2] / ay; w = d[0] / ay; f = 1; } else { u = d[0] / az; w = d[1] / az; f = 2; }
      const edge = Math.min(Math.abs(u + 1 / 3), Math.abs(u - 1 / 3), 1 - Math.abs(u), 1 - Math.abs(w));
      return edge < 0.022 ? l : cols[((u < -1 / 3 ? 0 : u < 1 / 3 ? 1 : 2) + f) % 3];
    };
  };
  const ICO = (() => {
    const f = (1 + Math.sqrt(5)) / 2, v = [], c = [], nrm = p => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
    for (const a of [-1, 1]) for (const b of [-1, 1]) { v.push(nrm([0, a, b * f]), nrm([a, b * f, 0]), nrm([b * f, 0, a])); c.push(nrm([0, a / f, b * f]), nrm([a / f, b * f, 0]), nrm([b * f, 0, a / f])); }
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const e of [-1, 1]) c.push(nrm([a, b, e]));
    return { v, c };
  })();
  const fnSoccer = s => {
    const [a, b, l] = C3(s, ['a', 'b', 'line']);
    return d => {
      let t1 = 1e9, t2 = 1e9, pent = false;
      for (let i = 0; i < 12; i++) { const q = ICO.v[i], dot = d[0] * q[0] + d[1] * q[1] + d[2] * q[2]; if (dot > 0.3) { const t = 2.327 / dot; if (t < t1) { t2 = t1; t1 = t; pent = true; } else if (t < t2) t2 = t; } }
      for (let i = 0; i < 20; i++) { const q = ICO.c[i], dot = d[0] * q[0] + d[1] * q[1] + d[2] * q[2]; if (dot > 0.3) { const t = 2.267 / dot; if (t < t1) { t2 = t1; t1 = t; pent = false; } else if (t < t2) t2 = t; } }
      return t2 - t1 < 0.022 ? l : pent ? b : a;
    };
  };
  const fnDodge = s => { const [a, b, l] = C3(s, ['a', 'b', 'line']); return d => { const y = Math.abs(d[1]); if (Math.abs(y - 0.34) < 0.02 || Math.abs(y - 0.8) < 0.015) return l; return y < 0.34 ? b : a; }; };
  const SEAM = (() => { const p = [], n = 400, b = 0.25, a = 0.75, c = 2 * Math.sqrt(a * b); for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; p.push(a * Math.cos(t) + b * Math.cos(3 * t), c * Math.sin(2 * t), a * Math.sin(t) - b * Math.sin(3 * t)); } return p; })();
  // Nearest seam sample: coarse pass over every 8th point, then refine around the best one.
  const seamAt = d => {
    const dot = i => { const k = ((i + 400) % 400) * 3; return d[0] * SEAM[k] + d[1] * SEAM[k + 1] + d[2] * SEAM[k + 2]; };
    let best = -2, bi = 0;
    for (let i = 0; i < 400; i += 8) { const v = dot(i); if (v > best) { best = v; bi = i; } }
    const c = bi;
    for (let i = c - 8; i <= c + 8; i++) { const v = dot(i); if (v > best) { best = v; bi = (i + 400) % 400; } }
    return [best, bi];
  };
  // seamAt per pix() sample, cached by sample count (12 MB at 1024x512) so 7 colourways share one pass
  const seamCache = {};
  const seamCached = (d, k, n) => {
    let c = seamCache[n];
    if (!c) { c = seamCache[n] = { best: new Float32Array(n), bi: new Int16Array(n).fill(-1) }; }
    if (c.bi[k] < 0) { const q = seamAt(d); c.best[k] = q[0]; c.bi[k] = q[1]; }
    return [c.best[k], c.bi[k]];
  };
  const fnBaseball = s => { const [a, b] = C3(s, ['a', 'b']), g = mix(a, [0, 0, 0], 0.18); return (d, k, n) => { const q = seamCached(d, k, n), ang = Math.acos(Math.min(q[0], 1)); return ang < 0.012 ? g : (ang < 0.075 && q[1] % 4 < 2) ? b : a; }; };
  const fnTennisBall = s => { const [a, b] = C3(s, ['a', 'b']); return (d, k, n) => seamCached(d, k, n)[0] > 0.9993 ? b : a; };
  const FIB = (() => { const p = [], n = 40, g = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y); p.push([r * Math.cos(g * i), y, r * Math.sin(g * i)]); } return p; })();
  const fnHoles = s => { const a = rgb(s.a), h = rgb(s.b); return d => { for (const q of FIB) if (d[0] * q[0] + d[1] * q[1] + d[2] * q[2] > 0.9925) return h; return a; }; };
  const fnTT = s => { const [a, b] = C3(s, ['a', 'b']); return d => (d[2] > 0.3 && Math.abs(d[1]) < 0.045 && Math.abs(d[0]) < 0.42 && (Math.abs(d[0]) % 0.3) < 0.2) ? b : a; };
  const fnBowl = s => {
    const [a, b, c] = C3(s, ['a', 'b', 'c']), holes = [[0.16, 0.975, 0.13], [-0.16, 0.975, 0.13], [0, 0.95, -0.3]].map(p => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    return d => {
      for (const q of holes) if (d[0] * q[0] + d[1] * q[1] + d[2] * q[2] > 0.992) return [12, 12, 14];
      const n = Math.sin(7 * d[0] + 3 * Math.sin(5 * d[1] + 2 * d[2])) + Math.sin(6 * d[1] + 3 * Math.sin(4 * d[2] - 3 * d[0])), t = Math.max(0, Math.min(1, n * 0.35 + 0.5));
      return t < 0.5 ? mix(a, b, t * 2) : mix(b, c, t * 2 - 1);
    };
  };
  const ballMats = (fn, rough, metalKey) => s => ({ ball: pixMat(fn(s), s.rough || rough, metalKey ? s[metalKey] : 0) });
  const ABL = ['a', 'b', 'line'];
  const BASKET_STYLES = mk('basketball', ABL, [
    ['classic', '經典橘', '#d9651f', '#d9651f', '#17181c'], ['street', '街頭棕', '#8a4a22', '#8a4a22', '#17181c'], ['tricolor', '紅白藍', '#f4f5f7', '#c7262f', '#1d2a55'],
    ['ocean', '海藍白', '#1f6fd0', '#f4f5f7', '#0d2a55'], ['black_gold', '黑金', '#1c1d21', '#1c1d21', '#d8a92f'], ['pink', '粉白', '#f0569a', '#f4f5f7', '#7a1f48'], ['neon', '螢光綠黃', '#b9f23c', '#f4e23a', '#17181c']
  ]);
  const VOLLEY_STYLES = mk('volleyball', ['a', 'b', 'c', 'line'], [
    ['classic', '經典白', '#f4f5f7', '#f4f5f7', '#f4f5f7', '#9aa1ad'], ['yellow_blue', '黃藍', '#f4d03a', '#1f5fb8', '#f4d03a', '#17181c'], ['tricolor', '紅白綠', '#c7262f', '#f4f5f7', '#1faa59', '#17181c'],
    ['beach', '沙灘橘', '#f08a24', '#f4f5f7', '#3aa0e8', '#17181c'], ['pink', '粉紫白', '#f0569a', '#f4f5f7', '#7a4be0', '#3b1d6b'], ['navy', '海軍金', '#1d2a55', '#d8a92f', '#f4f5f7', '#17181c'], ['mint', '薄荷', '#3fc9a0', '#f4f5f7', '#0b3d3a', '#0b3d3a']
  ]);
  const SOCCER_STYLES = mk('soccer', ABL, [
    ['classic', '經典黑白', '#f4f5f7', '#17181c', '#17181c'], ['blue', '藍白', '#f4f5f7', '#1f5fb8', '#0d2a55'], ['red', '紅白', '#f4f5f7', '#c7262f', '#5a1015'],
    ['gold', '黑金', '#1c1d21', '#d8a92f', '#d8a92f'], ['volt', '螢光黃', '#d7f531', '#17181c', '#17181c'], ['orange', '雪地橘', '#f08a24', '#f4f5f7', '#17181c'], ['teal', '青綠', '#f4f5f7', '#16a596', '#0b3d3a']
  ]);
  const DODGE_STYLES = mk('dodgeball', ABL, [
    ['red', '紅', '#c7262f', '#e2434b', '#f4f5f7'], ['yellow', '黃藍', '#f4d03a', '#1f5fb8', '#f4f5f7'], ['blue', '藍', '#1f5fb8', '#3a8ae8', '#f4f5f7'],
    ['green', '綠', '#1faa59', '#55d08a', '#f4f5f7'], ['white', '白紅', '#f4f5f7', '#c7262f', '#17181c'], ['purple', '紫', '#6a3fd0', '#9a7af0', '#f4f5f7'], ['orange', '橘黑', '#f08a24', '#17181c', '#f4f5f7']
  ]);
  const AB = ['a', 'b'];
  const BASEBALL_STYLES = mk('baseball', AB, [
    ['classic', '白球紅線', '#f3efe4', '#c7262f'], ['blue', '白球藍線', '#f3efe4', '#1f5fb8'], ['yellow', '黃球紅線', '#f0e04a', '#c7262f'], ['black', '黑球金線', '#1c1d21', '#d8a92f'],
    ['pink', '粉球白線', '#f48fb1', '#f4f5f7'], ['vintage', '復古皮革', '#c9a36a', '#5a1f1f'], ['orange', '橘球黑線', '#f08a24', '#17181c']
  ]);
  const TBALL_STYLES = mk('tennis_ball', AB, [
    ['classic', '螢光黃', '#d7e531', '#f4f5f7'], ['orange', '橘', '#f08a24', '#f4f5f7'], ['pink', '粉', '#f0569a', '#f4f5f7'], ['white', '白', '#f1efe6', '#9aa1ad'],
    ['green', '草綠', '#6fcf3a', '#f4f5f7'], ['blue', '藍', '#3a8ae8', '#f4f5f7'], ['purple', '紫', '#9a6af0', '#f4f5f7']
  ]);
  const PBALL_STYLES = mk('pickleball_ball', AB, [
    ['yellow', '黃', '#f0e04a', '#6a6212'], ['lime', '萊姆綠', '#b9f23c', '#4a6212'], ['orange', '橘', '#f08a24', '#6a3a0c'], ['pink', '粉', '#f0569a', '#6a1f40'],
    ['white', '白', '#f4f5f7', '#6a6d74'], ['blue', '藍', '#3a8ae8', '#143a6a'], ['purple', '紫', '#9a6af0', '#3b1d6b']
  ]);
  const TTBALL_STYLES = mk('tt_ball', AB, [
    ['white', '白', '#f6f6f2', '#1d2a55'], ['orange', '橘', '#f59a2a', '#17181c'], ['yellow', '黃', '#f4e23a', '#c7262f'], ['pink', '粉', '#f7a8c8', '#7a1f48'],
    ['blue', '淺藍', '#9ad0f5', '#1d2a55'], ['green', '淺綠', '#a8e6a1', '#0b3d3a'], ['black', '黑', '#1c1d21', '#d8a92f']
  ]);
  const BOWL_STYLES = mk('bowling_ball', ['a', 'b', 'c'], [
    ['galaxy', '銀河藍紫', '#1d2a55', '#6a3fd0', '#3aa0e8'], ['lava', '熔岩紅', '#1c1d21', '#c7262f', '#f08a24'], ['emerald', '翡翠', '#0b3d3a', '#16a596', '#b9f23c'], ['pearl', '珍珠白', '#f4f5f7', '#c9ced6', '#f7a8c8'],
    ['onyx', '黑曜石', '#101114', '#26282d', '#3a3d44'], ['sunset', '夕陽', '#3b1d6b', '#f0447a', '#ffb22e'], ['ocean', '海洋', '#0d2a55', '#1f6fd0', '#9ad0f5']
  ]);

  /* Shuttlecock */
  const SHUTTLE_STYLES = mk('shuttlecock', ['skirt', 'cork', 'band', 'line'], [
    ['feather', '羽毛白', '#f6f4ee', '#e8dcc0', '#1faa59', '#c9c4b4'], ['nylon_yellow', '尼龍黃', '#f0e04a', '#e8dcc0', '#c7262f', '#b8a820'], ['blue', '藍帶', '#f6f4ee', '#f4f5f7', '#1f5fb8', '#c9c4b4'],
    ['pink', '粉', '#f7a8c8', '#f4f5f7', '#f0569a', '#d07a9c'], ['black', '黑金', '#26282d', '#17181c', '#d8a92f', '#3a3d44'], ['orange', '橘', '#f59a2a', '#e8dcc0', '#17181c', '#c06a10'], ['mint', '薄荷', '#a8ead0', '#f4f5f7', '#16a596', '#6ac0a0']
  ]);
  function buildShuttle(params, detail) {
    const D = DETAIL[detail] || DETAIL.mid;
    const cork = stickPart('Cork', 'cork', curve([[0, 0], [0.007, 0.0015], [0.0115, 0.006], [0.013, 0.013], [0.013, 0.025], [0.0125, 0.0255], [0, 0.0255]], detail === 'low' ? 1 : 3), D, { v: (i, p) => p[1] / 0.0255 });
    const skirt = stickPart('Skirt', 'skirt', [[0.0125, 0.022], [0.033, 0.085], [0.032, 0.0852], [0.0116, 0.0228]], D, { v: (i, p) => (p[1] - 0.022) / 0.063 });
    const parts = [cork, skirt];
    return { parts, tris: total(parts), dims: {}, params: {} };
  }
  const shuttleMats = s => ({
    cork: bandMat([[0, 1, s.cork], [0.72, 0.9, s.band]], 0.8, 0),
    skirt: { draw: (c, W, H) => { c.fillStyle = s.skirt; c.fillRect(0, 0, W, H); c.fillStyle = s.line; for (let i = 0; i < 16; i++) c.fillRect(Math.round(i * W / 16), 0, 3, H); c.fillRect(0, H * 0.55, W, 5); c.fillRect(0, H * 0.7, W, 5); c.fillStyle = s.band; c.fillRect(0, H * 0.93, W, H * 0.07); }, size: [512, 256], rough: 0.8, metal: 0 }
  });

  /* Bowling pin */
  const PIN_STYLES = mk('bowling_pin', ['base', 'stripe', 'foot'], [
    ['classic', '經典白紅', '#f6f6f2', '#c7262f', '#e6e6e0'], ['blue', '白藍', '#f6f6f2', '#1f5fb8', '#e6e6e0'], ['gold', '黑金', '#1c1d21', '#d8a92f', '#d8a92f'], ['neon', '螢光', '#b9f23c', '#f0569a', '#17181c'],
    ['red', '紅白', '#c7262f', '#f6f6f2', '#f6f6f2'], ['wood', '原木', '#d9b382', '#5a3a1f', '#5a3a1f'], ['violet', '紫白', '#f6f6f2', '#7a4be0', '#e6e6e0']
  ]);
  function buildPin(params, detail) {
    const D = DETAIL[detail] || DETAIL.mid;
    const prof = curve([[0, 0], [0.026, 0.0005], [0.03, 0.006], [0.045, 0.05], [0.058, 0.09], [0.0605, 0.115], [0.057, 0.15], [0.043, 0.2], [0.028, 0.24], [0.0235, 0.262], [0.0245, 0.285], [0.03, 0.31], [0.032, 0.33], [0.029, 0.355], [0.02, 0.373], [0.008, 0.38], [0, 0.381]], detail === 'low' ? 1 : detail === 'high' ? 4 : 2);
    const parts = [stickPart('Pin', 'body', prof, D, { v: (i, p) => p[1] / 0.381 })];
    return { parts, tris: total(parts), dims: {}, params: {} };
  }
  const pinMats = s => ({ body: bandMat([[0, 1, s.base], [0, 0.03, s.foot], [0.63, 0.665, s.stripe], [0.69, 0.725, s.stripe]], 0.25, 0) });

  /* Pool ball set (16) */
  const POOL_STYLES = mk('pool_balls', ['c'], [
    ['classic', '經典', ['#f2c21a', '#1f4fb8', '#c7262f', '#5a2a8a', '#f08a24', '#1f8a4a', '#7a1f24', '#17181c']],
    ['tournament', '賽事款', ['#f2c21a', '#3a6ae0', '#e2434b', '#f48fb1', '#f08a24', '#1faa59', '#8a5a2a', '#17181c']],
    ['pastel', '粉彩', ['#f7e38a', '#9ad0f5', '#f7a8a8', '#c8a8f0', '#f7c08a', '#a8e6a1', '#d0a890', '#5a5d66']],
    ['neon', '螢光', ['#f4f43a', '#3ad0f4', '#f43a6a', '#b43af4', '#f4903a', '#5af43a', '#f43ad0', '#101114']],
    ['mono', '黑白灰', ['#d0d3d8', '#b0b4bb', '#90959e', '#737882', '#5a5f69', '#444851', '#30333a', '#101114']],
    ['ocean', '海洋', ['#9ad0f5', '#1f6fd0', '#16c7b0', '#1d2a55', '#3aa0e8', '#0b6a5a', '#35245f', '#0a1020']],
    ['candy', '糖果', ['#ffd23a', '#3ac0ff', '#ff4f6a', '#b06aff', '#ff9a3a', '#3ae08a', '#ff6ad0', '#3b1d6b']]
  ]);
  POOL_STYLES.forEach(s => { s.sw = s.c.slice(0, 3); });
  const POOL_R = 0.0286;
  function poolLayout() {
    const R = POOL_R, pos = [[0, R, 0.3]], order = [1, 9, 2, 10, 8, 3, 11, 7, 14, 4, 5, 13, 15, 6, 12]; let k = 0; const slot = {};
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) slot[order[k++]] = [(i - row / 2) * 2.02 * R, R, -row * 1.75 * R];
    for (let n = 1; n <= 15; n++) pos.push(slot[n]);
    return pos;
  }
  function buildPool(params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, lon = 2 * Math.round(D.seg * 0.6), pos = poolLayout(), parts = [];
    pos.forEach((p, n) => {
      const yaw = (n * 47 % 50 - 25) * Math.PI / 180, tilt = -35 * Math.PI / 180, ct = Math.cos(tilt), stt = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw), m = new MeshB();
      sphere(m, POOL_R, lon, lon / 2, { xf: (x, y, z) => { const y1 = y * ct - z * stt, z1 = y * stt + z * ct; return [p[0] + x * cy + z1 * sy, p[1] + y1, p[2] - x * sy + z1 * cy]; } });
      parts.push(pack(n ? 'Ball' + n : 'CueBall', 'ball' + n, smooth(m)));
    });
    return { parts, tris: total(parts), dims: {}, params: {} };
  }
  const poolMats = s => {
    const out = {};
    for (let n = 0; n <= 15; n++) {
      const col = n === 0 ? '#f6f4ea' : s.c[(n - 1) % 8], stripe = n > 8, c = rgb(col), w = [246, 244, 234];
      out['ball' + n] = { size: [256, 128], rough: 0.12, metal: 0, draw: (ctx, W, H) => {
        pix(ctx, W, H, d => stripe && Math.abs(d[1]) > 0.5 ? w : c);
        if (!n) return;
        for (const u of [0.25, 0.75]) {
          ctx.fillStyle = '#f6f4ea'; ctx.beginPath(); ctx.arc(u * W, H / 2, H * 0.17, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#101114'; ctx.font = 'bold ' + Math.round(H * 0.22) + 'px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), u * W, H / 2 + 1);
        }
      } };
    }
    return out;
  };

  /* Pétanque set: 3 boules + jack */
  const BOULE_STYLES = mk('petanque', ['a', 'b', 'jack', 'pat', 'metal', 'rough'], [
    ['steel', '不鏽鋼', '#c9ced6', '#5a5f69', '#c7262f', 1, 0.95, 0.25], ['bronze', '青銅', '#b08a4a', '#4a3516', '#f4f5f7', 2, 0.9, 0.35], ['carbon', '碳鋼黑', '#3a3d44', '#101114', '#f0e04a', 3, 0.85, 0.4],
    ['gold', '金', '#d8b65a', '#6a5216', '#1f5fb8', 4, 0.95, 0.25], ['copper', '紅銅', '#b87333', '#4a2a10', '#f4f5f7', 5, 0.9, 0.3], ['chrome', '鏡面鉻', '#e6e9ee', '#737882', '#f08a24', 0, 1, 0.08], ['leisure', '休閒彩色', '#3aa0e8', '#143a6a', '#f0e04a', 6, 0.3, 0.4]
  ]);
  BOULE_STYLES.forEach(s => { s.sw = [s.a, s.b, s.jack]; });
  function buildBoules(params, detail) {
    const D = DETAIL[detail] || DETAIL.mid, lon = 2 * Math.round(D.seg * 0.7), R = 0.037, b = new MeshB(), j = new MeshB();
    [[-0.06, 0, 20], [0.035, 0.03, 75], [0, -0.085, -40]].forEach(p => { const xf0 = rotZ(p[2], 0, 0); sphere(b, R, lon, lon / 2, { xf: (x, y, z) => { const q = xf0(x, y, z); return [q[0] + p[0], q[1] + R, q[2] + p[1]]; } }); });
    sphere(j, 0.015, 12, 6, { solid: true, xf: (x, y, z) => [x + 0.1, y + 0.015, z - 0.03] });
    const parts = [pack('Boules', 'ball', smooth(b)), pack('Jack', 'jack', smooth(j))];
    return { parts, tris: total(parts), dims: {}, params: {} };
  }
  const fnBoule = s => {
    const a = rgb(s.a), b = rgb(s.b), w = 0.018, near = (v, list) => list.some(q => Math.abs(v - q) < w);
    return d => {
      const y = d[1], x = d[0], z = d[2]; let g = false;
      switch (s.pat) {
        case 1: g = near(y, [0]); break; case 2: g = near(y, [-0.12, 0.12]); break; case 3: g = near(y, [-0.3, 0, 0.3]); break;
        case 4: g = near(y, [0]) || near(x, [0]); break; case 5: g = near(y, [0]) || near(x, [0]) || near(z, [0]); break;
        case 6: g = near(y, [-0.6, -0.36, -0.12, 0.12, 0.36, 0.6]); break;
      }
      return g ? b : a;
    };
  };
  const bouleMats = s => ({ ball: pixMat(fnBoule(s), s.rough, s.metal), jack: { color: s.jack, rough: 0.6, metal: 0 } });

  function toOBJ(parts, name) {
    const out = ['# ' + name + ' - procedural model (units: meters, Y-up)', 'mtllib ' + name + '.mtl'];
    let base = 1;
    const f = v => (Math.round(v * 1e5) / 1e5).toString();
    for (const p of parts) {
      out.push('o ' + p.name);
      const nv = p.positions.length / 3;
      for (let i = 0; i < nv; i++) out.push('v ' + f(p.positions[3 * i]) + ' ' + f(p.positions[3 * i + 1]) + ' ' + f(p.positions[3 * i + 2]));
      for (let i = 0; i < nv; i++) out.push('vt ' + f(p.uvs[2 * i]) + ' ' + f(p.uvs[2 * i + 1]));
      for (let i = 0; i < nv; i++) out.push('vn ' + f(p.normals[3 * i]) + ' ' + f(p.normals[3 * i + 1]) + ' ' + f(p.normals[3 * i + 2]));
      out.push('usemtl ' + name + '_' + p.material, 's 1');
      for (let k = 0; k < p.indices.length; k += 3) {
        const a = p.indices[k] + base, b = p.indices[k + 1] + base, c = p.indices[k + 2] + base;
        out.push('f ' + a + '/' + a + '/' + a + ' ' + b + '/' + b + '/' + b + ' ' + c + '/' + c + '/' + c);
      }
      base += nv;
    }
    return out.join('\n') + '\n';
  }
  function toMTL(name, mats, parts) {
    const seen = [], out = [];
    for (const p of parts) if (seen.indexOf(p.material) < 0) seen.push(p.material);
    for (const id of seen) {
      const m = mats[id] || {}, tex = !!m.draw;
      out.push(['newmtl ' + name + '_' + id, 'Kd ' + (tex ? '1 1 1' : rgb(m.color || '#cccccc').map(v => (v / 255).toFixed(4)).join(' ')), 'Ka 0 0 0', 'Ks 0.2 0.2 0.2', 'Ns 60', 'd 1', 'illum 2'].concat(tex ? ['map_Kd ' + name + '_' + id + '.png'] : []).join('\n'));
    }
    return out.join('\n\n') + '\n';
  }

  const mm = v => Math.round(v * 1000) + ' mm', mm1 = v => (v * 1000).toFixed(1) + ' mm';
  const sl = (key, label, min, max, step, fmt, k) => ({ key, label, min, max, step, k: k || 1000, fmt: fmt || mm });
  const stick = (h, w) => ({ h, w, cy: h / 2 });
  const ball = R => ({ h: R * 2.2, w: R * 2.6, cy: 0 });
  const dia = R => () => '直徑 ' + Math.round(R * 2000) + ' mm';
  const len = L => () => '全長 ' + Math.round(L * 1000) + ' mm';
  const CATS = [{ id: 'racket', label: '拍類' }, { id: 'stick', label: '棒桿類' }, { id: 'ball', label: '球類' }];
  const SPORTS = [
    { id: 'tennis', label: '網球拍', cat: 'racket', styles: TENNIS_STYLES, defaults: TENNIS_DEFAULTS, build: racketBuilder(TENNIS_DEFAULTS), mats: racketMats, view: stick(0.685, 0.34), patterns: ['16x19', '18x20', '16x18', '14x16'],
      sliders: [sl('headW', '拍面寬度', 235, 285, 1), sl('headL', '拍面長度', 305, 365, 1), sl('beam', '拍框厚度', 17, 30, 0.5, mm1), sl('egg', '拍面形狀', 0, 16, 1, v => v < 0.03 ? '橢圓' : v < 0.11 ? '標準' : '水滴', 100)],
      size: P => '685 mm · 拍面約 ' + Math.round(Math.PI * (P.headW - 0.024) / 2 * (P.headL - 0.024) / 2 / 0.00064516) + ' sq in' },
    { id: 'softtennis', label: '軟式網球拍', cat: 'racket', styles: SOFT_STYLES, defaults: SOFT_DEFAULTS, build: racketBuilder(SOFT_DEFAULTS), mats: racketMats, view: stick(0.69, 0.31), patterns: ['16x17', '16x19', '18x18'],
      sliders: [sl('headW', '拍面寬度', 210, 245, 1), sl('headL', '拍面長度', 280, 320, 1), sl('beam', '拍框厚度', 16, 24, 0.5, mm1)], size: len(0.69) },
    { id: 'squash', label: '壁球拍', cat: 'racket', styles: SQUASH_STYLES, defaults: SQUASH_DEFAULTS, build: racketBuilder(SQUASH_DEFAULTS), mats: racketMats, view: stick(0.686, 0.3), patterns: ['14x18', '16x17', '12x17'],
      sliders: [sl('headW', '拍面寬度', 195, 230, 1), sl('beam', '拍框厚度', 16, 22, 0.5, mm1)], size: len(0.686) },
    { id: 'badminton', label: '羽球拍', cat: 'racket', styles: BADMINTON_STYLES, defaults: BADMINTON_DEFAULTS, build: buildBadminton, view: stick(0.675, 0.26), patterns: ['22x21', '20x21', '24x22'],
      mats: (s, g) => ({ paint: { draw: (c, W, H) => paintBadminton(c, W, H, s, g), size: [1024, 2048], rough: s.rough, metal: s.metal }, grip: gripMat(s.grip), butt: { color: s.butt, rough: 0.5, metal: s.metal }, strings: { color: s.strings, rough: 0.6, metal: 0 } }),
      sliders: [sl('headW', '拍面寬度', 175, 205, 1), sl('headL', '拍面長度', 225, 262, 1), sl('beam', '拍框厚度', 8, 13, 0.5, mm1), sl('egg', '拍面形狀', 0, 18, 1, v => v < 0.04 ? '橢圓' : v < 0.13 ? '方頭' : '大方頭', 100)],
      size: P => '675 mm · 拍面 ' + Math.round(P.headW * 1000) + ' × ' + Math.round(P.headL * 1000) + ' mm' },
    { id: 'pickleball', label: '匹克球拍', cat: 'racket', styles: PICKLE_STYLES, defaults: PICKLE_DEFAULTS, build: buildPickle, view: stick(0.4, 0.27),
      mats: (s, g) => ({ paint: { draw: (c, W, H) => paintPickle(c, W, H, s, g), size: [1024, 2048], rough: s.rough, metal: s.metal }, grip: gripMat(s.grip), butt: { color: s.butt, rough: 0.5, metal: 0 }, edge: { color: s.edge, rough: 0.5, metal: s.metal } }),
      sliders: [sl('faceW', '拍面寬度', 180, 215, 1), sl('faceL', '拍面長度', 240, 305, 1), sl('corner', '圓角', 20, 80, 1), sl('thick', '拍面厚度', 10, 20, 0.5, mm1)],
      size: P => '總長 ' + Math.round((0.125 + P.faceL) * 1000) + ' mm · 寬 ' + Math.round(P.faceW * 1000) + ' mm' },
    { id: 'tt_shake', label: '桌球拍（橫拍）', cat: 'racket', styles: mk('tt_shake', TT_KEYS, ttRows), build: ttBuilder(TT_SHAKE), mats: ttMats, view: stick(0.258, 0.2), size: () => '全長 258 mm · 拍面 150 × 158 mm' },
    { id: 'tt_pen', label: '桌球拍（直拍）', cat: 'racket', styles: mk('tt_pen', TT_KEYS, ttRows), build: ttBuilder(TT_PEN), mats: ttMats, view: stick(0.23, 0.2), size: () => '全長 230 mm · 拍面 150 × 152 mm' },

    { id: 'bat', label: '棒球棒', cat: 'stick', styles: BAT_STYLES, defaults: BAT_DEFAULTS, build: batBuilder(BAT_DEFAULTS, false), mats: batMats(false), view: stick(0.84, 0.16),
      sliders: [sl('length', '長度', 760, 870, 5), sl('barrel', '棒頭直徑', 58, 70, 0.5, mm1)], size: P => '全長 ' + Math.round(P.length * 1000) + ' mm' },
    { id: 'softball_bat', label: '壘球棒', cat: 'stick', styles: SB_STYLES, defaults: SB_DEFAULTS, build: batBuilder(SB_DEFAULTS, true), mats: batMats(true), view: stick(0.86, 0.16),
      sliders: [sl('length', '長度', 780, 880, 5), sl('barrel', '棒頭直徑', 52, 60, 0.5, mm1)], size: P => '全長 ' + Math.round(P.length * 1000) + ' mm' },
    { id: 'cue', label: '撞球桿', cat: 'stick', styles: CUE_STYLES, build: buildCue, mats: cueMats, view: stick(1.47, 0.14), size: len(1.47) },
    { id: 'golf_iron', label: '高爾夫鐵桿', cat: 'stick', styles: mk('golf_iron', GOLF_KEYS, golfRows), build: golfBuilder(false), mats: golfMats, view: stick(0.99, 0.22), size: len(0.96) },
    { id: 'golf_putter', label: '高爾夫推桿', cat: 'stick', styles: mk('golf_putter', GOLF_KEYS, golfRows), build: golfBuilder(true), mats: golfMats, view: stick(0.89, 0.22), size: len(0.87) },
    { id: 'woodball', label: '木球桿', cat: 'stick', styles: WOODBALL_STYLES, build: malletBuilder(true), mats: malletMats(true), view: stick(0.91, 0.3), size: len(0.91) },
    { id: 'gateball', label: '槌球桿', cat: 'stick', styles: GATEBALL_STYLES, build: malletBuilder(false), mats: malletMats(false), view: stick(0.82, 0.32), size: len(0.82) },
    { id: 'hockey', label: '曲棍球棍', cat: 'stick', styles: HOCKEY_STYLES, build: buildHockey, mats: hockeyMats, view: stick(0.9, 0.24), size: len(0.9) },
    { id: 'bowling_pin', label: '保齡球瓶', cat: 'stick', styles: PIN_STYLES, build: buildPin, mats: pinMats, view: stick(0.381, 0.2), size: () => '高 381 mm' },

    { id: 'basketball', label: '籃球', cat: 'ball', styles: BASKET_STYLES, build: ballBuilder(0.12), mats: ballMats(fnBasket, 0.8), view: ball(0.12), size: dia(0.12) },
    { id: 'volleyball', label: '排球', cat: 'ball', styles: VOLLEY_STYLES, build: ballBuilder(0.105), mats: ballMats(fnVolley, 0.6), view: ball(0.105), size: dia(0.105) },
    { id: 'soccer', label: '足球', cat: 'ball', styles: SOCCER_STYLES, build: ballBuilder(0.11), mats: ballMats(fnSoccer, 0.5), view: ball(0.11), size: dia(0.11) },
    { id: 'dodgeball', label: '躲避球', cat: 'ball', styles: DODGE_STYLES, build: ballBuilder(0.1), mats: ballMats(fnDodge, 0.7), view: ball(0.1), size: dia(0.1) },
    { id: 'baseball', label: '棒球', cat: 'ball', styles: BASEBALL_STYLES, build: ballBuilder(0.0365), mats: ballMats(fnBaseball, 0.75), view: ball(0.0365), size: dia(0.0365) },
    { id: 'tennis_ball', label: '網球', cat: 'ball', styles: TBALL_STYLES, build: ballBuilder(0.0335), mats: ballMats(fnTennisBall, 0.95), view: ball(0.0335), size: dia(0.0335) },
    { id: 'shuttlecock', label: '羽毛球', cat: 'ball', styles: SHUTTLE_STYLES, build: buildShuttle, mats: shuttleMats, view: { h: 0.1, w: 0.1, cy: 0.043 }, size: () => '高 85 mm' },
    { id: 'pickleball_ball', label: '匹克球', cat: 'ball', styles: PBALL_STYLES, build: ballBuilder(0.037), mats: ballMats(fnHoles, 0.6), view: ball(0.037), size: dia(0.037) },
    { id: 'tt_ball', label: '桌球', cat: 'ball', styles: TTBALL_STYLES, build: ballBuilder(0.02), mats: ballMats(fnTT, 0.5), view: ball(0.02), size: dia(0.02) },
    { id: 'bowling_ball', label: '保齡球', cat: 'ball', styles: BOWL_STYLES, build: ballBuilder(0.109), mats: ballMats(fnBowl, 0.15), view: ball(0.109), size: dia(0.109) },
    { id: 'pool_balls', label: '撞球（16 顆）', cat: 'ball', styles: POOL_STYLES, build: buildPool, mats: poolMats, view: { h: 0.4, w: 0.42, cy: 0.03, elev: 0.75 }, size: () => '16 顆 · 直徑 57 mm' },
    { id: 'petanque', label: '法式滾球', cat: 'ball', styles: BOULE_STYLES, build: buildBoules, mats: bouleMats, view: { h: 0.2, w: 0.34, cy: 0.035, elev: 0.5 }, size: () => '3 顆鋼球 + 目標球 · 直徑 74 mm' }
  ];
  SPORTS.forEach(sp => { sp.defaults = sp.defaults || {}; sp.sliders = sp.sliders || []; });

  const api = { TEX, DETAIL, CATS, SPORTS, toOBJ, toMTL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RacketCore = api;
})(typeof self !== 'undefined' ? self : this);
