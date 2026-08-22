# 0002 — Era policy and source confidence

**Date:** 2026-08-22 · **Status:** accepted

## Frozen production era: early Fourth Era, canonical date 4E 201

Rationale:

- matches the Skyrim-derived asset base (architecture, equipment, creatures);
- post–Oblivion Crisis and post-Umbriel (4E 48), so the strong world states
  apply: An-Xileel ascendancy, Imperial withdrawal in decay rather than in
  force, Lilmoth's half-sunken Imperial districts, Argonian pressure on the
  Morrowind border (Thorn/Stormhold frontier), no Ministry of Truth;
- close to the community Inkarnate map's stated 4E 231 frame, so its settlement
  prominence prior needs no era translation;
- ESO-era (2E) sources remain usable for places, tribes and ecology but must be
  down-weighted for political state, per the confidence schema.

Lore facts recorded in world sources must carry an `era` range; anything whose
era is not early-4E-compatible needs explicit reinterpretation before use.

## Source confidence

The `CanonDatum` / `SourceConfidence` schema in the master plan §13 is adopted
as written. The master plan's own source register is the seed registry;
a structured `world/sources/source-registry/` is created in Phase 2 when map
data ingestion starts.
