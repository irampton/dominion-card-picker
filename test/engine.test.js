import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compareCards, compareKingdomCards, costLabel, drawKingdom, landscapeReplacementCandidates, ownedCards, pileCountNote, replacementCandidates, resolveSetup } from '../engine.js';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const byName = name => {
    const card = db.cards.find(item => item.name === name);
    assert.ok(card, `Missing ${name}`);
    return card;
};
const selections = db.sets.flatMap(set => set.editions.map(edition => `${set.sourceName}:${edition}`));
const pool = ownedCards(db, selections);

test('kingdom sort modes use cost, name, or displayed set then name', () => {
    const cards = ['Witch', 'Moat', 'Chapel', 'Alchemist', 'Apprentice', 'Village'].map(byName);
    const names = mode => [...cards].sort((a, b) => compareKingdomCards(a, b, mode)).map(card => card.name);
    assert.deepEqual(names('Cost'), [...cards].sort(compareCards).map(card => card.name));
    assert.deepEqual(names('Name'), ['Alchemist', 'Apprentice', 'Chapel', 'Moat', 'Village', 'Witch']);
    assert.deepEqual(names('Set'), ['Alchemist', 'Apprentice', 'Chapel', 'Moat', 'Village', 'Witch']);
    assert.ok(compareKingdomCards(byName('Chapel'), byName('Apprentice'), 'Set', card => card.set === 'Base' ? 'A Dominion' : card.set) < 0);
    assert.equal(cards[0].name, 'Witch');
});
const options = { colony: 'no', shelters: 'no', selections };
const kingdomWith = names => [...names.map(byName), ...ownedCards(db, ['Base:2']).filter(card => !names.includes(card.name))].slice(0, 10);

test('landscape replacements preserve ownership, type filters, uniqueness and cached choices', () => {
    const selected = ['Menagerie:1'];
    const owned = ownedCards(db, selected);
    const kingdom = owned.slice(0, 10);
    const config = { selections: selected, landscapes: 2, landscapeTypes: ['Way'] };
    const cache = {};
    const before = resolveSetup(db, kingdom, owned, config, cache);
    const current = before.landscapes[0];
    const choices = landscapeReplacementCandidates(db, kingdom, owned, config, cache, current);
    assert.ok(choices.length);
    assert.ok(choices.every(card => card.set === 'Menagerie' && card.types.includes('Way') && !before.landscapes.includes(card)));
    const nextCache = { ...cache, 'landscape-0': choices[0].id };
    const after = resolveSetup(db, kingdom, owned, config, nextCache);
    assert.equal(after.landscapes[0].id, choices[0].id);
    assert.equal(after.landscapes[1].id, before.landscapes[1].id);
    assert.equal(cache['landscape-0'], current.id);
    const specialCache = {};
    const specialKingdom = kingdomWith(['Importer', 'Poet']);
    const special = resolveSetup(db, specialKingdom, pool, options, specialCache);
    for (const type of ['Ally', 'Prophecy']) {
        const target = special.landscapes.find(card => card.types.includes(type));
        const replacements = landscapeReplacementCandidates(db, specialKingdom, pool, options, specialCache, target);
        assert.ok(replacements.length && replacements.every(card => card.types.includes(type)));
    }
});
const setupFor = names => resolveSetup(db, kingdomWith(names), pool, options, {}, () => .5);

test('pile quantities distinguish six-player Provinces, Curses, Ruins and Victory piles', () => {
    assert.equal(pileCountNote(byName('Province')), '8 / 12 / 12 / 15 / 18 for 2 / 3 / 4 / 5 / 6 players.');
    for (const name of ['Curse', 'Ruins']) {
        assert.equal(pileCountNote(byName(name)), '10 / 20 / 30 / 40 / 50 for 2 / 3 / 4 / 5 / 6 players.');
    }
    for (const name of ['Estate', 'Duchy', 'Colony', 'Gardens', 'Castles', 'Mill']) {
        assert.equal(pileCountNote(byName(name)), '8 / 12 for 2 / 3–6 players.');
    }
    assert.equal(pileCountNote(byName('Village')), '');
    assert.equal(pileCountNote(byName('Copper')), 'All remaining copies after dealing starting decks.');
});

test('starting decks are described only when changed, with combined Heirlooms and Shelters', () => {
    assert.ok(!setupFor(['Village']).notes.some(note => note.name === 'Starting decks'));
    const kingdom = kingdomWith(['Pooka', 'Cemetery']);
    const result = resolveSetup(db, kingdom, pool, { ...options, shelters: 'yes' });
    const note = result.notes.find(note => note.name === 'Starting decks');
    assert.ok(note);
    assert.match(note.text, /5 Coppers/);
    for (const name of ['Cursed Gold', 'Haunted Mirror', 'Hovel', 'Necropolis', 'Overgrown Estate']) {
        assert.ok(note.text.includes(`1 ${name}`));
    }
    assert.equal(result.notes.filter(note => note.name === 'Starting decks').length, 1);
});

