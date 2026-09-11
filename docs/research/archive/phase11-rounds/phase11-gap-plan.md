# Phase 11 — the gap-filling plan (2026-09-07), closed

This was the batch plan written from the 2026-09-07 claims-vs-code review of
Phase 11: four read-only audits checked every claim in decision 0041 against
the code, the data and the tool output, and each gap became a batch with its
own files and acceptance test. Every batch was either closed by 2026-09-10 or
absorbed into [Phase 16](../../../phases/16-foundation-and-places/README.md);
nothing here is a live instruction. The full 1,057-line text is in git history:
`git log -- docs/research/archive/phase11-rounds/phase11-gap-plan.md`.

| Batch | What it was | Outcome |
| --- | --- | --- |
| B1 | Round B massing pipeline — compiled settlements rendered as placed kit pieces in World Studio | absorbed into 16h (settlement runtime) |
| B2 | Terrain chain rebuild with the corrected route grader | absorbed into 16c (water/terrain chain) |
| B3 | Derived district and combat-space boundaries instead of hand-drawn boxes | closed 2026-09-08 |
| B4 | Module 97 §G open mechanisms (G18 dressing, G19 connectors, G8 flood band, G9 dock depth, G11 terrain requests, G13 first node) | G18/G19/G9/G13 closed 2026-09-08; G8 and G11 absorbed into 16c |
| B5 | Province plot re-solve: evenness, plus the 28 dots the water rebuild drowned | absorbed into 16g (macro plot) |
| B6 | One province extent | closed 2026-09-08 |
| B7 | Python tests as a CI gate | closed 2026-09-08 |
| B8 | Smaller items: Nine-Trunks dock side, Sap-Tapping dry-dock splice and the rest | closed 2026-09-09, except the published-waterway regeneration absorbed into 16c |
| B9 | Macro promise to final delivery contract (owner 2026-09-08) | closed 2026-09-08 |
| B10 | Phase 11 test and probe efficiency | optimisation closed 2026-09-09; the final profile absorbed into 16i (exemplars) |
| B11 | Sap-Tapping's landing standing 91 m from any water | closed 2026-09-09 (the place moved) |
| B12 | `grade_routes._water_fields` — wetness read from signed depth, not the class raster | absorbed into 16c |
| B13 | Hand-over from the paused 2026-09-09 session: class-versus-geometry audit and the water-raster consumer batch | audit closed 2026-09-09; the consumer batch absorbed into 16c |
| B14 | Places have EXTENT — typed footprints and typed proximity | closed 2026-09-09 |
| B15 | Place water facts versus the shipped water | root causes closed 2026-09-09; the three queued items absorbed into 16c |
| QA round | Gates that could not fail | closed 2026-09-09 |
| Held rollouts | The two rollouts held on the water pass | absorbed into 16e (routes and spans) and 16i (exemplars) |
