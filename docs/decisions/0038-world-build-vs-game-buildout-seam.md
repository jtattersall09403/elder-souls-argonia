# 0038 — The seam between the world build and the game build-out

**Date:** 2026-08-30 · **Status:** register live; pull-in recommendations
PROPOSED (owner ratifies at 10b kickoff)

## Context

Owner question: what happens to work that falls *between* the world-build
phases and the future full-game build-out — remaining weapon movesets, shield
parry, stealth/NPC awareness, the stats↔items↔loot boundary, "and stuff nobody
has thought of yet"? An audit found the plan already follows a consistent but
**unwritten** policy, and that three things were genuinely unowned: a home for
deferred *systems* (polish-backlog is explicitly cosmetic-only), an NPC
**detection model** (the accepted stat design depends on one — sneak XP,
sneak-opener bands, Elusiveness-vs-Spot — but module 72 is nav-only and no
phase builds it), and a **save/persistence layer** (save-on-rest is decided in
0031/76 §126, but nothing owns the save system itself).

## Decision

1. **The seam principle, made explicit:** the world build ships *contracts,
   thin slices and calibration data* for game systems — only as much as world
   validation and authoring need (capability profiles 75 §52, Phase 9's thin
   stat hook, semantic authoring 76 §128, the quest condition vocabulary).
   Full systems belong to the next goal's master plan, drafted when the world
   build closes.
2. **[docs/game-buildout-register.md](../game-buildout-register.md)** is the
   single parking place for deferred game *systems* — the systems twin of
   polish-backlog.md — and the seed of the future build-out plan. Each row
   names the **hook** the owning world-build phase must leave; a phase that
   touches a row and ships without its hook is not done.
3. **Recommended pull-ins** (in the register, owner ratifies at 10b kickoff):
   full movesets for the kept weapon classes (sourcing already a Phase 10 job,
   90 §74.3; wire at 10b, numbers at 10c, before 13) and a minimal detection
   model (cones + seen/unseen, before 13 authors encounters). **Shield parry**
   is a feel ruling → polish-backlog tagged `10b`, per the existing 95
   mechanism.
4. The stats↔items↔loot boundary needed **no new decision** — it is already
   seamed: gear.json is the single source (76 §129) ported at 10c, the
   semantic compiler covers loot/traps (10c), provenance and placement are
   Phase 13, catalogue breadth is 13/15 content.

## Addendum 2026-08-30 (2) — the package rule is now universal

**Owner ruling** on reading the audit: portable code was always *intended* to
land in shared packages; the renderer drift was never the design. From now on
**everything the final game will need is written package-shaped from the
start — rendering included** — apps hold only scene composition, app-only
tooling and debug UI; no new cross-system module singletons or `__STUDIO_*`
globals. Codified as a CLAUDE.md golden rule (binding on every agent).
Existing app-private runtime code stays recorded debt (audit §1), paid down
when touched substantially, not grown.

## Addendum 2026-08-30 — the comprehensive audit

The owner commissioned the full build-out systems audit the same day. Five
parallel audits (architecture, quest-plan demands, stats-design demands,
implemented stack, world-plan residue) → evidence doc
[research/game-buildout-systems-audit.md](../research/game-buildout-systems-audit.md);
the register was expanded to match (architecture-debt section, ~7 new system
rows, per-kickoff pull-in list, keep/cut batch). Headline findings: `apps/game`
is a stub and ~7.3k LOC of game-runtime renderer sits app-private in the
studio (extraction unowned → build-out milestone 1 recommended); the typed
quest condition vocabulary is mandated but enumerated nowhere (now flagged in
quests 80 §58, a Q1 gate); magic's *numbers* are settled but the casting
system is not; weapon poisons + the H2H finisher post-date both 10c
deliverable lists. Three doc/data defects fixed in the same change (76 §121.4
stale constant, stale stats-sim divergence note, the §58 flag); the training
price contradiction (10× vs 8×) is recorded for 10c, not resolved.
