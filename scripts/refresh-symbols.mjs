import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const names = [...new Set(db.cards.map(card => card.set)), 'Cornucopia', 'Guilds'];
mkdirSync('assets/symbols', { recursive: true });
const symbols = {};
for (const name of names) {
    const overrides = { Menagerie: 'Menagerie (expansion)_icon.png', Plunder: 'Plunder (expansion) icon.png' };
    const file = (overrides[name] || `${name === 'Base' ? 'Dominion' : name}_icon.png`).replaceAll(' ', '_');
    const hash = createHash('md5').update(file).digest('hex');
    const url = `https://wiki.dominionstrategy.com/images/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(file)}`;
    const response = await fetch(url);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
        console.log(`${name}: ${response.status}`);
        continue;
    }
    const path = `assets/symbols/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
    symbols[name] = { file: path, url };
    console.log(`${name}: saved`);
}
writeFileSync('data/set-symbols.json', JSON.stringify(symbols, null, 2) + '\n');
