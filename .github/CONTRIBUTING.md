# Contributing to sports-gear-generator

How the repo is put together and the checks CI runs.

## Working on this repo

```sh
npm run check   # geometry checks for every model, detail level and slider extreme
npm run build   # inline src/ into index.html (also a syntax check of both scripts)
npm install     # only needed for the next line
npm run media   # re-render .github/media/*.png with headless Chrome
```

CI runs `npm run check`, then `npm run build` and fails if `index.html` differs from the committed file. Both need only Node; there are no runtime dependencies. `npm run media` needs `puppeteer-core` (a dev dependency) and a local Chrome; set `CHROME_PATH` if Chrome is not in the default place.

## Rules

- Edit `src/core.js`, `src/app.js` or `src/template.html`, then run `npm run build` and commit `index.html` with the change.
- Triangles wind counter-clockwise when seen from outside. `scripts/check.js` rejects a part whose signed volume is not positive.
- Units are meters, Y is up. Long items have their origin at the grip end with +Y towards the head; single balls are centred; sets rest on `y = 0`.
- Sphere longitude segment counts are even.
- A colourway `id` is its export file name. Do not rename one after it has been published.
- Interface text is Traditional Chinese; code, comments and ids are English.
- Every colourway is original. Do not add real brand names, logos or designs.

## Before a release

- Open `index.html` in Chrome and Safari or Firefox, switch through all 28 models and press each export button.
- Import a `.glb` in Blender and an OBJ folder in Unity, and run the [glTF Validator](https://github.khronos.org/glTF-Validator/) on a `.glb`.
- If a model's look changed, run `npm run media` and update the triangle counts in all four READMEs from `npm run check`.
- Add an entry to `CHANGELOG.md` and bump `version` in `package.json`.
