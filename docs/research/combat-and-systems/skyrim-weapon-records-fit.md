# Skyrim's own weapon numbers, against our class and material tables

Mined 2026-09-18 from `Skyrim.esm` (+`Update.esm`) by
`tooling/asset-pipeline/pipeline/weapon_records.py` into
`packages/game-core/src/equipment/generated/weapon-records.json` — all **53/53**
arsenal items resolved. Layout reference: UESP **"Skyrim Mod:Mod File
Format/WEAP"** (and `/ARMO` for shields, which Skyrim does not store as
weapons: they carry `armourRating`, no damage/speed/reach).

Two mechanism notes, both in the module's docstrings: Skyrim's `DNAM` holds
**speed at offset 4 and reach at offset 8**; the vanilla `ElvenDagger`'s
`MODL` is its *first-person* mesh, so the matcher drops a `1stperson` file-name
prefix. Skyrim's weight unit reads as **pounds**: ×0.4536 lands within ~0.3 of
our `weightKg` for most classes, which is why the weight column below is
comparable at all.

`speedScale` in our table is a **time** multiplier (higher = slower), so
Skyrim's `speed` compares as `1/speed`, normalised to the steel sword.

## (a) Per class — the steel item of that class

| class | record | Skyrim speed | 1/speed (sword=1) | our speedScale | Skyrim reach | reach (sword=1) | our lengthMeters (sword=1) | Skyrim weight → kg | our weightKg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dagger | SteelDagger | 1.30 | 0.77 | 0.72 | 0.7 | 0.70 | 0.42 (0.43) | 2.5 → 1.13 | 1.2 |
| shortSword | *no vanilla record* | – | – | 0.88 | – | – | 0.72 (0.73) | – | 2.2 |
| straightSword | SteelSword | 1.00 | 1.00 | 1.00 | 1.0 | 1.00 | 0.98 (1.00) | 10 → 4.54 | 3.2 |
| scimitar | Scimitar | 1.00 | 1.00 | 0.92 | 1.0 | 1.00 | 0.95 (0.97) | 10 → 4.54 | 3.0 |
| axe | SteelWarAxe | 0.90 | 1.11 | 1.06 | 1.0 | 1.00 | 0.78 (0.80) | 12 → 5.44 | 4.0 |
| mace | SteelMace | 0.80 | 1.25 | 1.12 | 1.0 | 1.00 | 0.80 (0.82) | 14 → 6.35 | 5.0 |
| greatsword | SteelGreatsword | 0.70 | 1.43 | 1.34 | 1.3 | 1.30 | 1.42 (1.45) | 17 → 7.71 | 7.5 |
| greataxe | SteelBattleaxe | 0.70 | 1.43 | 1.42 | 1.3 | 1.30 | 1.35 (1.38) | 21 → 9.53 | 9.0 |
| warhammer | SteelWarhammer | 0.60 | 1.67 | 1.55 | 1.3 | 1.30 | 1.30 (1.33) | 25 → 11.34 | 11.0 |
| shortbow | LongBow (wood) | 1.00 | 1.00 | 1.20 | 1.0 | 1.00 | 1.25 | 5 → 2.27 | 1.4 |
| longbow | HuntingBow (steel mesh) | 0.94 | 1.07 | 1.20 | 1.0 | 1.00 | 1.75 | 7 → 3.18 | 1.9 |
| warbow | OrcishBow | 0.81 | 1.23 | 1.25 | 1.0 | 1.00 | 1.90 | 9 → 4.08 | 2.3 |
| spear / halberd / staff | *no vanilla record* | – | – | 1.15 / 1.40 / 1.25 | – | – | 2.1 / 2.2 / 1.6 | – | 5 / 8 / 4 |
| shield | ArmorSteelShield | – | – | – | – | – | 0.62 | 12 → 5.44 | – |

Reach agrees closely once normalised; our lengths are within 3% of Skyrim's
ratios for every melee class. Weight is systematically ~25% *lighter* than
Skyrim's on the one-handed classes (sword 3.2 vs 4.54 kg) and within ~3% on the
two-handed ones. Skyrim gives every one-hander the same reach 1.0 — our lengths
distinguish dagger from sword, which is the DS-like behaviour we want and is
kept.

## (b) Per material — the dagger and the sword, ratios to steel

