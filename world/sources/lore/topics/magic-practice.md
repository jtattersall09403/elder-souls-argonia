# Magic as it is practised in Black Marsh

Why this dossier exists: workstream S (character systems, world module
[76](../../../../docs/world/76-stats-progression.md) §123) had to decide which
schools of magic exist in our era, what magic *looks like* in this province,
and what the levelling currency is called in-game. Those are lore decisions, so
they are recorded here rather than in the design doc.

Sources: Lore:Mysticism, Lore:Illusion (fetched 2026-08-29 via the API);
Lore:Nisswo, Lore:Duskfall, Lore:Argonian, Lore:Hist, Lore:Hist Sap (via the
existing dossiers [sithis-nisswo-shadowscales](sithis-nisswo-shadowscales.md)
and [hist-and-sap](hist-and-sap.md), fetched 2026-08-24/28).

## 1. Mysticism survives here — the schools we keep

- **CANON_EXPLICIT** (Lore:Mysticism): "By 4E 201, Mysticism was no longer
  regarded as a separate school of magic **by the College of Winterhold**.
  There was no Mysticism specialist there, and the traditional spells had all
  been moved to other schools or were no longer in use." The dissolution is
  stated as an *institutional* fact about a Nord college in Skyrim — not a
  metaphysical death of the art. Mysticism's own origin is older than any
  guild: the Psijic "Old Way" of Artaeum.
- **CANON_EXPLICIT** (multiple, via the province dossiers): Argonians "do not
  have religion as it is known elsewhere in Tamriel", no Mages-Guild hall
  structure is attested in the interior in our era, and foreign institutions
  historically fail to take root in Black Marsh.
- ⇒ **EXTRAPOLATED (project reading):** the taxonomy of a Skyrim college has no
  authority over marsh practice, so **Mysticism survives in Argonia as a folk
  school** — soul-trapping, detection, telekinesis, reflection and the
  "true-name" tradition, taught hand to hand rather than by curriculum. Our six
  schools are therefore Morrowind's six: Alteration, Conjuration, Destruction,
  Illusion, **Mysticism**, Restoration.
- Handling note: a foreign scholar NPC may correctly say Mysticism "was
  dissolved"; a marsh practitioner may correctly say they have never heard of
  such a thing. Both lines are canon-safe and the disagreement is good texture.

## 2. Magic is folk literacy, not a profession

- **CANON_DERIVED**: the province's magic is ordinary and everywhere — the
  quest plan's standing reading (docs/quests/40 §34) is that Black Marsh
  day-labourers are accomplished Illusionists and that no robed-mage guild
  culture exists here. *Source-of-record caveat: the underlying UESP page for
  the "day-labourer illusionist" line was not re-verified on 2026-08-29 (the
  UESP search API returned no hits for the phrase); treat the specific wording
  as project-held until someone re-sources it.*
- **CANON_EXPLICIT** (via [hist-and-sap](hist-and-sap.md),
  [sithis-nisswo-shadowscales](sithis-nisswo-shadowscales.md)): **Hist-magic is
  real and does not follow conventional spellcraft** — a marsh-born Argonian can
  summon a cloud of incapacitating spores; the **dream-wallow** (isolation plus
  potent herbs) sees beyond the physical and can physically manifest objects;
  **life energy clings to grave-stakes** and can fuel necromancy; pulling a
  grave-stake raises a **bog blight**.
- ⇒ Build implication for §123: spells are bought, found, traded and taught
  informally; scroll magic is common and cheap; the "mage" archetype in Argonia
  is a neighbour with a knack, a Nisswo, a sap-speaker or a tree-minder, never
  a robed academic. Foreign mages exist only where foreign institutions do
  (Gideon, Stormhold, Blackrose garrisons, Imperial docks).

## 3. *Vastei* — the name of the progression currency

Workstream S needed an in-game name for the Souls-like currency the player
earns by acting and loses by dying (module 76 §120.3), grounded in lore and
**not** colliding with soul gems, whose canon meaning we keep intact.

- **CANON_EXPLICIT** (Lore:Nisswo, via the Sithis dossier): post-Duskfall
  Argonian religion is built on three words — **vastei**, *change*;
  **ku-vastei**, *one who brings necessary change*; **shunatei**, "the pain
  caused by holding on too tightly to that which has come to pass". Raj-Sithis
  is the Changer, "First Creator and Final Destroyer"; the Clutch of Nisswo
  teach people to let go, make art and destroy it, steal a thing and leave
  clues so it can be found.
- **CANON_EXPLICIT**: an Argonian's soul *is* Hist sap and returns to the tree;
  souls with no tree to return to "linger in the living world, mad". Soul gems
  are a separate, foreign technology and keep their canon function.
- ⇒ **AGENT_INVENTED naming, canon-grounded:** the currency is **vastei** —
  "the change you have earned". It accrues from acting in earnest, it is spent
  only on changing yourself (attribute growth at a rest), and it is dropped
  where you die: going back for it is *shunatei*, and the game lets you do it
  exactly once. A Nisswo NPC teaching the mechanic is the natural tutorial, and
  the joke — a travelling preacher watching you sprint back to the corpse pile
  you swore you had let go of — is the setting's own.
- Rejected alternatives: "souls" (collides with soul gems and with Argonian
  soul canon), "sap" (a real, tradeable, dangerous substance — module 30),
  "gloor" (the Hist's will, not the player's).

## 4. What this licenses elsewhere

- Spell vendors, spellmaking and enchanting **services** exist without a Mages
  Guild: a Nisswo, a tree-minder, a foreign fence, a Gideon chapterhouse.
- Mysticism content (soul trap, detect, reflect, telekinesis, mark/recall-style
  transport where quests permit) is available in the interior and *rare in
  foreign hands*, which is a legible, diegetic distribution.
- Necromancy has a local, canonical hook (grave-stakes, bog blights) that is a
  crime against the tribe rather than against a state — feeds the Owing
  assessment model (module 76 §124) and the quest plan's crime handling.
