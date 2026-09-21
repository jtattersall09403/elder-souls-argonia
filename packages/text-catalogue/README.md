# @elder-souls/text-catalogue

The one table of player-visible text, keyed by stable ID (engineering
standards 2 and 4). Pure data: no rendering, no formatting engine. Read the
header of `src/catalogue.ts` for why the package exists and what
`buildCatalogue` enforces; write against
[docs/standards/text/style-guide.md](../../docs/standards/text/style-guide.md).

## What is in it

| File | Holds |
|---|---|
| `src/catalogue.ts` | the machinery: `TextEntry`, `buildCatalogue`, `text()`, `bySurface()` |
| `src/entries.ts` | hand-written content; the live `CATALOGUE` built from every block |
| `src/generated/hydrology-names.ts` | `HYDROLOGY_NAME_TEXT` — `text.hydrology.name.<entityId>`, from `world/sources/hydrology/names.json` |
| `src/generated/place-names.ts` | `PLACE_NAME_TEXT` — `text.place.<slug>.name`, from `world/sources/catalogue/places-*.json` |
| `src/generated/quest-titles.ts` | `QUEST_TITLE_TEXT` — `text.quest.<slug>.title`, from `world/sources/quests/*.json` |

`<slug>` is the record id with its `place.` / `quest.` prefix dropped, so
`place.dunmer-north.andalen-plantation` is `text.place.dunmer-north.andalen-plantation.name`.
Records with a dead status (`cut`, `deferred`) carry no entry.

## Generated entries

A world record is the authority for its own name; the catalogue entry is the
string anything renders. Never edit a generated file — edit the record and run,
from `tooling/world-generation`:

```bash
python3 -m worldgen.place_text --emit-text        # place-names.ts + quest-titles.ts
python3 -m worldgen.hydrology_names --emit-text   # hydrology-names.ts
```

`npm test` fails on a stale generated file (`check.mjs`, `checkGeneratedText`),
so a record edited without regenerating never reaches a commit.

A renderer looks a name up by ID and shows nothing when it is missing
(`apps/world-studio/src/places/PlacesLayer.tsx`, `placeName`): a missing ID is
a stale generated file, which the gate catches, not something to paper over
with the raw record string.

Duplicate-line detection (`buildCatalogue`) is skipped for `text.place.*` and
`text.quest.*`: a quest named after the place it happens in is one proper name
used twice on purpose, not one line written twice.