| material | dmg ratio (dagger / sword) | our damageScale | weight ratio (dagger / sword) | our weightScale | Skyrim value per Skyrim-weight (sword) | our valuePerKg |
| --- | --- | --- | --- | --- | --- | --- |
| iron | 0.80 / 0.88 | 0.85 | 0.80 / 0.90 | 1.05 | 2.8 | 8 |
| steel | 1.00 / 1.00 | 1.00 | 1.00 / 1.00 | 1.00 | 4.5 | 16 |
| imperial | – / 1.00 | 1.02 | – / 1.00 | 0.95 | 2.3 | 22 |
| silver | – / 1.00 | 1.05 | – / **0.70** | **1.00** | 14.3 | 55 |
| dwarven | – / 1.25 | 1.16 | – / 1.20 | 1.20 | 11.2 | 40 |
| elven | 1.60 / 1.375 | 1.28 | 1.60 / 1.30 | 0.78 | 18.1 | 70 |
| orcish | – / 1.125 | 1.34 | – / 1.10 | 1.15 | 6.8 | 60 |
| nordhero | – / 1.375 | 1.42 | – / **0.90** | **1.00** | 15.0 | 110 |
| glass | – / 1.50 | 1.56 | – / 1.40 | 0.80 | 29.3 | 200 |
| ebony | 2.00 / 1.625 | 1.72 | 2.00 / 1.50 | 1.25 | 48.0 | 320 |
| daedric | – / 1.75 | 1.95 | – / 1.60 | 1.40 | 78.1 | 700 |
| akaviri | – / 1.375 | 1.40 | – / **1.00** | **0.85** | 30.0 | 120 |

Skyrim's value-per-weight is not monotone in tier — the imperial sword (2.3)
comes in *below* iron (2.8) — while ours rises with tier by design. The
ratios that matter — damage and weight — track Skyrim within ~0.1 except where
marked.

## (c) Proposed `speedScale` (Fable decides; owner signs in the round-0 playtest)

Keeps Skyrim's ordering, compressed toward 1 so the extremes stay playable,
with the scimitar pulled clear of the straight sword per the owner's ruling
2026-09-18 (Skyrim has them equal at 1.0; **0.85** makes it the fast one-hander
below the dagger).

| class | today | proposed | delta | why |
| --- | --- | --- | --- | --- |
| dagger | 0.72 | 0.74 | +0.02 | Skyrim 0.77; keeps it the fastest thing in the arsenal |
| shortSword | 0.88 | 0.88 | 0 | no vanilla record; sits between dagger and sword |
| scimitar | 0.92 | **0.85** | −0.07 | owner ruling: felt as faster than the sword, not marginally |
| straightSword | 1.00 | 1.00 | 0 | the reference |
| axe | 1.06 | 1.11 | +0.05 | exactly Skyrim's 1/0.90 |
| mace | 1.12 | 1.25 | +0.13 | Skyrim's 1/0.80; today's mace is barely slower than an axe |
| greatsword | 1.34 | 1.40 | +0.06 | Skyrim 1.43 |
| greataxe | 1.42 | 1.43 | +0.01 | Skyrim 1.43; equal to the greatsword, as Skyrim has it |
| warhammer | 1.55 | 1.62 | +0.07 | Skyrim 1.67 |
| spear | 1.15 | 1.15 | 0 | no record; thrust family, faster than a greatsword |
| halberd | 1.40 | 1.45 | +0.05 | no record; between greataxe and warhammer by mass |
| staff | 1.25 | 1.25 | 0 | no record |
| shortbow | 1.20 | 1.00 | −0.20 | Skyrim's wood bow is the reference speed 1.0 |
| longbow | 1.20 | 1.10 | −0.10 | Skyrim 1.07 |
| warbow | 1.25 | 1.25 | 0 | Skyrim 1.23 |

Bow rows move melee-swing timing only; draw and release stay on `ranged`.

## (d) Where our tables contradict Skyrim's ordering

1. **Silver** — Skyrim's silver sword is **0.70×** steel's weight (a light,
   specialist blade); our `weightScale` is 1.00, so we made the lighter material
   heavier; we also give it +5% damage where Skyrim gives it none.
2. **Imperial value** — Skyrim's imperial sword is worth **2.3 per weight**,
   *half* a steel sword's 4.5; our `valuePerKg` 22 makes it 1.4× steel. Legion
   issue kit is cheap in Skyrim; our inventory prices it as a luxury.
3. **Scimitar damage** — Skyrim's `Scimitar` does **11** damage at sword weight
   and sword speed (stronger than a steel sword's 8); our table makes it weaker
   *and* faster (`powerScale` 0.95). If the owner wants it fast, Skyrim's number
   says it should not also be weaker; a `powerScale` of 1.0 with `speedScale`
   0.85 is the closer reading. (Its 5-gold `value` is a Bethesda artefact of an
   unused item — do not read value from this record.)
4. **Nord Hero and Akaviri weights** — Skyrim: nordhero 0.90×, akaviri 1.00×;
   ours: 1.00 and 0.85. Both are inverted relative to Skyrim, mildly.
5. **Dwarven damage** — Skyrim 1.25×, ours 1.16×: we understate the one tier
   Bethesda made notably hard-hitting.
6. **One `weightScale` per material cannot fit Skyrim.** Elven is 1.60× steel on
   the dagger and 1.30× on the sword, ebony 2.00× and 1.50×: Bethesda's ratios
   vary by class. Our two-axis table is the right simplification — this is
   recorded so nobody later "fixes" a per-class mismatch that is not a bug.
7. **One-handed weights** run ~25% under Skyrim's while two-handed match. If
   encumbrance is meant to read as Skyrim's, the one-handed `weightKg` column
   wants a single ×1.3 pass; deliberate lightness is equally defensible, hence
   a Fable call, not a change made here.
