export function normalizeAttackOptions(value = {}) {
    const allowAttacks = value.allowAttacks !== false;
    const requireResponse = allowAttacks && value.requireResponse === true;
    return { allowAttacks, requireResponse, blockResponse: requireResponse && value.blockResponse === true };
}

export function buildAttackProfiles(db) {
    const byName = new Map(db.cards.map(card => [card.name, card]));
    const blocksAttack = card => /Attack\b[\s\S]*(?:unaffected|doesn't affect you)/i.test(card.text);
    const responds = card => blocksAttack(card) || (card.types.includes('Reaction') && /When (?:another player plays an Attack|you (?:gain|discard)|one of your cards is trashed|something causes you to reveal|any player gains|anyone gains)/i.test(card.text));
    const profiles = new Map();
    for (const root of db.cards) {
        const seen = new Set();
        const queue = [root];
        while (queue.length) {
            const card = queue.shift();
            if (seen.has(card.name)) {
                continue;
            }
            seen.add(card.name);
            for (const name of [...card.members, ...card.requires]) {
                if (byName.has(name)) {
                    queue.push(byName.get(name));
                }
            }
            // Loot brings every Loot card into setup, including Shield and
            // Sword. Champion similarly comes with the Page upgrade chain.
            if (card.name === 'Loot') {
                queue.push(...db.cards.filter(item => item.purpose === 'Mixed Pile Card' && item.types.includes('Loot')));
            }
        }
        const accessible = [...seen].map(name => byName.get(name));
        profiles.set(root.id, {
            attack: accessible.some(card => card.types.includes('Attack')),
            responses: accessible.filter(responds).map(card => card.name),
            blockers: accessible.filter(blocksAttack).map(card => card.name)
        });
    }
    return profiles;
}

export function attackRuleSet(profiles, value = {}) {
    const options = normalizeAttackOptions(value);
    return {
        definitions: [
            { id: 'policy-attacks', matches: card => profiles.get(card.id)?.attack === true },
            { id: 'policy-response', matches: card => (profiles.get(card.id)?.[options.blockResponse ? 'blockers' : 'responses'].length || 0) > 0 }
        ],
        upper: options.allowAttacks ? {} : { 'policy-attacks': 0 },
        conditions: options.requireResponse ? [{ when: 'policy-attacks', require: 'policy-response' }] : []
    };
}