test('catalog IDs, edition membership, references and split piles are internally consistent', () => {
    assert.equal(db.cards.length, 855);
    assert.equal(pool.length, 498);
    assert.equal(new Set(db.cards.map(card => card.id)).size, db.cards.length);
    for (const card of db.cards) {
        assert.ok(card.editions.length && card.editions.every(edition => [1, 2].includes(edition)), card.name);
        assert.ok(card.imageUrl.startsWith('https://wiki.dominionstrategy.com/'), card.name);
        for (const name of [...card.requires, ...card.members]) {
            assert.ok(db.cards.some(item => item.name === name), `${card.name} references missing ${name}`);
        }
        if (card.quantity === 0 && card.purpose === 'Kingdom Pile') {
            assert.ok(card.members.length >= 2, `Missing mixed-pile members: ${card.name}`);
        }
    }
});

test('editions exclude removed / added cards and union shared cards', () => {
    const first = ownedCards(db, ['Base:1']);
    const second = ownedCards(db, ['Base:2']);
    assert.equal(first.length, 25);
    assert.equal(second.length, 26);
    assert.ok(first.some(card => card.name === 'Witch'));
    assert.ok(first.some(card => card.name === 'Adventurer'));
    assert.ok(!second.some(card => card.name === 'Adventurer'));
    assert.ok(!first.some(card => card.name === 'Artisan'));
    assert.equal(ownedCards(db, ['Base:1', 'Base:2']).length, 32);
    assert.equal(ownedCards(db, ['Seaside:2']).length, 27);
    assert.equal(ownedCards(db, ['Cornucopia:1']).length, 13);
    assert.equal(ownedCards(db, ['Guilds:1']).length, 13);
    assert.equal(ownedCards(db, ['Cornucopia:1', 'Guilds:1', 'Cornucopia & Guilds:1']).length, 26);
    assert.deepEqual(ownedCards(db, ['Promo:black-market']).map(card => card.name), ['Black Market']);
});

test('1000 draws have ten unique owned kingdom piles in cost/name order', () => {
    for (let i = 0; i < 1000; i++) {
        const kingdom = drawKingdom(pool);
        assert.equal(kingdom.length, 10);
        assert.equal(new Set(kingdom.map(card => card.id)).size, 10);
        assert.ok(kingdom.every(card => card.purpose === 'Kingdom Pile'));
        assert.deepEqual(kingdom, [...kingdom].sort(compareCards));
    }
    assert.throws(() => drawKingdom(pool.slice(0, 9)), /at least 10/);
});

test('replacement excludes every selected pile and setup extra, even the outgoing card', () => {
    const kingdom = drawKingdom(pool);
    const extra = pool.find(card => !kingdom.includes(card));
    const candidates = replacementCandidates(pool, kingdom, [extra]);
    assert.equal(candidates.length, pool.length - 11);
    assert.ok(!candidates.includes(extra));
    assert.ok(candidates.every(card => !kingdom.includes(card)));
});

test('display cost preserves coins, Potion, Debt and variable markers', () => {
    assert.equal(costLabel(byName('Witch')), '$5');
    assert.match(costLabel(byName('Alchemist')), /\$3 \+ 1 Potion/);
    assert.equal(costLabel(byName('Engineer')), '4 Debt');
    assert.ok(compareCards(byName('Chapel'), byName('Moat')) < 0);
});

test('Bane, Ferryman and Riverboat use distinct owned extras, recursively', () => {
    const result = setupFor(['Young Witch', 'Ferryman', 'Riverboat']);
    assert.equal(result.warnings.length, 0);
    const bane = result.extras.find(item => item.label.startsWith('Bane')).card;
    assert.ok([2, 3].includes(bane.cost.coins));
    assert.equal(bane.cost.potion, false);
    const ferry = result.extras.find(item => item.label.startsWith('Ferryman')).card;
    assert.ok([3, 4].includes(ferry.cost.coins));
    const river = result.extras.find(item => item.label.startsWith('Riverboat')).card;
    assert.equal(river.cost.coins, 5);
    assert.ok(river.types.includes('Action') && !river.types.includes('Duration'));
    assert.equal(new Set(result.extras.map(item => item.card.id)).size, result.extras.length);
});

test('impossible extra selection warns without drawing unowned cards', () => {
    const kingdom = kingdomWith(['Young Witch']);
    const result = resolveSetup(db, kingdom, kingdom, options);
    assert.ok(result.warnings.some(text => text.includes('Bane')));
    assert.equal(result.extras.length, 0);
});

test('mixed-pile members contribute dependencies', () => {
    const result = setupFor(['Wizards', 'Gladiator/Fortune']);
    assert.ok(result.landscapes.some(card => card.types.includes('Ally')));
    assert.ok(result.materials.some(item => item.name === 'Debt tokens'));
    assert.ok(result.materials.some(item => item.name === 'Favors mat'));
});

test('Horses, Heirlooms, Loot, Ruins and traveller chains are collected', () => {
    const result = setupFor(['Cavalry', 'Pooka', 'Cemetery', 'Marauder', 'Page', 'Peasant', 'Jewelled Egg']);
    const names = result.companions.map(item => item.name);
    for (const name of ['Horse', 'Cursed Gold', 'Haunted Mirror', 'Ghost', 'Ruins', 'Spoils', 'Champion', 'Teacher', 'Loot']) {
        assert.ok(names.includes(name), `Missing ${name}`);
    }
});

