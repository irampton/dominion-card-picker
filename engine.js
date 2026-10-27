export function compareCards(a, b) {
    return a.cost.coins - b.cost.coins || Number(a.cost.potion) - Number(b.cost.potion) || a.cost.debt - b.cost.debt || a.name.localeCompare(b.name, 'en');
}

export function compareKingdomCards(a, b, mode = 'Cost', setName = card => card.set === 'Base' ? 'Dominion' : card.set) {
    if (mode === 'Set') {
        return setName(a).localeCompare(setName(b), 'en') || a.name.localeCompare(b.name, 'en');
    }
    return mode === 'Name' ? a.name.localeCompare(b.name, 'en') : compareCards(a, b);
}

export function costLabel(card) {
    return [card.cost.coins || (!card.cost.debt && !card.cost.potion) ? `$${card.cost.coins}` : '', card.cost.potion ? '1 Potion' : '', card.cost.debt ? `${card.cost.debt} Debt` : ''].filter(Boolean).join(' + ') + (card.cost.extra || '');
}

export function pileCountNote(card) {
    if (card.name === 'Province') {
        return '8 / 12 / 12 / 15 / 18 for 2 / 3 / 4 / 5 / 6 players.';
    }
    if (card.name === 'Curse' || card.name === 'Ruins') {
        return '10 / 20 / 30 / 40 / 50 for 2 / 3 / 4 / 5 / 6 players.';
    }
    if (card.types.includes('Victory') && ['Basic', 'Kingdom Pile'].includes(card.purpose)) {
        return '8 / 12 for 2 / 3–6 players.';
    }
    if (['Copper', 'Silver', 'Gold'].includes(card.name)) {
        return `${card.name === 'Copper' ? 'All remaining copies after dealing starting decks' : 'All available copies'}.`;
    }
    if (card.name === 'Shelters') {
        return '1 Hovel, 1 Necropolis and 1 Overgrown Estate per player (2–6 of each).';
    }
    if (card.types.includes('Heirloom')) {
        return '1 per player (2–6 copies).';
    }
    return '';
}

export function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function ownedCards(db, selections) {
    return db.cards.filter(card => card.purpose === 'Kingdom Pile' && (
        (card.set === 'Promo' ? selections.includes(`Promo:${card.id}`) || selections.includes('Promo:1') : card.editions.some(edition => selections.includes(`${card.set}:${edition}`)))
        || card.ownership?.some(key => selections.includes(key))
    ));
}

export function drawKingdom(pool, random = Math.random, requirements = {}, definitions = [], fixed = [], upperBounds = {}, conditions = []) {
    if (pool.length < 10) {
        throw new Error(`Select expansions with at least 10 kingdom piles. Your selection has ${pool.length}.`);
    }
    const result = requiredKingdom(shuffle(pool, random), requirements, definitions, 10, fixed, upperBounds, conditions);
    if (!result) {
        throw new Error('Your collection cannot fill a ten-pile kingdom with these requirements. Lower a requirement or add expansions.');
    }
    return result.sort(compareCards);
}

export function replacementCandidates(pool, kingdom, extras = [], requirements = {}, definitions = [], replacingId = null) {
    const used = new Set([...kingdom, ...extras].map(card => card.id));
    return pool.filter(card => !used.has(card.id) && (!replacingId || meetsRequirements([...kingdom.filter(item => item.id !== replacingId), card], requirements, definitions))).sort(compareCards);
}

