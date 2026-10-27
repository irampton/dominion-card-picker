import { compareCards, compareKingdomCards, costLabel, drawKingdom, landscapeReplacementCandidates, ownedCards, pileCountNote, resolveSetup, shuffle } from './engine.js';
import { costDefinitions, requirementCountLimits, requirementDefinitions, requiredKingdom } from './requirements.js';
import { builtInPresets, presetConstraints, presetState } from './presets.js';
import { attackRuleSet, buildAttackProfiles, normalizeAttackOptions } from './attacks.js';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const storageKey = 'dominion-picker-v1';
const presetStorageKey = 'dominion-picker-presets-v1';
let customPresets = [];
let activePreset = 'builtin:random';
let requirementGroups = {};
let db;
let selections = ['Base:2'];
let kingdom = [];
const sortModes = ['Cost', 'Name', 'Set'];
let sortMode = 'Cost';
let setup;
let cache = {};
let replacing;
let replacingLandscape = false;
const landscapeKinds = ['Event', 'Landmark', 'Project', 'Way', 'Trait'];
const quickRequirements = [
    { id: 'keyword-actions', label: 'Require +2 Action' },
    { id: 'keyword-draw-two', label: 'Require 2+ Draw' },
    { id: 'keyword-buy', label: 'Require Buy' },
    { id: 'keyword-trash', label: 'Require Trashing' }
];
let options = { landscapes: 0, landscapeTypes: [...landscapeKinds], prophecy: 'auto' };
let editionChoices = {};
let collectionOpen = true;
let promosOpen = false;
let requirements = {};
let requirementCaps = {};
let definitions = [];
let attackOptions = normalizeAttackOptions();
let attackProfiles = new Map();
let costExact = {};
let setSpread = [];
let costRanges = [];
let nextCostRange = 1;
let setSymbols = {};
const lockedIds = new Set();
let pendingSettings = false;

function announce(message, error = false) {
    $('announcements').textContent = message;
    $('error-notice').textContent = error ? message : '';
    $('error-notice').hidden = !error;
}

function save() {
    try {
        localStorage.setItem(storageKey, JSON.stringify({ selections, options, editionChoices, collectionOpen, promosOpen, requirements, requirementCaps, costExact, costRanges, attackOptions, sortMode, activePreset, requirementGroups, setSpread }));
    } catch {
        // Private browsing and file URLs may deny storage; the picker still works.
    }
}

function pool() {
    return ownedCards(db, selections);
}

