// Inlines src/core.js and src/app.js into src/template.html and writes index.html.
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('src/template.html').replace('/*__CORE__*/', () => read('src/core.js')).replace('/*__APP__*/', () => read('src/app.js'));
for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]); // syntax check
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html written,', html.length, 'bytes');
