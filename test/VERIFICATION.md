# Verification — 2026-10-25

Presets: all 29 tests pass. Added tests for the requirements-only snapshot whitelist and deep copy, exact Balanced Game minimums, zero-constraint Completely Random state, and feasibility / repeated matching draws for all five built-ins using Dominion second edition alone. Browser-verified Balanced values (1 / 1 / 1 keywords, cost minimums 1 / 1 / 3 / 2, three $2–$3 piles), saving My Balanced Game, loading Completely Random, restoring the custom preset, and persistence across reload. Sets and landscape values remained unchanged, with ten backs throughout.

Streamlined layout and reveal: all 26 tests pass. Browser-verified 14 flip wrappers for ten Kingdom cards plus four landscapes, with delays increasing by 130 ms, followed by complete wrapper cleanup. Copy setup is inside Bring to the table, no visible status area remains, and selected landscapes are omitted from Extra cards & piles. The header stays on one line at 390 px with no horizontal overflow; Sets replaces the old collection label. Reduced-motion CSS/JS paths bypass the reveal. Routine ready/copied messages were removed, while actionable errors retain a separate hidden-until-needed alert.

Cost Spread: all 26 tests pass. Added repeated constrained draws with exact costs and overlapping intervals, minimum/maximum feasibility limits with locked cards, and exhaustive comparisons covering 125 lower/upper/fixed-card combinations. Browser-verified an exact two-$2 requirement, a $3–$5 count band capped at 2–4, two active custom rows plus an automatically appended blank row, generated card costs, and persistence across reload while the board stays face-down. Exact-cost rows with fewer than two owned piles are hidden. Default endpoints matched the collection's $2–$8 range.

Landscape controls: all 24 tests pass. Browser-verified that Menagerie exposes only Events and Ways, count 4 shows the two-landscape recommendation, disabling Events produces four distinct Ways rendered beneath ten kingdom piles, and symbols load correctly. The count defaults to zero; required Allies / Prophecies remain automatic. Lock buttons measure 27 px instead of 36 px (75%), with 15 px symbols instead of 20 px. Removed Platinum / Colony and Shelter filters and the extra-base-Treasure suffix from Supply entries.

Expansion pills: browser-verified ten pills with embedded, successfully loaded wiki symbols and no old card-detail blocks. Card overlay controls and lower-right lock buttons remain over the artwork. All 19 expansion / standalone icon assets were downloaded from the wiki; Menagerie and Plunder use filenames with `(expansion)`. All 23 tests pass. Victory pile counts moved from card footers to the setup checklist.

Current lock controls: bottom-right accessible toggle buttons replace the earlier read-only indicators. Browser-verified locking and unlocking changes aria-pressed true / false without changing cards, and the renamed Pick Kingdom Cards button follows Game options. The 2+ draw filter matches Smithy, Moat and Laboratory while excluding Village and Market; all 23 tests pass.

Button-only generation and locks: 23 passing tests. New coverage verifies repeated constrained generation preserves fixed manual choices, excludes duplicates, adjusts maxima around locked cards, and rejects duplicate/unowned locks or impossible combinations. Browser checks: ten exact wiki Randomizer.jpg backs on load, reset/settings changes do not generate, choosing Village before generation leaves nine backs and one locked card, Generate fills ten unique piles while retaining Village, changing draw requirements leaves the board unchanged, subsequent generation preserves the lock, clicking its icon does not unlock it, and reload returns to ten backs. Hover/tap controls are stacked over the art and have a close control plus keyboard access. The randomizer back is embedded so placeholders do not require network access.

Requirement sliders: 22 passing tests, including 250 generated small collections checked against exhaustive enumeration, 60 constrained draws, multi-type overlaps, impossible combinations, and replacement filtering. Browser check with Dominion only: requiring ten Actions reduces Treasure and Victory maxima to zero; +2 Actions caps at two, draws satisfy both minimums, and values survive reload. Sliders cover all 25 selectable Kingdom types and 19 common effects / keywords. Types and keywords with no matching piles in the collection are hidden; those present remain visible and disabled when other minimums reduce their maximum to zero. Each slider shows both its constrained maximum and total matching piles available in the collection.

Pile-count update: 17 passing tests. Added coverage for Province counts through six players, Curses / Ruins through six players, Colony and Kingdom Victory pile counts, and combined Heirloom / Shelter starting decks. Inline counts replace general pile reminders; unchanged starting decks produce no setup note. Counts checked against the publisher's [base rules, pages 3 and 9](https://www.riograndegames.com/wp-content/uploads/2016/09/Dominion2nd.pdf) and [Prosperity rules](https://www.riograndegames.com/wp-content/uploads/2022/05/Prosperity2nd.pdf). The current base rules use all available basic Treasures, including extra copies for 5–6 players, rather than one fixed stock size.

Collection UI update: browser-verified one checkbox per expansion, latest-edition defaults, switching Dominion to first edition and retaining that choice on reload, collapsed collection persistence, promos collapsed by default, and conditional options. Dominion alone hides the options box; Prosperity shows only Platinum / Colony; adding Dark Ages and Menagerie exposes Shelters and landscapes. Removed heading subtitles. All 15 automated tests still pass after rebuilding.

`node --test`: 15 passing tests, including 1,000 random draws and 100 complete randomized setups. Covers database references and mixed piles, edition unions and exclusions, separate Cornucopia / Guilds ownership, individual promos, cost ordering, replacement uniqueness, impossible Bane warnings, recursive extra piles, mats and tokens, Boons, Hexes, Heirlooms, Horses, Loot, Allies, Prophecies, Colony / Shelters, cached choices, and exact script preservation in the static build.

Browser checks on the built `dist/index.html`, served over loopback HTTP:

- Initial ten-pile kingdom renders and sorts by cost / name.
- Manual search for Witch offers a single eligible result; choosing it replaces the correct card and keeps ten piles.
- Random replacement removes the outgoing card and keeps ten piles.
- Clearing ownership disables generation and displays an explicit empty-selection message.
- Selecting only Menagerie generates only Menagerie piles; setup lists Horses and Exile mats for the appropriate cards.
- Reload preserves the exact selected kingdom and collection.
- 390 × 844 viewport: collection controls remain usable, with no horizontal overflow.
- Direct wiki artwork loads successfully; failed images show card text instead. All 855 card-page image URLs were resolved from public wiki metadata.
- Self-contained HTML build embeds styles, executable code and catalog; no runtime JSON fetch is necessary.

The wiki's HTML / image redirect endpoints presented an anti-bot page. Reading public Open Graph metadata supplied working direct image-file URLs; no challenge was solved or bypassed. Image availability remains dependent on the wiki.

Setup data uses the requested repository snapshots. Sun-token quantities were cross-checked against the publisher's [Rising Sun rules](https://www.riograndegames.com/wp-content/uploads/2024/04/DomRisingSunRules.pdf). The checklist is not an automated game-rules interpreter; special pile quantities and large-player games remain governed by the rulebooks.


Attack controls: 36 tests pass, including conditional response feasibility against exhaustive enumeration, locked attacks, cost caps, indirect attacks and blockers, and attack-free optional setup. Browser verified Allow Attacks disables the Attack slider and hides response controls; requiring a blocker with an Attack in Dominion adds Moat; Prosperity permits general responses but disables the blocker checkbox. No browser console errors.

Requirement ranges: 37 tests pass. Added preset round-trip and 100 constrained draws enforcing type and keyword caps. Browser verified zero Attack maximum, simultaneous trash minimum / maximum, successful generation without Attacks, and values preserved after reload; no console errors.
