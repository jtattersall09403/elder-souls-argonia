# Engineering standards

Eleven standing rules that are **cheap to require now and brutal to retrofit**.
Adopted by the owner 2026-09-01 (decision
[0042](decisions/0042-buildout-steers-and-engineering-standards.md) §8) after
the lesson of the renderer: the code that has to be true of *everything* must be
made true from the first line, not converted later.

Each rule states **what**, **why**, **how it is enforced**, and **who owns it**.
Enforcement is one of:

- **check** — mechanical, runs in `npm test` from the repo root
  (`tooling/repo-standards`); a violation fails the build;
- **rule** — binding on agents, verified by review at the named phase kickoff;
- **hook** — a contract or data field an owning phase must leave behind (these
  also appear as rows in [game-buildout-register.md](game-buildout-register.md)).

---

## 1. The typed condition/action vocabulary exists before content is authored

**What.** Every quest gate, faction check, reward grant and world-state change is
written in one typed vocabulary. It is authored *before* Phase 11 places
anything.

**Why.** This is the packages mistake about to repeat. The vocabulary is
mandated everywhere in the quest plan and enumerated nowhere; the only extant
list (76 §125, 8 predicates) cannot express stage, journal, topic, evidence,
custody, time or tier-lock gates. Content authored against ad-hoc prose
conditions has to be hand-translated later, hundreds of times.

**Enforcement.** rule. First cut authored:
[quests/85-condition-vocabulary.md](quests/85-condition-vocabulary.md). It is a
living document — an author who needs a predicate that does not exist **adds it
there** rather than inventing prose. The Q1 gate (quests 90) checks that every
authored condition names a listed predicate.

**Owner.** Authored now; extended by Phase 11/12 authoring; implemented in
build-out G2 (`narrative-core`).

## 2. Stable IDs, and a registry, from the first placed object

**What.** Everything placeable or referenceable carries a stable, human-readable
ID that never changes: settlements, POIs, dungeons, interiors, sockets, NPCs,
factions, quests, items, Hist trees, water bodies, travel services. IDs are
registered in one place per domain and never reused after deletion.

**Why.** A save file and a quest flag both point at "that door" forever. An ID
that shifts when a file is regenerated silently breaks saves and quests.

**Format.** `<domain>.<packet>.<name>` in lower kebab, e.g.
`poi.murkmire.drowned-stair`, `npc.lilmoth.never-writes-twice`. No spaces, no
capitals, ASCII only. Retired IDs go to a `retired` list, never deleted.

**Enforcement.** check — `repo-standards` asserts ID shape and global
uniqueness across every registered data file, and that no retired ID is reused.

**Owner.** Phase 11 onwards for placement; the check is live now.

## 3. Ownership and value ship *with* placement

**What.** Every placed interactable may carry `owner` / `ownerFaction` and a
value tier at the moment it is placed. Unowned is the wilderness norm — the
field is optional, but the *opportunity* to set it is not deferred.

**Why.** Retrofitting "who owns this crate" across a province is the expensive
version; the Morrowind-visibility theft model (0039) depends on it.

**Enforcement.** hook (Phase 11 kickoff, already a register row).

## 4. One text catalogue; every player-visible string has an ID

**What.** No player-visible string is a literal in a component or a data file.
All of it lives in `packages/text-catalogue`, keyed by ID, with the speaker or
surface recorded.

**Why.** Three payoffs, none of them localization (which stays out of scope):
the **voice review** (0042 §6) can sweep one catalogue instead of grepping the
codebase; a glossary and newcomer-topic coverage check (quest Q0 gate) become
trivial; and consistency of terminology across hundreds of thousands of words
stops being a matter of memory.

**Enforcement.** check — the catalogue's own tests assert ID shape, global
uniqueness and no duplicate *text* under different IDs (the tell of two agents
writing the same line twice). New UI and content code uses the catalogue;
existing sandbox/studio debug UI is exempt (debug strings are not player-facing)
and is not retrofitted.

**Owner.** Live now; every text-producing phase from 11 onwards.

## 5. The quest runtime is headlessly drivable from day one

**What.** `narrative-core` is built so a whole playthrough can be simulated with
no renderer, no input and no clock — conditions evaluated, stages advanced,
endings computed.

