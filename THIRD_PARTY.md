# Data and artwork credits

Dominion is by Donald X. Vaccarino and Rio Grande Games. This is an unofficial fan tool. Card names, rules and artwork belong to their respective owners. Artwork is loaded remotely from the [Dominion Strategy Wiki](https://wiki.dominionstrategy.com); it is not bundled or relicensed by this project.

The primary catalog is a snapshot of [sgraaf/dominion-setup](https://github.com/sgraaf/dominion-setup), which derives its records from the wiki. Its GPL-3.0 license is preserved in `data/upstream/LICENSE` (and `DATA-LICENSE.txt` in the build). The derived `data/cards.json` is distributed under GPL-3.0. Exact source revisions are recorded inside that file. The original per-expansion JSON snapshots and the generator used to normalize them are included in this repository. Upstream Python files are retained for reference only; the app does not execute them.

Supplemental historical setup and category fields come from [KLongmuir/dominion-card-data](https://github.com/KLongmuir/dominion-card-data), copyright 2022 Kevin Longmuir, MIT license; see `data/source-LICENSE`. Its complete original `data.json` is preserved as `data/source-cards.json`.

The app's original HTML, CSS and JavaScript use this repository's MIT license. That license does not replace the separate licenses and rights covering the catalog and artwork.

The optional Google Fonts stylesheets supply DM Sans and Libre Baskerville under their open font licenses. System font fallbacks work without network access.

The face-down slot artwork is the wiki's [Randomizer.jpg](https://wiki.dominionstrategy.com/index.php/Special_cards#/media/File:Randomizer.jpg), downloaded from its [direct image file](https://wiki.dominionstrategy.com/images/6/65/Randomizer.jpg) and embedded in the standalone HTML. Its artwork rights remain with the original owners.

Expansion symbols are the official icons hosted by the wiki, referenced from its [Sets page](https://wiki.dominionstrategy.com/index.php/Sets). They are stored in `assets/symbols/` and embedded in the HTML build. Exact image source URLs are recorded in `data/set-symbols.json`; original artwork rights remain with the respective owners.
