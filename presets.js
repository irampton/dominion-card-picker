import { costDefinitions } from './requirements.js';
import { normalizeAttackOptions } from './attacks.js';

export function presetState(source = {}) {
    const count = value => Math.max(0, Math.min(10, Math.floor(Number(value) || 0)));
    const pair = rule => {
        const min = count(rule?.min);
        return { min, max: Math.max(min, count(rule?.max ?? 10)) };
    };
    const requirements = Object.fromEntries(Object.entries(source.requirements || {}).filter(([id]) => /^(type|keyword)-[a-z0-9-]+$/.test(id)).map(([id, value]) => [id, count(value)]));
    const requirementCaps = Object.fromEntries(Object.entries(source.requirementCaps || {}).filter(([id]) => /^(type|keyword)-[a-z0-9-]+$/.test(id)).map(([id, value]) => [id, Math.max(requirements[id] || 0, count(value))]));
    const costExact = Object.fromEntries(Object.entries(source.costExact || {}).filter(([id]) => /^cost-[1-9]$/.test(id)).map(([id, rule]) => [id, pair(rule)]));
    const costRanges = (Array.isArray(source.costRanges) ? source.costRanges : []).filter(range => range?.active).map((range, index) => {
        const low = Math.max(1, Math.min(9, Math.floor(Number(range.low) || 1)));
        const high = Math.max(low, Math.min(9, Math.floor(Number(range.high) || 9)));
        return { id: index + 1, low, high, ...pair(range), active: true };
    });
    // Whitelist requirement fields: Sets, landscapes, locks and cards must
    // never enter a requirements preset, even when passed a full app state.
    return { requirements, requirementCaps, costExact, costRanges, attackOptions: normalizeAttackOptions(source.attackOptions) };
}

export const builtInPresets = [
    {
        id: 'random', name: 'Completely Random', description: 'No type, keyword or cost requirements.',
        state: presetState()
    },
    {
        id: 'balanced', name: 'Balanced Game',
        description: '1 +2 Actions, 1 trash, 1 draw 2+; at least 1 $2, 1 $3, 3 $4, 2 $5, and 3 cards costing $2–$3.',
        state: presetState({
            requirements: { 'keyword-actions': 1, 'keyword-trash': 1, 'keyword-draw-two': 1 },
            costExact: { 'cost-2': { min: 1, max: 10 }, 'cost-3': { min: 1, max: 10 }, 'cost-4': { min: 3, max: 10 }, 'cost-5': { min: 2, max: 10 } },
            costRanges: [{ low: 2, high: 3, min: 3, max: 10, active: true }]
        })
    },
    {
        id: 'engine', name: 'Engine Builder',
        description: '8 Actions, 2 +2 Actions, 3 draw 2+, 1 trash, and 1 +Buy.',
        state: presetState({ requirements: { 'type-action': 8, 'keyword-actions': 2, 'keyword-draw-two': 3, 'keyword-trash': 1, 'keyword-buy': 1 } })
    },
    {
        id: 'control', name: 'Deck Control',
        description: '7 Actions, 2 trash, 2 draw 2+, and 2 gain effects.',
        state: presetState({ requirements: { 'type-action': 7, 'keyword-trash': 2, 'keyword-draw-two': 2, 'keyword-gain': 2 } })
    },
    {
        id: 'interaction', name: 'Attack & Defend',
        description: '2 Attacks, 1 Reaction, and 2 draw 2+.',
        state: presetState({ requirements: { 'type-attack': 2, 'type-reaction': 1, 'keyword-draw-two': 2 } })
    }
];

export function presetConstraints(source, definitions, attackRules = null) {
    const state = presetState(source);
    const allDefinitions = [...definitions, ...costDefinitions(state.costRanges), ...(attackRules?.definitions || [])];
    const lower = { ...state.requirements };
    const upper = { ...state.requirementCaps, ...attackRules?.upper };
    for (const definition of allDefinitions.filter(item => item.group === 'Cost Spread')) {
        const rule = state.costExact[definition.id] || state.costRanges.find(range => `cost-range-${range.id}` === definition.id);
        if (rule) {
            lower[definition.id] = rule.min;
            upper[definition.id] = rule.max;
        }
    }
    return { allDefinitions, lower, upper, conditions: attackRules?.conditions || [] };
}