// Setup choices are cached per kingdom, so a swap does not reroll unrelated extras.
export function landscapeReplacementCandidates(db, kingdom, pool, options, cache, current) {
    if (!current) {
        return [];
    }
    const key = Object.keys(cache).find(key => /^(landscape-\d+|ally|prophecy)$/.test(key) && cache[key] === current.id);
    if (!key) {
        return [];
    }
    const existing = resolveSetup(db, kingdom, pool, options, { ...cache }).landscapes;
    return db.cards.filter(card => card.purpose === 'Landscape' && !existing.some(item => item.id === card.id) && (
        key === 'ally' ? card.types.includes('Ally') : key === 'prophecy' ? card.types.includes('Prophecy') :
            !card.types.includes('Prophecy') && card.types.some(type => options.landscapeTypes?.includes(type)) && card.editions.some(edition => options.selections?.includes(`${card.set}:${edition}`))
    )).filter(card => resolveSetup(db, kingdom, pool, options, { ...cache, [key]: card.id }).landscapes.some(item => item.id === card.id)).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function resolveSetup(db, kingdom, pool, options = {}, cache = {}, random = Math.random) {
    const byName = new Map(db.cards.map(card => [card.name, card]));
    const used = new Set(kingdom.map(card => card.id));
    const all = new Map();
    const extras = [];
    const landscapes = [];
    const notes = [];
    const warnings = [];
    const materials = new Map();
    const companions = new Map();
    const visited = new Set();
    const queue = [...kingdom];
    const responseKey = options.blockAttackResponse ? 'blockers' : 'responses';
    const canUse = card => {
        if (options.prophecy === 'exclude' && (card.types.includes('Omen') || card.types.includes('Prophecy'))) {
            return false;
        }
        const profile = options.attackProfiles?.get(card.id);
        const attack = profile?.attack || card.types.includes('Attack') || card.name === 'Approaching Army';
        if (!attack) {
            return true;
        }
        if (options.allowAttacks === false) {
            return false;
        }
        return !options.requireAttackResponse || profile?.[responseKey].length > 0 || [...kingdom, ...landscapes, ...extras.map(item => item.card)].some(item => options.attackProfiles?.get(item.id)?.[responseKey].length);
    };
    const choose = (key, candidates) => {
        const previous = candidates.find(card => card.id === cache[key]);
        const chosen = previous || shuffle(candidates, random)[0];
        if (chosen) {
            cache[key] = chosen.id;
        }
        return chosen;
    };
    const addMaterial = (name, reason) => {
        if (!materials.has(name)) {
            materials.set(name, new Set());
        }
        materials.get(name).add(reason);
    };
    const addCompanion = (name, reason) => {
        if (!companions.has(name)) {
            companions.set(name, { card: byName.get(name), name, reasons: new Set() });
        }
        companions.get(name).reasons.add(reason);
        if (byName.has(name)) {
            queue.push(byName.get(name));
        }
    };
    const addLandscape = (type, key) => {
        const card = choose(key, db.cards.filter(item => item.types.includes(type) && item.purpose === 'Landscape' && canUse(item)));
        if (card) {
            landscapes.push(card);
            queue.push(card);
        }
    };
    if (options.landscapes) {
        const selectedSets = new Set(pool.map(card => card.set));
        const allowedTypes = options.landscapeTypes || ['Event', 'Landmark', 'Project', 'Way', 'Trait'];
        const candidates = db.cards.filter(card => card.purpose === 'Landscape' && !card.types.includes('Prophecy') && selectedSets.has(card.set) && card.types.some(type => allowedTypes.includes(type)) && card.editions.some(edition => options.selections?.includes(`${card.set}:${edition}`)) && canUse(card));
        const count = Math.min(4, Math.max(0, options.landscapes));
        if (candidates.length < count) {
            warnings.push(`Only ${candidates.length} landscape cards are available for the selected types and expansions (requested ${count}).`);
        }
        for (let i = 0; i < Math.min(count, candidates.length); i++) {
            const card = choose(`landscape-${i}`, candidates.filter(item => !landscapes.includes(item)));
            landscapes.push(card);
            queue.push(card);
        }
    }
    if (options.prophecy === 'require') {
        addLandscape('Prophecy', 'prophecy');
        notes.push({ name: 'Prophecy', text: 'Place Sun tokens on the Prophecy: 5 / 8 / 10 / 12 / 13 for 2 / 3 / 4 / 5 / 6 players.' });
    }
    const plainCost = (card, values) => !card.cost.potion && !card.cost.debt && values.includes(card.cost.coins);
    const rules = {
        'Young Witch': { label: 'Bane pile (in Supply)', test: card => plainCost(card, [2, 3]) },
        Ferryman: { label: 'Ferryman pile (outside Supply)', test: card => plainCost(card, [3, 4]) },
        Riverboat: { label: 'Riverboat set-aside card', test: card => plainCost(card, [5]) && card.types.includes('Action') && !card.types.includes('Duration') },
        'Way of the Mouse': { label: 'Mouse set-aside card', test: card => plainCost(card, [2, 3]) && card.types.includes('Action') && !card.types.includes('Duration') },
        'Approaching Army': { label: 'Approaching Army pile (in Supply)', test: card => card.types.includes('Attack') }
    };
    const process = () => {
        while (queue.length) {
            const card = queue.shift();
            if (visited.has(card.id)) {
                continue;
            }
            visited.add(card.id);
            all.set(card.id, card);
            card.materials.forEach(name => addMaterial(name, card.name));
            card.requires.forEach(name => addCompanion(name, card.name));
            card.members.forEach(name => {
                if (byName.has(name)) {
                    queue.push(byName.get(name));
                }
            });
            if (card.setup && card.name !== 'Shelters') {
                notes.push({ name: card.name, text: card.name === 'Ruins' ? 'Shuffle the Ruins pile and keep only its top card face up.' : card.setup });
            }
            if (card.cost.potion) {
                addCompanion('Potion', card.name);
            }
            if (card.types.includes('Liaison') && !landscapes.some(item => item.types.includes('Ally'))) {
                addLandscape('Ally', 'ally');
                notes.push({ name: 'Favors', text: 'Each player starts with 1 Favor (Importer adds 4 more if present).' });
            }
            if (options.prophecy !== 'exclude' && card.types.includes('Omen') && !landscapes.some(item => item.types.includes('Prophecy'))) {
                addLandscape('Prophecy', 'prophecy');
                notes.push({ name: 'Prophecy', text: 'Place Sun tokens on the Prophecy: 5 / 8 / 10 / 12 / 13 for 2 / 3 / 4 / 5 / 6 players.' });
            }
            const rule = rules[card.name];
            if (rule) {
                const extra = choose(`extra-${card.id}`, pool.filter(item => !used.has(item.id) && rule.test(item) && canUse(item)));
                if (extra) {
                    used.add(extra.id);
                    extras.push({ card: extra, label: rule.label });
                    queue.push(extra);
                } else {
                    warnings.push(`${card.name}: no eligible unused card in your collection for ${rule.label}. Change the kingdom or select more owned sets.`);
                }
            }
            if (card.name === 'Black Market') {
                const deck = [];
                for (let i = 0; i < 15; i++) {
                    const extra = choose(`black-market-${i}`, pool.filter(item => !used.has(item.id) && canUse(item)));
                    if (!extra) {
                        break;
                    }
                    used.add(extra.id);
                    deck.push(extra);
                    extras.push({ card: extra, label: 'Black Market deck — one card' });
                    queue.push(extra);
                }
                notes.push({ name: 'Black Market', text: `Shuffle ${deck.length} different unused kingdom cards into the Black Market deck. For mixed piles, use one member, not the randomizer. Requirements below cover all possible members.` });
            }
        }
    };
    process();
    if (all.has('druid')) {
        const boons = db.cards.filter(card => card.types.includes('Boon') && card.purpose === 'Mixed Pile Card');
        const chosen = [];
        for (let i = 0; i < 3; i++) {
            const boon = choose(`druid-${i}`, boons.filter(card => !chosen.includes(card)));
            if (boon) {
                chosen.push(boon);
                addCompanion(boon.name, 'Druid — set aside face up');
            }
        }
        process();
    }
    // Boons and Hexes have secondary dependencies even when not individually dealt.
    if (companions.has('Boons')) {
        ["Will-o'-Wisp"].forEach(name => addCompanion(name, 'Boons'));
    }
    if (companions.has('Hexes')) {
        ['Deluded', 'Miserable'].forEach(name => addCompanion(name, 'Hexes (flip for Envious / Twice Miserable)'));
    }
    process();
    const addOptional = (key, set, names, explanation) => {
        const mode = options[key] || 'auto';
        if (mode === 'yes' || (mode === 'auto' && choose(`optional-${key}`, kingdom)?.set === set)) {
            names.forEach(name => addCompanion(name, explanation));
            if (key !== 'shelters') {
                notes.push({ name: names.join(' / '), text: explanation });
            }
        }
    };
    addOptional('colony', 'Prosperity', ['Platinum', 'Colony'], 'Use Platinum and Colony piles in addition to the normal basic Supply.');
    addOptional('shelters', 'Dark Ages', ['Shelters'], 'Each player starts with Hovel, Necropolis and Overgrown Estate instead of 3 Estates.');
    process();
    const heirlooms = [...companions.values()].filter(item => item.card?.types.includes('Heirloom')).map(item => item.name);
    const shelters = companions.has('Shelters');
    if (heirlooms.length || shelters) {
        const startingCards = [`${7 - heirlooms.length} Coppers`, ...heirlooms.map(name => `1 ${name}`), ...(shelters ? ['1 Hovel', '1 Necropolis', '1 Overgrown Estate'] : ['3 Estates'])];
        notes.push({ name: 'Starting decks', text: `Each player starts with ${startingCards.join(', ')}.${heirlooms.length ? ' Each Heirloom replaces one starting Copper.' : ''}${shelters ? ' Shelters replace the 3 starting Estates.' : ''}` });
    }
    const traitUsed = new Set();
    for (const card of landscapes) {
        if (card.types.includes('Trait') || card.name === 'Obelisk') {
            const target = choose(`target-${card.id}`, [...kingdom, ...extras.filter(item => /in Supply/.test(item.label)).map(item => item.card)].filter(item => (item.types.includes('Action') || (card.types.includes('Trait') && item.types.includes('Treasure'))) && !traitUsed.has(item.id)));
            if (target) {
                traitUsed.add(target.id);
                notes.push({ name: card.name, text: `Apply to ${target.name}.` });
            } else {
                warnings.push(`${card.name}: no eligible pile for its effect.`);
            }
        }
    }
    if (materials.has('Coffers / Villagers mat')) {
        materials.delete('Coffers mat');
    }
    return { extras, landscapes, companions: [...companions.values()], materials: [...materials].map(([name, reasons]) => ({ name, reasons: [...reasons] })), notes, warnings, cache };
}
import { meetsRequirements, requiredKingdom } from './requirements.js';

