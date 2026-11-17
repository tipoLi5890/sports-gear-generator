# sports-gear-generator — 給 Claude Code 的專案說明

## 這是什麼

瀏覽器內執行的程序化 3D 球具產生器。28 種模型、每種 7 款塗裝（共 196 款），用 three.js 預覽，匯出 GLB 與 OBJ 給 Blender、Unity 使用。整個頁面是單一 `index.html`，不需要建置或伺服器就能開啟。

## 檔案結構

```
index.html            建置產物，不要手改
src/template.html     頁面骨架與 CSS，含 /*__CORE__*/ 與 /*__APP__*/ 兩個插入點
src/core.js           建模核心，純 JS、無相依，Node 也能 require
src/app.js            UI、three.js 場景、匯出
scripts/build.js      把 src/ 內嵌成 index.html
scripts/check.js      幾何檢查
scripts/media.js      用無頭 Chrome 產生 README 圖片
.github/              多語 README、CONTRIBUTING、CI、media/（README 用圖）
```

## 指令

```sh
npm run check   # 改過 src/core.js 後一定要跑
npm run build   # 改過 src/ 任何檔案後重建 index.html，並與原始碼一起提交
npm run media   # 外觀改變後重畫 .github/media/*.png（需先 npm install 與本機 Chrome）
```

執行期沒有 npm 相依套件；`puppeteer-core` 只是 `npm run media` 用的開發相依。three.js r147（UMD 版）與 JSZip 3.10.1 由 `src/template.html` 從 CDN 載入。CI（`.github/workflows/ci.yml`）會跑 `npm run check`，並確認 `index.html` 與 `src/` 同步。

`npm run check` 只檢查幾何。動到預覽或匯出時，請在瀏覽器實際開啟頁面，切換模型並按下載按鈕確認。

## core.js 架構

對外介面是 `RacketCore`（瀏覽器全域變數，或 Node 的 `module.exports`）：`SPORTS`、`CATS`、`DETAIL`、`TEX`、`toOBJ`、`toMTL`。

`SPORTS` 每一筆是一種模型：

| 欄位 | 說明 |
|---|---|
| `id`, `label`, `cat` | 識別碼、中文名、類別（`racket`／`stick`／`ball`） |
| `styles` | 7 款塗裝，每款有 `id`、`label`、`sw`（色票）與該模型自訂的顏色欄位 |
| `defaults`, `sliders`, `patterns` | 可調參數（沒有就是空的） |
| `build(params, detail)` | 回傳 `{ parts, tris, dims }`；`parts` 每筆有 `name`、`material`、`positions`、`normals`、`uvs`、`indices` |
| `mats(style, dims)` | 回傳 `{ 材質id: 描述 }`；描述是 `{ color, rough, metal }` 或 `{ draw(ctx, W, H), size, rough, metal, wrap }` |
| `view` | 預覽鏡頭用的 `{ h, w, cy, elev }` |
| `size(params)` | 畫面上顯示的尺寸文字 |

建模工具：

- `sweep(mb, path, section, opts)`：截面沿 XY 平面上的路徑掃掠。拍框、握把、弦線、曲棍球棍。
- `lathe(mb, profile, seg, opts)`：繞 +Y 的旋轉體，面朝輪廓前進方向的右側。球棒、球桿、球瓶、槌頭。
- `sphere(mb, R, lon, lat, opts)`：UV 球，貼圖是等距圓柱投影。
- `extrude(mb, outline, z0, z1, opts)`：星形輪廓擠出。桌球拍、鐵桿桿頭。
- `curve(points, sub)`：Catmull-Rom 平滑輪廓。
- `finish(mb, flat)`／`smooth(mb)`：計算法線；`smooth` 會焊接接縫處的法線。

貼圖工具：`drawBands`（沿長度的色帶）、`paintFrame`／`paintBadminton`／`paintPickle`（正面投影塗裝，範圍由 `TEX` 定義）、`pix`（逐像素球面貼圖）。

## 實作上要注意的地方

- `pix(ctx, W, H, fn)` 每個像素取 2×2 個樣本做反鋸齒，球的貼圖預設 1024×512。`fn(d, k, n)` 會收到樣本索引 `k` 與總數 `n`；與配色無關的昂貴計算（例如棒球、網球的縫線距離 `seamCached`）用它快取，讓 7 款共用。新增的球紋若很慢，也照這個做法。
- OBJ 匯出時每個材質都要有 `map_Kd`。純色材質由 `src/app.js` 補一張 8×8 色票 PNG，因為 Unity 的 OBJ 匯入器會把別的貼圖套到只有 `Kd` 的材質上。
- 預覽的貼圖快取以總像素數為上限（約 2400 萬像素）；匯出時不走快取，每款重畫，避免 196 款匯出時佔用大量記憶體。
- 下載走一般瀏覽器的 Blob + `<a download>`。批次匯出每款之間會讓出主執行緒並更新進度文字。

## 慣例

- 單位公尺，Y 軸朝上。拍、棒、桿原點在握把底部，+Y 朝前端；單顆球原點在球心；成組的球與球瓶放在 y = 0 上。
- 三角面一律逆時針朝外，`scripts/check.js` 用體積正負檢查。
- 球的經度段數必須是偶數（緯度是它的一半）。
- 塗裝 `id` 是匯出檔名，已發佈後不要改名。
- 介面文字用繁體中文；程式碼、註解、id 用英文。README 有英文（根目錄）與繁中、簡中、日文（`.github/`）四個版本，內容要同步。
- 所有塗裝都是原創配色，不要加入任何真實品牌的名稱、標誌或設計。
