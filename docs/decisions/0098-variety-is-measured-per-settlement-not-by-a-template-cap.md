# 0098 — Variety is measured per settlement, not by a template cap; vanilla is tropicalised by texture only; two provenance warnings noted and ruled usable

**Date:** 2026-09-24. **Status:** accepted (planner ruling 2026-09-24, from
the building-breadth research). Supersedes the "~25 % of its family in a
region" template cap of 97 Part F and 0041 Part 3, and the 16h planner
ruling of the same day that the cap counts assemblies. Evidence and method:
[building-asset-breadth.md](../research/placement-settlements/building-asset-breadth.md)
§2–§3 and §1c.

## What was decided

### 1. The per-settlement variety table

Checked per settlement when the blueprint is exported (the workbench
computes the signature). Only buildings whose main piece is a dwelling,
work, civic or storage piece count.

| Check | Hamlet (4–6) | Village (7–12) | Town (13–25) | City (26+) |
|---|---|---|---|---|
| Distinct dwelling signatures ÷ dwellings | ≥ 0.75 | 1.0 | 1.0 | ≥ 0.9 |
| Distinct shells | ≥ 2 | ≥ 4 | ≥ 6 | ≥ 8 per culture quarter |
| Top shell share among dwellings | ≤ 0.5 | ≤ 0.35 | ≤ 0.25 | ≤ 0.2 |
| Two houses on one shell differ on ≥ 3 axes (porch or steps, openings, roof detail, condition, trade dressing, yaw or mirror) | yes | yes | yes | yes |
| Pieces within 12 m per dwelling, p50 | ≥ 15 | ≥ 20 | ≥ 25 | ≥ 40 |
| Minimum set per dwelling: door, light, roof detail, windows (unless "none by design", building-depth-and-variety.md §4), ≥ 5 personal clutter | yes | yes | yes | yes |
| Non-dwelling share | 97 Part F bands | same | same | same |

- **Shell** = the largest-volume piece of a building. **Signature** = the
  sorted list of the building's distinct pieces, condition variants
  included.
- **Province-wide:** one exact assembly (a full signature) appears at most
  3 times in the province and never twice within 2 km.
- The culture's reachable shell count sets the ceiling on the shells row;
  a grammar that cannot reach its tier's row is a sourcing gap, shown as a
  gap (breadth doc §3, reachability).

**Evidence (plugin data).** Distinct forms per settlement were measured
over Skyrim.esm + Update.esm and Black Marsh.esm + Black Marsh North.esp
with `mine_settlement_form_stats.collect` (building = pieces within 8 m,
settlement = 4 or more buildings within 45 m). Skyrim p50: 2 shells and a
0.50 top-shell share at 4–6 buildings; 6 shells, 0.29 at 7–12; 13 shells,
0.19 at 13–25; 26 shells at 26+. BM&V's Black Marsh villages repeat one
shell 43–71 % of the time, the sparseness the owner reacted to. Vanilla
houses carry 19.5–69.5 pieces within 12 m. The table's shell and share
rows are the Skyrim p50s rounded to be at least as strict at village tier
and above; the dressing rows sit at or below the vanilla range because
marsh houses stand closer to water.

**Why the cap went.** It was scoped to a family in a region, not to what
the player sees (25 % of 200 mud houses allows 50 copies of one assembly,
ten of them in one view). It was stricter than the source games for
hamlets and looser than Skyrim for villages. It said nothing about how
lived-in a house looks.

### 2. Tropicalisation is by texture, never by mesh

A vanilla family is used in Black Marsh only if all three hold (rules 1
and 3 as first ruled; rule 2 as amended 2026-09-24):
1. Its silhouette carries no Nord mark: no carved dragon gables, no
   snow-scaled Nord stone massing, no Nordic burial, Dwemer or Akaviri
   architecture.
2. No texture it samples carries snow, frost, ice or a Nord-painted
   motif (dragon carvings and tiles, hold banners, burial-hall murals),
   unless that texture is repainted by Tropical Skyrim or aliased
   (`textureAliases`) to a texture of the same material that carries
   none. Neutral stone, timber, thatch and plaster textures pass
   unrepainted: stone forts and Markarth stone sit in Black Marsh as they
   are. (Planner ruling, Fable 2026-09-24, replacing the earlier rule
   that every sampled texture be repainted: Tropical Skyrim changes only
   108 of 1,238 vanilla architecture and dungeon diffuse maps, and 180 of
   its 368 architecture files are vanilla copies, so the earlier rule
   failed families whose textures were never wintry.)
3. Its material is on the culture's row it serves in 97 Part F.

A family that fails rule 1 stays out whatever the texture. A texture that
fails rule 2 gets an alias or a repaint, or the pieces that sample it stay
out. The measured verdicts per family are in the breadth doc §2.

### 3. Provenance warnings, ruled usable

Two meshes drew provenance warnings in the breadth research: the "swamp
house" mesh (BM&V `architecture/swamp house.nif` and HTBM
`villages/kothringi/swamp house`; Nexus skyrim 89966 says a mesh of that
name came from *Sniper: Ghost Warrior 2*) and King of the Murkmire's
`blackwood/shiveringhouse_#` (reads as a Shivering Isles building). The
owner ruled on 2026-09-24 that their permission covers every asset in the
pool, these two included: the warnings are noted here and both meshes are
usable in kits and places.

## Consequences

- 97 Part F points here for the variety rule; the placement playbook's
  variety gate reads this record (standard 13).
- 16h part 2 item 31 (building checks as gates) and the 16i acceptance
  check this table; the workbench's repetition-signature command computes
  the signature defined above.
- route-spans-v1 and route-structures-v1 carry Nordic pieces that fail
  rule 2.1; their replacement is queued as 16h part 2 item 32.
- Project Rainforest's repaints (Windhelm streets and ground, caves,
  dungeon root) join the texture fallback as a second overlay behind
  Tropical Skyrim: 16h part 2 item 37.

## Addendum 2026-09-25 ([0099](0099-places-are-built-in-a-loop-until-the-skill-is-proven.md), 0100)

The 16i acceptance named above is now the 16k slice gates: the place-completeness
checklist rows marked Gate, this table (`wb.py signature`) and the breadth bars
in `world/sources/placement/breadth-bars.json`.
