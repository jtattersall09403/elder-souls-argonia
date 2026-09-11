# Phase 11 touchpoint ① — the place catalogue, owner summary (2026-09-02)

The province-wide catalogue is derived, critiqued (5 adversarial passes),
repaired and verified. This is the Part 2 owner review before anything is
plotted. Full trail: decision 0041; critique docs in
`docs/research/phase11/phase11-critique/`.

## The numbers

**527 live places** (region budgets enforced in `npm test`; envelope 467–596
from the corrected land arithmetic), **272 deferred** (parked with reasons,
revivable at plotting), 1 cut (a canon merge). 227 of 236 place types used;
14 dungeon-entrance kinds; all validators green.

| region | live | flavour in one line |
|---|---|---|
| dunmer-north | 138 | Velothi plantations and the Flu's inward-facing cordon over Argonian marsh |
| imperial-fringe | 121 | Nibenese records-and-roads colonialism, the Owing's walkable chain |
| hist-heartland | 111 | the grown-root interior: sacred, sparse, strange; Helstrom + the Made Ground |
| mercantile-coast | 56 | rebuilt Lilmoth + hollow Soulrest; underwater salvage economy |
| naga-kur-deeps | 39 | black water, bone, drums, blue light; grave discipline |
| saxhleel-coast | 24 | Argonian harbour law over a drowned street grid |
| imperial-penal-south | 21 | the prison economy and its cordons |
| pirate-freeholds | 17 | riverine freeholds with no Hist and no ceremony |

Class mix province-wide: settlement 128 · ruin 61 · lair 57 · sacred 56 ·
transit 52 · lone 45 · works 39 · civic 34 · camp 31 · martial 24.
Danger: D1–D3 carry 399; D4–D5 carry 119 (landmark-heavy, quest-light, as
designed). Importance: 12 tier-0, 90 tier-1.

## The variety story (what the critics forced)

- Eight distinct regional identities with written naming registers and
  signature asset pools (table in `world/sources/catalogue/README.md`).
- Every record has a unique signature feature; zero visual-twin pairs;
  zero duplicate names; region-constant palettes eliminated.
- The interior got its own canon-grounded **grown-root building culture**
  (material-culture.md), distinct from the two coastal kits.
- Dungeon entrances span the full vocabulary (trapdoors, hollow trunks,
  underwater entries, sinkhole lips, grave-cuts…) per the owner's
  entrance-decoupling ruling.
- Discovery is honest to the no-long-sightlines terrain: sightline claims
  cut from 27% to 18%, worst-zone rate from 21.7/km² to 3.4/km².

## Load-bearing calls already made (challenge any of them)

1. **Budget**: Morrowind density applied by danger band (18–22/km² settled,
   8–12 wild), surplus parked not deleted.
2. **Reward scale**: five tiers, `tier-1`…`tier-5` (catalogue README).
3. **The interior root kit** and the three-culture never-blend rule.
4. **Xal-Krona's lair** authored as "The Made Ground" — the sap-flooded
   basin where the Hist made the Last Warden, D5, with the stand-down
   variant for the main quest's MEND path.
5. **Tenmar Wall merged into Ten-Maur-Wolk** (they are canon-identical),
  with a new market town carrying the road function.

## Decisions that are YOURS (also in 0041 Owner Q&A)

1. **Player stronghold A/B**: Xal-Meeruth Station (deep interior, remote,
   sacred-adjacent, hard to supply) vs Rockpoint (pirate coast,
   canon-named, connected, commercially entangled). Both reserved; pick
   one (or keep both plotted and decide at Part 6).
2. **Hero-Hist reserves**: the ten-tree roster is set; First-Rain Trunk and
   Black Fin Grove are reserves with empty power slots — swap freely.
3. **Raft eyeball** (from sourcing): do the plank ferries read as Argonian
   rafts? (Screenshots on request; low stakes now that a true raft + canoe
   are sourced.)
4. **Environment tweaks requested under your permission** (systems-side,
   not yet applied): black water for naga-kur-deeps; a committed tidal
   amplitude for Oliis Bay.
5. **Naga-kur-deeps holds 39 live vs a 32 ceiling** — pushing lower would
   gut type variety; residue goes to Part 3's homeless review. Accept or
   direct a harder cut.

## Known-open (not blocking your review)

Scour-detector relaxation before Part 3 (flood-high etc. saturated);
9 unspent poi types; era back-fill is shallow on 304 records ("current"
only); the 113 district/dressing-scope types are Part 3/compiler work;
BM&V extraction queue for two landmark records; one ID-rename wish
(archon-thalmor-post) awaiting a migration mechanism.

## Next

Part 3: macro plot — every live record gets an approximate position on the
2D map (importance order, causal density gradient, deferred batch review),
then agent QA, then **touchpoint ②: you review the whole plotted province
in the studio map** (the layer is already built — `?cat=1`).
