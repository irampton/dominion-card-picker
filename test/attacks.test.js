import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAttackProfiles, attackRuleSet } from '../attacks.js';
import { requirementDefinitions, meetsRequirements, requiredKingdom, requirementMaximum } from '../requirements.js';
import { drawKingdom, ownedCards, resolveSetup } from '../engine.js';
import { presetState } from '../presets.js';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const profiles = buildAttackProfiles(db);
const byName = name => db.cards.find(card => card.name === name);
const base = ownedCards(db, ['Base:2']);
const all = db.cards.filter(card => card.purpose === 'Kingdom Pile');
const definitions = requirementDefinitions(db);

test('attack classification includes listed responses and additional effect reactions', () => {
    const names = ['Moat', 'Lighthouse', 'Champion', 'Guardian', 'Shield', 'Secret Chamber', 'Diplomat', 'Horse Traders', 'Beggar', 'Caravan Guard', 'Guard Dog', 'Watchtower', 'Trader', 'Tunnel', 'Faithful Hound', 'Village Green', 'Trail', 'Weaver', 'Sheepdog', 'Sleigh', 'Market Square', 'Patron'];
    for (const name of names) {
        assert.ok(profiles.get(byName(name).id).responses.includes(name), name);
    }
    for (const name of ['Moat', 'Lighthouse', 'Champion', 'Guardian', 'Shield']) {
        assert.ok(profiles.get(byName(name).id).blockers.includes(name));
    }
    for (const name of ['Secret Chamber', 'Watchtower', 'Diplomat', 'Tunnel', 'Clerk', "Fool's Gold"]) {
        assert.equal(profiles.get(byName(name).id).blockers.length, 0);
    }
    assert.equal(profiles.get(byName('Clerk').id).responses.length, 0);
    assert.equal(profiles.get(byName("Fool's Gold").id).responses.length, 0);
});

test('support-card access handles Champion, Shield, Sword, and mixed-pile attacks', () => {
    assert.ok(profiles.get(byName('Page').id).blockers.includes('Champion'));
    assert.ok(profiles.get(byName('Page').id).attack, 'Warrior is in Page chain');
    assert.ok(profiles.get(byName('Search').id).blockers.includes('Shield'));
    assert.ok(profiles.get(byName('Search').id).attack, 'Sword is in Loot');
    assert.ok(profiles.get(byName('Clashes').id).attack, 'Archer is in Clashes');
});

test('disallowing attacks excludes them from random kingdoms and optional setup', () => {
    const policy = attackRuleSet(profiles, { allowAttacks: false });
    const defs = [...definitions, ...policy.definitions];
    assert.equal(requirementMaximum(all, {}, defs, 'type-attack', [], policy.upper), 0);
    const safe = all.filter(card => !profiles.get(card.id).attack);
    const selections = db.sets.flatMap(set => set.editions.map(edition => `${set.sourceName}:${edition}`));
    for (let i = 0; i < 50; i++) {
        const kingdom = drawKingdom(all, Math.random, {}, defs, [], policy.upper);
        assert.ok(kingdom.every(card => !profiles.get(card.id).attack));
        const setup = resolveSetup(db, kingdom, safe, { selections, landscapes: 4, allowAttacks: false, attackProfiles: profiles, colony: 'no', shelters: 'no' });
        assert.ok(setup.extras.every(item => !profiles.get(item.card.id).attack));
        assert.ok(setup.landscapes.every(card => !profiles.get(card.id).attack && card.name !== 'Approaching Army'));
    }
});

test('conditional response generation requires counters only if attacks are present', () => {
    for (const blockResponse of [false, true]) {
        const policy = attackRuleSet(profiles, { requireResponse: true, blockResponse });
        const defs = [...definitions, ...policy.definitions];
        for (let i = 0; i < 60; i++) {
            const kingdom = drawKingdom(base, Math.random, { 'type-attack': 2 }, defs, [], policy.upper, policy.conditions);
            assert.ok(kingdom.some(card => card.name === 'Moat'));
            assert.ok(meetsRequirements(kingdom, { 'type-attack': 2 }, defs, policy.upper, policy.conditions));
        }
        const safe = base.filter(card => !profiles.get(card.id).attack && card.name !== 'Moat');
        assert.ok(requiredKingdom(safe, {}, defs, 10, [], {}, policy.conditions));
        assert.equal(requiredKingdom(base.filter(card => card.name !== 'Moat'), { 'type-attack': 1 }, defs, 10, [], {}, policy.conditions), null);
    }
});

test('a general reaction is insufficient for strict blocking, and locks/cost caps are honored', () => {
    const pool = ownedCards(db, ['Prosperity:2']);
    const broad = attackRuleSet(profiles, { requireResponse: true });
    assert.ok(requiredKingdom(pool, { 'type-attack': 1 }, [...definitions, ...broad.definitions], 10, [], {}, broad.conditions));
    const strict = attackRuleSet(profiles, { requireResponse: true, blockResponse: true });
    assert.equal(requiredKingdom(pool, { 'type-attack': 1 }, [...definitions, ...strict.definitions], 10, [], {}, strict.conditions), null);
    const defs = [...definitions, ...strict.definitions];
    const locked = [byName('Witch')];
    const kingdom = drawKingdom(base, Math.random, {}, defs, locked, {}, strict.conditions);
    assert.ok(kingdom.includes(locked[0]) && kingdom.some(card => card.name === 'Moat'));
    const costDefs = [...defs, { id: 'two-coins', matches: card => card.cost.coins === 2 }];
    assert.equal(requiredKingdom(base, {}, costDefs, 10, locked, { 'two-coins': 0 }, strict.conditions), null);
});

test('attack checkboxes are preserved in requirements-only presets', () => {
    const saved = presetState({ attackOptions: { allowAttacks: true, requireResponse: true, blockResponse: true }, selections: ['Base:2'] });
    assert.deepEqual(saved.attackOptions, { allowAttacks: true, requireResponse: true, blockResponse: true });
    assert.ok(!Object.hasOwn(saved, 'selections'));
});

test('conditional solver agrees with enumeration on small overlapping sets', () => {
    const cards = Array.from({ length: 8 }, (_, id) => ({ id, attack: id < 3, response: id === 3, feature: id % 2 === 0 }));
    const defs = [{ id: 'a', matches: card => card.attack }, { id: 'r', matches: card => card.response }, { id: 'f', matches: card => card.feature }];
    const conditions = [{ when: 'a', require: 'r' }];
    for (let requiredAttacks = 0; requiredAttacks < 4; requiredAttacks++) {
        for (let requiredFeature = 0; requiredFeature < 5; requiredFeature++) {
            for (let cap = 0; cap < 5; cap++) {
                const lower = { a: requiredAttacks, f: requiredFeature };
                const upper = { f: cap };
                const feasible = Array.from({ length: 256 }, (_, mask) => cards.filter((card, i) => mask & (1 << i))).some(selected => selected.length === 4 && meetsRequirements(selected, lower, defs, upper, conditions));
                const result = requiredKingdom(cards, lower, defs, 4, [], upper, conditions);
                assert.equal(Boolean(result), feasible);
                if (result) {
                    assert.ok(meetsRequirements(result, lower, defs, upper, conditions));
                }
            }
        }
    }
});
