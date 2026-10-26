import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const legacy = read('data/source-cards.json');
let wikiImages = {};
try {
    wikiImages = read('data/wiki-images.json');
} catch {
    // First build can use wiki redirects until image metadata is refreshed.
}
const raw = readdirSync('data/upstream').filter(file => file.endsWith('.json')).flatMap(file => read(`data/upstream/${file}`));
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const companions = {
    Hermit: ['Madman'], Urchin: ['Mercenary'], 'Bandit Camp': ['Spoils'], Marauder: ['Spoils'], Pillage: ['Spoils'],
    Page: ['Treasure Hunter', 'Warrior', 'Hero', 'Champion'], Peasant: ['Soldier', 'Fugitive', 'Disciple', 'Teacher'],
    Necromancer: ['Zombie Apprentice', 'Zombie Mason', 'Zombie Spy'], Fool: ['Lost in the Woods'], Vampire: ['Bat'],
    Leprechaun: ['Wish'], 'Secret Cave': ['Wish'], "Devil's Workshop": ['Imp'], Tormentor: ['Imp'], Cemetery: ['Ghost'],
    Exorcist: ["Will-o'-Wisp", 'Imp', 'Ghost'], 'Flag Bearer': ['Flag'], 'Border Guard': ['Horn', 'Lantern'],
    Treasurer: ['Key'], Swashbuckler: ['Treasure Chest']
};
const materialNames = ['Island mat', 'Pirate Ship mat', 'Native Village mat', 'Trade Route mat', 'Tavern mat', 'Journey token', '-1 Card token', '+1 Card token', '+1 Action token', '+1 Buy token', 'Trashing token', 'Estate token'];
const cards = raw.map(card => {
    const text = card.instructions;
    const old = legacy.find(item => item.name === card.name);
    const materials = materialNames.filter(name => text.includes(name));
    const requires = [...(companions[card.name] || [])];
    if (/Coffers/.test(text)) {
        materials.push('Coffers mat', 'Coin tokens');
    }
    if (/Villager/.test(text)) {
        materials.push('Coffers / Villagers mat', 'Coin tokens');
    }
    if (/Coin token/i.test(text)) {
        materials.push('Coin tokens');
    }
    if (/Exile/.test(text)) {
        materials.push('Exile mat');
    }
    if (card.types.includes('Liaison') || /Favors?/.test(text)) {
        materials.push('Favors mat', 'Coin tokens');
    }
    if (card.types.includes('Gathering') || /\+\d+ VP|Put \d+ VP/.test(text)) {
        materials.push('Victory tokens');
    }
    if (card.cost.debt || /\d+D\b/.test(text)) {
        materials.push('Debt tokens');
    }
    if (/-\$1 token/.test(text)) {
        materials.push('-1 Coin token');
    }
    if (/\+\$1 token/.test(text)) {
        materials.push('+1 Coin token');
    }
    if (card.name === 'Embargo') {
        materials.push('Embargo tokens');
    }
    if (card.types.includes('Project')) {
        materials.push('Wooden cubes');
    }
    if (card.types.includes('Omen')) {
        materials.push('Sun tokens');
    }
    if (card.types.includes('Fate')) {
        requires.push('Boons', "Will-o'-Wisp");
    }
    if (card.types.includes('Doom')) {
        requires.push('Hexes', 'Deluded', 'Miserable');
    }
    if (card.types.includes('Looter')) {
        requires.push('Ruins');
    }
    if (/[gG]ains? (?:a|that many|\d+) Horses?/.test(text)) {
        requires.push('Horse');
    }
    if (/[gG]ain a Loot/.test(text)) {
        requires.push('Loot');
    }
    if (card.name === 'Joust' || card.name === 'Tournament') {
        requires.push(...raw.filter(item => item.types.includes(card.name === 'Joust' ? 'Reward' : 'Prize')).map(item => item.name));
    }
    const heirloom = text.match(/Heirloom: (.+)/)?.[1];
    if (heirloom) {
        requires.push(heirloom);
    }
    // Mixed piles remain one selectable pile; include all members for dependency analysis.
    let members = [];
    if (card.quantity === 0 && card.purpose === 'Kingdom Pile') {
        if (card.name.includes('/')) {
            members = card.name.split('/');
        } else if (card.name === 'Knights' || card.name === 'Castles') {
            members = raw.filter(item => item.purpose === 'Mixed Pile Card' && item.types.includes(card.name === 'Knights' ? 'Knight' : 'Castle')).map(item => item.name);
        } else {
            members = raw.filter(item => item.purpose === 'Mixed Pile Card' && item.set === card.set && text.includes(item.name)).map(item => item.name);
        }
    }
    const imageFile = card.image.replaceAll(' ', '_');
    return {
        id: slug(card.name), name: card.name, set: card.set, editions: card.editions,
        types: card.types, purpose: card.purpose, cost: { coins: 0, debt: 0, potion: false, ...card.cost },
        quantity: card.quantity, text, imageFile,
        imageUrl: wikiImages[slug(card.name)] || `https://wiki.dominionstrategy.com/index.php/Special:Redirect/file/${encodeURIComponent(imageFile)}`,
        wikiUrl: `https://wiki.dominionstrategy.com/index.php/${encodeURIComponent(card.name.replaceAll(' ', '_'))}`,
        members, requires: [...new Set(requires)], materials: [...new Set(materials)],
        ownership: card.set === 'Cornucopia & Guilds' && card.editions.includes(1) && ['Cornucopia', 'Guilds'].includes(old?.set) ? [`${old.set}:1`] : [],
        setup: text.match(/Setup: ([\s\S]*?)(?:\nHeirloom:|$)/)?.[1] || '',
        ...(old ? { legacy: { categories: old.categories, setup: old.setup } } : {})
    };
});
const sets = [...new Set(cards.filter(card => card.purpose === 'Kingdom Pile').map(card => card.set))].map(name => ({
    id: slug(name), name: name === 'Base' ? 'Dominion' : name,
    sourceName: name,
    editions: [...new Set(cards.filter(card => card.set === name && card.purpose === 'Kingdom Pile').flatMap(card => card.editions))].sort()
}));
sets.splice(sets.findIndex(set => set.sourceName === 'Cornucopia & Guilds'), 0,
    { id: 'cornucopia', name: 'Cornucopia', sourceName: 'Cornucopia', editions: [1], standalone: true },
    { id: 'guilds', name: 'Guilds', sourceName: 'Guilds', editions: [1], standalone: true });
const db = {
    schemaVersion: 1, generated: '2026-10-25',
    sources: [
        { url: 'https://wiki.dominionstrategy.com', role: 'Card rules and remote images, via the setup snapshot' },
        { url: 'https://github.com/sgraaf/dominion-setup', revision: read('data/setup-revision.json').sha, role: 'Primary card catalog and editions', license: 'GPL-3.0' },
        { url: 'https://github.com/KLongmuir/dominion-card-data', revision: read('data/cards-revision.json').sha, role: 'Supplemental categories and historical setup fields', license: 'MIT' }
    ], sets, cards
};
writeFileSync('data/cards.json', JSON.stringify(db, null, 2) + '\n');
console.log(`${cards.length} records; ${cards.filter(card => card.purpose === 'Kingdom Pile').length} kingdom piles.`);
