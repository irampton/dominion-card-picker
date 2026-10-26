import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { costDefinitions, requirementCountLimits, requirementDefinitions, requirementMaximum, requiredKingdom, meetsRequirements } from '../requirements.js';
import { drawKingdom, ownedCards, replacementCandidates } from '../engine.js';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const definitions = requirementDefinitions(db);
const base = ownedCards(db, ['Base:2']);
const all = db.cards.filter(card => card.purpose === 'Kingdom Pile');

test('all selectable types have sliders and common effects match rules text', () => {
    for (const card of all) {
        for (const type of card.types) {
            assert.ok(definitions.some(definition => definition.id === `type-${type.toLowerCase()}`));
        }
    }
    const matches = (id, name) => definitions.find(definition => definition.id === id).matches(all.find(card => card.name === name));
    assert.ok(matches('keyword-actions', 'Village'));
    assert.ok(!matches('keyword-actions', 'Market'));
    assert.ok(matches('keyword-trash', 'Chapel'));
    assert.ok(matches('keyword-draw', 'Smithy'));
    assert.ok(matches('keyword-buy', 'Market'));
    assert.ok(matches('keyword-draw-two', 'Smithy'));
    assert.ok(matches('keyword-draw-two', 'Moat'));
    assert.ok(matches('keyword-draw-two', 'Laboratory'));
    assert.ok(!matches('keyword-draw-two', 'Village'));
    assert.ok(!matches('keyword-draw-two', 'Market'));
});

test('maxima use owned supply and account for overlapping Action / Victory piles', () => {
    assert.equal(requirementMaximum(base, {}, definitions, 'type-duration'), 0);
    assert.equal(requirementMaximum(base, {}, definitions, 'type-victory'), 1);
    assert.equal(requirementMaximum(base, { 'type-action': 10 }, definitions, 'type-victory'), 0);
    const intrigue = ownedCards(db, ['Intrigue:2']);
    const requirements = { 'type-action': 10, 'type-victory': 2 };
    assert.ok(requiredKingdom(intrigue, requirements, definitions));
    assert.equal(requirementMaximum(intrigue, { 'type-action': 10 }, definitions, 'type-victory'), 2);
});

test('generation satisfies type and keyword minimums simultaneously without duplicates', () => {
    const requirements = { 'type-action': 8, 'type-attack': 2, 'type-reaction': 1, 'type-duration': 2, 'keyword-actions': 2, 'keyword-trash': 2, 'keyword-draw': 4, 'type-treasure': 1 };
    for (let i = 0; i < 60; i++) {
        const kingdom = drawKingdom(all, Math.random, requirements, definitions);
        assert.equal(kingdom.length, 10);
        assert.equal(new Set(kingdom.map(card => card.id)).size, 10);
        assert.ok(meetsRequirements(kingdom, requirements, definitions));
    }
    assert.throws(() => drawKingdom(base, Math.random, { 'type-victory': 2 }, definitions), /cannot fill/);
});

test('replacements preserve minimums while allowing cards that cover several requirements', () => {
    const requirements = { 'keyword-actions': 2, 'type-action': 10 };
    const kingdom = drawKingdom(base, Math.random, requirements, definitions);
    for (const outgoing of kingdom) {
        for (const replacement of replacementCandidates(base, kingdom, [], requirements, definitions, outgoing.id)) {
            assert.ok(meetsRequirements([...kingdom.filter(card => card.id !== outgoing.id), replacement], requirements, definitions));
        }
    }
});

test('exact solver agrees with exhaustive enumeration on small overlapping collections', () => {
    let seed = 42;
    const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const defs = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, matches: card => card.bits[i] }));
    for (let trial = 0; trial < 250; trial++) {
        const cards = Array.from({ length: 8 }, (_, i) => ({ id: String(i), bits: defs.map(() => random() > .5) }));
        const requirements = Object.fromEntries(defs.map(definition => [definition.id, Math.floor(random() * 5)]));
        let possible = false;
        for (let mask = 0; mask < 256; mask++) {
            const selected = cards.filter((card, i) => mask & (1 << i));
            if (selected.length === 4 && meetsRequirements(selected, requirements, defs)) {
                possible = true;
                break;
            }
        }
        const result = requiredKingdom(cards, requirements, defs, 4);
        assert.equal(Boolean(result), possible, `Trial ${trial}`);
        if (result) {
            assert.equal(new Set(result.map(card => card.id)).size, 4);
            assert.ok(meetsRequirements(result, requirements, defs));
        }
    }
});

