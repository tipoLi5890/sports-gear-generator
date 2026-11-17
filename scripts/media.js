// Renders the README images into .github/media/ with headless Chrome.
// Needs Chrome and puppeteer-core (dev dependency):  npm install && npm run media
// Set CHROME_PATH if Chrome is not in the default location.
const fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..'), out = path.join(root, '.github', 'media');
const CHROME = process.env.CHROME_PATH || {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
}[process.platform];

const C = require('../src/core.js');
const ids = cat => C.SPORTS.filter(s => s.cat === cat).map(s => s.id);
// Each image: rows of models, each scaled to fit its cell (not to real scale).
// `rows` lists the model ids per row; `weights` sets the relative row heights.
const balls = ids('ball');
const IMAGES = [
  { file: 'hero.png', W: 2400, H: 1300, rows: [ids('racket'), ids('stick'), balls], weights: [1, 1, 0.5] },
  { file: 'rackets.png', W: 2100, H: 760, rows: [ids('racket')] },
  { file: 'sticks.png', W: 2100, H: 820, rows: [ids('stick')] },
  { file: 'balls.png', W: 2100, H: 760, rows: [balls.slice(0, 6), balls.slice(6)] }
];

function render(spec) {
  const { W, H, rows } = spec, weights = spec.weights || rows.map(() => 1), wsum = weights.reduce((a, b) => a + b, 0);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(W, H, false);
  r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(r).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(1.2, 2, 2.5); scene.add(key);
  const bg = document.createElement('canvas'); bg.width = 512; bg.height = 256;
  const g = bg.getContext('2d'), grad = g.createRadialGradient(256, 90, 20, 256, 128, 330);
  grad.addColorStop(0, '#3a4150'); grad.addColorStop(1, '#1b1f28'); g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
  scene.background = new THREE.CanvasTexture(bg); scene.background.encoding = THREE.sRGBEncoding;
  // world units are pixels
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -5000, 5000);
  const cells = []; let top = H / 2;
  rows.forEach((row, r) => {
    const ch = H * weights[r] / wsum, cw = W / row.length;
    row.forEach((id, c) => cells.push({ id, cw, ch, x: -W / 2 + (c + 0.5) * cw, y: top - ch / 2 }));
    top -= ch;
  });
  cells.forEach(({ id, cw, ch, x: x0, y: y0 }, i) => {
    const sp = RacketCore.SPORTS.find(s => s.id === id), style = sp.styles[(i * 3) % sp.styles.length];
    const built = sp.build(sp.defaults, 'high'), desc = sp.mats(style, built.dims), mats = {};
    const inner = new THREE.Group();
    for (const p of built.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(p.normals, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(p.uvs, 2));
      geo.setIndex(new THREE.BufferAttribute(p.indices, 1));
      if (!mats[p.material]) {
        const d = desc[p.material];
        if (d.draw) {
          const c = document.createElement('canvas'); c.width = d.size[0]; c.height = d.size[1]; d.draw(c.getContext('2d'), c.width, c.height);
          const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; if (d.wrap) t.wrapS = THREE.RepeatWrapping;
          mats[p.material] = new THREE.MeshStandardMaterial({ map: t, roughness: d.rough, metalness: d.metal || 0 });
        } else mats[p.material] = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color), roughness: d.rough == null ? 0.5 : d.rough, metalness: d.metal || 0 });
      }
      inner.add(new THREE.Mesh(geo, mats[p.material]));
    }
    // three-quarter view: turn towards the camera and tip sets/balls slightly forward
    inner.rotation.y = sp.cat === 'ball' ? 0.5 : -0.45;
    if (sp.cat === 'ball') inner.rotation.x = /pool|petanque/.test(id) ? 0.75 : 0.25;
    const holder = new THREE.Group(); holder.add(inner); holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const s = Math.min(0.8 * cw / size.x, 0.84 * ch / size.y);
    holder.scale.setScalar(s);
    holder.position.set(x0 - mid.x * s, y0 - mid.y * s, -mid.z * s);
    scene.add(holder);
  });
  r.render(scene, cam);
  return canvas.toDataURL('image/png');
}

(async () => {
  if (!CHROME || !fs.existsSync(CHROME)) throw new Error('Chrome not found; set CHROME_PATH');
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(root, 'index.html'), { waitUntil: 'networkidle0' });
    for (const spec of IMAGES) {
      const url = await page.evaluate(render, spec);
      fs.writeFileSync(path.join(out, spec.file), Buffer.from(url.split(',')[1], 'base64'));
      console.log('.github/media/' + spec.file, spec.W + 'x' + spec.H);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
