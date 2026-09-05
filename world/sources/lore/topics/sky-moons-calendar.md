# Sky, moons and calendar

Sources: Lore:Calendar, Lore:Moons, Lore:Constellations, Lore:The Seasons of
Argonia, Lore:Topal Bay, Lore:Black Marsh (fetched 2026-08-25 via the UESP API).
Consumers: the world clock and natural-light system (plan module
[55](../../../../docs/world/55-light-sky-time.md)), Argonian material culture,
quests with timed or nocturnal beats, alchemy, festivals, naming.

Companion: [material-culture.md](material-culture.md) (calendar as social
practice), [../../../../docs/research/world-terrain/black-marsh-climatology.md](../../../../docs/research/world-terrain/black-marsh-climatology.md)
(seasons as *climate*; this file is seasons as *sky*).

## Calendar — CANON_EXPLICIT

365-day year, 12 months, 7-day week, 24-hour day. Month order, length, Jel
name and birthsign constellation:

| # | Month | Days | Jel name (meaning) | Birthsign |
|---|---|---|---|---|
| 1 | Morning Star | 31 | Vakka (Sun) | Ritual |
| 2 | Sun's Dawn | 28 | Xeech (Nut) | Lover |
| 3 | First Seed | 31 | Sisei (Sprout) | Lord |
| 4 | Rain's Hand | 30 | Hist-Deek (Hist Sapling) | Mage |
| 5 | Second Seed | 31 | Hist-Dooka (Mature Hist) | Shadow |
| 6 | Midyear | 30 | Hist-Tsoko (Elder Hist) | Steed |
| 7 | Sun's Height | 31 | Thtithil-Gah (Egg-Basket) | Apprentice |
| 8 | Last Seed | 31 | Thtithil (Egg) | Warrior |
| 9 | Hearthfire | 30 | Nushmeeko (Lizard) | Lady |
| 10 | Frostfall | 31 | Shaja-Nushmeeko (Semi-Humanoid Lizard) | Tower |
| 11 | Sun's Dusk | 30 | Saxhleel (Argonian) | Atronach |
| 12 | Evening Star | 31 | Xulomaht (The Deceased) | Thief |

Week: Morndas, Tirdas, Middas, Turdas, Fredas, Loredas, Sundas.

The Jel month names are the Argonian calendar and track the **Hist life cycle**
(sprout → sapling → mature → elder → egg → hatchling → death) — for our
province they are the primary names in Argonian mouths; Cyrodilic month names
belong to Imperials, foreigners and written records.