test('Druid gets three distinct Boons and Doom gets Hexes and double-sided statuses', () => {
    const result = setupFor(['Druid', 'Tormentor']);
    assert.equal(result.companions.filter(item => item.card?.types.includes('Boon') && item.card.purpose === 'Mixed Pile Card').length, 3);
    for (const name of ['Boons', 'Hexes', 'Deluded', 'Miserable', 'Imp']) {
        assert.ok(result.companions.some(item => item.name === name));
    }
});

test('mats and tokens include all distinct mechanisms', () => {
    const result = setupFor(['Native Village', 'Island', 'Pirate Ship', 'Baker', 'Recruiter', 'Bounty Hunter', 'Relic', 'Bridge Troll', 'Ranger', 'Monument']);
    const names = result.materials.map(item => item.name);
    for (const name of ['Native Village mat', 'Island mat', 'Pirate Ship mat', 'Coffers / Villagers mat', 'Coin tokens', 'Exile mat', '-1 Card token', '-1 Coin token', 'Journey token', 'Victory tokens']) {
        assert.ok(names.includes(name), `Missing ${name}`);
    }
    assert.ok(!names.includes('Coffers mat'));
});

test('Omen adds one Prophecy; Liaison adds one Ally; cache is stable', () => {
    const kingdom = kingdomWith(['Poet', 'Mountain Shrine', 'Bauble', 'Underling']);
    const cache = {};
    const first = resolveSetup(db, kingdom, pool, options, cache);
    const second = resolveSetup(db, kingdom, pool, options, cache);
    assert.equal(first.landscapes.filter(card => card.types.includes('Prophecy')).length, 1);
    assert.equal(first.landscapes.filter(card => card.types.includes('Ally')).length, 1);
    assert.deepEqual(first.landscapes, second.landscapes);
    assert.ok(first.materials.some(item => item.name === 'Sun tokens'));
});

test('Colony and Shelters are optional, auto uses kingdom proportions', () => {
    const kingdom = kingdomWith(['Witch']);
    assert.ok(!setupFor(['Witch']).companions.some(item => item.name === 'Colony'));
    const forced = resolveSetup(db, kingdom, pool, { ...options, colony: 'yes', shelters: 'yes' });
    for (const name of ['Colony', 'Platinum', 'Shelters']) {
        assert.ok(forced.companions.some(item => item.name === name));
    }
    const prosperity = pool.filter(card => card.set === 'Prosperity').slice(0, 10);
    const auto = resolveSetup(db, prosperity, pool, { ...options, colony: 'auto' });
    assert.ok(auto.companions.some(item => item.name === 'Colony'));
});

test('100 randomized full setups resolve without duplicate extra piles or missing cards', () => {
    for (let i = 0; i < 100; i++) {
        const kingdom = drawKingdom(pool);
        const result = resolveSetup(db, kingdom, pool, { ...options, landscapes: 2 });
        assert.equal(result.warnings.length, 0);
        assert.ok(result.companions.every(item => item.card), 'Missing companion record');
        const selected = [...kingdom, ...result.extras.map(item => item.card)];
        assert.equal(new Set(selected.map(card => card.id)).size, selected.length);
    }
});

test('landscape type filters select up to four distinct owned cards and allow zero', () => {
    const ownedSelections = ['Base:2', 'Menagerie:1'];
    const owned = ownedCards(db, ownedSelections);
    const kingdom = kingdomWith(['Village']);
    const filteredOptions = { ...options, selections: ownedSelections, landscapes: 4, landscapeTypes: ['Way'] };
    const result = resolveSetup(db, kingdom, owned, filteredOptions);
    assert.equal(result.landscapes.length, 4);
    assert.equal(new Set(result.landscapes.map(card => card.id)).size, 4);
    assert.ok(result.landscapes.every(card => card.set === 'Menagerie' && card.types.includes('Way')));
    assert.equal(resolveSetup(db, kingdom, owned, { ...filteredOptions, landscapes: 0 }).landscapes.length, 0);
    const none = resolveSetup(db, kingdom, owned, { ...filteredOptions, landscapeTypes: [] });
    assert.equal(none.landscapes.length, 0);
    assert.ok(none.warnings.some(text => text.includes('Only 0 landscape cards')));
});

test('static bundle preserves source scripts and embeds database without external JS', () => {
    execFileSync(process.execPath, ['scripts/build.mjs']);
    const html = readFileSync('dist/index.html', 'utf8');
    const engine = readFileSync('engine.js', 'utf8').replace(/^import .*?;\r?\n/m, '').replaceAll('export ', '');
    assert.ok(html.includes(engine), 'Bundling must not reinterpret dollar replacement patterns');
    assert.ok(html.includes('"schemaVersion": 1'));
    assert.ok(!html.includes('src="app.js"'));
    assert.ok(!html.includes('href="styles.css"'));
    const inline = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(inline);
    execFileSync(process.execPath, ['--input-type=module', '--check'], { input: inline });
});
