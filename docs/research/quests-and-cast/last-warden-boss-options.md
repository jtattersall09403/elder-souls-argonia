# Last Warden final boss — creature options research

Researched 2026-08-28 (owner question: is there a lore-consistent final boss
where skeleton, meshes, textures, animations and moveset are all *known*
obtainable?). Outcome adopted in decision 0030: **the Last Warden is an
ancient Xal-Krona (Argonian Behemoth)**; the Mihail wamasu is deferred to an
optional overworld legendary. Consumers: quests 30 §19/MQ29, quests 70 §52
A06, world 90 §78, lore topics/fauna-hazards.md.

## The chosen build (verified in-vault, nothing to source)

- **Rig + moveset:** vanilla `werewolfbeast` — **121 clips** confirmed in the
  vault's `Skyrim - Animations.bsa`: left/right/fast/low attacks, power combos
  with backhand finishers, 8-direction run-attack syncs, all-fours sprint +
  sprint attacks, 3 howls (re-flavour: root-shaking call), combat idles,
  staggers, **bleedout start/idle/getup** (the non-lethal stand-down state,
  already animated), death, paired killmoves. Richest creature moveset in
  Skyrim after the dragon. `skeleton.nif` in `Skyrim - Meshes.bsa`.
- **Body:** the ingested BM&V pool contains giant reptilian bipeds rigged to
  this exact skeleton — `meshes/actors/werewolfbeast/character assets/
  daedroth.nif` + three **armoured** variants (`daedrotharmored00–03`, an
  ancient-bound-guardian dress for free) + `dragman_swamp.nif`; 58 daedroth
  texture files in part2. Re-texture: Argonian scale + amber Hist-sap
  emissives, scaled up. Pure re-material class.
- **Adds (optional):** vanilla spriggan rig (68 clips incl. `idle_kneel_loop`
  — a guardian *waiting* — and `ambush.hkx` rising from root cover); BM&V has
  `bottreant.nif`/AncientSpriggan variants on the rig.
- **Freshness:** no werewolves exist anywhere in the plan, so the player has
  never fought this rig.
- **Lore:** [Lore:Argonian Behemoth](https://en.uesp.net/wiki/Lore:Argonian_Behemoth)
  — Hist-created through sap, "often created for a reason" (Dead-Water made
  one to test young warriors), immense strength, corrosive spew, sentimental/
  proud, **speech-capable** in fragmentary third person. Grounding note added
  to lore topics/fauna-hazards.md. Flavour change from the wamasu:
  environmental lightning → Hist-sap surges + corrosive spew (both canon).

## Why the wamasu was demoted

[Mihail Wamasu SE 158860](https://www.nexusmods.com/skyrimspecialedition/mods/158860):
real and animation-complete, but — custom twice-modified Megalania-derived
skeleton (hardest conversion class; no vanilla fallback pool if any clip is
missing/broken); clip inventory unknown until extraction (several signature
attacks are Skyrim magic effects, not clips); **sound files credit CD Projekt
Red** — legally the shakiest asset in the plan and mandatory to replace.
Lore fit was genuinely good (Lore:Wamasu; Haynekhtnamet of Shadowfen as the
venerated-individual precedent) — keep it as a possible overworld legendary
later, never on the critical path.

## Rejected alternatives (for the record)

- **Werecrocodile** (canon, Black Marsh; rigged mesh exists via gg77/Dogtown1
  oldrim mods): a Hircine werebeast guarding a Hist sanctuary is a lore
  contradiction — wrong divine allegiance. Excellent *side-quest* cryptid.
- **Giant crocodile:** no vanilla croc; Mihail's crocodile rides the
  slaughterfish (swim-only) skeleton — unusable in a dry-islands arena.
- **BM&V exotic actors (sload, dreugh, gehenoth):** mesh-only in the vault
  manifest (only `actors/snakes` ships HKX) — not boss-capable without a
  sourcing gamble. Their folder placement still documents which vanilla rig
  each fits.
- **Chaurus/ash-spawn re-skins:** complete rigs, hard lore mismatch, thin
  boss movesets.
- **Undead First-Era warden (draugr/dragon-priest rig):** most-proven rigs,
  but Argonian funerary lore treats necromancy as abomination — an undead
  warden of the Hist's own sanctuary needs heavy lore surgery, and a humanoid
  finale loses the never-fought-this wonder. Emergency fallback only.