Solstices and equinoxes are canonical events ("the Steed is prominent in the
southern sky during the summer solstice"). Era dating per decision 0002; our
present is 4E 201.

## Moons — CANON_EXPLICIT unless marked

- **Masser** (Jel/Khajiit: *Jode*) — the larger, "well over twice Secunda's
  size"; conventionally the red-tinted moon. **Secunda** (*Jone*) — small,
  pale.
- Both are **phased**, and phases are culturally load-bearing (Khajiiti
  morphology, alchemy, festivals).
- **Eclipses are frequent**: "solar eclipses can happen in Tamriel several
  times a year and are known as **Vampire Days**", during which "spirits,
  vampires and other undead are said to be encountered more frequently".
- **Tides are moon-driven** in lore (Lore:Topal Bay).

### Argonian moon practice — CANON_EXPLICIT, and the cycle length it implies

> "Argonian alchemy uses the phases of the moon to precisely align a
> calcinator… During the full moon, the calcinator faces south and aligns with
> the **Southron pole star**, and every night after that, the calcinator
> rotates clockwise **one twenty-eighth of the circle**. …During the new moon,
> the calcinator should be fully exposed to the light."

Two things fall out:

1. **A 28-night lunar cycle** for the moon Argonian alchemy tracks —
   CANON_DERIVED (28 equal nightly steps returning to full). We adopt 28
   nights as our canonical synodic period. (Skyrim's engine instead used 8
   phases × 3 days = a 24-day cycle — GAME_DERIVED, and *not* what we follow;
   Argonian practice is the better-grounded prior for an Argonian province.)
2. **A southern pole star visible from Black Marsh** — CANON_EXPLICIT. See the
   sky-geometry consequence below.

- **Moonmarch** (town, southern Black Marsh, east of Soulrest / southwest of
  Blackrose) and **Fort Moonmarch** are canonical place names — the moons are
  already in the province's toponymy.
- Argonian moon-origin myth: Masser and Secunda are tied to the fate of the
  twins **Izzik and Tweer**, who "wandered too deep into the bowels of an
  ancient Xanmeer" — a ready-made local folk tale, and a Xanmeer hook.

## Constellations — CANON_EXPLICIT

Thirteen "Thirteen Patrons": three **Guardians** (Warrior, Mage, Thief), each
with three charges, plus the **Serpent**, which belongs to no month. Each of
the twelve monthly constellations "is typically in the sky throughout"
its month — so the star field must **rotate with the calendar**, not be a
fixed dome.

| Constellation | Stars | Month | Role |
|---|---|---|---|
| Warrior | 30 (or 28) + planet Akatosh | Last Seed | Guardian |
| Lady | 4 | Hearthfire | Warrior's charge |
| Steed | 8 | Midyear | Warrior's charge |
| Lord | 19 | First Seed | Warrior's charge |
| Mage | 27 + planet Julianos | Rain's Hand | Guardian |
| Apprentice | 11 | Sun's Height | Mage's charge |
| Atronach | 10 | Sun's Dusk | Mage's charge |
| Ritual | 7 | Morning Star | Mage's charge |
| Thief | 18 (or 17) + planet Arkay | Evening Star | Guardian |
| Lover | 12 | Sun's Dawn | Thief's charge |
| Shadow | 5 | Second Seed | Thief's charge |
| Tower | 12 | Frostfall | Thief's charge |
| Serpent | 4 "unstars" | none — wanders | neither |

The **Serpent moves unpredictably** and its four bodies "do not emit
varliance" — i.e. they read as *dark*, drifting anomalies rather than stars.
That is a free, canon-grounded piece of night-sky character for a province
whose religion is Sithis-shaped (see
[sithis-nisswo-shadowscales.md](sithis-nisswo-shadowscales.md)).

Planets are visible bodies too: Akatosh, Julianos and Arkay sit *within* their
Guardian constellations.

## Sky geometry over Black Marsh — CANON_DERIVED / EXTRAPOLATED

- The **Southron pole star is visible and usable** from Black Marsh
  (CANON_EXPLICIT above). Combined with the canon tropical climate and the
  province's position at Tamriel's south-east, the coherent reading is that
  **Argonia sits close to Nirn's celestial equator** — both celestial poles
  near the horizon, the southern one low and due south. `EXTRAPOLATED`
  (reasoning: an alchemical device aligned nightly to a pole star needs that
  star to be *visible and steady*; near the equator both poles are).
- Consequences we take as design-binding (all `EXTRAPOLATED`, all cheap to
  retune from one latitude constant):
  - **the sun passes near the zenith at noon** — short, hard shadows in the
    middle of the day, no long low-sun raking light except at the ends;
  - **twilight is short** — dawn and dusk are ~20–30 minutes of fast colour
    change rather than Skyrim's long northern gloaming; night arrives quickly,
    which sharpens the danger contract of being caught out in the marsh;
  - **day length barely varies with season** (~12 h ±30 min) — the year's
    rhythm is carried by the **monsoon**, not by daylight, which is exactly
    what the climatology model already says;
  - **the moons rise and set close to vertically** and pass high, so
    moonlight reaches the swamp floor between canopy gaps rather than raking
    in sideways.
- Constellations near the southern horizon are the "fixed" ones for Argonian
  practice; the Cyrodilic zodiac wheels overhead.

## Gameplay/authoring hooks (for later phases, not decisions yet)

- **Vampire Days** (eclipses) as a fixed, calendared world state with an
  undead/spirit surge — fits the fixed-danger rule (0004) exactly: a date, not
  a level.
- Moon-driven **spring tides** at the delta and Topal coast — deeper channels,
  drowned mudflats, boat access windows (Phase 8/9 water; module 60).
- Argonian **alchemy** requiring a specific phase, and full-moon/new-moon
  ritual nights at Hist sites.
- Naming and festivals: Moonmarch, Moon Festival analogues, month-named
  markets.
