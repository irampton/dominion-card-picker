import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { requiredKingdom, requirementCountLimits } from '../requirements.js';

const source = readFileSync('app.js', 'utf8');
const helpers = source.slice(source.indexOf('function normalizeSetSpread('), source.indexOf('function renderRequirements('));
function fixture(rules, lower = {}, upper = {}, fixed = []) {
    const available = ['A', 'B', 'C'].flatMap(set => Array.from({ length: 10 }, (_, i) => ({ id: `${set}${i}`, set })));
    const context = vm.createContext({ available, setSpread: rules, requirementCountLimits, eligibleLocks: () => fixed });
    vm.runInContext(`function constraintState() {
        return {
            allDefinitions: setSpread.map(rule => ({ id: 'set:' + rule.set, matches: card => card.set === rule.set })),
            lower: { ...${JSON.stringify(lower)}, ...Object.fromEntries(setSpread.map(rule => ['set:' + rule.set, rule.min])) },
            upper: { ...${JSON.stringify(upper)}, ...Object.fromEntries(setSpread.map(rule => ['set:' + rule.set, rule.max])) },
            conditions: []
        };
    }`, context);
    vm.runInContext(helpers, context);
    return { context, available };
}

test('set spread reconciles conflicting counts and removes duplicate or deselected sets', () => {
    const { context, available } = fixture([{ set: 'A', min: 7, max: 7 }, { set: 'B', min: 8, max: 8 }, { set: 'A', min: 1, max: 1 }, { set: 'missing', min: 1, max: 2 }]);
    vm.runInContext('normalizeSetSpread(available)', context);
    assert.equal(context.setSpread.length, 2);
    assert.equal(context.setSpread[1].min, 3);
    const state = vm.runInContext('constraintState()', context);
    assert.ok(requiredKingdom(available, state.lower, state.allDefinitions, 10, [], state.upper));
});

test('set spread respects locked cards and clears with one selected set', () => {
    const fixed = [{ id: 'B0', set: 'B' }, { id: 'B1', set: 'B' }];
    const { context } = fixture([{ set: 'A', min: 10, max: 10 }], {}, {}, fixed);
    vm.runInContext('normalizeSetSpread(available)', context);
    assert.equal(context.setSpread[0].min, 8);
    vm.runInContext("available = available.filter(card => card.set === 'A'); normalizeSetSpread(available)", context);
    assert.equal(context.setSpread.length, 0);
});