**Why.** It is the only way we ever verify three endings, tier protection and
fail-forward successors without playing to the end three times. Bolting
headlessness onto a runtime that assumed a scene is a rewrite.

**Enforcement.** hook, asserted at the `narrative-core` kickoff: the first test
written for the quest engine is a headless run of the exemplar quest.

**Owner.** build-out G2.

## 6. Determinism in world building

**What.** No wall-clock time and no unseeded randomness anywhere in world
generation, compilation or placement. Every random draw takes an explicit seed
derived from stable inputs (chunk coordinates, packet ID, object ID).

**Why.** Reproducibility is the whole basis of our evidence: a probe result, a
placement audit or an owner playtest means nothing if the next run differs.

**Enforcement.** check — `repo-standards` rejects `Math.random`, `Date.now` and
argless `new Date()` in the world-generation and world-data code paths. Test
files and explicitly-annotated runtime jitter are exempt via a narrow allowlist.

**Owner.** Live now.

## 7. Every data bundle carries a `schemaVersion`

**What.** Every generated or authored data file that the game reads at runtime
carries a `schemaVersion` integer at its top level, bumped whenever the shape
changes incompatibly.

**Why.** Save migration is impossible without it. Later is too late: a bundle
shipped without a version is a bundle we cannot tell apart from its successor.

**Enforcement.** check over a declared registry of runtime data paths
(`tooling/repo-standards/data-registry.json`). New runtime data paths are added
to the registry when created; the check fails if a registered path contains a
file with no `schemaVersion`.

**Owner.** Live now, forward-looking; historical bundles are versioned as their
owning phase next touches them.

## 8. No new module-level mutable singletons in `packages/`

**What.** Shared packages export functions, classes and types — not mutable
module-level state. Anything that needs shared state takes it by injection.

**Why.** This is the *specific* thing that made the renderer hard to extract:
sky, water, weather and terrain are a five-way import cycle coupled by
`sharedAerialUniforms`, `worldClock`, `wetnessUniforms` and friends. The golden
rule already forbids it; a rule without a check rots.

**Enforcement.** check — `repo-standards` flags new module-level `let`/`var`
exports and mutable exported object literals in `packages/`. Existing violations
are listed in the check's baseline file and must **shrink, never grow**; the
check fails if the baseline is exceeded.

**Owner.** Live now.

## 9. The creature/actor statblock schema precedes creature placement

**What.** The actor schema (statblock class, Fight/Flee/Alarm ints, overlay and
state flags, faction, territory) is settled before Phase 13 places a single
creature.

**Why.** Same shape of problem as ownership: fields added after placement mean
touching every placed thing.

**Enforcement.** hook — by 10c, already a register pull-in (cross-check §1).

**Owner.** Phase 10c; consumed by 13.

## 10. Asset provenance: source, hash and credit in the same change

**What.** No sourced asset lands without its source URL, file hash and a credit
line in root `README.md` § Credits — in the same change, not the same quarter.

**Why.** The credits review keeps re-finding gaps, which means the rule alone is
not working. A mod credited only in a pipeline audit doc is a gap the next
review has to re-find.

**Enforcement.** check — `repo-standards` asserts every Nexus/asset source URL
referenced by a pipeline kit config appears in the root README credits.

**Owner.** Live now.

## 11. One content-unit convention

**What.** Letters, rumours, books, notes, journal entries, dialogue lines and
barks are all **typed content units** of one shape: stable ID, type, text
catalogue reference, availability conditions (standard 1's vocabulary), and the
world state they key off.

**Why.** The narrative machinery then reads one format instead of seven, and the
validators, the voice review and the discovery feed all operate on one table.

**Enforcement.** rule; the shape is defined in
[quests/85 §C](quests/85-condition-vocabulary.md).

**Owner.** Defined now; authored from Phase 11; runtime in build-out G2.

---

## Running the checks

```
npm test                     # from the repo root — includes repo-standards
npm test -w @elder-souls/repo-standards     # just these checks
```

Each check names the standard it enforces and prints the offending file and
line. If a check is wrong, fix the check — do not add an exemption without
saying why in the allowlist file.
