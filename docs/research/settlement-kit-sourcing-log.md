# Settlement kit sourcing log — Phase 11 Part 0 item 6b

**Delivered 2026-09-02** against decision
[0041](../decisions/0041-phase11-settlement-decisions.md) Part 0 item 6b, from
the gap list in [settlement-asset-inventory.md](settlement-asset-inventory.md)
(that file and its JSON twin are owned by the inventory agent — this log records
only what was *downloaded, registered and kitted*).

Archives live in the vault (`mod-sources/archives/`), never in git. Every pool
below is credited in the root [README](../../README.md) § Credits and checked
mechanically by `python3 -m worldgen.check_credits`.

## What was downloaded

| Mod | Nexus | Version | sha256 (first 16) | Pool | Verdict |
|---|---|---|---|---|---|
| Mud Mother Grove — An Argonian Mud Hut (GeminiVoid) | SSE 146557 | 1.5.1 | `7ac552437eeac11f` | `mudmother` | **the find of the pass** — 62 meshes incl. `MudHut01`, `ThatchRoofing`, `RoundFloor01`, woven furniture/fences, tents, carapace oven, fish rack, totem, bone chime, Sithis shrine and **`HistTree` (27 × 28 × 22 m)** |
| Skyrim Ferries (Mharlek1; meshes by yamadori) | SSE 109843 | 1.4.1 | `2fb9aae7ba870042` | `ferries` | 89 meshes; `plank_ferry_swamp_01/03` + `rowboat_ferry_swamp_01` are our first keel-less hulls. **Caution:** `plank_ferry_swamp_02/04/05/06` are editor markers with no geometry |
| RowBoats and Oars of Skyrim (PraedythXVI) | SSE 35341 | Final | `9edfe3ebe786a00f` | `rowboats` | 3 meshes (rowboat, animated rowboat, oar) — keeled, so **Imperial fringe only** |
| Creation Club Ayleid Ruin Resources (SarthesArai) | SSE 83999 | 1.0 | `03f9203f14744f48` | `ayleidcc` | 68 meshes, **all interior modules** — does *not* close the stepped-pyramid exterior gap |
| Xalfek — An Argonian Home (DexMods) | SSE 55595 | 1.0 | `e341443b7de89f1a` | `xalfek` | 72 interior prop/furniture meshes (bundled modder resources) |
| Darkwater Den (Elianora) | classic 52630 | 1.2 | `60a2ec29e6348b13` | `darkwater` | 123 organic-interior clutter meshes (bundled modder resources) |
| Marsh-Rest (Konrann) | classic 50111 | 1.01 | `bea64fc2e213a1e8` | *none* | **Downloaded, deliberately not registered:** ESP-only player home built entirely from vanilla assets. It contributes no meshes, so it gets no pool and no credit line. |

Full metadata (file ids, sizes, hashes, upload names) is cached in the vault at
`mod-sources/api/<modId>-mod.json` / `-files.json`.

## Gap status after this pass

| # | Gap | Status |
|---|---|---|
| 1 | No modular mud-hut kit | **closed enough for v1** — one mud shell plus thatch, deck, fences, tents, furniture and props that read as one culture. Still a *shell*, not a modular wall kit; instance variety must come from dressing and rotation |
| 2 | No stepped-pyramid xanmeer exteriors | **still open** — CC Ayleid is interior-only. Check the vault's own xanmeer mod before buying anything else |
| 3 | No Argonian cultural props | **largely closed** — totem, bone chime, painted urn, pottery, woven furniture, carapace oven, fish rack, Sithis shrine. **Grave-stakes remain absent** |
| 4 | No rafts or canoes | **closed for rafts, open for canoes** — 2 poled plank rafts + 1 swamp rowboat. No dugout or twin-hulled platform canoe |
| 5 | No Hist tree asset | **closed** — `mudmother:gv_meshes/argoniannest/histtree` |
| 6 | Thin working/industrial props | **partly** — fish rack and carapace oven only; no saltern, kiln or reed-cutting gear |
| 9 | BM&V archived | **not a blocker** — `RarSource` pulls single members from `Data1.rar`/`Data2.rar` on demand (~0.1 s each), so no bulk extraction was needed or done |

## The kits

Three configs, not one, because
[material-culture.md](../../world/sources/lore/extrapolation/topics/material-culture.md)
forbids blending the building cultures in a settlement — separate kits make the
blend impossible by construction rather than by a placement rule:

| Kit | Culture | Assets | GLB |
|---|---|---|---|
| `settlement-mud-v1` | Shadowfen mud/wattle | 33 | 19.2 MB |
| `settlement-stilt-v1` | Murkmire reed/stilt (passerelles + shackkit) | 26 | 14.0 MB |
| `settlement-imperial-v1` | Imperial/foreign stone-timber | 11 | 8.1 MB |

Configs: `tooling/asset-pipeline/pipeline/config/kits/settlement-*-v1.json`.
Outputs land in `tooling/asset-pipeline/output/kits/` (gitignored — rebuild with
`python3 -m pipeline.build_kit --kit <id>`).

### Vet results, and how to read them

`python3 -m pipeline.vet_kit output/kits/<kit>.kit.json` is clean apart from:

- **one untextured material** on `argonianbonechime01` (an anonymous sub-mesh);
- ~30 **"pivot above base"** findings across all three kits. These are
  **expected and not defects**: `vet_kit` was written for flora, which is
  bottom-anchored to terrain. Architecture kit pieces snap to the 3.64 m grid
  around a *centred* pivot — a dock straight and a passerelle section are
  *supposed* to have their origin mid-height. The settlement compiler must place
  kit pieces by grid transform, never by the flora bottom-anchor path.

Excluded after vetting, with reasons recorded in each config's description:
`wovenfence01` and `argonianbonechime02` (no renderable geometry),
`chitinchair01` (needs Dragonborn DLC textures the vault does not hold),
`plank_ferry_swamp_02/04/05/06` (editor markers).

## Pipeline changes this required

- `pipeline/bsa.py` now reads **BSA v105** (SSE): 24-byte folder records and
  LZ4-frame blocks. Three of the seven mods ship v105 archives, so this was a
  root-cause fix rather than an unpack-by-hand workaround. Adds an `lz4`
  dependency, imported only on the v105 path.
- `pipeline/build_kit.py` resolves extracted-directory pools from one table
  instead of an `if` per mod.
- Mud Mother Grove's `Data/` wrapper is **flattened at unpack time**. Nested
  layouts silently export every material untextured, because Blender resolves a
  NIF's texture paths relative to the folder above `meshes/` — this cost a full
  rebuild to find and is now written into the pipeline README.
