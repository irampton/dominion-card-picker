import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtInPresets, presetConstraints, presetState } from '../presets.js';
import { requirementDefinitions, meetsRequirements, requiredKingdom } from '../requirements.js';
import { drawKingdom, ownedCards } from '../engine.js';

const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
const definitions = requirementDefinitions(db);
const pool = ownedCards(db, ['Base:2']);

test('presets capture only requirements and active cost rules, with independent copies', () => {
    const source = {
        requirements: { 'type-action': 5 },
        costExact: { 'cost-4': { min: 3, max: 5 } },
        costRanges: [{ id: 7, low: 2, high: 3, min: 2, max: 4, active: true }, { id: 8, low: 2, high: 6, min: 0, max: 10, active: false }],
        selections: ['Base:2'], options: { landscapes: 4 }, lockedIds: ['village'], kingdom: ['chapel']
    };
    const saved = presetState(source);
    assert.deepEqual(Object.keys(saved), ['requirements', 'requirementCaps', 'costExact', 'costRanges', 'attackOptions']);
    assert.equal(saved.costRanges.length, 1);
    assert.equal(saved.costExact['cost-4'].max, 5);
    saved.requirements['type-action'] = 1;
    saved.costExact['cost-4'].min = 0;
    saved.costRanges[0].low = 1;
    assert.equal(source.requirements['type-action'], 5);
    assert.equal(source.costExact['cost-4'].min, 3);
    assert.equal(source.costRanges[0].low, 2);
});

test('Balanced Game has the requested minimums, and Completely Random has none', () => {
    const balanced = builtInPresets.find(preset => preset.id === 'balanced').state;
    assert.deepEqual(balanced.requirements, { 'keyword-actions': 1, 'keyword-trash': 1, 'keyword-draw-two': 1 });
    assert.deepEqual(Object.fromEntries(Object.entries(balanced.costExact).map(([id, rule]) => [id, rule.min])), { 'cost-2': 1, 'cost-3': 1, 'cost-4': 3, 'cost-5': 2 });
    assert.deepEqual(balanced.costRanges[0], { id: 1, low: 2, high: 3, min: 3, max: 10, active: true });
    assert.deepEqual(builtInPresets.find(preset => preset.id === 'random').state, { requirements: {}, requirementCaps: {}, costExact: {}, costRanges: [], attackOptions: { allowAttacks: true, requireResponse: false, blockResponse: false } });
});

test('type and keyword maximums persist in presets and constrain generated kingdoms', () => {
    const state = presetState({ requirements: { 'keyword-trash': 1 }, requirementCaps: { 'type-attack': 0, 'keyword-trash': 2, selections: 3 } });
    assert.deepEqual(state.requirementCaps, { 'type-attack': 0, 'keyword-trash': 2 });
    const { lower, upper, allDefinitions } = presetConstraints(state, definitions);
    for (let i = 0; i < 100; i++) {
        const cards = drawKingdom(pool, Math.random, lower, allDefinitions, [], upper);
        assert.ok(meetsRequirements(cards, lower, allDefinitions, upper));
        assert.equal(cards.filter(card => card.types.includes('Attack')).length, 0);
        const trashCount = cards.filter(definitions.find(item => item.id === 'keyword-trash').matches).length;
        assert.ok(trashCount >= 1 && trashCount <= 2);
    }
    assert.deepEqual(presetState({ requirements: { 'type-action': 3 }, requirementCaps: { 'type-action': 1 } }).requirementCaps, { 'type-action': 3 });
});

test('all five included presets are feasible with Dominion second edition and generate matching kingdoms', () => {
    assert.equal(builtInPresets.length, 5);
    const originals = JSON.stringify(builtInPresets);
    for (const preset of builtInPresets) {
        const { lower, upper, allDefinitions } = presetConstraints(preset.state, definitions);
        assert.ok(requiredKingdom(pool, lower, allDefinitions, 10, [], upper), preset.name);
        for (let i = 0; i < 10; i++) {
            const cards = drawKingdom(pool, Math.random, lower, allDefinitions, [], upper);
            assert.ok(meetsRequirements(cards, lower, allDefinitions, upper), preset.name);
        }
    }
    assert.equal(JSON.stringify(builtInPresets), originals);
});
