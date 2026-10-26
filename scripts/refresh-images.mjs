import { readFileSync, writeFileSync } from 'node:fs';

// Read public Open Graph metadata only; never attempt to solve the wiki's challenge.
const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const images = {};
let cursor = 0;
let done = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < db.cards.length) {
        const card = db.cards[cursor++];
        try {
            const response = await fetch(card.wikiUrl, { signal: AbortSignal.timeout(20000) });
            const html = await response.text();
            const image = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1];
            if (image) {
                images[card.id] = image.replace(/^http:/, 'https:').replaceAll('&amp;', '&');
            }
        } catch (error) {
            console.log(`${card.name}: ${error.message}`);
        }
        done++;
        if (done % 100 === 0) {
            console.log(`${done}/${db.cards.length} pages checked; ${Object.keys(images).length} image URLs found.`);
        }
    }
}));
writeFileSync('data/wiki-images.json', JSON.stringify(images, null, 2) + '\n');
console.log(`${Object.keys(images).length} wiki image URLs saved.`);
