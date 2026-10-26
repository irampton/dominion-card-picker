export function requirementDefinitions(db) {
    const commonTypes = ['Action', 'Duration', 'Attack', 'Reaction', 'Victory', 'Treasure'];
    const types = [...new Set(db.cards.filter(card => card.purpose === 'Kingdom Pile').flatMap(card => card.types))].sort((a, b) => {
        const rank = type => commonTypes.includes(type) ? commonTypes.indexOf(type) : commonTypes.length;
        return rank(a) - rank(b) || a.localeCompare(b);
    });
    const keywords = [
        ['action', '+Actions', /\+\d+ Actions?\b/i],
        ['actions', '+2 Actions or more', /\+(?:[2-9]|\d{2,}) Actions?\b/i],
        ['trash', 'Trash keyword', /\btrash(?:es|ed|ing)?\b/i],
        ['draw', 'Card draw', /\+\d+ Cards?\b|\bdraw(?:s|ing)?\b/i],
        ['draw-two', '2+ card draw', /\+(?:[2-9]|\d{2,}) Cards?\b|\bdraw(?:s)? (?:[2-9]|\d{2,}) cards\b/i],
        ['buy', '+Buy', /\+\d+ Buys?\b/i],
        ['coins', '+Coins', /\+\$\d+|^\$\d+/m],
        ['gain', 'Gain keyword', /\bgain(?:s|ed|ing)?\b/i],
        ['discard', 'Discard keyword', /\bdiscard(?:s|ed|ing)?\b/i],
        ['reveal', 'Reveal keyword', /\breveal(?:s|ed|ing)?\b/i],
        ['exile', 'Exile keyword', /\bexil(?:e|es|ed|ing)\b/i],
        ['coffers', 'Coffers', /\bCoffers\b/],
        ['villagers', 'Villagers', /\bVillagers?\b/],
        ['favor', 'Favors', /\bFavors?\b/],
        ['vp', '+Victory tokens', /\+\d+ VP\b/],
        ['horse', 'Horses', /\bHorses?\b/],
        ['loot', 'Loot', /\bLoot\b/],
        ['set-aside', 'Set aside', /\bset(?:s|ting)? aside\b/i],
        ['shuffle', 'Shuffle keyword', /\bshuffl(?:e|es|ed|ing)\b/i],
        ['look', 'Look at keyword', /\blook(?:s|ing)? at\b/i]
    ];
    return [
        ...types.map(type => ({ id: `type-${type.toLowerCase()}`, group: 'Card types', label: `${type} cards`, matches: card => card.types.includes(type) })),
        ...keywords.map(([id, label, pattern]) => ({ id: `keyword-${id}`, group: 'Card effects & keywords', label: `cards with ${label}`, matches: card => pattern.test(card.text) }))
    ];
}

export function costDefinitions(ranges = []) {
    return [
        ...Array.from({ length: 9 }, (_, i) => ({ id: `cost-${i + 1}`, low: i + 1, high: i + 1 })),
        ...ranges.filter(range => range.active).map(range => ({ id: `cost-range-${range.id}`, low: range.low, high: range.high }))
    ].map(rule => ({ ...rule, group: 'Cost Spread', matches: card => card.cost.coins >= rule.low && card.cost.coins <= rule.high }));
}

export function meetsRequirements(cards, requirements, definitions, upperBounds = {}, conditions = []) {
    return definitions.every(definition => {
        const count = cards.filter(definition.matches).length;
        return count >= (requirements[definition.id] || 0) && count <= (upperBounds[definition.id] ?? cards.length);
    }) && conditions.every(condition => {
        const trigger = definitions.find(definition => definition.id === condition.when);
        const response = definitions.find(definition => definition.id === condition.require);
        return !cards.some(trigger.matches) || cards.some(response.matches);
    });
}

