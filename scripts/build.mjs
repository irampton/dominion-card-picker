import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
mkdirSync('dist', { recursive: true });
const db = readFileSync('data/cards.json', 'utf8');
const symbolManifest = JSON.parse(readFileSync('data/set-symbols.json', 'utf8'));
const symbols = JSON.stringify(Object.fromEntries(Object.entries(symbolManifest).map(([name, symbol]) => [name, { src: `data:image/png;base64,${readFileSync(symbol.file).toString('base64')}` }])));
const requirementsCode = readFileSync('requirements.js', 'utf8').replaceAll('export ', '');
const attacksCode = readFileSync('attacks.js', 'utf8').replaceAll('export ', '');
const presetsCode = readFileSync('presets.js', 'utf8').replace(/^import .*?;\r?\n/gm, '').replaceAll('export ', '');
const engine = readFileSync('engine.js', 'utf8').replace(/^import .*?;\r?\n/m, '').replaceAll('export ', '');
const app = readFileSync('app.js', 'utf8').replace(/^import .*?;\r?\n/gm, '');
const html = readFileSync('index.html', 'utf8')
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${readFileSync('styles.css', 'utf8')}</style>`)
    .replace('<script type="module" src="app.js"></script>', () => `<script id="set-symbols" type="application/json">${symbols}</script>\n<script id="card-data" type="application/json">${db.replaceAll('<', '\\u003c')}</script>\n<script type="module">${requirementsCode}\n${attacksCode}\n${presetsCode}\n${engine}\n${app.replaceAll('./assets/randomizer-back.jpg', `data:image/jpeg;base64,${readFileSync('assets/randomizer-back.jpg').toString('base64')}`)}</script>`);
writeFileSync('dist/index.html', html);
mkdirSync('dist/data', { recursive: true });
cpSync('data/cards.json', 'dist/data/cards.json');
cpSync('THIRD_PARTY.md', 'dist/THIRD_PARTY.md');
cpSync('data/upstream/LICENSE', 'dist/DATA-LICENSE.txt');
cpSync('data/source-LICENSE', 'dist/SUPPLEMENTAL-DATA-LICENSE.txt');
console.log('Built dist/index.html (self-contained code and database; remote card images).');