test('locked manual cards survive repeated constrained generation', () => {
    const locked = base.filter(card => ['Village', 'Chapel'].includes(card.name));
    const requirements = { 'type-action': 10, 'keyword-actions': 2, 'keyword-trash': 1 };
    const signatures = new Set();
    for (let i = 0; i < 30; i++) {
        const result = drawKingdom(base, Math.random, requirements, definitions, locked);
        assert.ok(locked.every(card => result.some(item => item.id === card.id)));
        assert.equal(new Set(result.map(card => card.id)).size, 10);
        assert.ok(meetsRequirements(result, requirements, definitions));
        signatures.add(result.map(card => card.id).join(','));
    }
    assert.ok(signatures.size > 1);
    const gardens = base.find(card => card.name === 'Gardens');
    assert.equal(requirementMaximum(base, {}, definitions, 'type-action', [gardens]), 9);
    assert.equal(requiredKingdom(base, { 'type-action': 10 }, definitions, 10, [gardens]), null);
    assert.equal(requiredKingdom(base, {}, definitions, 10, [locked[0], locked[0]]), null);
    assert.equal(requiredKingdom(base, {}, definitions, 10, [all.find(card => card.name === 'Wharf')]), null);
});

test('cost bounds and overlapping bands hold alongside types and locked cards', () => {
    const ranges = [{ id: 1, low: 2, high: 4, active: true }, { id: 2, low: 4, high: 6, active: true }];
    const defs = [...definitions, ...costDefinitions(ranges)];
    const lower = { 'type-action': 8, 'keyword-trash': 1, 'cost-2': 1, 'cost-5': 2, 'cost-range-1': 4, 'cost-range-2': 6 };
    const upper = { 'cost-2': 2, 'cost-3': 2, 'cost-5': 4, 'cost-range-1': 6, 'cost-range-2': 8 };
    const locks = base.filter(card => card.name === 'Chapel');
    for (let i = 0; i < 60; i++) {
        const kingdom = drawKingdom(base, Math.random, lower, defs, locks, upper);
        assert.equal(kingdom.length, 10);
        assert.ok(kingdom.includes(locks[0]));
        assert.ok(meetsRequirements(kingdom, lower, defs, upper));
    }
    assert.equal(requiredKingdom(base, { 'cost-2': 3 }, defs, 10, [], { 'cost-2': 1 }), null);
    assert.equal(requiredKingdom(base, {}, defs, 10, locks, { 'cost-2': 0 }), null);
    const limits = requirementCountLimits(base, {}, defs, 'cost-2', locks);
    assert.deepEqual(limits, { min: 1, max: 3 });
});

test('upper bounds agree with exhaustive enumeration, including fixed cards', () => {
    const defs = [{ id: 'a', matches: card => card.a }, { id: 'b', matches: card => card.b }];
    const cards = Array.from({ length: 8 }, (_, id) => ({ id, a: id % 2 === 0, b: id < 4 }));
    for (let a = 0; a <= 4; a++) {
        for (let b = 0; b <= 4; b++) {
            for (let cap = 0; cap <= 4; cap++) {
                const lower = { a, b };
                const upper = { a: cap, b: 3 };
                const locked = [cards[0]];
                let possible = false;
                for (let mask = 0; mask < 256; mask++) {
                    const selected = cards.filter((card, i) => mask & (1 << i));
                    if (selected.length === 4 && selected.includes(cards[0]) && meetsRequirements(selected, lower, defs, upper)) {
                        possible = true;
                        break;
                    }
                }
                const result = requiredKingdom(cards, lower, defs, 4, locked, upper);
                assert.equal(Boolean(result), possible);
                if (result) {
                    assert.equal(result.length, 4);
                    assert.ok(meetsRequirements(result, lower, defs, upper));
                }
            }
        }
    }
});