// Exact covering search over groups of equivalent cards. A multi-type pile can
// cover several deficits at once, but occupies only one of the ten slots.
export function requiredKingdom(pool, requirements, definitions, size = 10, fixed = [], upperBounds = {}, conditions = []) {
    if (conditions.length) {
        const [condition, ...rest] = conditions;
        const trigger = definitions.find(definition => definition.id === condition.when);
        const response = definitions.find(definition => definition.id === condition.require);
        const initial = requiredKingdom(pool, requirements, definitions, size, fixed, upperBounds, rest);
        if (!initial || !initial.some(trigger.matches) || initial.some(response.matches)) {
            return initial;
        }
        return requiredKingdom(pool, { ...requirements, [condition.require]: Math.max(1, requirements[condition.require] || 0) }, definitions, size, fixed, upperBounds, rest)
            || requiredKingdom(pool, requirements, definitions, size, fixed, { ...upperBounds, [condition.when]: 0 }, rest);
    }
    if (Object.keys(upperBounds).length) {
        const expandedDefinitions = [...definitions];
        const expandedRequirements = { ...requirements };
        for (const definition of definitions) {
            const upper = upperBounds[definition.id] ?? size;
            if (upper < 0) {
                return null;
            }
            if (upper < size) {
                const id = `upper:${definition.id}`;
                expandedDefinitions.push({ id, matches: card => !definition.matches(card) });
                expandedRequirements[id] = size - upper;
            }
        }
        return requiredKingdom(pool, expandedRequirements, expandedDefinitions, size, fixed);
    }
    if (fixed.length) {
        const ids = new Set(fixed.map(card => card.id));
        if (fixed.length > size || ids.size !== fixed.length || fixed.some(card => !pool.some(item => item.id === card.id))) {
            return null;
        }
        const remaining = Object.fromEntries(definitions.map(definition => [definition.id, Math.max(0, (requirements[definition.id] || 0) - fixed.filter(definition.matches).length)]));
        const result = requiredKingdom(pool.filter(card => !ids.has(card.id)), remaining, definitions, size - fixed.length);
        return result ? [...fixed, ...result] : null;
    }
    if (pool.length < size) {
        return null;
    }
    const active = definitions.filter(definition => requirements[definition.id] > 0);
    if (!active.length) {
        return pool.slice(0, size);
    }
    const groupsByKey = new Map();
    for (const card of pool) {
        const mask = active.map(definition => definition.matches(card) ? 1 : 0);
        const key = mask.join('');
        if (!groupsByKey.has(key)) {
            groupsByKey.set(key, { mask, cards: [] });
        }
        groupsByKey.get(key).cards.push(card);
    }
    const groups = [...groupsByKey.values()];
    const failed = new Set();
    function search(counts, needs, slots) {
        if (needs.every(need => need === 0)) {
            return [];
        }
        if (!slots) {
            return null;
        }
        // If every remaining slot must satisfy a minimum, discard groups
        // lacking it immediately instead of exploring doomed combinations.
        counts = counts.map((count, index) => needs.some((need, i) => need === slots && !groups[index].mask[i]) ? 0 : count);
        if (counts.reduce((sum, count) => sum + count, 0) < Math.max(...needs)) {
            return null;
        }
        const key = `${slots}|${needs}|${counts}`;
        if (failed.has(key)) {
            return null;
        }
        let pivot = -1;
        let tightness = Infinity;
        for (let i = 0; i < needs.length; i++) {
            if (!needs[i]) {
                continue;
            }
            const available = groups.reduce((sum, group, j) => sum + group.mask[i] * counts[j], 0);
            if (needs[i] > Math.min(slots, available)) {
                failed.add(key);
                return null;
            }
            if (available / needs[i] < tightness) {
                tightness = available / needs[i];
                pivot = i;
            }
        }
        const candidates = groups.map((group, index) => ({ group, index })).filter(({ group, index }) => counts[index] && group.mask[pivot]);
        candidates.sort((a, b) => b.group.mask.reduce((sum, bit, i) => sum + (needs[i] ? bit : 0), 0) - a.group.mask.reduce((sum, bit, i) => sum + (needs[i] ? bit : 0), 0));
        const remaining = [...counts];
        for (const { group, index } of candidates) {
            remaining[index]--;
            const result = search([...remaining], needs.map((need, i) => Math.max(0, need - group.mask[i])), slots - 1);
            if (result) {
                return [index, ...result];
            }
            // Subsequent branches omit this group entirely. All solutions using
            // it were explored above, including taking more than one of it.
            remaining[index] = 0;
        }
        failed.add(key);
        return null;
    }
    const chosen = search(groups.map(group => group.cards.length), active.map(definition => requirements[definition.id]), size);
    if (!chosen) {
        return null;
    }
    const offsets = groups.map(() => 0);
    const result = chosen.map(index => groups[index].cards[offsets[index]++]);
    const used = new Set(result.map(card => card.id));
    return [...result, ...pool.filter(card => !used.has(card.id)).slice(0, size - result.length)];
}

export function requirementMaximum(pool, requirements, definitions, id, fixed = [], upperBounds = {}, conditions = []) {
    const definition = definitions.find(item => item.id === id);
    const upper = Math.min(10, pool.filter(definition.matches).length);
    for (let value = upper; value > 0; value--) {
        if (requiredKingdom(pool, { ...requirements, [id]: value }, definitions, 10, fixed, upperBounds, conditions)) {
            return value;
        }
    }
    return 0;
}

export function requirementCountLimits(pool, requirements, definitions, id, fixed = [], upperBounds = {}, conditions = []) {
    const lower = { ...requirements, [id]: 0 };
    const upper = { ...upperBounds };
    delete upper[id];
    const max = requirementMaximum(pool, lower, definitions, id, fixed, upper, conditions);
    for (let min = 0; min <= max; min++) {
        if (requiredKingdom(pool, lower, definitions, 10, fixed, { ...upper, [id]: min }, conditions)) {
            return { min, max };
        }
    }
    return { min: 0, max: 0 };
}
