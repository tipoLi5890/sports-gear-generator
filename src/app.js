(function () {
  const $ = id => document.getElementById(id), RC = RacketCore;
  const state = { sport: 'tennis', style: {}, params: {}, detail: 'mid', lineup: false, spin: false, wire: false };
  RC.SPORTS.forEach(sp => {
    state.style[sp.id] = sp.styles[0].id; state.params[sp.id] = {};
    sp.sliders.forEach(s => { state.params[sp.id][s.key] = sp.defaults[s.key]; });
    if (sp.patterns) { state.params[sp.id].mains = sp.defaults.mains; state.params[sp.id].crosses = sp.defaults.crosses; }
  });
  const sport = () => RC.SPORTS.find(s => s.id === state.sport);
  const curStyle = () => sport().styles.find(s => s.id === state.style[state.sport]);
  const curParams = () => state.params[state.sport];

  /* ---------- controls that work without WebGL ---------- */
  const sportsEl = $('sports'), stylesEl = $('styles'), slidersEl = $('sliders');
  RC.CATS.forEach(cat => {
    const h = document.createElement('h3'); h.textContent = cat.label; sportsEl.appendChild(h);
    const wrap = document.createElement('div'); wrap.className = 'chips'; sportsEl.appendChild(wrap);
    RC.SPORTS.filter(sp => sp.cat === cat.id).forEach(sp => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.s = sp.id; b.textContent = sp.label;
      b.addEventListener('click', () => { state.sport = sp.id; buildControls(); refresh(); });
      wrap.appendChild(b);
    });
  });
  function buildControls() {
    const sp = sport(), P = curParams();
    stylesEl.innerHTML = ''; slidersEl.innerHTML = '';
    sp.styles.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'style'; b.dataset.id = s.id;
      b.innerHTML = '<span class="sw">' + s.sw.map(c => '<i style="background:' + c + '"></i>').join('') + '</span><span><b>' + s.label + '</b><small>' + s.id + '</small></span>';
      b.addEventListener('click', () => { state.style[state.sport] = s.id; refresh(); });
      stylesEl.appendChild(b);
    });
    sp.sliders.forEach(s => {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = '<label for="sl_' + s.key + '">' + s.label + '</label><input type="range" id="sl_' + s.key + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '"><output id="so_' + s.key + '"></output>';
      const inp = row.querySelector('input'); inp.value = P[s.key] * s.k;
      inp.addEventListener('input', () => { P[s.key] = inp.value / s.k; refresh(); });
      slidersEl.appendChild(row);
    });
    $('shapeSec').style.display = sp.sliders.length || sp.patterns ? '' : 'none';
    const pr = $('patternRow'), sel = $('pattern');
    pr.style.display = sp.patterns ? '' : 'none';
    if (sp.patterns) {
      sel.innerHTML = sp.patterns.map(p => '<option value="' + p + '">' + p.replace('x', ' × ') + '</option>').join('');
      sel.value = P.mains + 'x' + P.crosses;
    }
    $('dlSport').textContent = '下載「' + sp.label + '」全部 ' + sp.styles.length + ' 款（ZIP）';
  }
  function syncUI() {
    const sp = sport(), P = curParams(), s = curStyle();
    sportsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === state.sport)));
    stylesEl.querySelectorAll('.style').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === s.id)));
    $('detail').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.d === state.detail)));
    sp.sliders.forEach(sl => { $('so_' + sl.key).textContent = sl.fmt(P[sl.key]); });
    $('tagName').textContent = state.lineup ? sp.label + ' · 全部樣式' : sp.label + ' · ' + s.label;
    $('tagId').textContent = state.lineup ? sp.styles.length + ' models' : s.id;
    $('stSize').textContent = sp.size(P);
    for (const [k, el] of [['low', 'dLow'], ['mid', 'dMid'], ['high', 'dHigh']]) $(el).textContent = sp.build(P, k).tris.toLocaleString() + ' tris';
  }
  $('pattern').addEventListener('input', e => { const p = e.target.value.split('x'), P = curParams(); P.mains = +p[0]; P.crosses = +p[1]; refresh(); });
  const bind = (id, key) => $(id).addEventListener('input', e => { state[key] = e.target.checked; refresh(); });
  bind('lineup', 'lineup'); bind('spin', 'spin'); bind('wire', 'wire');
  $('detail').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.detail = b.dataset.d; refresh(); } });

  /* ---------- three.js scene ---------- */
  let renderer, scene, camera, controls, holder, ok = false, lastFit = '';
  const stage = $('stage'), canvas = $('view');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
    try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; } catch (e) { /* lights below still work */ }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, scene.environment ? 0.25 : 0.9));
    const key = new THREE.DirectionalLight(0xffffff, scene.environment ? 0.9 : 1.4); key.position.set(1.2, 2, 2.5); scene.add(key);
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.minDistance = 0.05; controls.maxDistance = 12;
    holder = new THREE.Group(); scene.add(holder);
    ok = true;
  } catch (e) { $('err').style.display = 'flex'; }

  const texCache = new Map(); let texPixels = 0;
  // Preview textures are cached (switching back is instant); export draws fresh canvases so a
  // 196-model export does not keep hundreds of large canvases alive.
  function texCanvas(key, d, cache) {
    let c = cache ? texCache.get(key) : null;
    if (!c) {
      c = document.createElement('canvas'); c.width = d.size[0]; c.height = d.size[1];
      d.draw(c.getContext('2d'), c.width, c.height);
      if (cache) {
        // keep at most ~24 M texels (~96 MB); a pool-ball lineup (112 small maps) or 7 ball maps fit at once
        texCache.set(key, c); texPixels += c.width * c.height;
        while (texPixels > 24e6 && texCache.size > 1) { const [k0, c0] = texCache.entries().next().value; texCache.delete(k0); texPixels -= c0.width * c0.height; }
      }
    }
    return c;
  }
  function makeModel(sp, style, params, detail, wire, cache) {
    const built = sp.build(params, detail), desc = sp.mats(style, built.dims), pk = sp.id + '|' + style.id + '|' + JSON.stringify(params) + '|';
    const mats = {}, canvases = {}, matFor = id => {
      if (mats[id]) return mats[id];
      const d = desc[id]; let m;
      if (d.draw) {
        const c = texCanvas(pk + id, d, cache !== false), t = new THREE.CanvasTexture(c);
        t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; if (d.wrap) t.wrapS = THREE.RepeatWrapping;
        canvases[id] = c; m = new THREE.MeshStandardMaterial({ map: t, roughness: d.rough, metalness: d.metal || 0 });
      } else m = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), roughness: d.rough == null ? 0.5 : d.rough, metalness: d.metal || 0 });
      m.name = style.id + '_' + id; m.wireframe = !!wire; mats[id] = m; return m;
    };
    const group = new THREE.Group(); group.name = style.id;
    for (const p of built.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(p.normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(p.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(p.indices, 1));
      const mesh = new THREE.Mesh(geo, matFor(p.material)); mesh.name = p.name; group.add(mesh);
    }
    return { group, built, canvases, desc };
  }
  function disposeGroup(g) {
    g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  }
  function fit() {
    const v = sport().view, n = state.lineup ? sport().styles.length : 1, width = v.w * n, height = v.h * 1.1;
    const aspect = stage.clientWidth / Math.max(stage.clientHeight, 1), th = Math.tan(camera.fov * Math.PI / 360);
    const dist = Math.max(height / 2 / th, width / 2 / (th * aspect)) * 1.12, el = v.elev || 0.08;
    controls.target.set(0, v.cy, 0);
    camera.position.set(state.lineup ? 0 : dist * 0.42, v.cy + dist * el, dist * (state.lineup ? 1 : 0.9));
    controls.update();
  }
  function rebuild() {
    if (!ok) return;
    while (holder.children.length) { const c = holder.children[0]; holder.remove(c); disposeGroup(c); }
    const sp = sport(), list = state.lineup ? sp.styles : [curStyle()];
    let tris = 0;
    list.forEach((s, i) => {
      const r = makeModel(sp, s, curParams(), state.detail, state.wire);
      r.group.position.x = (i - (list.length - 1) / 2) * sp.view.w;
      holder.add(r.group); tris = r.built.tris;
    });
    $('stTris').textContent = tris.toLocaleString() + ' 三角面／件';
    const key = state.sport + state.lineup;
    if (key !== lastFit) { lastFit = key; fit(); }
  }
  function refresh() { syncUI(); rebuild(); }

  function resize() {
    if (!ok) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (ok) {
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
    resize();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (function loop() {
      requestAnimationFrame(loop);
      const on = state.spin && !reduce;
      holder.children.forEach(c => { c.rotation.y = on ? c.rotation.y + 0.008 : 0; });
      controls.update(); renderer.render(scene, camera);
    })();
  }
  $('dlAll').textContent = '下載全部 ' + RC.SPORTS.length + ' 種共 ' + RC.SPORTS.reduce((a, sp) => a + sp.styles.length, 0) + ' 款（ZIP）';
  buildControls(); refresh();

  /* ---------- export ---------- */
  const msg = (t, warn) => { const m = $('msg'); m.textContent = t; m.className = 'msg' + (warn ? ' warn' : ''); };
  const canvasPNG = c => new Promise((res, rej) => c.toBlob(b => b ? b.arrayBuffer().then(res, rej) : rej(new Error('png')), 'image/png'));
  const README = [
    'Sports equipment - procedural models', '',
    'Units: meters, Y-up.',
    'Rackets, bats, cues, clubs, mallets and sticks: origin at the grip end, +Y towards the head.',
    'Single balls: origin at the centre. Ball sets and pins: resting on the ground plane (y = 0).', '',
    '<model>/glb/  - binary glTF 2.0 with embedded textures.',
    '        Blender: File > Import > glTF 2.0 (.glb/.gltf).',
    '        Unity: install the glTFast package (com.unity.cloud.gltfast), then drop the .glb into Assets.',
    '<model>/obj/  - Wavefront OBJ + MTL + PNG textures, one folder per colourway.',
    '        Unity: drag the folder into Assets (keep the files together so the textures link).',
    '        Blender: File > Import > Wavefront (.obj).', ''
  ].join('\n');

  const toGLB = group => new Promise((res, rej) => new THREE.GLTFExporter().parse(group, res, rej, { binary: true }));
  // OBJ: every material gets a map_Kd. Plain-colour materials get an 8x8 swatch, because Unity's
  // OBJ importer assigns another material's texture to materials that have only a Kd colour.
  async function addOBJ(zip, dir, name, r) {
    const desc = Object.assign({}, r.desc), pngs = Object.assign({}, r.canvases);
    for (const p of r.built.parts) {
      const d = desc[p.material];
      if (!d || d.draw || pngs[p.material]) continue;
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const x = c.getContext('2d'); x.fillStyle = d.color; x.fillRect(0, 0, 8, 8);
      pngs[p.material] = c; desc[p.material] = Object.assign({}, d, { draw: true });
    }
    zip.file(dir + name + '.obj', RC.toOBJ(r.built.parts, name));
    zip.file(dir + name + '.mtl', RC.toMTL(name, desc, r.built.parts));
    for (const id of Object.keys(pngs)) zip.file(dir + name + '_' + id + '.png', await canvasPNG(pngs[id]));
  }
  async function addToZip(zip, sp, style) {
    const r = makeModel(sp, style, state.params[sp.id], state.detail, false, false), name = style.id;
    try {
      zip.file(sp.id + '/glb/' + name + '.glb', await toGLB(r.group));
      await addOBJ(zip, sp.id + '/obj/' + name + '/', name, r);
    } finally { disposeGroup(r.group); }
  }
  /* Plain browser download: Blob + <a download>. */
  function save(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const tick = () => new Promise(r => setTimeout(r, 0)); // let the page repaint between models
  const ready = ok && window.JSZip && THREE.GLTFExporter;
  let busy = false;
  const btns = ['dlOne', 'dlObj', 'dlSport', 'dlAll'], lock = v => btns.forEach(b => { $(b).disabled = v; });
  async function run(work, filename) {
    if (busy || !ready) return;
    busy = true; lock(true);
    try {
      const blob = await work();
      save(blob, filename);
      msg('已下載 ' + filename + '（' + (blob.size / 1048576).toFixed(1) + ' MB）。');
    } catch (e) {
      msg('匯出失敗：' + ((e && e.message) || '未知錯誤') + '。請再試一次。', true);
    } finally { busy = false; lock(false); }
  }
  async function zipOf(items, withReadme) {
    const zip = new JSZip(); if (withReadme) zip.file('README.txt', README);
    for (let i = 0; i < items.length; i++) {
      msg('正在產生模型檔… ' + (i + 1) + ' / ' + items.length); await tick();
      await addToZip(zip, items[i][0], items[i][1]);
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, m => msg('正在壓縮… ' + Math.round(m.percent) + '%'));
  }
  $('dlOne').addEventListener('click', () => run(async () => {
    const sp = sport(), r = makeModel(sp, curStyle(), curParams(), state.detail, false, false);
    try { return new Blob([await toGLB(r.group)], { type: 'model/gltf-binary' }); } finally { disposeGroup(r.group); }
  }, curStyle().id + '.glb'));
  $('dlObj').addEventListener('click', () => run(async () => {
    const sp = sport(), s = curStyle(), r = makeModel(sp, s, curParams(), state.detail, false, false), zip = new JSZip();
    try { await addOBJ(zip, s.id + '/', s.id, r); } finally { disposeGroup(r.group); }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }, curStyle().id + '_obj.zip'));
  $('dlSport').addEventListener('click', () => { const sp = sport(); run(() => zipOf(sp.styles.map(s => [sp, s]), true), sp.id + '_all.zip'); });
  $('dlAll').addEventListener('click', () => { const all = []; RC.SPORTS.forEach(sp => sp.styles.forEach(s => all.push([sp, s]))); run(() => zipOf(all, true), 'sports_models_all.zip'); });
  if (ready) { lock(false); msg('會依目前的外型與精細度匯出。'); }
  else msg('3D 函式庫沒有載入完成，無法匯出。請重新整理頁面。', true);
})();
