# Polish backlog (Phase P — plan §86)

Rolling list for the general polish pass (module 95, "Phase P"). Add items
freely (owner or agents); one line each, with source and a concrete "done"
test. Remove items when shipped. This file is the single place deferred
cosmetic/feel work lives — do not park polish items in decision docs.

| Item | Source | Done when |
|---|---|---|
| Water: hero-pool interactive sim patches (jeantimex) at select POIs | 8b deferred (0025) | a hero pool ripples/reflects at full sim quality |
| Water: FFT open-sea tier (abyssal-ocean) for Topal Bay horizon | 8b deferred (0025) | open-sea swell quality on high tier, no perf regression |
| Water: projected bed caustics | 8b deferred (0025) | moving caustics on shallow beds in sun |
| Water: waterfall mist particles / sourced Skyrim FX meshes at major falls | 8b round 7 | falls carry mist + base splash FX beyond shader treatment |
| Water: any residual "barcode" foam artefacts after round-7 fix | 8b round 7 | none visible in a province sweep |
| Water: walk-mode SSR cost reduction + further DPR/rtScale tuning | 8b perf rounds | steady frame rate on owner's machine in dense water areas |
| Region raster reclassification (map tooltip coarse regions vs 8b water truth) | 8b round 5 §9 | tooltip region shapes match rendered water |
| Physics mass-unit scale cleanup (ecctrl capsule ~0.25 units vs real-mass props) | 8b round 6 §5 | one consistent mass scale; Phase 9 boats depend on it |
