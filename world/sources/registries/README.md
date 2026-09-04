# World registries

One framework for every id-linked **vocabulary** in the world: the things place
records, quests and (later) the runtime point *at* rather than contain.

Loader/validator: `tooling/world-generation/worldgen/registries.py`
(`python3 -m worldgen.registries --check`). Rationale: [decision 0044](../../../docs/decisions/0044-world-registries.md).

## The shape (all files identical)

```json
{ "schemaVersion": 1, "domain": "faction", "entries": [
  { "id": "faction.naga-kur", "name": "The Naga-Kur", "kind": "tribal-power",
    "status": "canon", "sources": ["UESP:Lore:Naga"], "notes": "one line", ... }
]}
```

- **id** — `<domain>.<slug>`, lower kebab, globally unique across *all*
  registries, never reused. These are vocabulary ids, not placed-object ids, so
  the two-segment form is legal (engineering standard 2's three-segment shape is
  relaxed per-source by `"idShape": "flat"` in `tooling/repo-standards/id-registry.json`).
- **status** — `canon` (in the lore, and `sources` must prove it), `derived`
  (project extrapolation with a written basis), `placeholder` (the id is in use
  or reserved; the brief is not written yet).
- **assetAvailability** — on `creature`, `item` and `npc` entries: can we
  actually put this on screen? `{status, via, notes}` where status is
  `vanilla` (vanilla Skyrim actor/prop), `sourced` (mesh already in the
  vault), `sourceable` (a named Nexus mod would supply a rigged mesh with
  its own animations; not downloaded, licence unchecked) or `none` (nothing
  can deliver it as an actor, so it is staged as an effect or dropped).
  **No new animations, ever**: a creature needs a mesh that ships its own
  animation set or sits on a vanilla skeleton. Verdicts and the sourcing
  shortlist: [docs/research/creature-asset-availability.md](../../../docs/research/creature-asset-availability.md).
- **notes** — one line, always. Domain fields (`code`, `tier`, `milestone`,
  `line`, `faction`, `mergeCandidate`, …) sit alongside.

## The registries

| File | Domain | What it holds | Who grows it |
|---|---|---|---|
| `factions.json` | `faction` | Every group the world can name — the canonical lines and powers with briefs, local groups as placeholders | Phase 12/13 faction pass; quest authors |
| `quests.json` | `quest` | Every quest and questline id, with code, tier, milestone and owning faction | Quest authors (docs/quests) |
| `creatures.json` | `creature` | **Placeholder.** The canon bestiary, so `contents.creatures[].registerRef` has somewhere to point | Phase 13 creature register (stats, spawns, assets) |
| `npcs.json` | `npc` | **Placeholder.** Principal cast only | Phase 13 NPC register — it turns `notableNpcSlots` prose into `npc.*` ids |
| `items.json` | `item` | **Placeholder.** Canon material culture and named main-quest objects | Phase 13 item register |
| `deeds.json` | `deed` | Every `deedCounterKeys` value — the reputation/progress counters quest conditions read | Whoever adds a deed key to a place |
| `rumour-pools.json` | `rumour` | Every `rumourPoolKey` — the ambient talk pools; the lines live in `packages/text-catalogue` | Text workstream |

Not here, because they already validate elsewhere: **routes**
(`world/sources/routes/registry.json`), **places** (the catalogue itself),
**sockets** (`sockets.{scene,evidence,station,marks}` inside each place record),
**assets** (`worldgen.asset_registry`).

## The linking rules

1. A catalogue field that names an id must resolve into a registry. Enforced by
   `worldgen.registries.cross_check`, run by `worldgen/test_registries.py`:
   `hostility.owner`, `ownerFaction` and `contents.npcs[].faction` → `factions.json`;
   `deedCounterKeys` → `deeds.json`; `rumourPoolKey` → `rumour-pools.json`;
   `contents.creatures[].registerRef` / `npcs[].registerRef` / `loot[].registerRef`
   → `creatures.json` / `npcs.json` / `items.json`.
2. **Add the registry entry in the same change as the id.** If a catalogue edit
   leaves a gap, `python3 -m worldgen.registries --sync` appends the missing ids
   as `placeholder` entries — it never rewrites an authored one — and you then
   write the notes line.
3. Never rename an id to tidy it. Add the new one, point the old one at it with
   `mergeCandidate`, and retire the old one through
   `tooling/repo-standards/id-registry.json`'s `retired` list.
4. Player-visible text does **not** live here. `name` is an authoring label;
   the displayed string belongs in `packages/text-catalogue` keyed by the id
   (engineering standard 3).
