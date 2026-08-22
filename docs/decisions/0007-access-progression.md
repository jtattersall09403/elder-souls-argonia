# 0007 — Deep-marsh access progression model (Phase 4 deliverable)

**Date:** 2026-08-22 · **Status:** accepted (pass 1; refined when systems land)

Fixed danger (decision 0004) means the world never softens: the player earns
depth. The danger field's own structure defines the progression geography —
each band corresponds to the capabilities that make it survivable:

| Band | Ground | What opens it |
|---|---|---|
| 1–2 | cities, road corridors, coasts | nothing — starting play space |
| 3 | wild fringe, uplands, travelled marsh edges | basic combat capability, disease/insect preparation (alchemy, salves), route knowledge |
| 4 | interior swamp, remote southern marshes | swimming skill + breath (or Argonian physiology), boats for channel travel, local guides, resistance gear, safe-rest knowledge |
| 5 | Middle Argonia around Helstrom, deepest rootlands | strong builds + water-breathing/fast-swim magic, boat upgrades, faction/tribal trust, rootworm transit access, Hist-related quest states |

Mechanisms (all lore-grounded, master plan §12.4/§19):

- **Boats** collapse travel cost on the waterway network (compiled lanes) but
  not danger off-lane; grounding/draft rules gate side channels.
- **Rootworm transit** (The Argonian Account) bypasses surface danger between
  deep stations, gated by tribal/Hist trust — the canonical "fast travel into
  peril" for those the marsh accepts.
- **Guides and tribal standing** (ESO travel-advice text) reduce effective
  hazard through knowledge, not stat scaling — implemented later as explicit
  buffs/route reveals, never as world softening.
- Loot/rewards stay fixed by place (plan §12.3): band-5 prizes are reachable
  early by exceptional preparation — that asymmetry is the game.

CI guard (from 1b onward): no `playerLevel` in any generation input (0004).
