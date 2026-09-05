# 0044 — One registry framework for the world's id vocabularies

*Date: 2026-09-04 · Status: accepted · Owner ask: "Faction registry — set this
up now. What other registries might be useful to set up placeholders for now?
Eventually pretty much everything in our world will need data and a registry,
linked by IDs where relevant."*

## Context

The Phase 11 catalogue already links place records to things with no file
behind them: ~110 `faction.*` ids (`hostility.owner`, `ownerFaction`,
`contents.npcs[].faction`), 303 `deed.*` counters, 164 `rumour.*` pools, and
`contents.*[].registerRef` — a hole deliberately left for creatures, NPCs and
items. Nothing checked any of them, so a typo was invisible and the same group
was spelled four ways (`faction.blackguard(s|-raw)`, `faction.ledgered-blackguards`).

## Decision

**One framework, not five files.** `world/sources/registries/<domain>.json`,
every file the same shape (`schemaVersion`, `domain`, `entries[]` of
`{id, name, kind, status, sources, notes, …domain fields}`), one loader and
validator (`worldgen.registries`), one cross-check against the catalogue, one
pytest suite. Adding a domain later is a JSON file, not a new subsystem.

Seven registries ship now: `factions`, `quests`, `creatures`, `npcs`, `items`,
`deeds`, `rumour-pools`. Routes, places, sockets and assets already validate in
their own tools and stay there.

## ID convention

`<domain>.<slug>`, lower kebab, globally unique across all registries, never
reused. These are **vocabulary** ids (a kind of thing), not placed-object ids
(a specific thing at a specific place), so engineering standard 2's
`<domain>.<packet>.<name>` shape is relaxed per-source via `"idShape": "flat"`
in `tooling/repo-standards/id-registry.json`. Uniqueness and the no-reuse rule
are unchanged — that is what a save file actually depends on.

## What is real and what is placeholder

`status` is on every entry and is load-bearing. `canon` requires `sources`
(the lore golden rule, enforced). `derived` is project extrapolation with a
written basis. `placeholder` means the id is in use or reserved and the brief
is not written.

- **factions** — the canonical lines, state, foreign powers and tribes carry
  real one-line briefs and sources; ~80 local groups the catalogue invented are
  `placeholder`, for the Phase 12/13 faction pass to promote or merge.
- **quests** — every MQ/LQ/DQ/faction-line id from the quest index, with code,
  tier, milestone and owning faction. Line spine slots are `placeholder` titles.
- **creatures / npcs / items** — thin `PLACEHOLDER` registers. The catalogue
  names nothing yet (`registerRef` is null everywhere and `rewardProfile` is
  typed, not named), so these are seeded from the canon bestiary, material
  culture and the principal cast purely so the links have somewhere to point.
  Phase 13's registers grow them into real data.
- **deeds / rumour-pools** — complete, derived mechanically from the catalogue;
  `--sync` keeps them in step.

**Asset availability lives on the entry (added 2026-09-04).** A registry
entry that names a creature the engine can never show is worse than no
entry, so `creature`, `item` and `npc` entries carry an
`assetAvailability` block — `{status: vanilla|sourced|sourceable|none, via,
notes}` — recording which vanilla actor, vault mesh or named Nexus mod
delivers it, under the no-new-animations rule. It sits on the vocabulary
entry rather than in a separate audit doc so it cannot drift from the id
it describes, and so the Phase 13 registers inherit a verdict instead of
re-deriving one. The full reasoning, the vault's creature roster and the
sourcing shortlist are in
[docs/research/lore/creature-asset-availability.md](../research/lore/creature-asset-availability.md).

## Consequences

An unregistered id now fails the world-generation test suite. The cost of that
is one `--sync` run plus a notes line. The benefit is that quest gates, the
reputation system, dialogue and the text catalogue all get to assume every id
they see resolves — the assumption that is brutal to retrofit later.
