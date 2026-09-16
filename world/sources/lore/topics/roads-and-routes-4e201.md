# Roads and routes at 4E 201 — what canon attests, and the state of repair

Dossier written 2026-09-16 from a read-only audit (UESP pages named per row;
the vault extract; the project's own `extrapolation/argonia-4e201-state.md`
§6, which this confirms). It feeds `world/sources/routes/registry.json`
(`confidence`, `condition`, `conditionWhy`). Era 4E 201 (decision 0002).

## The chain of reasoning for every state

- Lore:Transportation: during the Interregnum "most of the roads, specially
  in Valenwood and Black Marsh, became overgrown and abandoned", then
  rebuilt by the Third Empire.
- The Argonian Account (Bk 1, 4): the Imperial Commission's forty years of
  "roads, bridges, drainage" made freight slower; the programme was
  abandoned; the Naga left the roads "because there were no merchants
  traveling them to rob"; Argonians "began once again to use the old ways,
  their personal rafts and sometimes the Underground Express".
- Lore:Black Marsh: secession after the Oblivion Crisis (An-Xileel, 4E 6);
  the invasion of Morrowind; Umbriel (4E 48) destroyed Lilmoth and, per our
  dossier, ran over Gideon and Stormhold.
- So by 4E 201 no Imperial maintainer exists anywhere: every "maintained"
  road is a local community keeping an Imperial or Dunmer alignment.
- Closure mechanics canon gives: monsoon closures ("the roads to Gloommire
  are often closed due to the monsoons", blackwood-and-gloommire.md) and
  tidal swamping of Commission bridges (Slough Point).

## Attestation per route

| Route | Attested? | Canon mode | 4E 201 | Sources |
|---|---|---|---|---|
| Gideon–Blackwood Road (trunk) | yes, by name | road | worn; Gloommire legs shut in the monsoon | Lore:Gideon ("the first settlement on the Blackwood Road…"); no page "Lore:Blackwood Road" exists |
| Thorn–Tear road (trunk) | yes (Thorn's neighbour "Morrowind to the north, toward Tear") | road | worn; the live saltrice trade, watched since the invasion | Lore:Thorn; Lore:Black Marsh |
| Stormhold–Thorn (trunk) | extrapolated, adjacency-supported (Tenmar Wall, Riverwalk) | road on an old Dunmer alignment | worn; flagged stretches, unlit Dunmer light posts, patched timber bridges | Lore:Stormhold; regions/secondary-settlements.md |
| Alten Corimont–Stormhold | extrapolated | **waterway** ("on the bank of a waterway, which provides access to the sea"; in 2E "little more than a glorified tavern… docks") | decayed local boardwalk spur, never a city road | Lore:Alten Corimont |
| Gideon–Stormhold | extrapolated (our dossier only) | road plausible (the engineered western half) | decayed; peat-burn country, drainage failed | shadowfen.md (the Great Burn network) |
| Gideon–Soulrest | extrapolated | road part-way, water the rest | broken: bridged and ferried in pieces | Lore:Soulrest |
| Archon–Gideon | extrapolated (owner 2026-08-22) | **river and root** across Middle Argonia ("impenetrable"; rafts, the Underground Express) | broken: firm legs at each end, a marked route dissolving into poled channel in the middle; the crossroads the one kept point | middle-argonia.md; Pocket Guide 3rd Ed/Argonia; The Argonian Account |
| Helstrom–Blackrose | extrapolated; the place link is canon (the Panther River's last fork "right next to… Helstrom") | mostly river; a pilgrim causeway at best | decayed: flagged near Blackrose, planked, then a pole-boat stage; never a highway to the Hist heart | Lore:Helstrom; Lore:Panther River |
| Soulrest–Blackrose | extrapolated | river (Red Bramman's, 1E 1033) | worn lakeside track shadowing the river the boats use | Lore:Soulrest; Lore:Blackrose |
| Blackrose–Lilmoth | extrapolated, well grounded | road | broken south of the prison since Umbriel; abandoned Imperial settlements; a ferried gap | Lore:Lilmoth; Lore:Black Marsh |
| Coast road (track) | extrapolated (was mis-tiered canon-derived) | sea | worn, milestone-counted | Lore:Soulrest (peninsula, Chasepoint) |

Lanes: Stormhold–Alten Corimont (attested in substance), Soulrest–Blackrose
(attested: the Imperial Navy sailed it), Blackrose–Lilmoth (attested: the
south river to Oliis Bay); the sea runs and the Onkobra convoy water are
inferred. All live.

## Defects found and fixed in the registry (2026-09-16)

- The Blackwood Road citation named a page that does not exist; it is Lore:Gideon.
- "The Bogmother causeway" named the Helstrom–Blackrose road; Bogmother is a
  ruin south-west of Stormhold and the canon causeway runs Stormhold–Bogmother.
  The rename waits for 16g’s naming pass, because two catalogue records repeat the name in prose that must be rewritten and text-reviewed with it.
- The coast road's confidence was `CANON_DERIVED` with no attesting page; now `LORE_INFERRED`.

## Open calls for the owner (load-bearing)

1. `argonia-4e201-state.md` §6 puts Alten Corimont ON the northern trunk
   (Stormhold → Tenmar Wall → Alten Corimont → Riverwalk → Thorn); the
   registry makes Stormhold–Thorn direct with a spur to Corimont, and the
   owner's 2026-09-16 steer sends the trunk north of the river. One must win.
2. Archon–Gideon and Helstrom–Blackrose: canon says river and root, not
   road, across the heartland. Keep them as roads (the acceptance rule wants
   eight cities joined by legs that may be ferried), or re-type their middle
   legs to boardwalk-and-ferry with `conditionSections`.
3. Alten Corimont's land link: a local track/boardwalk (class `track`), not a road.
