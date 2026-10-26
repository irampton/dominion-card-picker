# Dominion kingdom picker

A buildless static app that chooses ten unique kingdom **piles** from your owned expansions and editions, sorts them by coin / Potion / Debt cost and then name, and lets you randomly or manually replace any pile. Collection choices, requirements, edition dropdowns, and collection / promo collapse states are saved in browser local storage when available. Each expansion has one ownership checkbox and defaults to its latest edition. Promos start collapsed beneath expansions. A separate Landscapes box offers a count slider from 0–4 (default 0) and Events, Landmarks, Projects, Ways and Traits checkboxes, visible only for types in selected expansions. A note appears at 3 or 4 that only two are recommended. Chosen landscape images appear below the ten kingdom piles. Platinum / Colony and Shelters use automatic setup determination without manual filters.

Each page load starts with ten face-down randomizer backs. Generation happens only when the full-width Pick Kingdom Cards button below Landscapes is clicked; changing selectors keeps the current cards and marks settings pending. Hover a card, focus it with the keyboard, or tap it to show stacked controls. Manually choose cards into empty slots or replace existing cards; chosen cards sort into place and are locked for the current session. Click the bottom-right lock button to lock or unlock a card. Picking redraws only unlocked cards and respects requirements with the locked piles included. Explicit Choose, Random, or Remove controls can change a locked card; Random produces an unlocked replacement. Reloading resets the board, retaining collection/settings preferences. The 2+ card draw requirement matches explicit printed +2 Cards or higher, or draw instructions with an explicit count of at least two; conditional effects are included.

Each face-up card shows only its artwork and a floating expansion-name pill with the wiki's expansion symbol. Symbols are bundled in the standalone HTML. Variable Victory pile quantities remain in the setup checklist. `data/set-symbols.json` records icon provenance; `node scripts/refresh-symbols.mjs` refreshes the local icon files from the wiki.

The top bar displays Dominion Kingdom Picker on one line; the collapsible collection panel is named Sets. New picks reveal unlocked Kingdom cards first, followed by landscapes, with staggered CSS flips from the randomizer back. Locked cards remain face up. Image decoding is given up to two seconds before the reveal starts; reduced-motion preferences skip the animation. There is no visible routine status area. Errors still appear when action is required. Copy setup sits at the top right of Bring to the table and includes landscape names in the copied text without repeating them under Extra cards & piles.

## Run and deploy

Requires Node.js 20+ for development; no packages to install.

```sh
npm test
npm run build
npm run dev
```

Visit `http://127.0.0.1:4173` for the source app or `http://127.0.0.1:4173/dist/` for the built app. **`dist/index.html` can also be opened directly from disk.** It embeds the code, styles and full database. Only card images and optional web fonts need a network connection; blocked images fall back to readable card rules.

Upload the contents of `dist/` to Apache, GitHub Pages, or another static host. No backend, routes, secrets or build service is required. Keep the credits and data-license files alongside the HTML. The readable JSON is also included at `dist/data/cards.json` for future integrations.

## Catalog

`data/cards.json` is the local database: 855 records, including 498 selectable kingdom piles, through Rising Sun, plus landscapes, mixed-pile members, basic cards, and support cards. Each record includes edition membership, structured cost, types, rules, wiki page and image URL, dependencies, setup text, and materials. The source and exact revisions are recorded in the JSON. `npm run data` deterministically rebuilds it from checked-in source snapshots; `npm run build` embeds the current database in the distributable HTML.

Kingdom selection never includes individual split-pile members, basic cards, landscapes or non-Supply cards. Selecting both editions uses a union, without duplicating shared piles. Cornucopia & Guilds is available as a combined product in either edition; first-edition Cornucopia and Guilds can also be selected separately. Promos are selected individually. For mixed piles, sorting uses the randomizer / top-card cost. Potion and Debt costs are incomparable in the game rules; this app uses a deterministic coin, Potion, Debt ordering for presentation only.

## Setup coverage

Under Card types, Allow Attacks defaults to checked. Turning it off excludes Attack piles, including attacks in split piles, upgrade chains, Loot, and extra setup piles. Require Attack Response conditionally requires a response when an attack is selected. General responses include attack-triggered reactions and reactions to gaining, discarding, trashing, or revealing; their usefulness depends on the specific attack. Require Response to Block Attack restricts this to Moat, Lighthouse, Guardian, Champion (through Page), or Shield (through Loot). Having those support cards available does not guarantee players will acquire them. Unavailable response options are disabled. These controls persist locally and are included in requirements presets; they default to off except Allow Attacks.

