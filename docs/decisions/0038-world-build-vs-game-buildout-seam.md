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
