# Part 4 step 2 — region repair brief (owner feedback round, 2026-09-03)

The brief every per-region repair agent works from. One agent per region file
(`world/sources/catalogue/places-<region>.json`); the lead re-plots after all
eight report. Rulings and context: decision 0041 § Part 4 step 2.

## Read first (and only)

1. `world/sources/catalogue/README.md` — the schema v2 section, the naming
   register and signature pool for YOUR region.
2. `world/sources/sites/semantic-audit.md` — filter to your region's rows.
3. `world/sources/sites/macro-plot.md` § Owner-feedback checks — your cities'
   hinterland purpose coverage, rest-cadence gaps, hostile counts.
4. `docs/research/place-purpose-hostility-and-dungeon-balance.md` §2–§6 (the
   vocabularies, the dungeon target per region, the hostility model).
5. `docs/text/style-guide.md` §voice + your region's row in
   `docs/text/culture-registers.md` — you are writing prose; write it in
   register, plainly, never in AI voice (banned constructions: quests 60 §45e.1).
6. Lore: `world/sources/lore/` dossier for your region and cities; UESP via
   the API for gaps (cite page names).

## What to do, per record (live records only — status ≠ deferred/cut)

1. **Resolve every semantic-audit finding** for the record: `move` (edit
   `sitingPrefs` — landform/region wishes, hard constraints, a named
   neighbour; never a position), `rewrite` (change the identity text so it is
   true of the ground it landed on), `swap` (set this record `deferred` and
   promote a reserve record — status `deferred` → `active` — whose identity
   fits that ground; move any `relationsReserved` edges back to `relations`
   for promoted targets), or `cut` (status `cut`; ids never disappear). Prefer
   rewrite for low-value fill, move/swap for named or quest-bearing places.
2. **Review the four v2 blocks** the migration guessed: `playerPurpose`
   (primary/secondary/impact and a real one-sentence `hook` in register — then
   set `reviewed: true`), `hostility` (baseline; add `flips` where a quest,
   faction rank, crime, deed or season plausibly turns the place; set
   `owner` to a faction id where one exists), `interior` (kind/family/size/wet
   fraction/entrance count; `kind: none` only if there is genuinely nothing to
   enter), `contents` (≤4 slots each: who and what is actually there — Black
   Tarn's "something old" becomes a named creature slot with role and danger).
3. **Rewards**: `rewardProfile.kinds` from the 20 typed values only.
4. **Routes and boats**: `relations.patrols`/`tolls` and `travelServiceEdges`
   use `world/sources/routes/registry.json` ids. Any water-touching M3+
   settlement, landing or port gets a `travelStation` with real
   `destinations` (other stations, reachable by water), so the boat network is
   a connected graph per coast/river. Add `route.track.*` entries to the
   registry (with `solved: false`) for a named minor route your records
   depend on.
5. **Dungeon and hostility balance** (research §2 targets for your region):
   convert repetitive low-value fill (same family within 1 km, `impact: mild`,
   `importanceTier 4`) into dungeon-like places (a delve, a wreck with an
   underwater entrance, a warren) or hostile camps with a stated owner and a
   reason to be there; do not exceed the region target; keep ≤25 % of
   interiors wet-majority.
6. **Hinterland collections**: read your cities' ring counts in the plot
   report. If a city edge ring holds things that are not city-edge things
   (villages, lairs, hostile camps), change their siting wishes or cut/swap;
   if a hinterland lacks a core purpose (delve, combat, lore, rest, resource)
   add or convert one.
7. **Enclaves** (dunmer-north, imperial-fringe, mercantile-coast): follow
   `docs/research/minority-enclaves-lore.md` — pull the two Gideon estate
   records toward Gideon; scattered minorities keep a stated personal reason.
8. **Region-specific asks** are listed below.

## Hard rules

- IDs are permanent; new records use `place.<region>.<slug>` and must validate
  (`python3 -m worldgen.catalogue --check` from `tooling/world-generation`;
  run it before you report — it must print OK).
- Never write `position`, `positionM`, `plotFacts`, `whySiteWon`,
  `candidatesConsidered` — the plot owns them.
- Keep the region's naming register; `assetPlan` from `asset-aliases.json`
  (new: `imperial-keep`, `hlaalu-domestic`; lowland records use the
  tropicalised kits by default; `vanilla-farmhouse` only where the README's
  signature pool allows it — saxhleel-coast and hist-heartland never).
- Prose: British spelling, no em-dash chains, no AI voice, no phonetic accents.
- Budget: the province envelope is 467–596 live records; report your live
  count before/after.
- Do not touch other regions' files, `macro_plot.py`, or `catalogue.py`.
  Write only your region file (through `catalogue.dump_json`) and, if needed,
  `world/sources/routes/registry.json` (append, keep valid).

## Region-specific asks

- **pirate-freeholds** (the start): add live records for the penal work barge
  and work camp on the Corimont water (MQ01, docs/quests/30 — the Owing gang,
  processing, the attack), un-defer or replace The Hiring Yard, add a trivial
  first dungeon (D2, 5–15 minutes, three weak enemies, one reward) 150–400 m
  from the barge, a vantage inside 250 m seeing Tearmouth / Stormhold's
  terraces / the Helstrom convoy dock, and re-tier or re-site Medusa Wood
  (D5) and The Unmade Work (D4) outward; keep The Wading Ground as the one
  telegraphed hostile quadrant. Zero hostile camps today — this is a pirate
  freehold; fix that.
- **hist-heartland**: add **the falling mage** (cast roster §58: a body arcs
  out of the sky in an obscure corner far from any road; on it the jump
  scrolls and a triumphant letter) as a `lone / curiosity`, `discovery: none`,
  siting hint remote, `impact: real`, `unique-item` reward.
- **mercantile-coast**, **imperial-penal-south**: dungeon share is ~10 %; the
  coast wants wrecks, drowned villas, sea-cave and seabed-trapdoor entrances;
  the penal south wants the prison's outworks, cordon cellars, flooded
  workings.
- **saxhleel-coast**: 14 records use `vanilla-farmhouse` against the README's
  own *avoid* — replace with stilt/quay/shack kits.
- **imperial-fringe**: Gideon's civic/military records switch to
  `imperial-keep` (+ `hlaalu-domestic` for the domestic tier); tighten the
  two estate records toward Gideon; the four Tear-road/Blackwood-road
  patrol records reference registry ids.
- **dunmer-north**: 228 audit findings, the most; six D2 villages sit in band
  5 (the plot will now refuse that — give them honest danger or honest siting
  wishes); Ten-Maur-Wolk's junction claim is false on the map (rewrite or move).
- **naga-kur-deeps**: the deep interior stays sparse and lethal; hostile
  baseline is the norm here — check the sanctuaries are D≤3 or marked
  `environmentalDanger`.

## Report (≤20 lines)

Live count before/after; findings resolved by class (move/rewrite/swap/cut);
records added/promoted/cut by id; dungeon-like and hostile-baseline counts
before/after; travel stations added; anything you could not resolve and why.
