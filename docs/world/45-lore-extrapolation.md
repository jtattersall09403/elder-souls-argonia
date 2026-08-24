# Part IVb — Lore extrapolation loop (owner directive 2026-08-23)

> Module of the world-generation master plan — see [README](README.md) for the
> router. This defines the standing workstream that fills the canon gap
> between "what sources say about Black Marsh" and "what the game needs to
> know about Argonia in 4E 201".

## The problem

Canon is rich on Black Marsh's history, ecology and older eras (ESO's 2E
Murkmire/Shadowfen, PGE1/PGE3, the novels ~4E 40s) but thin on **4E 201
specifics**: who rules where, faction strength, settlement condition,
demographics, trade, banditry/piracy, tribal politics after the An-Xileel's
rise. The world build (Phases 11–13) and the quest plan need those answers.

## The method (run by a dedicated high-capability agent — Opus-class or
better, owner directive)

1. **Sweep**: methodically crawl UESP (and the vault extract) for everything
   Black Marsh/Argonia-relevant not yet in our dossiers — locations, dates,
   events, factions, peoples, economy, religion — and record it in
   `world/sources/lore/` following that README's sourcing rules. Cite pages.
2. **Gap register**: list what the game must know that canon doesn't state
   (per settlement: who runs it in 4E 201, economy, danger; per faction:
   strength, aims, conflicts; per region: tribes, threats, trade).
3. **Extrapolation loops**: fill each gap by logical inference from dated
   canon (e.g. project the An-Xileel's 4E 6–48 trajectory to 4E 201; decay
   or growth of Imperial remnants after the Empire's withdrawal), preferring
   the *least inventive* consistent answer. Iterate until the register is
   empty.
4. **Canon tiers** (every statement gets one; never blur them):
   - `CANON_EXPLICIT` — a source says it (cite);
   - `CANON_DERIVED` — direct logical consequence of cited sources;
   - `EXTRAPOLATED` — our reasoned headcanon (state the reasoning + the
     sources it extrapolates from);
   - `AGENT_INVENTED` — pure invention (allowed only where extrapolation has
     nothing to grip; flag for owner review).
5. **Quest-plan coupling** (two-way): the quest plan breaks 50/50
   extrapolation ties; extrapolated lore corrects quest-plan factions,
   people and premises. Quest-side changes are made in `docs/quests/` with a
   pointer back to the lore file justifying them.

## Storage and coordination

- Everything lands in `world/sources/lore/` (dossiers extended in place;
  new files as needed) + `world/sources/lore/extrapolation/` for the gap
  register, the 4E 201 state-of-the-province synthesis, and the workstream's
  own `PROGRESS.md` (packet-based, so any future agent can resume).
- Runs in parallel with terrain/asset work by construction: it edits only
  lore and quest docs. It does not commit — the main-line agent reviews and
  commits its output.
- Key judgement calls (province-scale politics, anything reshaping a major
  city's identity) go to the owner, not decided unilaterally.

## Consumers

Phases 11 (causal locations/settlements), 12 (dungeons), 13
(ecology/encounters/loot), and all quest production: the acceptance rules
(00-core) already require causal, lore-grounded answers — this workstream is
where those answers come from when raw canon runs out.