The Preset section saves and loads only Kingdom requirements: type / keyword minimums, exact-cost minimums and maximums, and active cost bands. Sets, editions, landscape settings, locked cards and the current board are excluded. Built-ins are Completely Random, Balanced Game, Engine Builder, Deck Control, and Attack & Defend. Balanced Game uses minimums of one +2 Actions pile, one trash-keyword pile, one 2+ draw pile, one $2 pile, one $3 pile, three $4 piles, two $5 piles, and three piles in $2–$3. Save a trimmed name to create a local custom preset; saving the same custom name updates it. Built-in names cannot be overwritten. Presets are stored separately in local storage, so the save survives reloads. Loading never picks cards. An incompatible collection or locked selection is reported without changing the requirements.

Cost Spread is the third Kingdom requirements section. Each coin cost from $1–$9 appears only when at least two owned Kingdom piles match. Its paired handles set an inclusive minimum / maximum count. Repeating cost-band rows pair a count range with a coin-cost interval; using the blank row adds another beneath it. Intervals start at the lowest and highest positive coin costs in the collection, capped to $1–$9. Both count limits and cost endpoints are keyboard- and touch-operable, with clickable Minimum / Maximum labels to focus overlapping handles. Remove range deletes a custom rule; Reset to zero clears all cost rules as well as type / keyword minimums. Cost rules are saved locally and enforced jointly during generation and manual selection, including locked cards. Overlapping intervals count a matching pile in each rule. Cost matching uses the printed coin portion, so extra Potion or Debt costs do not change its bracket. Requirements count Kingdom piles, not individual cards within a pile.

Kingdom requirements default to zero and are saved with the collection. Sliders cover every type found on a selectable Kingdom randomizer, plus +Actions, +2 Actions or more, trashing, drawing, +Buys, +Coins, gaining, discarding, revealing, Exile, Coffers, Villagers, Favors, victory tokens, Horses, Loot, setting aside, shuffling, and looking at cards. Keyword matching uses printed randomizer text, including conditional effects; it does not infer outcomes from other cards or mixed-pile members. Requirements count only the ten selected kingdom piles, not bonus piles or landscapes. One pile may satisfy several minimums. Exact joint feasibility determines each slider's maximum, accounting for all other selected minimums and the owned collection. New kingdoms and both replacement methods preserve these minimums. Collection changes lower unsupported minimums with a status message. Reset to zero clears them all.

The setup checklist includes the basic Supply (including Curses), required non-Supply cards, mixed-pile setup, Heirlooms, mats and tokens. It recursively resolves Bane, Ferryman, Riverboat, Mouse, Approaching Army, Black Market, Allies, Prophecies and Druid Boons. Optional landscapes are drawn only from selected editions. Required Allies and Prophecies are drawn when their associated kingdom cards appear. Platinum/Colony and Shelters can be forced or chosen using the standard proportional randomization. Choice caching preserves eligible setup choices across swaps.

The Black Market deck uses 15 distinct unused piles from the collection; take one physical card per pile. For mixed piles choose one member; the checklist conservatively includes all member dependencies. It is a preparation aid, not a rules engine. Follow printed rules for pile quantities, large-player games, and optional card interactions. If an owned collection cannot supply a required extra, an explicit warning appears rather than silently drawing from an unowned set.

## Structure and future changes

- `engine.js`: DOM-free selection and setup rules, tested with Node's test runner.
- `app.js`, `index.html`, `styles.css`: accessible, responsive interface with a searchable replacement dialog and setup export.
- `scripts/build-data.mjs`: normalization and dependency metadata. Add rules here for new cards or editions.
- `scripts/build.mjs`: self-contained static distribution.
- `data/upstream/`: primary source snapshots, license and reference files.
- `data/wiki-images.json`: direct wiki artwork URLs resolved from public card-page metadata. `node scripts/refresh-images.mjs` refreshes them (network access required); rebuild the database afterward.

See [THIRD_PARTY.md](THIRD_PARTY.md) for data licensing and artwork credits. Updating the catalog should include review of edition counts, new split-pile membership, material triggers and recursive setup tests. The schema is versioned for future additions such as named saved kingdoms, exclusions and shareable URLs.


Card type and keyword requirements use paired minimum / maximum sliders. Maximums default to the available feasible count, account for overlapping rules and locked cards, and persist in local settings and presets. Reset to zero clears custom maximums as well as minimums.