function renderPresets(selected = activePreset) {
    $('preset-select').innerHTML = `<optgroup label="Included presets">${builtInPresets.map(preset => `<option value="builtin:${preset.id}">${escapeHtml(preset.name)}</option>`).join('')}</optgroup>${customPresets.length ? `<optgroup label="Your presets">${customPresets.map(preset => `<option value="custom:${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join('')}</optgroup>` : ''}`;
    activePreset = [...$('preset-select').options].some(option => option.value === selected) ? selected : 'builtin:random';
    $('preset-select').value = activePreset;
    updatePresetDescription();
}

function selectedPreset() {
    const value = $('preset-select').value;
    return value.startsWith('builtin:') ? builtInPresets.find(preset => `builtin:${preset.id}` === value) : customPresets.find(preset => `custom:${preset.id}` === value);
}

function updatePresetDescription() {
    const preset = selectedPreset();
    $('load-preset').disabled = !preset;
    $('preset-description').textContent = preset?.description || '';
    if ($('preset-select').value.startsWith('custom:')) {
        $('preset-name').value = preset?.name || '';
    }
    $('preset-message').hidden = true;
}

function presetMessage(message, error = false) {
    $('preset-message').hidden = false;
    $('preset-message').textContent = message;
    $('preset-message').classList.toggle('preset-error', error);
}

function loadPreset() {
    const preset = selectedPreset();
    if (!preset) {
        return;
    }
    const state = presetState(preset.state);
    const constraints = presetConstraints(state, definitions, attackRuleSet(attackProfiles, state.attackOptions));
    const constrained = constraints.conditions.length > 0 || Object.values(constraints.lower).some(value => value > 0) || Object.values(constraints.upper).some(value => value < 10);
    const hiddenCostRule = costDefinitions().some(definition => {
        const rule = state.costExact[definition.id];
        const available = pool().filter(definition.matches).length;
        return rule && available < 2 && (rule.min > 0 || rule.max < available);
    });
    const missingResponse = state.attackOptions.requireResponse && !pool().some(card => attackProfiles.get(card.id)?.[state.attackOptions.blockResponse ? 'blockers' : 'responses'].length);
    if (hiddenCostRule || missingResponse || (constrained && !requiredKingdom(pool(), constraints.lower, constraints.allDefinitions, 10, fixedCards(), constraints.upper, constraints.conditions))) {
        presetMessage('Your selected sets or locked cards cannot meet this preset. Add sets or unlock cards, then load it again.', true);
        return;
    }
    requirements = state.requirements;
    requirementCaps = state.requirementCaps;
    costExact = state.costExact;
    costRanges = state.costRanges;
    attackOptions = state.attackOptions;
    nextCostRange = Math.max(0, ...costRanges.map(range => range.id)) + 1;
    renderRequirements();
    settingsChanged();
    presetMessage(`Loaded ${preset.name}.`);
}

function savePreset() {
    const name = $('preset-name').value.trim();
    if (!name) {
        presetMessage('Enter a name for the preset.', true);
        $('preset-name').focus();
        return;
    }
    if (builtInPresets.some(preset => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        presetMessage('Use a different name to save your own version of an included preset.', true);
        return;
    }
    const existing = customPresets.find(preset => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const id = existing?.id || globalThis.crypto?.randomUUID?.() || `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const preset = { id, name, state: presetState({ requirements, requirementCaps, costExact, costRanges, attackOptions }) };
    const updated = [...customPresets.filter(item => item.id !== preset.id), preset].sort((a, b) => a.name.localeCompare(b.name));
    try {
        localStorage.setItem(presetStorageKey, JSON.stringify(updated));
        customPresets = updated;
        renderPresets(`custom:${preset.id}`);
        save();
        presetMessage(`Saved ${name}.`);
    } catch {
        presetMessage('This browser cannot save presets locally. Allow local storage and try again.', true);
    }
}

function collectionChoices() {
    return db.sets.flatMap(set => {
        if (set.sourceName === 'Promo') {
            return db.cards.filter(card => card.set === 'Promo' && card.purpose === 'Kingdom Pile').map(card => ({ key: `Promo:${card.id}`, label: `Promo · ${card.name}`, count: 1 }));
        }
        return set.editions.map(edition => ({
            key: `${set.sourceName}:${edition}`,
            label: `${set.name}${set.editions.length > 1 || set.standalone ? ` · ${edition === 1 ? '1st' : '2nd'}` : ''}`,
            count: ownedCards(db, [`${set.sourceName}:${edition}`]).length
        }));
    });
}

function renderSets() {
    $('sets').innerHTML = db.sets.filter(set => set.sourceName !== 'Promo').map(set => {
        const edition = editionChoices[set.sourceName] || Math.max(...set.editions);
        const checked = selections.includes(`${set.sourceName}:${edition}`);
        const count = ownedCards(db, [`${set.sourceName}:${edition}`]).length;
        return `<div class="set"><label><input type="checkbox" data-set="${escapeHtml(set.sourceName)}" ${checked ? 'checked' : ''}><span>${escapeHtml(set.name)}</span></label>${set.editions.length > 1 ? `<select data-edition="${escapeHtml(set.sourceName)}" aria-label="${escapeHtml(set.name)} edition">${[...set.editions].sort((a, b) => b - a).map(value => `<option value="${value}" ${value === edition ? 'selected' : ''}>${value === 1 ? '1st' : '2nd'} edition</option>`).join('')}</select>` : ''}<small>${count}</small></div>`;
    }).join('');
    $('promo-sets').innerHTML = collectionChoices().filter(choice => choice.key.startsWith('Promo:')).map(({ key, label }) => `<label class="set"><input type="checkbox" value="${escapeHtml(key)}" ${selections.includes(key) ? 'checked' : ''}><span>${escapeHtml(label.replace('Promo · ', ''))}</span></label>`).join('');
    $('generate').disabled = pool().length < 10;
    renderOptions();
}

function renderOptions() {
    const supported = landscapeKinds.filter(type => db.cards.some(card => card.purpose === 'Landscape' && card.types.includes(type) && card.editions.some(edition => selections.includes(`${card.set}:${edition}`))));
    $('game-options').hidden = supported.length === 0;
    $('prophecies').hidden = !selections.some(key => key.startsWith('Rising Sun:'));
    document.querySelectorAll('input[name="prophecy"]').forEach(input => { input.checked = input.value === options.prophecy; });
    $('landscape-types').innerHTML = supported.map(type => `<label><input type="checkbox" value="${type}" ${options.landscapeTypes.includes(type) ? 'checked' : ''}>${{ Event: 'Events', Landmark: 'Landmarks', Project: 'Projects', Way: 'Ways', Trait: 'Traits' }[type]}</label>`).join('');
    $('landscape-count').value = options.landscapes;
    updateLandscapeCount();
}

function updateLandscapeCount() {
    $('landscape-value').value = $('landscape-count').value;
    $('landscape-recommendation').hidden = Number($('landscape-count').value) <= 2;
}

function activeOptions() {
    return {
        ...options,
        prophecy: selections.some(key => key.startsWith('Rising Sun:')) ? options.prophecy : 'auto',
        landscapes: $('game-options').hidden ? 0 : options.landscapes,
        colony: selections.some(key => key.startsWith('Prosperity:')) ? 'auto' : 'no',
        shelters: selections.includes('Dark Ages:1') ? 'auto' : 'no',
        allowAttacks: attackOptions.allowAttacks,
        requireAttackResponse: attackOptions.requireResponse,
        blockAttackResponse: attackOptions.blockResponse,
        attackProfiles,
        selections
    };
}

function cardHtml(card) {
    const locked = lockedIds.has(card.id);
    return `<article class="card" data-id="${card.id}">
        <div class="card-visual"><button class="art-toggle" data-action="toggle" aria-expanded="false" aria-label="Show controls for ${escapeHtml(card.name)}">
            <img class="card-art" src="${card.imageUrl}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">
            <div class="art-fallback" hidden><strong>${escapeHtml(card.name)}</strong>${escapeHtml(card.text)}</div>
        </button>${lockHtml(locked, card.name)}<div class="card-actions"><button class="overlay-close" data-action="close" aria-label="Close controls for ${escapeHtml(card.name)}">✕</button><button data-action="choose" aria-label="Choose a replacement for ${escapeHtml(card.name)}">Choose card…</button><button data-action="random" aria-label="Replace ${escapeHtml(card.name)} with a random card">⤨ Random card</button><button data-action="remove" aria-label="Remove ${escapeHtml(card.name)}">Remove card</button><a href="${card.wikiUrl}" target="_blank" rel="noopener">Card rules ↗</a></div></div>
        ${expansionPill(card)}
    </article>`;
}

function expansionSet(card) {
    const standalone = card.ownership?.find(key => selections.includes(key));
    return standalone && !selections.some(key => key.startsWith('Cornucopia & Guilds:')) ? standalone.split(':')[0] : card.set;
}

function expansionPill(card) {
    const set = expansionSet(card);
    const symbol = setSymbols[set];
    return `<div class="expansion-pill">${symbol ? `<img src="${symbol.src || `./${symbol.file}`}" alt="" aria-hidden="true">` : ''}<span>${escapeHtml(set === 'Base' ? 'Dominion' : set)}</span></div>`;
}

function landscapeHtml(card) {
    const available = landscapeReplacementCandidates(db, kingdom, setupPool(), activeOptions(), cache, card).length;
    return `<article class="card landscape-card" data-id="${card.id}"><div class="card-visual"><button class="art-toggle" data-action="toggle" aria-expanded="false" aria-label="Show controls for ${escapeHtml(card.name)}"><img class="card-art" src="${card.imageUrl}" alt="${escapeHtml(card.name)}" loading="lazy"><div class="art-fallback" hidden><strong>${escapeHtml(card.name)}</strong>${escapeHtml(card.text)}</div></button><div class="card-actions"><button class="overlay-close" data-action="close" aria-label="Close controls for ${escapeHtml(card.name)}">✕</button><button data-action="choose" ${available ? '' : 'disabled'} aria-label="Choose a replacement for ${escapeHtml(card.name)}">Choose card…</button><button data-action="random" ${available ? '' : 'disabled'} aria-label="Replace ${escapeHtml(card.name)} with a random card">⤨ Random card</button><a href="${card.wikiUrl}" target="_blank" rel="noopener">Card rules ↗</a></div></div>${expansionPill(card)}</article>`;
}

function lockHtml(locked, name) {
    return `<button class="lock-state" data-action="lock" aria-pressed="${locked}" aria-label="${locked ? 'Unlock' : 'Lock'} ${escapeHtml(name)}" title="${locked ? 'Unlock: replace on next pick' : 'Lock: keep on next pick'}"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="${locked ? 'M7 10V7a5 5 0 0 1 10 0v3' : 'M7 10V7a5 5 0 0 1 9-3'}"/><rect x="4" y="10" width="16" height="12" rx="2"/><path d="M12 14v4"/></svg></button>`;
}

function emptyHtml(index) {
    return `<article class="card empty-card" data-id="empty-${index}"><div class="card-visual"><button class="art-toggle" data-action="toggle" aria-expanded="false" aria-label="Show controls for empty slot ${index + 1}"><img class="card-art" src="./assets/randomizer-back.jpg" alt="Dominion randomizer card back"><div class="art-fallback back-fallback" hidden>Dominion</div></button><div class="card-actions"><button class="overlay-close" data-action="close" aria-label="Close controls for empty slot ${index + 1}">✕</button><button data-action="choose" aria-label="Choose a card for empty slot ${index + 1}">Choose card…</button></div></div></article>`;
}

function renderLandscapes(complete = false) {
    const cards = complete ? setup.landscapes : [];
    const available = db.cards.filter(card => card.purpose === 'Landscape' && card.types.some(type => options.landscapeTypes.includes(type)) && card.editions.some(edition => selections.includes(`${card.set}:${edition}`)));
    const count = complete ? cards.length : Math.min(activeOptions().landscapes, available.length);
    $('chosen-landscapes').hidden = count === 0;
    $('landscape-cards').innerHTML = complete ? cards.map(landscapeHtml).join('') : Array.from({ length: count }, () => `<article class="card landscape-card empty-landscape"><div class="card-visual landscape-back"><img src="./assets/randomizer-back.jpg" alt="Dominion landscape randomizer card back"></div></article>`).join('');
}

function fixedCards() {
    return kingdom.filter(card => lockedIds.has(card.id));
}

function settingsChanged() {
    pendingSettings = true;
    $('setup').hidden = true;
    renderLandscapes();
    if ($('copy')) {
        $('copy').disabled = true;
    }
    updateCardControls();
    announce('Settings changed. Click Pick Kingdom Cards to apply them.');
    save();
}

function updateCardControls() {
    const availability = new Map();
    $('kingdom').querySelectorAll('.card').forEach(element => {
        const key = element.classList.contains('empty-card') ? 'empty' : element.dataset.id;
        if (!availability.has(key)) {
            availability.set(key, candidatesFor(element.dataset.id, true).length > 0);
        }
        const available = availability.get(key);
        element.querySelectorAll('[data-action="choose"], [data-action="random"]').forEach(button => { button.disabled = !available; });
    });
}

function constraintState() {
    const policy = attackRuleSet(attackProfiles, attackOptions);
    const allDefinitions = [...definitions, ...costDefinitions(costRanges), ...policy.definitions];
    const lower = { ...requirements };
    const upper = { ...requirementCaps, ...policy.upper };
    if (selections.some(key => key.startsWith('Rising Sun:'))) {
        if (options.prophecy === 'require') {
            lower['type-omen'] = Math.max(1, lower['type-omen'] || 0);
            upper['type-omen'] = Math.max(1, upper['type-omen'] ?? 10);
        } else if (options.prophecy === 'exclude') {
            lower['type-omen'] = 0;
            upper['type-omen'] = 0;
        }
    }
    for (const definition of allDefinitions.filter(item => item.group === 'Cost Spread')) {
        const rule = definition.id.startsWith('cost-range-') ? costRanges.find(item => `cost-range-${item.id}` === definition.id) : costExact[definition.id];
        if (rule) {
            lower[definition.id] = rule.min;
            upper[definition.id] = rule.max;
        }
    }
    for (const rule of setSpread) {
        const id = `set:${rule.set}`;
        allDefinitions.push({ id, matches: card => card.set === rule.set });
        lower[id] = rule.min;
        upper[id] = rule.max;
    }
    return { allDefinitions, lower, upper, conditions: policy.conditions };
}

function setupPool() {
    return pool().filter(card => attackOptions.allowAttacks || !attackProfiles.get(card.id)?.attack);
}

function attackControlsHtml(available) {
    const hasAttacks = available.some(card => attackProfiles.get(card.id)?.attack);
    const hasResponse = available.some(card => attackProfiles.get(card.id)?.responses.length);
    const hasBlocker = available.some(card => attackProfiles.get(card.id)?.blockers.length);
    return `<div class="attack-controls"><label><input id="allow-attacks" type="checkbox" ${attackOptions.allowAttacks ? 'checked' : ''} ${hasAttacks ? '' : 'disabled'}>Allow Attacks</label>${attackOptions.allowAttacks ? `<div class="attack-response-controls"><label title="Includes on-Attack responses and reactions to gaining, discarding, trashing or revealing. Some help only against particular attacks. Page provides Champion; Loot providers include Shield."><input id="require-attack-response" type="checkbox" ${attackOptions.requireResponse ? 'checked' : ''} ${hasAttacks && hasResponse ? '' : 'disabled'}>Require Attack Response</label>${attackOptions.requireResponse ? `<label title="Requires Moat, Lighthouse, Guardian, Champion via Page, or access to Shield via Loot."><input id="block-attack-response" type="checkbox" ${attackOptions.blockResponse ? 'checked' : ''} ${hasAttacks && hasBlocker ? '' : 'disabled'}>Require Response to Block Attack</label>` : ''}</div>` : ''}</div>`;
}

function eligibleLocks() {
    const ids = new Set(pool().map(card => card.id));
    return fixedCards().filter(card => ids.has(card.id));
}

function normalizeCosts(available) {
    const costs = available.map(card => card.cost.coins).filter(cost => cost >= 1 && cost <= 9);
    const low = costs.length ? Math.min(...costs) : 1;
    const high = costs.length ? Math.max(...costs) : 9;
    const integer = (value, fallback) => Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
    for (const definition of costDefinitions()) {
        const count = available.filter(definition.matches).length;
        if (count < 2) {
            delete costExact[definition.id];
        }
    }
    for (const range of costRanges) {
        range.low = Math.max(low, Math.min(high, integer(range.low, low)));
        range.high = Math.max(range.low, Math.min(high, integer(range.high, high)));
    }
    if (costs.length && !costRanges.some(range => !range.active)) {
        costRanges.push({ id: nextCostRange++, low, high, min: 0, max: 10, active: false });
    }
    const policy = attackRuleSet(attackProfiles, attackOptions);
    const allDefinitions = [...definitions, ...costDefinitions(costRanges), ...policy.definitions];
    const lower = { ...requirements };
    const upper = { ...requirementCaps, ...policy.upper };
    let adjusted = false;
    for (const definition of allDefinitions.filter(item => item.group === 'Cost Spread')) {
        const rule = definition.id.startsWith('cost-range-') ? costRanges.find(item => `cost-range-${item.id}` === definition.id) : costExact[definition.id];
        if (!rule) {
            continue;
        }
        const cap = Math.min(10, available.filter(definition.matches).length);
        let min = Math.max(0, Math.min(cap, integer(rule.min, 0)));
        let max = Math.max(min, Math.min(cap, integer(rule.max, cap)));
        while (min > 0 && !requiredKingdom(available, { ...lower, [definition.id]: min }, allDefinitions, 10, eligibleLocks(), upper, policy.conditions)) {
            min--;
        }
        while (max < cap && !requiredKingdom(available, { ...lower, [definition.id]: min }, allDefinitions, 10, eligibleLocks(), { ...upper, [definition.id]: max }, policy.conditions)) {
            max++;
        }
        adjusted ||= min !== rule.min || max !== rule.max;
        rule.min = min;
        rule.max = max;
        lower[definition.id] = min;
        upper[definition.id] = max;
    }
    return { low, high, adjusted };
}

function dualRangeHtml(prefix, low, high, min, max, attributes, floors = {}) {
    const disabled = low === high ? 'disabled' : '';
    return `<div class="dual-range"><input id="${prefix}-min" type="range" aria-label="${attributes.label} minimum" min="${low}" max="${high}" value="${min}" step="1" data-floor="${floors.minFloor ?? low}" data-ceiling="${floors.minCeiling ?? max}" ${attributes.data} data-end="min" ${disabled}><input id="${prefix}-max" type="range" aria-label="${attributes.label} maximum" min="${low}" max="${high}" value="${max}" step="1" data-floor="${floors.maxFloor ?? min}" data-ceiling="${floors.maxCeiling ?? high}" ${attributes.data} data-end="max" ${disabled}></div><div class="range-ends"><label for="${prefix}-min">Minimum</label><label for="${prefix}-max">Maximum</label></div>`;
}

function costSpreadHtml(available, bounds) {
    const state = constraintState();
    const countPair = (id, rule, label, priceControls = '') => {
        const definition = state.allDefinitions.find(item => item.id === id);
        const total = available.filter(definition.matches).length;
        const limits = requirementCountLimits(available, state.lower, state.allDefinitions, id, eligibleLocks(), state.upper, state.conditions);
        const max = Math.min(rule?.max ?? limits.max, limits.max);
        const min = Math.min(rule?.min ?? 0, max);
        if (rule) {
            rule.min = min;
            rule.max = max;
        }
        const countControls = `${dualRangeHtml(id, 0, limits.max, min, max, { label: `${label.replace(/<[^>]+>/g, '')} card count`, data: `data-cost-id="${id}" data-kind="count"` }, { minCeiling: max, maxFloor: Math.max(min, limits.min) })}<small>Maximum ${limits.max} · Total available ${total}</small>`;
        return `<div class="cost-rule" data-cost-rule="${id}"><div>Must have between <output id="${id}-min-value">${min}</output> and <output id="${id}-max-value">${max}</output> cards that cost ${label}</div>${priceControls ? `<div class="cost-band-controls"><div>${countControls}</div><div>${priceControls}</div></div>` : countControls}</div>`;
    };
    const exact = costDefinitions().filter(definition => available.filter(definition.matches).length >= 2).map(definition => countPair(definition.id, costExact[definition.id], `$${definition.low}`)).join('');
    const ranges = available.some(card => card.cost.coins >= 1 && card.cost.coins <= 9) ? costRanges.map(range => {
        const id = `cost-range-${range.id}`;
        const definition = { id, matches: card => card.cost.coins >= range.low && card.cost.coins <= range.high };
        if (!state.allDefinitions.some(item => item.id === id)) {
            state.allDefinitions.push(definition);
        }
        const priceControls = dualRangeHtml(`${id}-prices`, bounds.low, bounds.high, range.low, range.high, { label: `Cost range ${range.id} price`, data: `data-cost-id="${id}" data-kind="price"` });
        return `<div class="cost-band">${range.active ? `<button class="remove-cost-range" data-remove-cost="${range.id}" aria-label="Remove cost range ${range.id}" title="Remove range">X</button>` : ''}${countPair(id, range.active ? range : null, `between $<output id="${id}-low-value">${range.low}</output> and $<output id="${id}-high-value">${range.high}</output>`, priceControls)}</div>`;
    }).join('') : '';
    return `<details class="requirement-group"><summary>Cost spread</summary><div class="cost-grid">${exact}</div><div class="cost-bands">${ranges}</div></details>`;
}

function normalizeSetSpread(available) {
    const sets = [...new Set(available.map(card => card.set))].sort();
    const used = new Set();
    const rules = sets.length < 2 ? [] : setSpread.filter(rule => {
        if (!rule || !sets.includes(rule.set) || used.has(rule.set)) {
            return false;
        }
        used.add(rule.set);
        return true;
    });
    setSpread = [];
    for (const rule of rules) {
        const state = constraintState();
        const id = `set:${rule.set}`;
        state.allDefinitions.push({ id, matches: card => card.set === rule.set });
        const limits = requirementCountLimits(available, state.lower, state.allDefinitions, id, eligibleLocks(), state.upper, state.conditions);
        const min = Math.max(limits.min, Math.min(limits.max, Math.floor(Number(rule.min) || 0)));
        const max = Math.max(min, Math.min(limits.max, Math.floor(Number(rule.max) || 0)));
        setSpread.push({ set: rule.set, min, max });
    }
    return sets;
}

function setSpreadHtml(available, sets) {
    if (sets.length < 2) {
        return '';
    }
    const state = constraintState();
    const rows = [...setSpread];
    if (rows.length < sets.length) {
        rows.push({ set: '', min: 0, max: 10 });
    }
    return `<details class="requirement-group"><summary>Set spread</summary><div class="set-spread-rows">${rows.map((rule, index) => {
        const choices = sets.filter(set => set === rule.set || !setSpread.some(item => item.set === set));
        const id = `set-spread-${index}`;
        const limits = rule.set ? requirementCountLimits(available, state.lower, state.allDefinitions, `set:${rule.set}`, eligibleLocks(), state.upper, state.conditions) : { min: 0, max: 10 };
        return `<div class="cost-rule"><div>Require between <output id="${id}-min-value">${rule.min}</output> and <output id="${id}-max-value">${rule.max}</output> cards</div><div class="set-spread-controls"><div>${dualRangeHtml(id, 0, limits.max, rule.min, rule.max, { label: escapeHtml(rule.set || 'New set') + ' card count', data: `data-set-row="${index}"` }, { minCeiling: rule.max, maxFloor: Math.max(rule.min, limits.min) })}</div><select id="${id}-select" data-set-select="${index}" aria-label="Set for card count"><option value="">Select a set</option>${choices.map(set => `<option value="${escapeHtml(set)}" ${set === rule.set ? 'selected' : ''}>${escapeHtml(set)}</option>`).join('')}</select></div></div>`;
    }).join('')}</div></details>`;
}

function renderRequirements() {
    if (selections.some(key => key.startsWith('Rising Sun:'))) {
        if (options.prophecy === 'require') {
            requirements['type-omen'] = Math.max(1, requirements['type-omen'] || 0);
            requirementCaps['type-omen'] = Math.max(1, requirementCaps['type-omen'] ?? 10);
        } else if (options.prophecy === 'exclude') {
            requirements['type-omen'] = 0;
            requirementCaps['type-omen'] = 0;
        }
    }
    const available = pool();
    const hasResponse = available.some(card => attackProfiles.get(card.id)?.responses.length);
    const hasBlocker = available.some(card => attackProfiles.get(card.id)?.blockers.length);
    attackOptions = normalizeAttackOptions({ ...attackOptions, requireResponse: attackOptions.requireResponse && hasResponse, blockResponse: attackOptions.blockResponse && hasBlocker });
    const policy = attackRuleSet(attackProfiles, attackOptions);
    const policyDefinitions = [...definitions, ...policy.definitions];
    const next = {};
    for (const definition of definitions) {
        let value = Math.min(10, Math.max(0, Math.floor(Number(requirements[definition.id]) || 0)));
        while (value > 0 && !requiredKingdom(available, { ...next, [definition.id]: value }, policyDefinitions, 10, eligibleLocks(), policy.upper, policy.conditions)) {
            value--;
        }
        next[definition.id] = value;
    }
    const adjusted = definitions.some(definition => (requirements[definition.id] || 0) !== next[definition.id]);
    requirements = next;
    const acceptedCaps = { ...policy.upper };
    for (const definition of definitions) {
        let cap = Math.max(requirements[definition.id], Math.min(10, Number(requirementCaps[definition.id] ?? 10)));
        while (cap < 10 && !requiredKingdom(available, requirements, policyDefinitions, 10, eligibleLocks(), { ...acceptedCaps, [definition.id]: cap }, policy.conditions)) {
            cap++;
        }
        if (cap < 10) {
            requirementCaps[definition.id] = cap;
        } else {
            delete requirementCaps[definition.id];
        }
        acceptedCaps[definition.id] = Math.min(cap, policy.upper[definition.id] ?? 10);
    }
    const costBounds = normalizeCosts(available);
    const spreadSets = normalizeSetSpread(available);
    const state = constraintState();
    const quickControls = `<div class="quick-requirements">${quickRequirements.map(({ id, label }) => {
        const canRequire = Boolean(requiredKingdom(available, { ...state.lower, [id]: Math.max(1, state.lower[id] || 0) }, state.allDefinitions, 10, eligibleLocks(), state.upper, state.conditions));
        return `<label><input id="quick-${id}" type="checkbox" data-quick-requirement="${id}" ${(requirements[id] || 0) > 0 ? 'checked' : ''} ${canRequire ? '' : 'disabled'}>${label}</label>`;
    }).join('')}</div>`;
    $('requirement-sliders').innerHTML = quickControls + attackControlsHtml(available) + ['Card types', 'Card effects & keywords'].map(group => `<details class="requirement-group"><summary>${group}</summary><div class="requirement-grid">${definitions.filter(definition => definition.group === group && available.some(definition.matches)).map(definition => {
        const limits = requirementCountLimits(available, state.lower, state.allDefinitions, definition.id, eligibleLocks(), state.upper, state.conditions);
        const max = limits.max;
        const total = available.filter(definition.matches).length;
        const value = requirements[definition.id];
        const cap = Math.max(value, Math.min(requirementCaps[definition.id] ?? max, max));
        const id = definition.id;
        return `<div class="requirement-slider"><span>Require between <output id="${id}-min-value">${value}</output> and <output id="${id}-max-value">${cap}</output> ${escapeHtml(definition.label)}</span>${dualRangeHtml(id, 0, max, value, cap, { label: escapeHtml(definition.label), data: `data-requirement-id="${id}"` }, { minCeiling: cap, maxFloor: Math.max(value, limits.min) })}<small>Maximum ${max} · Total available ${total}</small></div>`;
    }).join('')}</div></details>`).join('') + costSpreadHtml(available, costBounds) + setSpreadHtml(available, spreadSets);
    $('requirement-sliders').querySelectorAll('.requirement-group').forEach(group => {
        group.open = requirementGroups[group.querySelector('summary').textContent] === true;
    });
    return adjusted || costBounds.adjusted;
}

function candidatesFor(id, firstOnly = false) {
    const remaining = kingdom.filter(card => card.id !== id);
    const used = new Set(kingdom.map(card => card.id));
    const extras = new Set((!pendingSettings ? setup?.extras || [] : []).map(item => item.card.id));
    const state = constraintState();
    const externalAttack = attackOptions.requireResponse && !pendingSettings && [...(setup?.extras.map(item => item.card) || []), ...(setup?.landscapes || [])].some(card => attackProfiles.get(card.id)?.attack || card.name === 'Approaching Army');
    const lower = externalAttack ? { ...state.lower, 'policy-response': 1 } : state.lower;
    const available = pool();
    const matches = card => !used.has(card.id) && !extras.has(card.id) && requiredKingdom(available, lower, state.allDefinitions, 10, [...remaining, card], state.upper, state.conditions);
    if (firstOnly) {
        const card = available.find(matches);
        return card ? [card] : [];
    }
    return available.filter(matches).sort(compareCards);
}

function listBlock(title, entries) {
    return `<div class="setup-block"><h3>${title}</h3><ul>${entries.map(entry => `<li>${entry}</li>`).join('')}</ul></div>`;
}

function wikiLink(card, label = card.name) {
    return `<a href="${card.wikiUrl}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function quantityHtml(card) {
    const note = pileCountNote(card);
    return note ? ` <span class="pile-count">${escapeHtml(note)}</span>` : '';
}

function renderSetup() {
    const extraEntries = [
        ...setup.extras.map(item => `${wikiLink(item.card)}${/set-aside|Black Market/.test(item.label) ? ' <span class="pile-count">1 card.</span>' : quantityHtml(item.card)} <span class="reason">${escapeHtml(item.label)}</span>`),
        ...setup.companions.map(item => `${item.card ? wikiLink(item.card) + quantityHtml(item.card) : escapeHtml(item.name)} <span class="reason">${escapeHtml([...item.reasons].join(', '))}</span>`)
    ];
    $('setup').innerHTML = `<div class="section-heading"><h2 id="setup-heading">Bring to the table</h2></div>
        ${setup.warnings.map(text => `<p class="warning">${escapeHtml(text)}</p>`).join('')}
        <div class="setup-columns"><div>${listBlock('Basic Supply', [...['Copper', 'Silver', 'Gold', 'Estate', 'Duchy', 'Province', 'Curse'].map(name => {
            const card = db.cards.find(item => item.name === name);
            return `${name === 'Curse' ? 'Curses' : name}${quantityHtml(card)}`;
        }), 'Trash area or Trash mat'])}
        ${kingdom.some(card => card.types.includes('Victory')) ? listBlock('Kingdom pile sizes', kingdom.filter(card => card.types.includes('Victory')).map(card => `${wikiLink(card)}${quantityHtml(card)}`)) : ''}
        ${listBlock('Extra cards & piles', extraEntries.length ? extraEntries : ['No extra cards needed.'])}</div><div>${listBlock('Mats & tokens', setup.materials.length ? setup.materials.sort((a, b) => a.name.localeCompare(b.name)).map(item => `${escapeHtml(item.name)}<span class="reason">${escapeHtml(item.reasons.join(', '))}</span>`) : ['No special mats or tokens needed.'])}
        </div></div>
        ${setup.notes.length ? `<details open><summary>Setup instructions · ${setup.notes.length}</summary><ul>${setup.notes.map(note => `<li><strong>${escapeHtml(note.name)}:</strong> ${escapeHtml(note.text)}</li>`).join('')}</ul></details>` : ''}`;
}

function render() {
    kingdom.sort((a, b) => compareKingdomCards(a, b, sortMode, card => expansionSet(card) === 'Base' ? 'Dominion' : expansionSet(card)));
    document.querySelectorAll('input[name="kingdom-sort"]').forEach(input => {
        input.checked = input.value === sortMode;
    });
    const complete = kingdom.length === 10 && !pendingSettings;
    $('copy').disabled = !complete;
    setup = complete ? resolveSetup(db, kingdom, setupPool(), activeOptions(), cache) : null;
    $('setup').hidden = !complete;
    $('kingdom').innerHTML = kingdom.map(cardHtml).join('') + Array.from({ length: 10 - kingdom.length }, (_, index) => emptyHtml(index)).join('');
    renderLandscapes(complete);
    document.querySelectorAll('#kingdom img, #landscape-cards img').forEach(img => {
        img.addEventListener('error', () => {
            img.hidden = true;
            if (img.nextElementSibling?.classList.contains('art-fallback')) {
                img.nextElementSibling.hidden = false;
            }
        });
    });
    updateCardControls();
    if (complete) {
        renderSetup();
    }
    save();
}

function generate() {
    try {
        if (fixedCards().some(card => !pool().some(item => item.id === card.id))) {
            throw new Error('A locked card is outside your selected collection. Select its expansion again, or replace / remove that card.');
        }
        const state = constraintState();
        let nextKingdom = drawKingdom(pool(), Math.random, state.lower, state.allDefinitions, fixedCards(), state.upper, state.conditions);
        const nextCache = {};
        if (attackOptions.requireResponse) {
            const prepared = resolveSetup(db, nextKingdom, setupPool(), activeOptions(), nextCache);
            const inUse = [...nextKingdom, ...prepared.extras.map(item => item.card), ...prepared.landscapes];
            const hasAttack = inUse.some(card => attackProfiles.get(card.id)?.attack || card.name === 'Approaching Army');
            const hasResponse = inUse.some(card => attackProfiles.get(card.id)?.[attackOptions.blockResponse ? 'blockers' : 'responses'].length);
            if (hasAttack && !hasResponse) {
                nextKingdom = drawKingdom(pool(), Math.random, { ...state.lower, 'policy-response': 1 }, state.allDefinitions, fixedCards(), state.upper, state.conditions);
            }
        }
        kingdom = nextKingdom;
        cache = nextCache;
        pendingSettings = false;
        render();
        $('announcements').textContent = '';
        $('error-notice').hidden = true;
        revealCards();
    } catch (error) {
        announce(error.message, true);
    }
}

function revealCards() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }
    const cards = [...document.querySelectorAll('#kingdom .card:not(.empty-card)')].filter(element => !lockedIds.has(element.dataset.id));
    cards.push(...document.querySelectorAll('.landscape-card'));
    const images = [];
    cards.forEach((card, index) => {
        const visual = card.querySelector('.card-visual');
        const inner = document.createElement('div');
        inner.className = 'flip-inner';
        const front = document.createElement('div');
        front.className = 'flip-front';
        front.append(...visual.childNodes);
        const back = document.createElement('div');
        back.className = 'flip-back';
        back.setAttribute('aria-hidden', 'true');
        const image = document.createElement('img');
        image.src = './assets/randomizer-back.jpg';
        image.alt = '';
        back.append(image);
        inner.append(front, back);
        visual.append(inner);
        card.classList.add('is-revealing');
        card.style.setProperty('--reveal-delay', `${index * 130}ms`);
        front.querySelectorAll('img.card-art').forEach(img => {
            img.loading = 'eager';
            images.push(img.decode().catch(() => {}));
        });
        inner.addEventListener('animationend', event => {
            if (event.animationName === 'card-reveal') {
                visual.replaceChildren(...front.childNodes);
                card.classList.remove('is-revealing', 'reveal-ready');
            }
        });
    });
    // Keep the backs visible while artwork loads, with a bounded wait for
    // unavailable remote images. CSS performs the staggered reveal itself.
    Promise.race([Promise.allSettled(images), new Promise(resolve => setTimeout(resolve, 2000))]).then(() => {
        cards.filter(card => card.isConnected).forEach(card => card.classList.add('reveal-ready'));
    });
}

function changeCollection(event) {
    if (event?.target.dataset.edition) {
        editionChoices[event.target.dataset.edition] = Number(event.target.value);
    }
    selections = [
        ...[...$('sets').querySelectorAll('input:checked')].map(input => `${input.dataset.set}:${editionChoices[input.dataset.set]}`),
        ...[...$('promo-sets').querySelectorAll('input:checked')].map(input => input.value)
    ];
    cache = {};
    renderSets();
    const adjusted = renderRequirements();
    settingsChanged();
    if (adjusted) {
        announce('Requirements reduced to fit your collection. Click Pick Kingdom Cards to apply changes.');
    }
}

function replaceWith(card, manual = true) {
    if (replacingLandscape) {
        const current = setup?.landscapes.find(item => item.id === replacing);
        if (!current || !landscapeReplacementCandidates(db, kingdom, setupPool(), activeOptions(), cache, current).some(item => item.id === card.id)) {
            return;
        }
        const key = Object.keys(cache).find(key => /^(landscape-\d+|ally|prophecy)$/.test(key) && cache[key] === replacing);
        cache[key] = card.id;
        render();
        $('card-dialog').close();
        $('landscape-cards').querySelector(`[data-id="${card.id}"] [data-action="choose"]`)?.focus();
        announce(`${current.name} replaced with ${card.name}.`);
        return;
    }
    const index = kingdom.findIndex(item => item.id === replacing);
    const oldName = index >= 0 ? kingdom[index].name : 'Empty slot';
    if (index >= 0) {
        lockedIds.delete(kingdom[index].id);
        kingdom[index] = card;
    } else {
        kingdom.push(card);
    }
    if (manual) {
        lockedIds.add(card.id);
    }
    cache = {};
    renderRequirements();
    render();
    announce(`${oldName} replaced with ${card.name}.${manual ? ' Card locked for regeneration.' : ''}${setup?.warnings.length ? ' Check the setup notice below.' : ''}`);
    $('card-dialog').close();
    // Sorting moves cards; return focus to the replacement, not a detached button.
    $('kingdom').querySelector(`[data-id="${card.id}"] [data-action="choose"]`)?.focus();
}

function renderResults() {
    const query = $('card-search').value.trim().toLocaleLowerCase();
    const current = setup?.landscapes.find(card => card.id === replacing);
    const candidates = (replacingLandscape ? (current ? landscapeReplacementCandidates(db, kingdom, setupPool(), activeOptions(), cache, current) : []) : candidatesFor(replacing)).filter(card => `${card.name} ${card.set} ${card.types.join(' ')}`.toLocaleLowerCase().includes(query));
    $('result-count').textContent = `${candidates.length} available cards · matching your collection and requirements`;
    $('card-results').innerHTML = candidates.length ? candidates.map(card => `<button class="result" data-id="${card.id}"><span>${escapeHtml(card.name)}<small>${escapeHtml(card.set)} · ${escapeHtml(card.types.join(' · '))}</small></span><span class="cost">${escapeHtml(costLabel(card))}</span></button>`).join('') : '<p>No matching unused cards. Try another search.</p>';
}

async function init() {
    try {
        const embedded = $('card-data');
        if (embedded) {
            db = JSON.parse(embedded.textContent);
        } else {
            const response = await fetch('./data/cards.json');
            if (!response.ok) {
                throw new Error(`Card database returned HTTP ${response.status}`);
            }
            db = await response.json();
        }
        const embeddedSymbols = $('set-symbols');
        if (embeddedSymbols) {
            setSymbols = JSON.parse(embeddedSymbols.textContent);
        } else {
            const response = await fetch('./data/set-symbols.json');
            if (response.ok) {
                setSymbols = await response.json();
            }
        }
        definitions = requirementDefinitions(db);
        attackProfiles = buildAttackProfiles(db);
        try {
            const storedPresets = JSON.parse(localStorage.getItem(presetStorageKey));
            customPresets = Array.isArray(storedPresets) ? storedPresets.filter(preset => typeof preset?.id === 'string' && typeof preset?.name === 'string').map(preset => ({ id: preset.id, name: preset.name, state: presetState(preset.state) })) : [];
        } catch {
            customPresets = [];
        }
        renderPresets();
        $('preset-select').addEventListener('change', () => {
            activePreset = $('preset-select').value;
            updatePresetDescription();
            save();
        });
        $('load-preset').addEventListener('click', loadPreset);
        $('save-preset').addEventListener('click', savePreset);
        $('preset-name').addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                savePreset();
            }
        });
        let saved;
        try {
            saved = JSON.parse(localStorage.getItem(storageKey));
        } catch {
            saved = null;
        }
        if (saved && Array.isArray(saved.selections)) {
            const validSelections = collectionChoices().map(choice => choice.key);
            selections = saved.selections.flatMap(item => item === 'Promo:1' ? validSelections.filter(key => key.startsWith('Promo:')) : [item]).filter(item => validSelections.includes(item));
            editionChoices = saved.editionChoices || {};
            collectionOpen = saved.collectionOpen ?? true;
            promosOpen = saved.promosOpen ?? false;
            sortMode = sortModes.includes(saved.sortMode) ? saved.sortMode : 'Cost';
            activePreset = typeof saved.activePreset === 'string' ? saved.activePreset : 'builtin:random';
            requirementGroups = saved.requirementGroups && typeof saved.requirementGroups === 'object' ? saved.requirementGroups : {};
            requirements = saved.requirements || {};
            requirementCaps = presetState(saved).requirementCaps;
            attackOptions = normalizeAttackOptions(saved.attackOptions);
            setSpread = Array.isArray(saved.setSpread) ? saved.setSpread : [];
            costExact = saved.costExact && typeof saved.costExact === 'object' ? saved.costExact : {};
            costRanges = Array.isArray(saved.costRanges) ? saved.costRanges.filter(range => range && Number.isInteger(range.id)) : [];
            nextCostRange = Math.max(0, ...costRanges.map(range => range.id)) + 1;
            options = {
                landscapes: Math.min(4, Math.max(0, Math.floor(Number(saved.options?.landscapes) || 0))),
                landscapeTypes: Array.isArray(saved.options?.landscapeTypes) ? saved.options.landscapeTypes.filter(type => landscapeKinds.includes(type)) : [...landscapeKinds],
                prophecy: ['auto', 'require', 'exclude'].includes(saved.options?.prophecy) ? saved.options.prophecy : 'auto'
            };
        }
        if (!saved || !Array.isArray(saved.selections)) {
            const random = presetState(builtInPresets.find(preset => preset.id === 'random').state);
            requirements = random.requirements;
            requirementCaps = random.requirementCaps;
            costExact = random.costExact;
            costRanges = random.costRanges;
            attackOptions = random.attackOptions;
        }
        renderPresets();
        for (const set of db.sets.filter(set => set.sourceName !== 'Promo')) {
            const selected = set.editions.filter(edition => selections.includes(`${set.sourceName}:${edition}`));
            const edition = selected.length ? Math.max(...selected) : Number(editionChoices[set.sourceName]);
            editionChoices[set.sourceName] = set.editions.includes(edition) ? edition : Math.max(...set.editions);
            if (selected.length) {
                selections = selections.filter(key => !key.startsWith(`${set.sourceName}:`));
                selections.push(`${set.sourceName}:${editionChoices[set.sourceName]}`);
            }
        }
        $('collection').open = collectionOpen;
        $('promos').open = promosOpen;
        $('landscape-count').value = options.landscapes;
        renderSets();
        renderRequirements();
        $('data-version').textContent = `Catalog: ${db.generated}.`;
        render();
        $('generate').addEventListener('click', generate);
        $('sort-kingdom').addEventListener('change', event => {
            if (!sortModes.includes(event.target.value)) {
                return;
            }
            sortMode = event.target.value;
            render();
            save();
        });
        $('requirement-sliders').addEventListener('change', event => {
            if (event.target.dataset.setSelect !== undefined || event.target.dataset.setRow !== undefined) {
                const input = event.target;
                const index = Number(input.dataset.setSelect ?? input.dataset.setRow);
                const rule = setSpread[index] || { set: '', min: 0, max: 10 };
                if (input.dataset.setSelect !== undefined) {
                    rule.set = input.value;
                } else {
                    rule.set ||= [...new Set(pool().map(card => card.set))].sort().find(set => !setSpread.some(item => item.set === set));
                    rule[input.dataset.end] = Number(input.value);
                }
                setSpread[index] = rule;
                renderRequirements();
                settingsChanged();
                $(input.id)?.focus();
                return;
            }

            if (event.target.dataset.quickRequirement) {
                const id = event.target.dataset.quickRequirement;
                requirements[id] = event.target.checked ? Math.max(1, requirements[id] || 0) : 0;
                renderRequirements();
                settingsChanged();
                $(`quick-${id}`)?.focus();
                return;
            }
            if (['allow-attacks', 'require-attack-response', 'block-attack-response'].includes(event.target.id)) {
                const id = event.target.id;
                const key = { 'allow-attacks': 'allowAttacks', 'require-attack-response': 'requireResponse', 'block-attack-response': 'blockResponse' }[id];
                attackOptions = normalizeAttackOptions({ ...attackOptions, [key]: event.target.checked });
                renderRequirements();
                settingsChanged();
                $(id)?.focus();
                return;
            }
            if (!event.target.matches('input[type="range"]')) {
                return;
            }
            const id = event.target.id;
            if (event.target.dataset.costId) {
                const costId = event.target.dataset.costId;
                const end = event.target.dataset.end;
                const row = event.target.closest('.cost-rule');
                let rule;
                if (costId.startsWith('cost-range-')) {
                    rule = costRanges.find(range => `cost-range-${range.id}` === costId);
                    if (!rule.active) {
                        rule.min = Number($(costId + '-min').value);
                        rule.max = Number($(costId + '-max').value);
                    }
                    rule.active = true;
                } else {
                    rule = costExact[costId] || { min: Number(row.querySelector('[data-end="min"]').value), max: Number(row.querySelector('[data-end="max"]').value) };
                    costExact[costId] = rule;
                }
                rule[event.target.dataset.kind === 'price' ? (end === 'min' ? 'low' : 'high') : end] = Number(event.target.value);
                renderRequirements();
                settingsChanged();
                $(id)?.focus();
                return;
            }
            const requirementId = event.target.dataset.requirementId;
            if (event.target.dataset.end === 'max') {
                requirementCaps[requirementId] = Number(event.target.value);
            } else {
                requirements[requirementId] = Number(event.target.value);
            }
            renderRequirements();
            settingsChanged();
            $(id)?.focus();
        });
        $('requirement-sliders').addEventListener('toggle', event => {
            if (event.target.matches('.requirement-group')) {
                requirementGroups[event.target.querySelector('summary').textContent] = event.target.open;
                save();
            }
        }, true);
        $('requirement-sliders').addEventListener('input', event => {
            if (event.target.matches('input[type="range"]')) {
                if (event.target.dataset.setRow !== undefined) {
                    const input = event.target;
                    input.value = Math.max(Number(input.dataset.floor), Math.min(Number(input.dataset.ceiling), Number(input.value)));
                    $('set-spread-' + input.dataset.setRow + '-' + input.dataset.end + '-value').value = input.value;
                    return;
                }
                if (event.target.dataset.requirementId) {
                    const input = event.target;
                    input.value = Math.max(Number(input.dataset.floor), Math.min(Number(input.dataset.ceiling), Number(input.value)));
                    $(input.dataset.requirementId + '-' + input.dataset.end + '-value').value = input.value;
                    if (input.dataset.end === 'min') {
                        const quick = $(`quick-${input.dataset.requirementId}`);
                        if (quick) {
                            quick.checked = Number(input.value) > 0;
                        }
                    }
                    return;
                }
                if (event.target.dataset.costId) {
                    const input = event.target;
                    input.value = Math.max(Number(input.dataset.floor), Math.min(Number(input.dataset.ceiling), Number(input.value)));
                    const suffix = input.dataset.kind === 'price' ? (input.dataset.end === 'min' ? 'low' : 'high') : input.dataset.end;
                    $(input.dataset.costId + '-' + suffix + '-value').value = input.value;
                    return;
                }
                event.target.previousElementSibling.querySelector('output').value = event.target.value;
            }
        });
        $('requirement-sliders').addEventListener('click', event => {
            const button = event.target.closest('[data-remove-cost]');
            if (button) {
                costRanges = costRanges.filter(range => range.id !== Number(button.dataset.removeCost));
                renderRequirements();
                settingsChanged();
            }
        });
        $('sets').addEventListener('change', changeCollection);
        $('promo-sets').addEventListener('change', changeCollection);
        $('select-all').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            $('collection').querySelectorAll('input').forEach(input => { input.checked = true; });
            changeCollection();
        });
        $('select-none').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            $('collection').querySelectorAll('input').forEach(input => { input.checked = false; });
            changeCollection();
        });
        $('landscape-count').addEventListener('input', updateLandscapeCount);
        $('prophecies').addEventListener('change', event => {
            if (event.target.name !== 'prophecy') {
                return;
            }
            if (options.prophecy === 'exclude') {
                delete requirementCaps['type-omen'];
            }
            options.prophecy = event.target.value;
            renderRequirements();
            settingsChanged();
        });
        $('landscape-count').addEventListener('change', () => {
            options.landscapes = Number($('landscape-count').value);
            settingsChanged();
        });
        $('landscape-types').addEventListener('change', event => {
            const type = event.target.value;
            options.landscapeTypes = event.target.checked ? [...new Set([...options.landscapeTypes, type])] : options.landscapeTypes.filter(item => item !== type);
            settingsChanged();
        });
        $('collection').addEventListener('toggle', () => {
            collectionOpen = $('collection').open;
            save();
        });
        $('promos').addEventListener('toggle', () => {
            promosOpen = $('promos').open;
            save();
        });
        document.querySelector('.picker-content').addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) {
                return;
            }
            replacing = button.closest('.card').dataset.id;
            replacingLandscape = button.closest('.card').classList.contains('landscape-card');
            if (button.dataset.action === 'lock') {
                const card = kingdom.find(item => item.id === replacing);
                if (lockedIds.has(card.id)) {
                    lockedIds.delete(card.id);
                } else {
                    lockedIds.add(card.id);
                }
                const element = button.closest('.card');
                button.outerHTML = lockHtml(lockedIds.has(card.id), card.name);
                const adjusted = renderRequirements();
                updateCardControls();
                save();
                element.querySelector('.lock-state').focus();
                announce(`${card.name} ${lockedIds.has(card.id) ? 'locked' : 'unlocked'}.${adjusted ? ' Requirements adjusted to fit locked cards.' : ''}`);
                return;
            }
            if (button.dataset.action === 'close') {
                button.closest('.card').classList.remove('controls-open');
                button.closest('.card').querySelector('.art-toggle').setAttribute('aria-expanded', 'false');
                button.blur();
                return;
            }
            if (button.dataset.action === 'toggle') {
                const card = button.closest('.card');
                const open = !card.classList.contains('controls-open');
                document.querySelectorAll('.controls-open').forEach(item => {
                    item.classList.remove('controls-open');
                    item.querySelector('.art-toggle').setAttribute('aria-expanded', 'false');
                });
                card.classList.toggle('controls-open', open);
                button.setAttribute('aria-expanded', open);
                return;
            }
            if (button.dataset.action === 'remove') {
                lockedIds.delete(replacing);
                kingdom = kingdom.filter(card => card.id !== replacing);
                cache = {};
                renderRequirements();
                render();
                announce('Card removed.');
                return;
            }
            if (button.dataset.action === 'random') {
                const current = setup?.landscapes.find(card => card.id === replacing);
                const candidates = replacingLandscape ? landscapeReplacementCandidates(db, kingdom, setupPool(), activeOptions(), cache, current) : candidatesFor(replacing);
                if (candidates.length) {
                    replaceWith(shuffle(candidates)[0], false);
                }
            } else {
                const current = (replacingLandscape ? setup.landscapes : kingdom).find(card => card.id === replacing);
                $('dialog-heading').textContent = current ? `Replace ${current.name}` : 'Choose a card';
                $('card-search').value = '';
                renderResults();
                $('card-dialog').showModal();
                $('card-search').focus();
            }
        });
        document.querySelector('.picker-content').addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.target.closest('.card')?.classList.remove('controls-open');
                event.target.closest('.card')?.querySelector('.art-toggle').setAttribute('aria-expanded', 'false');
                event.target.blur();
            }
        });
        $('close-dialog').addEventListener('click', () => $('card-dialog').close());
        $('card-search').addEventListener('input', renderResults);
        $('card-results').addEventListener('click', event => {
            const button = event.target.closest('[data-id]');
            if (button) {
                replaceWith(db.cards.find(card => card.id === button.dataset.id));
            }
        });
        $('copy').addEventListener('click', async () => {
            const text = ['DOMINION KINGDOM', ...kingdom.map(card => `${costLabel(card)} — ${card.name}`), ...(setup.landscapes.length ? ['', 'LANDSCAPES', ...setup.landscapes.map(card => card.name)] : []), '', $('setup').innerText.replace('Copy setup', '').trim()].join('\n');
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const link = Object.assign(document.createElement('a'), { href: url, download: 'dominion-kingdom.txt' });
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                announce('Clipboard unavailable; setup downloaded as a text file.');
            }
        });
    } catch (error) {
        announce(`Unable to load the card catalog. ${error.message}. Use dist/index.html directly, or serve the source folder over HTTP.`, true);
        $('generate').disabled = true;
    }
}

init();
