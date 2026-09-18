"""Generate `world/sources/flora/palettes.json` — the evidence-based v2.

Why a generator: the v1 palettes hand-wrote ~60 layers and the same structural
mistakes repeated in every one (dry species hard-gated to the water table,
one flat stratum, no scenes). v2 has ~140 layers across 13 regions built from
a small set of ARCHETYPES that encode the evidence once:

* **Strata** (research/vegetation/tropical-vegetation-ecology-targets.md §7): landmark
  giants (owner 0036 Q2) / emergents / canopy / understory / shrubs, with
  per-landscape densities from the game-translation table.
* **Four water postures** (research/vegetation/mod-vegetation-micro-siting.md M1):
  depth-sorted aquatics, waterline-committed trees, bimodal drowned trees,
  and a WADING terrestrial matrix (dry species run ~0.35 m into the water —
  this, not the aquatics, is what makes a marsh read flooded).
* **Signed riparian boost** (M2): wetland matrix ×~2 at the bank easing by
  ~40 m; dry country inverts and stands back from rivers.
* **Pool guilds** (M3): each ~220 m guild tile is a lilypad pond OR a reed
  bed OR a drowned thicket, never a blend.
* **Edges and gaps** (ecology §1.4/§6.2): gap-fill thickets on the open end
  of the shared openness field, green walls on its mid band, interior kept
  comparatively open at eye level — the "impenetrable jungle" is edge and
  regrowth, not interior.
* **Gallery ribbons** (ecology §6.1): open landscapes carry closed-forest
  ribbons within ~35 m of watercourses with an abrupt outer edge.

Species must all be in flora-province-v1 (the kit config lists them; adding
a species here means adding it there and rebuilding — 0036 run-book step 3).

Run:  python3 -m worldgen.build_palettes     (from tooling/world-generation)
Then: python3 -m worldgen.compile_scatter --report ... per the 0036 run-book.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from . import dressing_zones as dz          # 16f rocks and dressing zones
from . import landcover as lc
from . import rock_dressing as rd           # 16f rocks and dressing zones
from .regions import REGION_CLASSES         # 16f rocks and dressing zones
from .vegetation_ladder import (MEASURED_ATTENUATION, MEASURED_DELIVERED_PER_HA,
                                TARGET_RATIOS, is_stem_layer, multipliers)

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"

# Asset ids, aliased so the region tables below read like the ecology tables.
S = {
    "cypress_big": "bmv:landscape/trees/cypress1",
    "cypress": "bmv:landscape/trees/cypress3",
    "jungle_tree_hero": "bmv:landscape/trees/gkbjungletreenew12v3",
    "jungle_tree": "bmv:landscape/trees/gkbjungletreenew1",
    "mangrove_a": "bmv:landscape/trees/mangrovereachtree0gkb3",
    "mangrove_b": "bmv:landscape/trees/mangrovereachtree0gkb9",
    "willow_a": "bmv:landscape/trees/treewillow01a",
    "willow_b": "bmv:landscape/trees/treewillow02a",
    "willow_c": "bmv:landscape/trees/treewillow03a",
    "cedar": "bmv:landscape/trees/cedartree3",
    "juniper": "bmv:landscape/trees/dwarfjunip05",
    "palm_a": "bmv:landscape/trees/beachpalm1",
    "palm_b": "bmv:landscape/trees/beachpalm2",
    "palm_c": "bmv:landscape/trees/beachpalm3",
    "fanpalm": "bmv:landscape/trees/fanpalm1",
    "bamboo": "bmv:landscape/trees/bambooplant",
    "trop_plant": "bmv:landscape/trees/tropicalplant01",
    "trop_shrub": "bmv:landscape/trees/tropicalshrub01",
    "vines_a": "bmv:landscape/trees/hangingvines1",
    "vines_b": "bmv:landscape/trees/hangingvines2",
    "fall_shrub": "bmv:landscape/trees/gkbfallforestshrub02",
    "lilypad": "bmv:landscape/trees/gkblillipad2",
    "moss_a": "bmv:landscape/plants/florahangingmoss02aaa",
    "moss_b": "bmv:landscape/plants/florahangingmoss03aaa",
    "fern_big": "bmv:landscape/plants/fernlarge03",
    "fern": "bmv:landscape/plants/fern01",
    "manfern": "tropical:plants/tropical/manfern",
    "bracken": "bmv:landscape/plants/braken",
    "big_shrub": "bmv:landscape/plants/bigshrub2(colorful)",
    "loebush": "bmv:landscape/plants/esloebush08",
    "chickweed": "bmv:landscape/plants/chickweed",
    "shroom": "bmv:vurt_shroom/vurt_shroom_big1",
    "kelp_tall": "bmv:landscape/plants/kelptallstatic01aaa",
    "wkelp_tall": "bmv:landscape/grass/waterkelptall01",
    "wkelp_short": "bmv:landscape/grass/waterkelpshort01",
    "reeds": "bmv:landscape/grass/vurt_reeds",
    "algrass": "bmv:vvardenfell/flora/algrass03b",
    "moss_rock": "bmv:landscape/rocks/moss_rockcliff01",
    # Closed vanilla boulders (round 5, A2). moss_rockcliff01 is an
    # open-backed cliff-face DRESSING shell — freestanding scatter needs
    # meshes that are closed on every side, which these are (measured by the
    # rock-probe kit: convex collision, single-sided, 1.5–6.0 m).
    "boulder_hero": "vanilla:landscape/rocks/rockl04",     # 5.96 m
    "boulder_big": "vanilla:landscape/rocks/rockl02",      # 3.75 m, broad
    "boulder_mid": "vanilla:landscape/rocks/rockm03",      # 2.45 m
    "boulder_small": "vanilla:landscape/rocks/rockm02",    # 1.88 m
    "stone": "vanilla:landscape/rocks/rocks03",            # 1.47 m
    # Tall jungle canopy (round 5, A4): the region had NO tree over 8 m, so it
    # read as clumps of bushes. Heights measured by the jungle-canopy-probe
    # kit; all three carry a base pivot and a billboard.
    "jungle_tall": "bmv:landscape/trees/gkbjungletreenew17v2tropical",  # 14.4 m
    "jungle_tall_b": "bmv:landscape/trees/gkbjungletreenew19v3",        # 13.9 m
    "jungle_mid": "bmv:landscape/trees/gkbjungletreenew21v3",           # 11.4 m
    # ROUND 7 (owner: "these look like oak trees; do we have specifically
    # TROPICAL tall jungle trees with wide canopies?"). A 102-mesh probe of
    # both pools, rendered and measured (`pipeline.render_sheet`), settled it:
    # round 6's wide-crowned picks really were temperate — gkbwrtempletree03
    # is a textbook English oak, cedartree5 a cedar of Lebanon, gkbtreeofwolene
    # a bare winter oak, giantredwood a conifer. They are GONE.
    #
    # It also showed that NEITHER mod ships a 30-40 m broad-crowned rainforest
    # tree. The genuinely tropical giant in the pools is Tropical Skyrim's
    # Anvil tree, and it ships as PARTS — a trunk, fern-palm crowns and a
    # buttress-root flare. So the roof is now two COMPOSITES (kit config
    # `compose`), assembled from the mod's own geometry:
    "anvil_canopy": "composite:jungle/anvil-canopy-tree",   # 42.4 m, 33.8 m crown
    "anvil_giant": "composite:jungle/anvil-emergent-giant",  # 66.7 m, 36.7 m crown
    # ...plus the two broadleaves that DO read tropical, upscaled uniformly
    # (proportions preserved; only texel density drops, and these are 30 m
    # overhead) to reach the owner's 30-40 m roof band:
    "fig_dome": "bmv:landscape/trees/treeofwolene4",        # 20.6 m, 20.9 m crown
    "jungle_gnarled": "bmv:landscape/trees/gkbjungletreenew30v3",  # 15.9 m, 18.6 m
    "fanpalm_tall_b": "bmv:landscape/trees/fanpalm4",       # 23.6 m clean palm
    "fanpalm_broad": "bmv:landscape/trees/fanpalm6",        # 18.9 m, 21.0 m crown
    "fanpalm_tall": "bmv:landscape/trees/fanpalm3",        # 23.4 m clean palm
    # REGIONAL VARIETY (2026-09-08, decision 0036 addendum): the province-wide
    # rollout showed the 40-species set repeating between regions (lowland
    # shared 90 % of its tree weight with the jungle, the lake 100 % with the
    # river). Each region now carries a SIGNATURE species drawn from the
    # measured candidate sheets (output/sheets/*/sheet.md) and the registry;
    # heights are source-scale metres. Audit: docs/research/vegetation/
    # regional-variety-audit-2026-09-08.md.
    "pine_a": "bmv:landscape/trees/scottish-pine22",        # 29.2 m — northern border (Lore:Thornmarsh "more temperate")
    "hill_aspen_a": "bmv:landscape/trees/gkbtreeaspen02jungle",  # 19.0 m slender broadleaf, 380 tris
    "hill_aspen_b": "bmv:landscape/trees/gkbtreeaspen03jungle",  # 14.2 m
    "hill_aspen_small": "bmv:landscape/trees/gkbtreeaspen05jungle",  # 10.6 m
    "alder": "bmv:landscape/trees/hodalder01gkb",            # 14.5 m streamside alder
    "gorse": "bmv:landscape/trees/ztgorsebush02lightyellow", # 4.5 m flowering scrub
    "flatpalm_a": "bmv:landscape/trees/flatpalm1",           # 13.7 m (author eid 00tropicpalm)
    "flatpalm_b": "bmv:landscape/trees/flatpalm2",           # 15.6 m
    "mangrove_c": "bmv:landscape/trees/mangrovereachtree0gkb2",  # 12.8 m (01MANGROVE)
    "mangrove_d": "bmv:landscape/trees/mangrovereachtree0gkb8",  # 8.4 m (01MANGROVE3white)
    "datepalm": "bmv:landscape/trees/datepalm2",             # 19.0 m (00thickpalm)
    "coconut_palm": "bmv:landscape/trees/beachpalm5",        # 15.5 m, 17 m crown
    "fanpalm_wide": "bmv:landscape/trees/fanpalm5",          # 20.4 m, 19.7 m crown
    "column_cypress_a": "bmv:landscape/trees/gkbcyrodilcypress1",  # 23.4 m columnar (GRtree6)
    "column_cypress_b": "bmv:landscape/trees/gkbcyrodilcypress2",  # 23.4 m
    # REJECTED on the 2026-09-08 sheet (output/sheets/regional-variety-2026-09-08):
    # treefern_huge/tall (BM&V "my_own_made") reference textures by an absolute
    # "g:/berkians folder/..." path that Wine/Blender cannot resolve — white
    # fronds; ethas/paradise-b and scottish-pine33 carry crossed LOD cards
    # inside the L0 mesh. Tropical Skyrim's manfern is the tree fern instead.
    "shroom_giant": "bmv:vurt_shroom/vurt_shroom_big6",      # 15.2 m fungus (01muckspone2)
    "tallmush_a": "bmv:trdata/mushrooms/tr_oth_tallmush01",  # 8.0 m
    "tallmush_b": "bmv:trdata/mushrooms/tr_oth_tallmush05",  # 8.4 m
    "snag_a": "bmv:vurt/deadtrees/dead_bc_tree_01",          # Bitter Coast dead trees (vurt)
    "snag_b": "bmv:vurt/deadtrees/dead_bc_tree_02",
    "snag_c": "bmv:vurt/deadtrees/dead_bc_tree_04",
    "stick_tree_a": "bmv:landscape/trees/gkbjungletreenewsticktree11",   # 11.3 m thin
    "stick_tree_b": "bmv:landscape/trees/gkbjungletreenewsticktree20v2", # 12.0 m
    "umbrella_tree": "bmv:landscape/trees/gkbjungletreenew10",  # 14.8 m, 23 m flat crown
    "rain_tree": "bmv:landscape/trees/gkbjungletreenew3",       # 23.3 m, 34 m crown (GRTree9)
    "banana": "bmv:plants/trees/banana_tree",                # 4.6 m
    "water_lily_a": "bmv:landscape/plants/water lily1",      # flowering pads (water-surface class)
    "water_lily_b": "bmv:landscape/plants/water lily2",
    # ROUND 12 (decision 0048 addendum): region-EXCLUSIVE understory. Every
    # size below is the metre bound the kit build measured (probe-understory,
    # 2026-09-09), not a registry guess — several of these recorded 0,0,0
    # before the build that measures them ran. Each is placed in a set of
    # region classes that never touch on the shipped region raster, so a
    # player crossing a boundary meets plants they have not seen.
    "reed_large": "bmv:landscape/trees/reedlarge1",    # 8.27 × 7.09 × 2.81 m, 12 tris
    "reed_med": "bmv:landscape/trees/reedmed1",        # 6.37 × 5.97 × 2.81 m, 12 tris
    "reed_small_a": "bmv:landscape/trees/reedsmall1",  # 1.54 × 1.30 × 2.40 m, 4 tris
    "reed_small_b": "bmv:landscape/trees/reedsmall2",  # 1.13 × 1.30 × 2.40 m, 4 tris
    # Measured identical to the `lilypad` already in use — same 0.938 × 0.814
    # × 2.334 m bounds, same 6 triangles, same origin at the TOP of the mesh
    # (the pads sit at the water plane and the stems trail 2.33 m below it).
    # The one difference is the pad texture: lillipads2 against lillipads3.
    # A hue variant, therefore, and it is placed in the same lilypad role.
    "pond_reedpad": "bmv:landscape/trees/gkblillipad",
    # Bracken. Kept on the texture, not the name: the diffuse averages hue
    # 101° / 94°, saturation 0.35–0.40 over its opaque texels — a live green
    # frond, not the rust-brown of dead temperate bracken. Six single stands
    # (6–240 tris) and six modelled clusters (336–1424 tris, ~3 m spread).
    "brack_a": "bmv:landscape/plants/espfernbraken01st",  # 0.98 × 0.77 × 0.91 m
    "brack_b": "bmv:landscape/plants/espfernbraken02st",  # 0.68 × 0.90 × 1.10 m
    "brack_c": "bmv:landscape/plants/espfernbraken03st",  # 0.98 × 0.89 × 1.45 m
    "brack_d": "bmv:landscape/plants/espfernbraken04st",  # 1.77 × 1.72 × 0.98 m
    "brack_e": "bmv:landscape/plants/espfernbraken05st",  # 1.73 × 1.68 × 1.07 m
    "brack_f": "bmv:landscape/plants/espfernbraken06st",  # 1.70 × 1.88 × 1.03 m
    "brackclump_a": "bmv:landscape/plants/espfernbrakencluster01",  # 2.94 × 2.75 × 1.45 m
    "brackclump_b": "bmv:landscape/plants/espfernbrakencluster02",  # 3.00 × 3.30 × 1.15 m
    "brackclump_c": "bmv:landscape/plants/espfernbrakencluster03",  # 3.33 × 1.95 × 0.91 m
    "brackclump_d": "bmv:landscape/plants/espfernbrakencluster04",  # 2.69 × 1.25 × 1.76 m
    "brackclump_e": "bmv:landscape/plants/espfernbrakencluster05",  # 3.12 × 1.90 × 1.17 m
    "brackclump_f": "bmv:landscape/plants/espfernbrakencluster06",  # 2.00 × 1.56 × 1.31 m
    # Colour variants of the shrub already in use: same 5.22 × 5.35 × 3.19 m
    # geometry, different foliage texture — variety of hue, not of silhouette.
    "big_shrub_b": "bmv:landscape/plants/bigshrub-b(colorful)",
    "big_shrub_c": "bmv:landscape/plants/bigshrub-c(colorful)",
    "coral_grass": "bmv:landscape/grass/watercoralgrass01",     # 1.42 × 1.17 × 1.26 m
    "seaweed_clump": "depths:landscape/grass/tbp_seaweed06",    # 7.39 × 6.74 × 4.21 m
    "seaweed_clump_b": "depths:landscape/grass/tbp_seaweed06var1",
    "wkelp_tall_b": "depths:landscape/grass/waterkelptall02",   # 1.52 × 1.43 × 3.98 m
    "wkelp_tall_c": "depths:landscape/grass/waterkelptall03",
    "kelp_short_b": "vanilla:landscape/plants/kelpshortstatic01",  # 0.73 × 0.79 × 1.36 m
    "fungal_pod_a": "vanilla:plants/floraswampfungalpod01",     # 1.37 × 1.07 × 0.43 m
    "fungal_pod_b": "vanilla:plants/floraswampfungalpod02",     # 0.51 × 0.65 × 0.29 m
    # --- UPLAND DRESSING (16f deliverable 11) -----------------------------
    # The sixteen vanilla upland pieces the flora kit shipped and no palette
    # placed. Sizes are the kit manifest's measured LOD0 bounds; every
    # placement figure each layer carries is read from the mined vanilla
    # record (`vanilla-tamriel-placement.json`), never typed here.
    "dead_shrub": "vanilla:landscape/plants/deadshrub01",       # 5.58 x 3.76 x 2.49 m
    "tundra_shrub_a": "vanilla:landscape/plants/tundrashrub01",  # 1.74 x 3.50 x 1.06 m
    "tundra_shrub_b": "vanilla:landscape/plants/tundrashrub02",  # 3.03 x 3.36 x 1.05 m
    "tundra_shrub_c": "vanilla:landscape/plants/tundrashrub03",  # 7.45 x 5.23 x 1.21 m
    "tundra_scrub": "vanilla:landscape/plants/tundrascrub01",    # 5.51 x 5.54 x 1.38 m
    "reach_shrub": "vanilla:landscape/plants/reachshrub01",      # 2.34 x 1.96 x 1.82 m
    "thicket": "vanilla:landscape/plants/thicket01",             # 2.60 x 3.05 x 2.03 m
    "mtn_flower_purple": "vanilla:plants/floramountainflower01purple",
    "mtn_flower_blue": "vanilla:plants/floramountainflower01blue",
    "mtn_flower_red": "vanilla:plants/floramountainflower01red",
    "pine_log_a": "vanilla:landscape/trees/treepineforestlog01",   # 7.24 x 15.73 x 4.28 m
    "pine_log_b": "vanilla:landscape/trees/treepineforestlog02",   # 7.96 x 11.17 x 6.33 m
    "pine_stump_a": "vanilla:landscape/trees/treepineforeststump01",   # 9.14 x 8.04 x 7.45 m
    "pine_stump_b": "vanilla:landscape/trees/treepineforeststump02a",  # 11.00 x 10.47 x 7.22 m
    "aspen_log": "vanilla:landscape/trees/treeaspenlog01",        # 4.71 x 10.84 x 3.65 m
    "aspen_stump": "vanilla:landscape/trees/treeaspenstump01",    # 5.08 x 4.85 x 4.00 m
    # --- UNDERWATER BAND (2026-09-16) -------------------------------------
    # The drowned layer's own species, all in `underwater-v1`. Sizes are the
    # kit manifest's measured LOD0 bounds.
    "kelp_tall_v": "vanilla:landscape/plants/kelptallstatic01",   # 1.48 x 1.38 x 3.98 m
    "kelp_short_v": "vanilla:landscape/plants/kelpshortstatic01", # 0.73 x 0.79 x 1.36 m
    "kelp_tree_a": "depths:landscape/grass/tbp_seaweed01",        # 29.3 m column
    "kelp_tree_b": "depths:landscape/grass/tbp_seaweed02",        # 42.7 m column
    "coral_big": "depths:dos/misc/tbp_coralbig",                  # 16.8 x 17.9 x 3.57 m
    "coral_med": "depths:dos/misc/tbp_coralmedium",               # 11.2 x 10.9 x 3.17 m
    "coral_small": "depths:landscape/grass/tbp_coralsmall01",     # 5.40 x 5.33 x 2.66 m
    "algae_mat": "depths:landscape/grass/tbpalgae01",             # 2.94 x 3.65 x 0.37 m
    "driftwood_a": "depths:landscape/grass/tbpcoastdriftwood01",  # 3.11 x 3.08 x 1.51 m
    "driftwood_b": "depths:landscape/grass/tbpcoastdriftwood02",  # 3.20 x 2.19 x 1.39 m
    "clam_a": "vanilla:plants/clam01",
    "clam_b": "vanilla:plants/clamlarge01",
    "clam_c": "vanilla:plants/clamthin01",
    "boards_a": "vanilla:clutter/shipwreck/shipwreckboards01",    # 2.70 m plank
    "boards_b": "vanilla:clutter/shipwreck/shipwreckboards02",
    "boards_c": "vanilla:clutter/shipwreck/shipwreckboards03",
    "rowboat_back": "depths:dos/boats/rowboatbrokenback",         # 2.78 x 3.89 x 1.27 m
    "rowboat_front": "depths:dos/boats/rowboatbrokenfront",       # 2.71 x 4.85 x 1.52 m
    # --- SEA BED (2026-09-18) ---------------------------------------------
    # The owner's walk found the sea bed bare except for kelp, and what it did
    # carry read as "large flat horizontal squares jumbled on top of each
    # other": the three Depths corals, measured at 5:1 in plan with 46-72% of
    # their triangle area within 15 deg of horizontal. They are gone from the
    # kit and from every layer below. Sizes here are the rebuilt kit
    # manifest's measured LOD0 bounds, which is also what set every
    # `scale_range`: Jokerine's pieces are COLLECTABLE clutter, so they are
    # authored at hand-prop size and have to be scaled up to read as bed
    # dressing, and Shores of Skyrim's twelve "shore rocks" measure 0.07-0.16 m
    # - shingle, not boulders.
    "sb_coral": "jokerine:_seaside/coral",                # 0.22 x 0.32 x 0.14 m
    "sb_coral_spiky": "jokerine:_seaside/coral_spiky",    # 0.13 x 0.16 x 0.23 m
    "sb_starfish": "jokerine:_seaside/starfish",          # 0.28 x 0.30 x 0.05 m
    "sb_sponge": "jokerine:_seaside/sponge",              # 0.17 x 0.17 x 0.05 m
    "sb_conch": "jokerine:_seaside/conch",                # 0.16 x 0.32 x 0.15 m
    "sb_sanddollar": "jokerine:_seaside/sanddollar",      # 0.21 x 0.20 x 0.05 m
    "sb_clam_large": "jokerine:_seaside/clam_large",      # 0.36 x 0.28 x 0.09 m
    "sb_scallop_red": "jokerine:_seaside/scallop_red",    # 0.19 x 0.19 x 0.04 m
    "sb_scallop_blue": "jokerine:_seaside/scallop_blue",
    "sb_scallop_yellow": "jokerine:_seaside/scallop_yellow",
    "sb_scallop_greenwhite": "jokerine:_seaside/scallop_greenwhite",
    "sb_scallop_purplewhite": "jokerine:_seaside/scallop_purplewhite",
    "sb_scallop_slate": "jokerine:_seaside/scallop_slate",
    "sb_seashell_a": "shores:shoresofskyrim/seashell02",  # 0.07 x 0.14 x 0.08 m
    "sb_seashell_b": "shores:shoresofskyrim/seashell03",  # 0.15 x 0.14 x 0.05 m
    "sb_snailshell": "shores:shoresofskyrim/snailshell01",  # 0.04 x 0.05 x 0.03 m
    "sb_barnacles": "vanilla:plants/nordicbarnaclecluster01",  # 1.22 x 0.92 x 0.22 m
    "sb_pebbles_a": "bmv:landscape/grass/riverbedpebbles",  # 0.92 x 0.71 x 0.17 m
    "sb_pebbles_b": "bmv:landscape/grass/smallpebbles",     # 0.59 x 0.46 x 0.11 m
    "sb_driftwood_a": "vanilla:landscape/trees/coastdriftwood01",  # 3.11 x 3.08 x 1.51 m
    "sb_driftwood_b": "vanilla:landscape/trees/coastdriftwood02",  # 3.19 x 2.19 x 1.39 m
    "sb_driftwood_c": "vanilla:landscape/trees/coastdriftwood03",  # 2.70 x 1.33 x 0.48 m
    "sb_skull": "vanilla:clutter/bones/humanskull",        # 0.18 x 0.26 x 0.21 m
    "sb_ribcage": "vanilla:clutter/bones/humanribcagefull",  # 0.37 x 0.92 x 0.29 m
    "sb_mammoth_skull": "vanilla:clutter/bones/mammothskull1",  # 2.58 x 3.33 x 2.76 m
    "sb_barrel": "vanilla:clutter/barrel01",               # 0.79 x 0.79 x 1.14 m
    "sb_basket": "vanilla:clutter/basket01",               # 0.50 x 0.49 x 0.44 m
    "sb_bucket": "vanilla:clutter/bucket01",               # 0.50 x 0.54 x 0.43 m
    # tbp_seaweed01 (29.3 m) and tbp_seaweed02 (42.7 m) were rejected in
    # round 2 as giant-kelp columns taller than any water the province
    # carries. That was true at native size and is no longer how they are
    # used: Bethesda's own mine places them at 8-70 m of depth at scale
    # 0.15-1.15, so `deep_kelp_trees` below takes them at 0.15-0.35 in 6-25 m
    # of water, where a 4-10 m stipe is right. floramushroom01–06 measure
    # 2.6 × 2.0 × 0.55 m flat sheets at 2.2–2.8 k tris and take their
    # textures from textures/architecture/farmhouse — surface-applied shelf
    # fungus, not a free-standing floor plant.
}

WADE = 0.35   # M1: terrestrial matrix runs this deep into the water
RIPARIAN_WET = dict(shore_boost_gain=1.35, shore_boost_peak_m=-2.0,
                    shore_boost_half_width_m=25.0)          # M2 marsh shape
RIPARIAN_DRY = dict(shore_boost_gain=-0.55, shore_boost_peak_m=0.0,
                    shore_boost_half_width_m=18.0)          # M2 inverted


# --- what each role is allowed to stand in (the water record, 0066) -------
#
# The scatter reads kind, season and channel geometry from the signed
# hydrology record; a palette says which of the record's kinds a role belongs
# to. Depth alone could never express this — 0.4 m of water is a marsh pool
# or the middle of a river, and only the record knows which.

#: Roles that must never stand in a flowing channel or on its wetted bank.
CHANNEL_EXCLUDED_ROLES = frozenset({
    "canopy", "emergent", "gallery", "understory", "gap-thicket", "green-wall",
    "bank-wall", "landmark-giant", "interior-shrub", "fungal-giant",
    "floor-fungi", "fungal-floor", "forb", "tall-grass", "rock",
    "cliff-dressing",
})
#: Still water and slack water: where a tree can stand in the water at all.
_SLACK_WATER = ("horizontal-backwater", "marsh-fringe", "marsh-deep", "swamp",
                "backswamp", "pond", "pool")
ROLE_WATER_KINDS = {
    "waterline-tree": _SLACK_WATER,
    "drowned-tree": _SLACK_WATER,
    "drowned-tree-dry": _SLACK_WATER,
    "drowned-thicket": _SLACK_WATER,
    # Mangroves are the tidal coast: sea, lagoon, tidal reach, mudflat.
    # a mangrove stands in any still brackish-to-fresh water of its basin:
    # the marsh sheets, the backwaters and the backswamps as much as the
    # lagoon (measured: the lagoon-only list starved region 14 to 0.45 of its
    # 1.40 ratio, 16f)
    "basin-mangrove": ("lagoon", "mudflat", "ocean", "horizontal-tidal",
                       "marsh-fringe", "marsh-deep", "swamp", "backswamp",
                       "horizontal-backwater", "pond"),
    "aquatic-kelp": ("ocean", "lagoon", "lake-lowland", "tarn-upland", "pond",
                     "horizontal-backwater", "horizontal-tidal"),
    "aquatic-lilypads": ("pond", "pool", "lake-lowland", "backswamp",
                         "horizontal-backwater", "marsh-deep"),
    # aquatic-reeds: no kind gate — reeds fringe every kind of water there is.
}
#: Roles that need water that is there all year.
ROLE_SEASONS = {"aquatic-kelp": ("perennial",)}


def layer(species: str, per_ha: float, **kw) -> dict:
    entry = {"species": S[species], "tier": kw.pop("tier", "T2"),
             "instances_per_hectare": round(per_ha, 2)}
    entry.update(kw)
    role = entry.get("role", "")
    if role in CHANNEL_EXCLUDED_ROLES:
        entry.setdefault("channel_exclusion", True)
    if role in ROLE_WATER_KINDS:
        entry.setdefault("water_kinds", list(ROLE_WATER_KINDS[role]))
    if role in ROLE_SEASONS:
        entry.setdefault("season_kinds", list(ROLE_SEASONS[role]))
    return entry


def landmark_giant(species: str, per_ha: float = 0.12,
                   depth=(-6.0, 1.0), slope_max=32.0) -> dict:
    """Owner 0036 Q2: rare ×1.8–2.6 navigation silhouettes, wide clearance."""
    return layer(species, per_ha, tier="T1", role="landmark-giant",
                 clump_size_median=1, clump_size_tail=0.0, singleton_share=1.0,
                 clump_radius_m=0.0, patchiness=0.2, glade_response=0.0,
                 water_depth_m=list(depth), slope_deg_max=slope_max,
                 scale_range=[1.8, 2.6], clearance_radius_m=14.0,
                 respects_clearance=False)


def emergent(species: str, per_ha: float, depth=(-6.0, WADE),
             scale=(1.15, 1.5)) -> dict:
    """Ecology §1.2: the few big-crowned trees standing over the canopy —
    ordinary scale range's top end, not the owner's landmark giants. Species
    that are ALREADY emergent-sized meshes pass their own near-unit scale
    instead of the upscale default. The tropical-jungle region does not use
    this — its emergents are the Anvil giant composite, placed directly."""
    return layer(species, per_ha, tier="T1", role="emergent",
                 clump_size_median=1, singleton_share=0.8, clump_radius_m=10.0,
                 water_depth_m=list(depth), slope_deg_max=34.0,
                 slope_half_angle_deg=25.0, scale_range=list(scale),
                 clearance_radius_m=4.0)


def canopy(species: str, per_ha: float, depth=(-6.0, WADE), scale=(0.65, 1.05),
           slope_max=38.0, riparian=None, clearance=1.6, **kw) -> dict:
    """The closed-canopy workhorse. Wading gate (M1), tropical slope
    tolerance (real rainforest fully covers 25° hillsides — ecology §5.1)."""
    defaults = dict(clump_size_median=4, clump_radius_m=14.0)
    defaults.update(kw)
    defaults.setdefault("patchiness", 1.0)
    defaults.setdefault("glade_response", 0.95)
    defaults.setdefault("glade_band", [0.0, 0.9])   # top ~8%: treefall gaps
    defaults.setdefault("slope_half_angle_deg", 25.0)
    entry = layer(species, per_ha, tier="T1", role="canopy",
                  water_depth_m=list(depth), slope_deg_max=slope_max,
                  scale_range=list(scale),
                  clearance_radius_m=clearance, **defaults)
    if riparian:
        entry.update(riparian)
    return entry


def understory(species: str, per_ha: float, depth=(-6.0, WADE),
               scale=(0.5, 0.9), riparian=None, **kw) -> dict:
    """Saplings and small trees — ecology §1.2's 100–150/ha asset tier."""
    defaults = dict(clump_size_median=5, clump_radius_m=8.0)
    defaults.update(kw)
    defaults.setdefault("patchiness", 1.1)
    defaults.setdefault("glade_response", 0.85)
    defaults.setdefault("slope_deg_max", 40.0)
    defaults.setdefault("slope_half_angle_deg", 28.0)
    entry = layer(species, per_ha, role="understory",
                  water_depth_m=list(depth), scale_range=list(scale), **defaults)
    if riparian:
        entry.update(riparian)
    return entry


def interior_shrub(species: str, per_ha: float, depth=(-6.0, WADE), **kw) -> dict:
    """Sparse under closed canopy (ecology §6.5: primary interior is OPEN at
    eye level) — confined to the closed end of the openness field."""
    return layer(species, per_ha, role="interior-shrub",
                 glade_band=[0.0, 0.58], clump_size_median=4,
                 clump_radius_m=7.0, water_depth_m=list(depth),
                 slope_deg_max=40.0, scale_range=[0.7, 1.2], **kw)


def gap_thicket(species: str, per_ha: float, depth=(-6.0, WADE), **kw) -> dict:
    """Treefall-gap regrowth: shrubs ×4–8 where light reaches the floor
    (ecology §1.4) — the open end of the openness field."""
    defaults = dict(slope_deg_max=40.0)
    defaults.update(kw)
    return layer(species, per_ha, role="gap-thicket",
                 glade_band=[0.62, 1.0], glade_response=0.0,
                 clump_size_median=6, clump_radius_m=6.5,
                 water_depth_m=list(depth),
                 scale_range=[0.8, 1.4], **defaults)


def green_wall(species: str, per_ha: float, depth=(-6.0, WADE), **kw) -> dict:
    """The edge wall (ecology §6.2): dense growth on the mid band between
    closed interior and open glade — where the light gradient lives."""
    return layer(species, per_ha, role="green-wall",
                 glade_band=[0.5, 0.72], glade_response=0.0,
                 clump_size_median=5, clump_radius_m=6.0,
                 water_depth_m=list(depth), slope_deg_max=40.0,
                 scale_range=[0.8, 1.4], **kw)


def bank_wall(species: str, per_ha: float, shore=(0.0, 15.0),
              depth=(-6.0, WADE), **kw) -> dict:
    """Water-margin green wall: rivers/pools open the canopy, so their banks
    thicken (ecology §6.2) — banded on shore distance, not on the glade."""
    return layer(species, per_ha, role="bank-wall", shore_m=list(shore),
                 clump_size_median=5, clump_radius_m=6.0,
                 water_depth_m=list(depth), slope_deg_max=38.0,
                 scale_range=[0.8, 1.4], **kw)


def gallery(species: str, per_ha: float, shore=(0.0, 35.0), scale=(0.6, 1.0),
            **kw) -> dict:
    """Gallery-forest ribbon through open country (ecology §6.1): closed-
    forest density inside ~35 m of the water, abrupt outer edge."""
    return layer(species, per_ha, tier="T1", role="gallery",
                 shore_m=list(shore), clump_size_median=4, clump_radius_m=10.0,
                 water_depth_m=[-6.0, WADE], slope_deg_max=34.0,
                 slope_half_angle_deg=25.0, scale_range=list(scale),
                 clearance_radius_m=1.5, **kw)


def waterline_tree(species: str, per_ha: float, scale=(0.75, 1.2), **kw) -> dict:
    """M1's waterline-committed posture (mangrove/cypress5 pattern): ~50 % of
    instances within ±0.3 m of the line, flooded median 0.3–0.6 m."""
    return layer(species, per_ha, tier="T1", role="waterline-tree",
                 clump_size_median=5, clump_radius_m=11.0,
                 water_depth_m=[-0.6, 1.4], depth_peak_m=0.4,
                 depth_half_width_m=1.2, slope_deg_max=28.0,
                 scale_range=list(scale), clearance_radius_m=1.6, **kw)


def drowned_tree(species: str, per_ha: float, **kw) -> list[dict]:
    """M1's bimodal posture (cypress1/3): deep water OR dry ground, never the
    margin — two layers, one per mode."""
    deep = layer(species, per_ha * 0.45, tier="T1", role="drowned-tree",
                 clump_size_median=2, clump_radius_m=12.0,
                 water_depth_m=[0.8, 3.5], depth_peak_m=2.5,
                 depth_half_width_m=1.2, slope_deg_max=26.0,
                 scale_range=[0.6, 0.95], clearance_radius_m=1.8, **kw)
    dry = layer(species, per_ha * 0.55, tier="T1", role="drowned-tree-dry",
                clump_size_median=3, clump_radius_m=13.0,
                water_depth_m=[-6.0, -0.5], slope_deg_max=32.0,
                slope_half_angle_deg=25.0, scale_range=[0.65, 1.0],
                clearance_radius_m=1.8, **kw)
    return [deep, dry]


def dead_snag(species: str, per_ha: float, depth=(0.4, 3.0),
              scale=(0.8, 1.25)) -> dict:
    """Standing dead trees in the water — M1's deep drowned mode only (a snag
    on dry ground reads as a mistake). Sparse singletons; they are silhouettes,
    not a stratum."""
    return layer(species, per_ha, tier="T1", role="drowned-tree",
                 clump_size_median=1, singleton_share=0.85, clump_radius_m=9.0,
                 water_depth_m=list(depth), depth_peak_m=1.5,
                 depth_half_width_m=1.0, slope_deg_max=24.0,
                 scale_range=list(scale), clearance_radius_m=3.0)


def aquatic_reeds(per_ha: float, guild: str | None = None,
                  species: str = "reeds", scale=(1.0, 1.8), **kw) -> dict:
    """M1: reeds straddle the waterline into the shallows; M3: reed beds
    stand offshore AND fringe the bank — owner round 3: real water edges are
    densely vegetated, so the belt is wide and the clumps big enough to
    merge into continuous margins rather than spaced pom-poms."""
    entry = layer(species, per_ha, role="aquatic-reeds",
                  clump_size_median=18, clump_radius_m=9.5,
                  water_depth_m=[-0.15, 0.7], depth_peak_m=0.35,
                  depth_half_width_m=0.8, shore_m=[-30.0, 6.0],
                  scale_range=list(scale), **kw)
    if guild:
        # Round 4 (owner: edges must never be bare): the reed belt is the
        # BASELINE water margin — the guild only themes the extras. Where
        # another guild wins the tile the reeds keep a thinned belt instead
        # of vanishing (the round-3 bare-bank defect in guild regions).
        entry["guild"] = guild
        entry["guild_off_share"] = 0.45
    return entry


def aquatic_lilypads(per_ha: float, guild: str | None = None,
                     species: str = "lilypad", **kw) -> dict:
    """M1/M3: a floating belt over 0.5–2 m of water, 5–20 m off the bank."""
    entry = layer(species, per_ha, role="aquatic-lilypads",
                  clump_size_median=8, clump_radius_m=6.0,
                  water_depth_m=[0.4, 2.2], depth_peak_m=1.0,
                  depth_half_width_m=0.8, shore_m=[-22.0, -3.0],
                  scale_range=[0.8, 1.4], tilt_deg_max=0.0, **kw)
    if guild:
        entry["guild"] = guild
    return entry


def aquatic_kelp(species: str, per_ha: float, depth=(1.0, 6.0), peak=1.8,
                 guild: str | None = None, scale=(0.8, 1.3), **kw) -> dict:
    """M1: kelp is genuinely deep — median 1.6 m of standing water."""
    entry = layer(species, per_ha, role="aquatic-kelp",
                  clump_size_median=7, clump_radius_m=7.0,
                  water_depth_m=list(depth), depth_peak_m=peak,
                  depth_half_width_m=2.0, scale_range=list(scale), **kw)
    if guild:
        entry["guild"] = guild
    return entry


def drowned_thicket_guild(species: str, per_ha: float) -> dict:
    """M3's third pool theme: land plants standing IN the pool."""
    return layer(species, per_ha, role="drowned-thicket", guild="drowned-thicket",
                 clump_size_median=6, clump_radius_m=6.0,
                 water_depth_m=[0.1, 1.2], depth_peak_m=0.5,
                 depth_half_width_m=0.7, shore_m=[-20.0, 0.0],
                 scale_range=[0.8, 1.4])


# `boulders()` and `cliff_dressing()` were typed from memory (a 0.08 m bury, a
# 55 deg slope cap, one open-backed shell used freestanding). They are replaced
# by worldgen/rock_dressing.py, which reads every figure from the mined vanilla
# record and from the kit's measured meshes (16f deliverable 3).


def epiphyte_moss(species: str, per_ha: float, depth=(-6.0, 1.0)) -> dict:
    """Hanging moss/epiphyte dressing rides where the big trees are (same
    gates), clumped so trunks read dressed rather than the air."""
    return layer(species, per_ha, role="epiphyte",
                 clump_size_median=5, clump_radius_m=6.0,
                 water_depth_m=list(depth), slope_deg_max=38.0,
                 scale_range=[0.9, 1.6])


# ---------------------------------------------------------------------------
# The thirteen regions. Densities are the ecology §7.1 targets adapted to the
# region's landscape type; where a region mixes types the hectare mean is
# lower than the type column because bands/gates confine layers to their part.
# ---------------------------------------------------------------------------

REGIONS: dict[int, dict] = {}

REGIONS[13] = {
    "id": "tropical-jungle",
    "note": "Ecology type 1 (terra firme interior). Interior deliberately open"
            " at eye level (§6.5) — thickets live in gaps, on edges and along"
            " banks. Herb layer is the T3 ring (JUNGLE cover, 15,500/ha)."
            " ROUND 7 rebuilds the roof AGAIN, to the owner's three"
            " corrections: (a) round 6's wide-crowned species were temperate"
            " (an English oak, a cedar of Lebanon, a bare winter oak, a"
            " conifer) and are gone; (b) the roof sits at 30–40 m with rare"
            " 40–60 m giants, not 18–28 m; (c) there are far MORE 30 m+ trees"
            " and far fewer short broadleaves. The roof is now the Anvil"
            " composites (Tropical Skyrim's own trunk + fern-palm crowns +"
            " buttress flare, assembled in the kit) at 32–40 m, giants at"
            " 45–59 m, two genuinely tropical broadleaves upscaled into the"
            " same band, and tall palms through the top. The 10–17 m natives"
            " drop to a THIN sub-canopy: the owner keeps the bushy fern-trees"
            " and palms, not the temperate-looking mid trees. Wide crowns pay"
            " for themselves — a 30 m crown closes what fifteen of round 5's"
            " trees did, so stem counts FALL while closure rises.",
    "layers": [
        # --- Emergents: the rare 45-60 m giants that break the roof -------
        # One composite, placed sparsely. Its own mesh is 66.7 m at scale 1,
        # so the scale range is a DOWNSCALE — which only ever sharpens texel
        # density — rather than the round-6 upscale of a smaller tree.
        # Clumped, not a pure jittered grid: measured Clark-Evans R 1.10 on
        # the shipped scatter — MORE even than random, where hand placement
        # sits at ~0.45 (rule R1). Same density, grouped.
        layer("anvil_giant", 0.9, tier="T1", role="emergent",
              clump_size_median=2.0, clump_size_tail=0.3,
              singleton_share=0.35, clump_radius_m=14.0,
              water_depth_m=[-6.0, WADE], slope_deg_max=30.0,
              patchiness=0.4, glade_response=0.0,
              scale_range=[0.68, 0.88], clearance_radius_m=9.0),

        # --- The roof proper: 30-40 m, wide crowns, and MOST of the trees ---
        # The owner's target is "under a tall roof most of the time, with some
        # gaps". A 42.4 m composite with a 33.8 m crown at ×0.75-0.95 gives
        # 32-40 m trees carrying 25-32 m crowns; at 18/ha their crowns
        # interlock into continuous cover with treefall gaps left by the glade
        # band. Clearance stays TRUNK-scale — crowns are meant to overlap.
        canopy("anvil_canopy", 18.0, riparian=RIPARIAN_WET,
               scale=(0.75, 0.95), clump_size_median=3, clump_radius_m=26.0,
               clearance=3.0),
        # Broadleaf contrast, so the roof is not all fern-palm. Both are
        # UNIFORMLY upscaled: proportions are preserved exactly, and at 30 m
        # overhead the coarser texels do not read.
        canopy("fig_dome", 9.0, riparian=RIPARIAN_WET,
               scale=(1.5, 1.9), clump_size_median=2, clump_radius_m=22.0,
               clearance=2.8),
        canopy("jungle_gnarled", 8.0, riparian=RIPARIAN_WET,
               scale=(1.9, 2.4), clump_size_median=3, clump_radius_m=20.0,
               clearance=2.6),
        # Tall palms punching through the roof — the tropical silhouette cue.
        canopy("fanpalm_tall", 5.0, scale=(1.0, 1.35), clearance=1.2,
               clump_size_median=2, clump_radius_m=12.0),
        canopy("fanpalm_tall_b", 4.0, scale=(1.0, 1.3), clearance=1.2,
               clump_size_median=2, clump_radius_m=12.0),

        # --- Sub-canopy: a THIN scatter, not a second forest ---------------
        # Round 6 put 145/ha of 10-17 m broadleaves here and the owner read the
        # result as "way too many shorter ones ... more like temperate
        # deciduous forest". Cut to ~40/ha, and only the ones that read
        # tropical: the bushy fern-trees and the palms stay, the generic
        # broadleaves (jungle_mid, jungle_tree_hero, jungle_tall_b) go.
        canopy("jungle_tall", 14.0, riparian=RIPARIAN_WET,
               scale=(0.8, 1.15), clump_size_median=4, clump_radius_m=16.0,
               clearance=2.2),
        canopy("fanpalm_broad", 10.0, scale=(0.8, 1.15), clearance=1.4,
               clump_size_median=3, clump_radius_m=12.0),
        canopy("palm_a", 16.0, scale=(0.5, 0.8), clearance=1.4),
        understory("bamboo", 45.0, scale=(0.9, 1.6), clump_size_median=9,
                   clump_radius_m=5.0),
        understory("trop_plant", 50.0, scale=(0.7, 1.2)),
        understory("manfern", 40.0, scale=(0.6, 1.0)),
        understory("fern_big", 55.0, scale=(0.7, 1.3)),
        interior_shrub("bracken", 45.0),
        gap_thicket("trop_shrub", 190.0),
        gap_thicket("bracken", 120.0),
        green_wall("trop_shrub", 130.0),
        bank_wall("big_shrub", 210.0, shore=(0.0, 15.0)),
        layer("vines_a", 40.0, role="liana", clump_size_median=4,
              clump_radius_m=8.0, water_depth_m=[-6.0, WADE],
              slope_deg_max=36.0, scale_range=[0.9, 1.6]),
        layer("vines_b", 35.0, role="liana", clump_size_median=4,
              clump_radius_m=8.0, water_depth_m=[-6.0, WADE],
              slope_deg_max=36.0, scale_range=[0.9, 1.6]),
        epiphyte_moss("moss_b", 40.0),
        aquatic_reeds(95.0),
        aquatic_lilypads(30.0),
    ],
}

REGIONS[7] = {
    "id": "interior-swamp",
    "note": "Ecology type 2 (flooded forest) on the reference watershed:"
            " wading cypress matrix, waterline mangrove, bimodal drowned"
            " cypress, pool guilds. T3: SWAMP_GRASS/MARSH_GRASS covers.",
    "layers": [
        landmark_giant("cypress_big", 0.12, depth=(-6.0, 1.0)),
        emergent("cypress_big", 4.0, depth=(-6.0, 1.0)),
        # Weights re-tuned after the 2026-09-08 species swap: the broad rain
        # tree's clearance stamps out more understory than the cypress it
        # replaced, so the authored numbers below are higher than the old
        # ones to deliver the SAME count per chunk (5,12: 6.2 k both ways).
        canopy("cypress_big", 40.0, depth=(-6.0, 1.0), riparian=RIPARIAN_WET,
               scale=(0.6, 0.95), clump_radius_m=16.0),
        canopy("cypress", 55.0, depth=(-6.0, 0.8), riparian=RIPARIAN_WET,
               scale=(0.6, 0.95)),
        # Signature: the broad flat-crowned "rain tree" (34 m crown at unit
        # scale, here 16-21 m tall) spreading over the pools — it leads the
        # canopy; the giant cypress is the ROOTLAND's dominant, not this one's.
        canopy("rain_tree", 40.0, depth=(-6.0, 0.8), riparian=RIPARIAN_WET,
               scale=(0.8, 1.05), clump_size_median=2, clump_radius_m=18.0,
               clearance=2.6),
        waterline_tree("mangrove_b", 24.0),
        *drowned_tree("cypress", 14.0),
        # Dead snags standing in the pools: Shadowfen's "dank foliage"
        # (Lore:Shadowfen) needs decay, not just growth.
        dead_snag("snag_a", 4.0, scale=(0.5, 0.8)),   # 29 m mesh
        dead_snag("snag_b", 3.0, scale=(0.5, 0.8)),   # 32 m mesh
        canopy("willow_a", 18.0, depth=(-2.0, 0.5), scale=(0.6, 0.9),
               slope_max=28.0),
        understory("trop_plant", 70.0, depth=(-6.0, 0.6), riparian=RIPARIAN_WET),
        understory("fern_big", 110.0, depth=(-6.0, 0.5), riparian=RIPARIAN_WET),
        interior_shrub("bracken", 55.0, depth=(-6.0, 0.4)),
        gap_thicket("trop_plant", 90.0, depth=(-6.0, 0.3)),
        gap_thicket("big_shrub", 110.0, depth=(-6.0, 0.3)),
        green_wall("bracken", 100.0, depth=(-6.0, 0.4)),
        bank_wall("fern_big", 170.0),
        layer("vines_a", 45.0, role="liana", clump_size_median=3,
              clump_radius_m=8.0, water_depth_m=[-6.0, 0.8],
              slope_deg_max=35.0, scale_range=[0.9, 1.5]),
        epiphyte_moss("moss_a", 70.0),
        aquatic_reeds(145.0, guild="reed-bed"),
        aquatic_lilypads(70.0, guild="lilypad-pond"),
        drowned_thicket_guild("bracken", 60.0),
        aquatic_kelp("wkelp_short", 30.0, depth=(0.6, 4.0), peak=1.5),
    ],
}

REGIONS[6] = {
    "id": "rootland-deep-marsh",
    "note": "Ecology type 4 (dark deep swamp): few HUGE buttressed trunks,"
            " root-dominated ground, almost bare floor (§4.3 — herbs <5%),"
            " moss on everything. Identity from mass and dark, not clutter."
            " T3: MOSS/BC_MOSS covers only.",
    "layers": [
        landmark_giant("cypress_big", 0.15, depth=(-3.0, 1.0)),
        emergent("cypress_big", 10.0, depth=(-6.0, 1.0)),
        canopy("cypress_big", 110.0, depth=(-6.0, 1.0), riparian=RIPARIAN_WET,
               scale=(0.75, 1.15), clump_radius_m=15.0, clearance=2.2),
        canopy("cypress", 45.0, depth=(-6.0, 0.8), scale=(0.7, 1.0)),
        understory("manfern", 28.0, depth=(-6.0, 0.6), scale=(0.8, 1.2)),
        interior_shrub("fern_big", 40.0, depth=(-6.0, 0.5)),
        # Signature: fungus at tree scale. Canon lists lucan mold and mushroom
        # caves for the dark interior (Online:Shadowfen "Mushroom Cave",
        # Online:Murkmire "Mushrooms That Nourish"); the 15 m cap is a rare
        # landmark, the 8 m stalks a thin fungal stratum under the cypress.
        layer("shroom_giant", 1.2, tier="T1", role="fungal-giant",
              clump_size_median=1, singleton_share=1.0, clump_radius_m=0.0,
              water_depth_m=[-2.0, 0.5], slope_deg_max=24.0,
              patchiness=0.3, glade_response=0.0,
              scale_range=[0.8, 1.15], clearance_radius_m=7.0),
        layer("tallmush_a", 12.0, tier="T1", role="fungal-floor",
              clump_size_median=3, clump_radius_m=6.0,
              water_depth_m=[-2.0, 0.4], slope_deg_max=28.0,
              scale_range=[0.8, 1.3], clearance_radius_m=1.2),
        layer("tallmush_b", 8.0, tier="T1", role="fungal-floor",
              clump_size_median=3, clump_radius_m=6.0,
              water_depth_m=[-2.0, 0.4], slope_deg_max=28.0,
              scale_range=[0.8, 1.3], clearance_radius_m=1.2),
        layer("shroom", 25.0, role="fungal-floor", clump_size_median=4,
              clump_radius_m=5.0, water_depth_m=[-2.0, 0.3],
              slope_deg_max=30.0, scale_range=[0.7, 1.5]),
        epiphyte_moss("moss_a", 90.0, depth=(-3.0, 0.8)),
        epiphyte_moss("moss_b", 70.0, depth=(-3.0, 0.8)),
        layer("vines_a", 35.0, role="liana", clump_size_median=4,
              clump_radius_m=7.0, water_depth_m=[-3.0, 0.8],
              slope_deg_max=35.0, scale_range=[1.0, 1.8]),
        aquatic_reeds(110.0, guild="reed-bed"),
        aquatic_lilypads(50.0, guild="lilypad-pond"),
        drowned_thicket_guild("fern_big", 45.0),
    ],
}

REGIONS[4] = {
    "id": "coastal-lagoon-salt-marsh",
    "note": "Ecology type 3: mangrove banding by shore distance (fringe"
            " densest at the waterline, basin behind, landward palms), salt"
            " pans bare by land cover. T3: salt-marsh grass covers.",
    "layers": [
        waterline_tree("mangrove_a", 130.0, scale=(0.8, 1.3),
                       shore_m=[-12.0, 6.0]),
        waterline_tree("mangrove_c", 80.0, scale=(0.75, 1.1),
                       shore_m=[-10.0, 8.0]),
        layer("mangrove_c", 70.0, tier="T1", role="basin-mangrove",
              clump_size_median=5, clump_radius_m=9.0,
              water_depth_m=[-1.2, 1.0], shore_m=[5.0, 45.0],
              scale_range=[0.55, 0.85], clearance_radius_m=1.6),
        # Signature: the strand palms — thick-trunked date palm and the broad
        # coconut-crowned beach palm — landward of the mangrove.
        canopy("datepalm", 25.0, depth=(-6.0, -0.2), scale=(0.7, 1.0),
               slope_max=28.0, clearance=1.5),
        canopy("coconut_palm", 30.0, depth=(-6.0, -0.1), scale=(0.8, 1.2),
               clearance=1.4),
        understory("trop_plant", 45.0, depth=(-6.0, 0.2)),
        # Round 8 breadth pass: salt-marsh grass on the pans behind the
        # mangrove, strand scrub on the dune line, thicket where fresh water
        # reaches the back of the lagoon.
        layer("algrass", 60.0, role="tall-grass", clump_size_median=8,
              clump_radius_m=9.0, water_depth_m=[-6.0, 0.25],
              slope_deg_max=22.0, scale_range=[0.7, 1.2]),
        understory("loebush", 30.0, depth=(-6.0, -0.2), scale=(0.6, 1.0)),
        gap_thicket("trop_shrub", 40.0, depth=(-6.0, 0.1)),
        aquatic_reeds(255.0),
        aquatic_kelp("wkelp_tall", 60.0, depth=(0.8, 6.0), peak=2.0),
        aquatic_kelp("kelp_tall", 30.0, depth=(1.2, 7.0), peak=2.5),
    ],
}

REGIONS[3] = {
    "id": "tidal-delta",
    "note": "Reedier, muddier cousin of the lagoon: mangrove lines the"
            " channels, reeds carry the flats.",
    "layers": [
        waterline_tree("mangrove_b", 90.0, shore_m=[-12.0, 8.0]),
        layer("mangrove_b", 40.0, tier="T1", role="basin-mangrove",
              clump_size_median=5, clump_radius_m=9.0,
              water_depth_m=[-1.0, 1.2], shore_m=[5.0, 40.0],
              scale_range=[0.7, 1.05], clearance_radius_m=1.6),
        # Signature: flat-crowned palms on the dry levees between channels.
        canopy("flatpalm_a", 22.0, depth=(-6.0, -0.2), scale=(0.8, 1.2),
               slope_max=25.0, clearance=1.5, clump_radius_m=12.0),
        canopy("flatpalm_b", 18.0, depth=(-6.0, -0.2), scale=(0.8, 1.2),
               slope_max=25.0, clearance=1.5, clump_radius_m=12.0),
        understory("trop_shrub", 35.0, depth=(-4.0, 0.5), riparian=RIPARIAN_WET),
        # Round 8 breadth pass: the delta floor was reeds, one shrub and one
        # kelp. Salt-flat sward on the drying mud, ferns on the levee crowns,
        # tall kelp in the deeper channels between them.
        layer("algrass", 70.0, role="tall-grass", clump_size_median=7,
              clump_radius_m=8.0, water_depth_m=[-6.0, 0.3],
              slope_deg_max=26.0, scale_range=[0.7, 1.2]),
        understory("fern", 20.0, depth=(-6.0, -0.1), scale=(0.6, 1.0)),
        # Reeds were 61% of everything the delta's floor carried — a reed bed
        # is meant to READ as a reed bed against something, not be the region.
        aquatic_reeds(260.0),
        aquatic_lilypads(60.0),
        aquatic_kelp("wkelp_short", 40.0, depth=(0.6, 4.0), peak=1.4),
        aquatic_kelp("kelp_tall", 25.0, depth=(1.4, 7.0), peak=2.6),
    ],
}

REGIONS[5] = {
    "id": "deep-river-corridor",
    "note": "A moving-water gallery: cypress walls on the banks (riparian"
            " boost), aquatics in the margins, open channel kept open.",
    "layers": [
        landmark_giant("cypress_big", 0.08, depth=(-6.0, 0.6)),
        canopy("cypress", 40.0, depth=(-6.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.6, 0.95)),
        # Signature: the tall columnar Cyrodiil cypress, upscaled to 28-35 m,
        # walling the big navigable rivers (the Onkobra/Panther corridors,
        # Lore:Black Marsh) — a different silhouette from the swamp cypress.
        canopy("column_cypress_a", 28.0, depth=(-6.0, 0.6),
               riparian=RIPARIAN_WET, scale=(1.2, 1.5), clearance=2.2,
               clump_radius_m=14.0),
        canopy("column_cypress_b", 22.0, depth=(-6.0, 0.6),
               riparian=RIPARIAN_WET, scale=(1.2, 1.5), clearance=2.2,
               clump_radius_m=14.0),
        waterline_tree("willow_a", 20.0, scale=(0.6, 0.9)),
        understory("trop_plant", 30.0, depth=(-6.0, 0.5), riparian=RIPARIAN_WET),
        understory("manfern", 30.0, depth=(-6.0, 0.4), riparian=RIPARIAN_WET,
                   scale=(0.7, 1.1)),
        understory("fern_big", 30.0, depth=(-6.0, 0.4), riparian=RIPARIAN_WET),
        bank_wall("big_shrub", 100.0),
        bank_wall("manfern", 80.0),
        aquatic_reeds(190.0),
        aquatic_lilypads(45.0),
        aquatic_kelp("kelp_tall", 45.0, depth=(1.0, 8.0), peak=2.5),
    ],
}

REGIONS[8] = {
    "id": "fringe-marsh",
    "note": "Canopy 0.3 — genuinely open (the band the player crosses)."
            " Reed flats, scattered trees, thickets only at the water.",
    "layers": [
        landmark_giant("cypress", 0.06, depth=(-3.0, 0.6)),
        canopy("cypress", 9.0, depth=(-6.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.6, 0.9), clump_radius_m=18.0),
        # Signature: thin-stemmed "stick trees" in loose stands — the open
        # marsh the player crosses reads as sparse poles, not a cypress edge.
        canopy("stick_tree_a", 14.0, depth=(-6.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.8, 1.2), clump_radius_m=20.0, patchiness=1.2,
               clearance=1.2),
        canopy("stick_tree_b", 12.0, depth=(-6.0, 0.6), riparian=RIPARIAN_WET,
               scale=(0.8, 1.2), clump_radius_m=20.0, patchiness=1.2,
               clearance=1.2),
        waterline_tree("willow_b", 12.0, scale=(0.6, 0.9)),
        understory("loebush", 40.0, depth=(-6.0, 0.2)),
        understory("fern", 50.0, depth=(-6.0, 0.4), riparian=RIPARIAN_WET),
        bank_wall("bracken", 125.0),
        # Round 8 breadth pass: the band the player crosses is a SWARD, and it
        # carried none — reeds at the water and bare between. Grass and herbs
        # give the open marsh something at knee height away from the pools.
        layer("algrass", 70.0, role="tall-grass", clump_size_median=8,
              clump_radius_m=9.0, water_depth_m=[-6.0, 0.3],
              slope_deg_max=30.0, scale_range=[0.8, 1.4]),
        layer("chickweed", 30.0, role="forb", clump_size_median=7,
              clump_radius_m=7.0, water_depth_m=[-6.0, 0.2],
              slope_deg_max=30.0, scale_range=[0.9, 1.4]),
        aquatic_reeds(320.0, guild="reed-bed"),
        aquatic_lilypads(50.0, guild="lilypad-pond"),
        drowned_thicket_guild("fern", 40.0),
    ],
}

REGIONS[9] = {
    "id": "seasonal-floodplain",
    "note": "Ecology 5c-adjacent: open grass (T3 carries it) + gallery"
            " ribbons along the channels with an abrupt outer edge (§6.1)."
            " The flood takes free-standing trees; the ribbon survives.",
    "layers": [
        gallery("willow_c", 70.0, shore=(0.0, 30.0)),
        gallery("hill_aspen_small", 40.0, shore=(0.0, 25.0), scale=(0.8, 1.1)),
        # Signature: rare flat-crowned umbrella trees standing alone in the
        # grass beyond the ribbon — canon's "fast-growing grasses" plain
        # (Lore:Black Marsh, The Argonian Account) with a few survivors.
        canopy("umbrella_tree", 2.5, depth=(-6.0, 0.2), scale=(0.9, 1.3),
               riparian=RIPARIAN_DRY, clump_size_median=1, singleton_share=0.7,
               clump_radius_m=12.0, clearance=4.0, slope_max=25.0,
               patchiness=0.6),
        bank_wall("loebush", 110.0, shore=(0.0, 18.0)),
        understory("fern", 30.0, depth=(-6.0, 0.4), riparian=RIPARIAN_WET),
        layer("algrass", 55.0, role="tall-grass", clump_size_median=8,
              clump_radius_m=8.0, water_depth_m=[-6.0, 0.5],
              slope_deg_max=32.0, scale_range=[0.8, 1.4]),
        layer("chickweed", 40.0, role="forb", clump_size_median=8,
              clump_radius_m=7.0, water_depth_m=[-6.0, 0.4],
              slope_deg_max=32.0, scale_range=[0.9, 1.5]),
        # Round 8 breadth pass: bracken on the abrupt outer edge of the
        # gallery ribbon (§6.1 — the edge is where the light gradient lives),
        # and pads on the standing water the flood leaves behind.
        gap_thicket("bracken", 40.0, depth=(-6.0, 0.3), slope_deg_max=30.0),
        aquatic_lilypads(30.0),
        aquatic_reeds(95.0),
    ],
}

REGIONS[11] = {
    "id": "firm-lowland",
    "note": "The drier ground BETWEEN waterways — still swamp-forest to the"
            " eye (owner 0036 Q4 reading), just with dry feet: jungle canopy"
            " at ~60% of the jungle target, bamboo brakes, gallery thickening"
            " along whatever water crosses it. Round 7: it carries the same"
            " tall tropical roof as region 13 at 60% density, so crossing"
            " between the two does not step out from under a 35 m canopy into"
            " a 12 m one.",
    "layers": [
        # Clumped for the same measured reason as region 13's anvil layer.
        layer("anvil_giant", 0.5, tier="T1", role="emergent",
              clump_size_median=2.0, clump_size_tail=0.3,
              singleton_share=0.35, clump_radius_m=14.0,
              water_depth_m=[-6.0, WADE], slope_deg_max=30.0,
              patchiness=0.4, glade_response=0.0,
              scale_range=[0.68, 0.88], clearance_radius_m=9.0),
        canopy("anvil_canopy", 11.0, riparian=RIPARIAN_WET,
               scale=(0.75, 0.95), clump_size_median=3, clump_radius_m=26.0,
               clearance=3.0),
        canopy("fig_dome", 5.5, riparian=RIPARIAN_WET,
               scale=(1.5, 1.9), clump_size_median=2, clump_radius_m=22.0,
               clearance=2.8),
        canopy("jungle_gnarled", 3.0, riparian=RIPARIAN_WET,
               scale=(1.9, 2.4), clump_size_median=3, clump_radius_m=20.0,
               clearance=2.6),
        canopy("fanpalm_tall", 3.0, scale=(1.0, 1.35), clearance=1.2,
               clump_size_median=2, clump_radius_m=12.0),
        canopy("hill_aspen_a", 22.0, riparian=RIPARIAN_WET, scale=(0.9, 1.25)),
        canopy("jungle_tree", 10.0, riparian=RIPARIAN_WET, scale=(0.65, 1.0)),
        understory("bamboo", 55.0, scale=(0.9, 1.6), clump_size_median=8,
                   clump_radius_m=5.5),
        understory("manfern", 35.0, scale=(0.7, 1.1)),
        understory("trop_plant", 15.0),
        interior_shrub("bracken", 50.0),
        gap_thicket("big_shrub", 100.0),
        gap_thicket("trop_shrub", 45.0),
        green_wall("fern_big", 90.0),
        # Bamboo brakes on the water margins (canon bamboo, fauna-hazards § Flora)
        # where the jungle has big-shrub banks.
        bank_wall("bamboo", 155.0),
        layer("chickweed", 35.0, role="forb", clump_size_median=7,
              clump_radius_m=7.0, water_depth_m=[-6.0, 0.3],
              slope_deg_max=36.0, scale_range=[0.9, 1.5]),
        epiphyte_moss("moss_b", 25.0),
    ],
}

REGIONS[12] = {
    "id": "lake-and-standing-water",
    "note": "Open water: guild-themed aquatics near the shore, deep centre"
            " bare, drowned trees for silhouettes (M1 bimodal, deep mode).",
    "layers": [
        # Signature: flowering water lilies among the pads (BM&V's own
        # water-lily set; water-surface class in composition-rules.json).
        aquatic_lilypads(45.0, guild="lilypad-pond"),
        aquatic_lilypads(30.0, guild="lilypad-pond", species="water_lily_a"),
        aquatic_lilypads(25.0, guild="lilypad-pond", species="water_lily_b"),
        aquatic_reeds(210.0, guild="reed-bed"),
        aquatic_kelp("kelp_tall", 70.0, depth=(1.0, 9.0), peak=3.0,
                     guild="kelp-forest"),
        # Round 8 breadth pass: a shallow-margin weed under the deep kelp, and
        # bracken standing in the drawdown zone the lake leaves at low water.
        aquatic_kelp("wkelp_short", 40.0, depth=(0.5, 2.5), peak=1.2,
                     guild="kelp-forest"),
        drowned_thicket_guild("bracken", 25.0),
        dead_snag("snag_c", 3.0, depth=(0.6, 3.5)),
        layer("cypress_big", 3.0, tier="T1", role="drowned-tree",
              clump_size_median=2, clump_radius_m=12.0,
              water_depth_m=[0.8, 3.5], depth_peak_m=2.2,
              depth_half_width_m=1.2, slope_deg_max=26.0,
              scale_range=[0.6, 0.95], clearance_radius_m=4.0),
    ],
}

REGIONS[14] = {
    "id": "mangrove-forest",
    "note": "The canon Lilmoth mangrove wall (lore/regions/murkmire.md),"
            " built to real mangal structure (research/mangrove-coastal-"
            "ecology.md): dense Rhizophora-analogue fringe standing in the"
            " intertidal (the wall read from the sea), closed low-diversity"
            " interior over prop roots with a near-bare floor, landward"
            " palm/shrub transition. No lilypads — saline. Gaps come from"
            " the shared glade field at real dieback scale, left bare."
            " Meshes: mangrove a/c/d here, b belongs to the tidal delta, so"
            " the three mangrove coasts are not one tree repeated.",
    "layers": [
        # Seaward fringe: the wall. Committed to the waterline, standing in
        # 0-1.2 m of water, dense enough for crowns to interlock.
        waterline_tree("mangrove_a", 170.0, scale=(0.8, 1.25),
                       shore_m=[-25.0, 8.0], patchiness=0.6),
        waterline_tree("mangrove_c", 110.0, scale=(0.7, 1.05),
                       shore_m=[-20.0, 10.0], patchiness=0.6),
        # Interior: closed canopy behind the fringe; high patchiness + glade
        # response give the round/elliptic dieback gaps (10-1000 m^2). Two of
        # the mod's four mangrove meshes so the wall is not one tree repeated.
        layer("mangrove_a", 70.0, tier="T1", role="canopy",
              clump_size_median=5, clump_radius_m=10.0,
              water_depth_m=[-1.5, 1.0], shore_m=[0.0, 90.0],
              slope_deg_max=14.0, scale_range=[0.65, 1.0],
              clearance_radius_m=1.6, patchiness=1.2, glade_response=0.9,
              glade_band=[0.0, 0.88]),
        layer("mangrove_d", 60.0, tier="T1", role="canopy",
              clump_size_median=5, clump_radius_m=10.0,
              water_depth_m=[-1.5, 1.0], shore_m=[0.0, 90.0],
              slope_deg_max=14.0, scale_range=[0.8, 1.15],
              clearance_radius_m=1.6, patchiness=1.2, glade_response=0.9,
              glade_band=[0.0, 0.88]),
        # Prop-root understory: the root clutter IS the interior.
        epiphyte_moss("moss_a", 50.0, depth=(-1.5, 1.0)),
        # Near-bare floor (light + salt suppress seedlings): one thin tier.
        understory("trop_shrub", 18.0, depth=(-1.0, 0.4), scale=(0.6, 1.0)),
        # Landward transition to palms/salt marsh.
        canopy("fanpalm", 25.0, depth=(-4.0, -0.1), scale=(0.7, 1.1),
               slope_max=20.0, shore_m=[60.0, 180.0], clearance=1.5),
        canopy("palm_b", 15.0, depth=(-4.0, -0.2), scale=(0.55, 0.85),
               slope_max=20.0, shore_m=[60.0, 180.0], clearance=1.5),
        # Aquatic tier: brackish — seaweed in the channels, reeds on the
        # landward brack margin; no freshwater lilypads.
        aquatic_kelp("wkelp_tall", 40.0, depth=(0.8, 5.0), peak=1.8),
        # Round 8 breadth pass: the landward transition carried palms and one
        # shrub. Ferns in the shade behind the fringe, salt scrub on the dry
        # back edge, tall weed in the deeper tidal creeks.
        understory("fern", 20.0, depth=(-4.0, 0.1), shore_m=[40.0, 180.0],
                   scale=(0.6, 1.0)),
        gap_thicket("loebush", 30.0, depth=(-4.0, -0.1)),
        aquatic_kelp("kelp_tall", 25.0, depth=(1.2, 6.0), peak=2.4),
        aquatic_reeds(90.0),
    ],
}

REGIONS[2] = {
    "id": "upland-hills",
    "note": "Ecology 5a/5b mix: cedar hill forest in stands (high"
            " patchiness), thin-stem scrub between, grass via T3; rivers run"
            " OPEN (M2 inverted) but carry gallery ribbons where the land is"
            " otherwise bare.",
    "layers": [
        # The sculpted uplands are STEEP (median ~29 deg, p90 ~50): montane
        # forest really does cover such slopes (ecology 5a), so the slope
        # tolerance here is high and only crags/scars stay bare.
        # Signature: tall slender broadleaf stands (the "jungle aspen"
        # meshes) — northern Black Marsh is "more temperate" than the
        # southern swamps (Lore:Thornmarsh) and Blackwood is "dark and woodsy"
        # (Lore:Blackwood); cedar thins to an accent.
        canopy("hill_aspen_a", 40.0, depth=(-6.0, -0.3), scale=(0.8, 1.15),
               slope_max=46.0, riparian=RIPARIAN_DRY, patchiness=1.3,
               clearance=1.5, slope_half_angle_deg=35.0),
        canopy("hill_aspen_b", 35.0, depth=(-6.0, -0.3), scale=(0.8, 1.15),
               slope_max=46.0, riparian=RIPARIAN_DRY, patchiness=1.3,
               clearance=1.4, slope_half_angle_deg=35.0),
        canopy("cedar", 22.0, depth=(-6.0, -0.3), scale=(0.7, 1.0),
               slope_max=48.0, riparian=RIPARIAN_DRY, patchiness=1.3,
               clearance=1.5, slope_half_angle_deg=35.0),
        understory("fall_shrub", 70.0, depth=(-6.0, -0.2),
                   riparian=RIPARIAN_DRY, scale=(0.8, 1.3),
                   slope_deg_max=52.0, slope_half_angle_deg=35.0),
        gap_thicket("fall_shrub", 70.0, depth=(-6.0, -0.2),
                    slope_deg_max=50.0),
        gap_thicket("gorse", 60.0, depth=(-6.0, -0.2), slope_deg_max=50.0),
        gallery("alder", 50.0, shore=(0.0, 25.0), scale=(0.8, 1.1)),
        # Round 8 breadth pass: bracken under the stands, loebush in the open
        # scrub between them, herbs in the sward — the hill floor was three
        # species and read as one.
        interior_shrub("bracken", 40.0, depth=(-6.0, -0.2)),
        understory("loebush", 35.0, depth=(-6.0, -0.2),
                   riparian=RIPARIAN_DRY, slope_deg_max=50.0,
                   slope_half_angle_deg=35.0),
        layer("chickweed", 30.0, role="forb", clump_size_median=7,
              clump_radius_m=7.0, water_depth_m=[-6.0, 0.1],
              slope_deg_max=46.0, scale_range=[0.9, 1.4]),
        layer("algrass", 70.0, role="tall-grass", clump_size_median=6,
              clump_radius_m=7.0, water_depth_m=[-6.0, 0.1],
              slope_deg_max=50.0, slope_half_angle_deg=35.0,
              scale_range=[0.8, 1.4]),
    ],
}

REGIONS[1] = {
    "id": "border-mountains",
    "note": "The sparse, dry proof (owner 0036 Q3): juniper scrub thinning"
            " with altitude, bare rock carrying the view. Trees stop at the"
            " high altitude band; scrub climbs a little further.",
    "layers": [
        canopy("juniper", 32.0, depth=(-6.0, -0.5), scale=(0.7, 1.1),
               slope_max=50.0, altitude_m=[0.0, 420.0], clearance=1.5,
               riparian=RIPARIAN_DRY, slope_half_angle_deg=35.0),
        # Signature: pine on the Morrowind-facing border ranges, in stands,
        # stopping below the juniper line (Lore:Thornmarsh — the north is
        # temperate; the mountains are the only cold ground in the province).
        canopy("pine_a", 30.0, depth=(-6.0, -0.5), scale=(0.75, 1.15),
               slope_max=45.0, altitude_m=[0.0, 380.0], clearance=1.8,
               riparian=RIPARIAN_DRY, patchiness=1.4, slope_half_angle_deg=32.0),
        canopy("cedar", 6.0, depth=(-6.0, -0.5), scale=(0.6, 0.9),
               slope_max=38.0, altitude_m=[0.0, 300.0], clearance=1.6,
               riparian=RIPARIAN_DRY, patchiness=1.3),
        understory("fall_shrub", 45.0, depth=(-6.0, -0.3),
                   altitude_m=[0.0, 480.0], scale=(0.7, 1.2)),
        # Round 8 breadth pass: the mountains carried ONE understory species,
        # so every slope in the province's only cold ground read identically.
        # These five are the temperate-hill understory the uplands already
        # use, gated to the altitudes each can hold — bracken and gorse below
        # the treeline, grass and herbs climbing past it onto the open fell.
        interior_shrub("loebush", 25.0, depth=(-6.0, -0.3),
                       altitude_m=[0.0, 440.0]),
        gap_thicket("bracken", 35.0, depth=(-6.0, -0.3),
                    altitude_m=[0.0, 400.0], slope_deg_max=48.0),
        gap_thicket("gorse", 30.0, depth=(-6.0, -0.3),
                    altitude_m=[0.0, 460.0], slope_deg_max=48.0),
        layer("algrass", 60.0, role="tall-grass", clump_size_median=6,
              clump_radius_m=8.0, water_depth_m=[-6.0, -0.2],
              altitude_m=[0.0, 620.0], slope_deg_max=48.0,
              slope_half_angle_deg=35.0, scale_range=[0.7, 1.2]),
        layer("chickweed", 30.0, role="forb", clump_size_median=7,
              clump_radius_m=7.0, water_depth_m=[-6.0, -0.2],
              altitude_m=[0.0, 560.0], slope_deg_max=45.0,
              scale_range=[0.8, 1.3]),
    ],
}


# --- coastal gradient (round 4; research/world-terrain/mangrove-coastal-ecology.md §4) -----
#
# Salt exposure grades ~0.5-2 km inland from the OCEAN (the compiler's
# `coast_m` field), so coastal influence is a factor on every region's
# layers, not a property of the two thin tidal classes: salt-tolerant strand
# species mix IN toward any coast, salt-intolerant freshwater/forest species
# fade OUT. Applied per SPECIES so a region table never has to repeat it.
SALT_TOLERANT = dict(coast_boost_gain=0.5, coast_half_width_m=900.0)
SALT_INTOLERANT = dict(coast_boost_gain=-0.6, coast_half_width_m=700.0)
SALT_BY_SPECIES = {
    # strand / brackish: mix in near the sea
    **{S[k]: SALT_TOLERANT for k in (
        "palm_a", "palm_b", "palm_c", "fanpalm", "mangrove_a", "mangrove_b",
        "mangrove_c", "mangrove_d", "flatpalm_a", "flatpalm_b", "datepalm",
        "coconut_palm", "fanpalm_wide",
        "kelp_tall", "wkelp_tall", "wkelp_short", "reeds")},
    # freshwater / interior forest: fade toward the sea
    **{S[k]: SALT_INTOLERANT for k in (
        "cypress_big", "cypress", "willow_a", "willow_b", "willow_c",
        "cedar", "shroom", "fern", "fern_big", "manfern", "bracken",
        "bamboo", "jungle_tree", "jungle_tree_hero", "moss_a", "moss_b",
        "anvil_canopy", "anvil_giant", "fig_dome", "jungle_gnarled",
        "chickweed", "pine_a", "hill_aspen_a", "hill_aspen_b",
        "hill_aspen_small", "alder", "gorse", "column_cypress_a",
        "column_cypress_b", "shroom_giant",
        "tallmush_a", "tallmush_b", "snag_a", "snag_b", "snag_c",
        "stick_tree_a", "stick_tree_b", "umbrella_tree", "rain_tree",
        "banana")},
    # freshwater OBLIGATE: lilypads die in brack
    **{S[k]: dict(coast_boost_gain=-0.85, coast_half_width_m=700.0)
       for k in ("lilypad", "water_lily_a", "water_lily_b")},
}


def apply_coastal_gradient(layers: list[dict]) -> None:
    for entry in layers:
        salt = SALT_BY_SPECIES.get(entry["species"])
        if salt and "coast_boost_gain" not in entry:
            entry.update(salt)


def rebase_stems(region: int, layers: list[dict], factor: float) -> None:
    """Apply the between-region ladder (`vegetation_ladder.TARGET_RATIOS`).

    The region tables above author each stratum on its OWN ecological terms —
    a rootland cypress stand, a mangrove wall, a savanna gallery ribbon. What
    they never encoded was how those regions compare to each other, and that
    is what drifted: by round 7 the tropical jungle sat at the 37th percentile
    of the province's own lowland chunks.

    So the comparison is applied once, here, as a single scalar per region on
    the STEM layers only (T1, not rock — `vegetation_ladder.is_stem_layer`).
    Doing it as a multiplier rather than by re-typing 60 numbers is deliberate:

    * the understory, aquatics, groundcover, boulders and epiphytes keep their
      authored values, so this moves the tree ladder and nothing else;
    * every spatial parameter — `patchiness`, `glade_response`, the ~90 m
      glade and ~190 m stand wavelengths, `clump_size_median`, `clump_radius_m`
      — is untouched, so each region's variance stays a FRACTION of its new
      mean rather than becoming a smooth thin field. A region that halves gets
      half as many clumps of the same size, not the same clumps thinned;
    * re-basing again is one number per row in the ladder table.
    """
    if factor == 1.0:
        return
    for entry in layers:
        if is_stem_layer(entry):
            entry["instances_per_hectare"] = round(
                entry["instances_per_hectare"] * factor, 3)


# --- region-exclusive understory (round 12) ----------------------------------
#
# Decision 0048 lifted every region to six understory species but could not
# make any of them EXCLUSIVE: the flora kit shipped 81 assets and the palettes
# already placed 78. The kit now carries 108, and each region below takes two
# species that no region it physically borders carries. Adjacency is measured
# from `apps/world-studio/public/province/hydro-regions.png`, not asserted:
# `vegetation_ladder.region_adjacency()` counts shared 4-neighbour raster
# edges, and `test_vegetation_ladder.test_each_region_has_exclusive_understory`
# fails if a pair here ever shares. Two entries are deliberately shared
# between classes that never touch (region 5's tall waterweed also stands in
# region 14) — exclusivity is against neighbours, not the whole province.
EXCLUSIVE_UNDERSTORY: dict[int, list[dict]] = {
    # Border mountains: green fern in the slope hollows, the one place on the
    # ladder where the province stops being swamp.
    1: [understory("brack_a", 45.0, depth=(-6.0, 0.1), scale=(0.8, 1.3),
                   clump_radius_m=6.0),
        gap_thicket("brack_b", 35.0, depth=(-6.0, 0.1), slope_deg_max=38.0)],
    # Upland hills: fern with a second shrub hue, so the grassland north
    # reads as its own country from the marsh edge.
    2: [understory("brack_c", 55.0, depth=(-6.0, 0.2), scale=(0.8, 1.3)),
        gap_thicket("big_shrub_b", 22.0, depth=(-6.0, 0.2))],
    # Tidal delta and coastal lagoon: their aquatics are no longer authored
    # here. Everything that stands in water is now gated on the hydrology
    # record's water KIND, season and depth by AQUATIC_BAND below, which every
    # region carries — a land region class was never the right thing to decide
    # what grows on a sea bed (2026-09-16). Moving them out left 3 and 4 with
    # nothing exclusive, so both take two DRY-footed species instead, chosen
    # from the flora kit's unplaced assets (16f deliverable 12).
    #
    # Tidal delta: the salt sward on the drying flats between the channels,
    # and a fern stand on the dry levee crowns the region already plants
    # `fern` on. Neither stands in either of its neighbours (8, 14).
    3: [layer("coral_grass", 45.0, role="tall-grass", clump_size_median=8,
              clump_radius_m=7.0, water_depth_m=[-6.0, 0.25],
              slope_deg_max=22.0, scale_range=[0.8, 1.4]),
        understory("brack_e", 35.0, depth=(-6.0, -0.1), scale=(0.8, 1.2))],
    # Coastal lagoon and salt marsh: strand-palm regrowth on the dune line
    # (the mesh the province's other three palm coasts never use), and a
    # broad fern clump where fresh water reaches the back of the lagoon.
    # Neither is carried by 8, 11, 12, 13 or 14.
    4: [understory("palm_c", 22.0, depth=(-6.0, -0.2), scale=(0.35, 0.55)),
        understory("brackclump_d", 30.0, depth=(-6.0, 0.1), scale=(0.7, 1.1))],
    # Deep river corridor: banana clumps on the bank (canon tropical flora,
    # fauna-hazards § Flora) and the small 7.9 m jungle tree as the bank
    # thicket's own silhouette. The brief asked for a second REED here; the
    # kit has no unplaced reed left (reed_large/med/small_a/small_b are all
    # placed, and reed_large/med belong to region 8, a neighbour), so the
    # corridor's exclusivity is carried by these two instead.
    5: [aquatic_reeds(90.0, species="reed_small_a"),
        understory("banana", 40.0, depth=(-6.0, 0.3), riparian=RIPARIAN_WET,
                   scale=(0.8, 1.2)),
        bank_wall("jungle_tree_hero", 35.0, shore=(0.0, 18.0))],
    # Rootland deep marsh: fungal pods on the floor between the buttresses.
    6: [layer("fungal_pod_a", 40.0, role="floor-fungi", clump_size_median=5,
              clump_radius_m=5.0, water_depth_m=[-6.0, 0.15],
              slope_deg_max=22.0, scale_range=[0.8, 1.6]),
        understory("brackclump_a", 30.0, depth=(-6.0, 0.2), scale=(0.7, 1.1))],
    # Interior swamp: the smaller pod, and a broader fern clump.
    7: [layer("fungal_pod_b", 55.0, role="floor-fungi", clump_size_median=6,
              clump_radius_m=5.0, water_depth_m=[-6.0, 0.15],
              slope_deg_max=22.0, scale_range=[0.9, 1.8]),
        understory("brackclump_b", 35.0, depth=(-6.0, 0.25), scale=(0.7, 1.1))],
    # Fringe marsh: the reed flats the region is named for stop being one
    # mesh. These two are the wide, 12-triangle beds — the cheapest way to
    # make the open marsh read as reed country.
    8: [aquatic_reeds(120.0, species="reed_large", scale=(0.7, 1.1)),
        aquatic_reeds(140.0, species="reed_med", scale=(0.7, 1.2))],
    # Seasonal floodplain: fern on the abrupt outer edge of the gallery.
    9: [gap_thicket("brackclump_c", 45.0, depth=(-6.0, 0.3),
                    slope_deg_max=30.0),
        understory("brack_d", 40.0, depth=(-6.0, 0.3), scale=(0.8, 1.3))],
    # Firm lowland: our largest lowland class, and the one that most needed
    # something of its own at eye level.
    11: [understory("brackclump_e", 45.0, depth=(-6.0, 0.2), scale=(0.7, 1.1)),
         gap_thicket("big_shrub_c", 20.0, depth=(-6.0, 0.2))],
    # Lake and standing water: a second pad hue at the margin, and a
    # submerged weed clump off the bank.
    12: [aquatic_lilypads(45.0, species="pond_reedpad"),
         aquatic_kelp("seaweed_clump_b", 12.0, depth=(1.5, 6.0), peak=2.6,
                      scale=(0.5, 0.9))],
    # Tropical jungle: understory only — the ladder holds region 13's stems.
    13: [understory("brackclump_f", 40.0, depth=(-6.0, 0.2), scale=(0.8, 1.2)),
         understory("brack_f", 55.0, depth=(-6.0, 0.2), scale=(0.9, 1.4))],
    # Mangrove forest: fine reeds in the root channels, and the tall
    # waterweed it shares with the river corridor (they never meet).
    14: [aquatic_reeds(110.0, species="reed_small_b"),
         aquatic_kelp("wkelp_tall_c", 35.0, depth=(1.0, 4.0), peak=1.6)],
}

for _region, _layers in EXCLUSIVE_UNDERSTORY.items():
    REGIONS[_region]["layers"].extend(_layers)


# ===========================================================================
# THE UNDERWATER BAND (2026-09-16)  ---  keep additions inside this block
# ===========================================================================
#
# What the drowned layer stands in is decided by the HYDROLOGY RECORD, never
# by a land region class (0065/0066): a sea bed is a sea bed whether the
# nearest dry ground is jungle, marsh or mountain, and gating kelp on
# "coastal lagoon & salt marsh" left every other stretch of coast bare.
#
# So every layer here carries `region_classes=()` and is gated on the
# record's water KIND, its SEASON and the signed DEPTH, plus the ground
# material where the material is the point (coral wants rock, clams want
# sand). `merge_palettes` stamps an empty `region_classes` with the region
# key it was read under, so "province-wide" is realised by appending the
# whole band to EVERY region class including 0 (ocean) — there is no region
# key that means "all", and the union of all of them is the province.
#
# Depth floor: every AQUATIC role starts at >= 0.3 m of wet-season standing
# water, so nothing in the band can stand above the waterline. The two
# WATERLINE layers (strand driftwood, washed-up planks) are deliberately NOT
# aquatic roles — they are the debris line where the water meets the land,
# banded on `shore_m`, and the depth floor does not apply to them.
#
# Per-group densities are the group total, split evenly across the group's
# species (three kelp species at 60/ha is 20/ha each, not 180/ha).

_ANY_SEASON = None


def aquatic(species: str, per_ha: float, role: str, kinds: tuple[str, ...],
            depth: tuple[float, float], **kw) -> dict:
    """One layer of the underwater band: a bed species in a named water kind.

    `channel_exclusion` is False on every one of them — unlike a tree, a weed
    bed in a flowing reach is exactly right, and the kind gate already says
    which reaches it belongs to.
    """
    assert depth[0] >= 0.3, f"{species}: aquatic depth floor is 0.3 m"
    entry = layer(species, per_ha, tier="T2", role=role,
                  water_depth_m=list(depth), water_kinds=list(kinds),
                  channel_exclusion=False, **kw)
    return entry


def waterline(species: str, per_ha: float, role: str, kinds: tuple[str, ...],
              shore: tuple[float, float], **kw) -> dict:
    """The debris line: pieces the sea leaves at the edge, banded on shore
    distance rather than on depth, so they read as washed up rather than
    sunk."""
    return layer(species, per_ha, tier="T2", role=role, shore_m=list(shore),
                 water_kinds=list(kinds), channel_exclusion=False, **kw)


def _split(species: tuple[str, ...], per_ha: float, builder, **kw) -> list[dict]:
    """Group density split evenly across the group's species."""
    return [builder(name, round(per_ha / len(species), 2), **kw)
            for name in species]


#: Land-cover material ids the band gates on, by name (`worldgen.landcover`).
_ROCKY_BED = (lc.PEBBLES, lc.BC_ROCK, lc.MOSSY_ROCK, lc.OCEAN_FLOOR)
_SANDY_BED = (lc.SEABED_SAND, lc.BEACH_SAND, lc.SILT)
_STRAND = (lc.BEACH_SAND, lc.SAND, lc.SEABED_SAND)

AQUATIC_BAND: list[dict] = [
    # Kelp forest — the band's canopy. Perennial only: a kelp bed that dries
    # out in the dry season is a dead kelp bed.
    *_split(("kelp_tall_v", "wkelp_tall_b", "wkelp_tall_c"), 60.0, aquatic,
            role="aquatic-kelp", depth=(2.0, 12.0),
            kinds=("ocean", "lagoon", "lake-lowland", "tarn-upland",
                   "horizontal-tidal"),
            season_kinds=["perennial"], depth_peak_m=5.0,
            depth_half_width_m=4.0, clump_size_median=5, clump_radius_m=6.0,
            singleton_share=0.2, scale_range=[0.8, 1.3]),
    # Seaweed clumps — the broad salt-water weed, shallower than the kelp.
    *_split(("seaweed_clump", "seaweed_clump_b"), 25.0, aquatic,
            role="aquatic-seaweed", depth=(1.0, 8.0),
            kinds=("ocean", "lagoon", "horizontal-tidal"),
            season_kinds=["perennial"], depth_peak_m=3.0,
            depth_half_width_m=3.0, clump_size_median=6, clump_radius_m=7.0,
            scale_range=[0.5, 0.9]),
    # Deep kelp trees — the two giant-kelp columns, small and deep (see the
    # note in S). At 0.15-0.35 they stand 4-15 m: a stipe, not a canopy.
    *_split(("kelp_tree_a", "kelp_tree_b"), 8.0, aquatic,
            role="aquatic-kelp-deep", depth=(6.0, 25.0),
            kinds=("ocean", "lagoon", "lake-lowland"),
            season_kinds=["perennial"], depth_peak_m=12.0,
            depth_half_width_m=7.0, clump_size_median=3, clump_radius_m=12.0,
            singleton_share=0.3, scale_range=[0.15, 0.35]),
    # The three Depths corals stood here until 2026-09-18 and are GONE, with
    # their meshes, from the kit and from every layer: measured at 16.8 x 17.9
    # x 3.6 m, 11.2 x 10.9 x 3.2 and 5.4 x 5.3 x 2.7 on 144/94/64 triangles,
    # with 46-72% of their triangle area within 15 degrees of horizontal, they
    # are near-flat card fans, and on the sea bed they read as exactly what the
    # owner's walk called them: large flat squares jumbled on top of each
    # other. The reef is now `seabed-coral` below, on Jokerine's two genuine
    # 3D coral meshes.
    # Algae mats — the still, warm, shallow water of the interior: swamp,
    # backswamp, marsh pools. Any season; a drying pool still scums over.
    aquatic("algae_mat", 40.0, role="aquatic-algae", depth=(0.3, 2.0),
            kinds=("backswamp", "swamp", "marsh-deep", "pond", "pool",
                   "horizontal-backwater"),
            depth_peak_m=0.8, depth_half_width_m=1.0,
            clump_size_median=8, clump_radius_m=6.0, tilt_deg_max=0.0,
            scale_range=[0.8, 1.4]),
    # Driftwood sunk on the bed of still fresh water.
    *_split(("driftwood_a", "driftwood_b"), 1.5, aquatic,
            role="aquatic-deadfall", depth=(0.5, 6.0),
            kinds=("lake-lowland", "lagoon", "horizontal-backwater", "pond"),
            clump_size_median=1, singleton_share=0.8, clump_radius_m=14.0,
            scale_range=[0.8, 1.2]),
    # ...and the same pieces thrown up on the strand at the waterline.
    *_split(("driftwood_a", "driftwood_b"), 2.0, waterline,
            role="strand-deadfall", shore=(-3.0, 0.5),
            kinds=("ocean", "lagoon"), land_cover=list(_STRAND),
            clump_size_median=2, singleton_share=0.7, clump_radius_m=12.0,
            scale_range=[0.8, 1.2]),
    # Shell beds — clams on sand and silt, in the shallows where they are
    # worth wading out to. Tight clumps: a shell bed is a bed.
    *_split(("clam_a", "clam_b", "clam_c"), 30.0, aquatic,
            role="aquatic-shells", depth=(0.3, 5.0),
            kinds=("ocean", "lagoon", "horizontal-tidal"),
            land_cover=list(_SANDY_BED), depth_peak_m=1.5,
            depth_half_width_m=2.0, clump_size_median=6, clump_radius_m=4.0,
            singleton_share=0.1, scale_range=[0.9, 1.25]),
    # Wreck timber at the waterline: the sea's own litter, and the hint that
    # something bigger is on the bed further out (16g/16h plot the hulls).
    *_split(("boards_a", "boards_b", "boards_c"), 1.0, waterline,
            role="strand-debris", shore=(-2.0, 3.0),
            kinds=("ocean", "lagoon"),
            clump_size_median=3, clump_radius_m=5.0, scale_range=[0.95, 1.05]),
    # A broken rowboat on the bed of a lake or a backwater: rare enough to be
    # a find, common enough that the water is not empty.
    *_split(("rowboat_back", "rowboat_front"), 0.15, aquatic,
            role="aquatic-debris", depth=(0.5, 4.0),
            kinds=("lake-lowland", "lagoon", "horizontal-backwater"),
            clump_size_median=1, singleton_share=1.0, clump_radius_m=0.0,
            scale_range=[0.9, 1.1]),
]

# ===========================================================================
# --- the sea bed (2026-09-18) ---------------------------------------------
# ===========================================================================
#
# The owner's walk: the sea bed is bare nearly everywhere, and where it is not
# it reads as "large flat horizontal 2D squares jumbled on top of each other".
# Both halves are answered here.
#
# `ocean` ONLY. "Sea" is the record's word `ocean`, and nothing else: a lagoon
# or a tidal marsh reach sitting at sea level is not sea, and keeps the shells
# and algae it already had (decision 0065 - the compile realises the graph's
# kind, it never re-derives one from an elevation).
#
# Density falls with distance from the shoreline: 1.0 within ~150 m, 0.4 at
# 500 m, 0.2 further out. The mechanism is the sampler's existing
# `coast_factor` bell (scatter.py:381) - see `rock_dressing.SEABED_RAMP` for
# why a boost-only factor realises a decay, and `seabed_ramp_factor` for the
# arithmetic a test can check.
#
# Every Depths species below carries the figures from the committed mine
# `world/sources/placement/depths-underwater-placement.json` (4693 refs from
# DepthsOfSkyrim.esp + Underwater_Treasure.esp in Tamriel, 2026-09-18). A
# species the mine never reached says so in its own note rather than quoting a
# figure it does not have.

_MINED_DEPTHS_PATH = (Path(__file__).resolve().parents[3] / "world" / "sources"
                      / "placement" / "depths-underwater-placement.json")


@lru_cache(maxsize=1)
def _mined_depths() -> dict:
    if not _MINED_DEPTHS_PATH.exists():
        return {}
    return json.loads(_MINED_DEPTHS_PATH.read_text(encoding="utf-8"))["species"]


def mined_depths_note(mesh: str | None) -> str:
    """The mined depth quartiles for one Depths mesh, as the note text every
    layer built from it carries. A species the mine never reached says so."""
    row = _mined_depths().get(mesh) if mesh else None
    if row is None:
        return ("no mined row in depths-underwater-placement.json (the plugin "
                "never places this mesh, or places it below the mine's count "
                "threshold), so the band above is authored")
    d = row.get("groundWaterDepthM") or {}
    return (f"mined n={row['count']}: depth p25/p50/p75 "
            f"{d.get('p25')}/{d.get('p50')}/{d.get('p75')} m, "
            f"{row['perHectareWhereFound']} /ha where found")


def seabed(species: str, per_ha: float, role: str,
           depth: tuple[float, float], mined_mesh: str | None = None,
           **kw) -> dict:
    """One sea-bed layer: `ocean` only, perennial, on the shoreline ramp.

    `per_ha` is the SHORELINE density - what stands per hectare at the water's
    edge. What is written to the palette is a fifth of it, because the ramp
    multiplier the sampler applies runs 1 to 5 (see `SEABED_RAMP`); the note
    records both numbers so nobody reads the JSON figure as the real density.
    """
    entry = aquatic(species, round(per_ha * rd.SEABED_RAMP_FLOOR, 3), role=role,
                    kinds=("ocean",), depth=depth, season_kinds=["perennial"],
                    **rd.SEABED_RAMP, **kw)
    note = (f"SEABED: `ocean` only. {per_ha:g}/ha at the shoreline, written "
            f"at {rd.SEABED_RAMP_FLOOR:g}x that because the ramp multiplier "
            f"runs 1-5: 1.0 within 150 m of the coast, 0.4 at 500 m, 0.2 "
            f"beyond. {mined_depths_note(mined_mesh)}")
    entry["note"] = (entry["note"] + "; " + note) if entry.get("note") else note
    return entry


def _seabed_split(species: tuple[str, ...], per_ha: float, **kw) -> list[dict]:
    return [seabed(name, per_ha / len(species), **kw) for name in species]


_SCALLOPS = ("sb_scallop_red", "sb_scallop_blue", "sb_scallop_yellow",
             "sb_scallop_greenwhite", "sb_scallop_purplewhite",
             "sb_scallop_slate")
_SEABED_SHELLS = ("clam_a", "clam_b", "clam_c", "sb_clam_large", "sb_conch",
                  "sb_sanddollar", "sb_seashell_a", "sb_seashell_b",
                  "sb_snailshell") + _SCALLOPS

SEABED_BAND: list[dict] = [
    # Pebble and shingle mats - the commonest thing on a sea bed, and the
    # layer that stops it reading as bare sand. No cover gate: shingle lies on
    # anything.
    *_seabed_split(("sb_pebbles_a", "sb_pebbles_b"), 25.0,
                   role="seabed-pebbles", depth=(0.3, 30.0),
                   depth_peak_m=3.0, depth_half_width_m=12.0,
                   clump_size_median=6, clump_radius_m=5.0,
                   singleton_share=0.15, tilt_deg_max=6.0,
                   scale_range=[0.8, 1.6]),
    # Shell beds. The three vanilla clams kept their own shallow band in the
    # aquatic band above; this is the wider, richer bed the owner asked for,
    # with Jokerine's scallops, conch and sand dollar and Shores of Skyrim's
    # three shells. Every one of them is a hand prop at native size, so the
    # scale range is what puts a scallop at 0.15-0.30 m.
    *_seabed_split(_SEABED_SHELLS, 18.0,
                   role="seabed-shells", depth=(0.3, 15.0),
                   depth_peak_m=2.0, depth_half_width_m=5.0,
                   clump_size_median=6, clump_radius_m=4.0,
                   singleton_share=0.08, tilt_deg_max=10.0,
                   scale_range=[0.8, 1.6]),
    # Barnacle crusts. These were cover-gated to the surf covers (BC_ROCK,
    # PEBBLES, MOSSY_ROCK) and placed 0 instances province-wide, because the
    # bake never paints those under the sea. Measured on the shipped
    # ground-control raster over ocean texels of 0.3-6 m depth (158,227
    # texels): OCEAN_FLOOR 80.29 %, SEABED_SAND 17.57 %, SILT 1.99 %,
    # DIRT_CLIFF 0.08 %, MOUNTAIN_ROCK 0.04 %. None of the covers that
    # actually exist there is rocky in any meaningful share - the two rocky
    # ones together are 0.12 % - so the cover gate is DROPPED rather than
    # re-pointed at a cover that would place almost nothing. The shallow
    # depth band (0.3-8 m, peak 1.5 m) is what keeps barnacles inshore.
    seabed("sb_barnacles", 4.0, role="seabed-shells", depth=(0.3, 8.0),
           depth_peak_m=1.5,
           depth_half_width_m=3.0, clump_size_median=4, clump_radius_m=3.0,
           scale_range=[0.7, 1.1]),
    # Reef. Jokerine's two meshes are the only genuine 3D corals that exist
    # for Skyrim SE - everything else on offer is a card fan like the three we
    # just removed - so a reef here is these two, dense, in patches.
    # The rock/shingle cover gate is gone: it placed 0 coral province-wide,
    # because the bake paints OCEAN_FLOOR / SEABED_SAND / SILT under the sea
    # and never the surf covers (measured, see the barnacle note). What keeps
    # a reef where a reef belongs is now the depth band and `coast_m`:
    # within 600 m of the shore, 2-12 m down.
    seabed("sb_coral", 15.0, role="seabed-coral", depth=(2.0, 12.0),
           coast_m=[-600.0, 0.0], depth_peak_m=5.0,
           depth_half_width_m=4.0, clump_size_median=8, clump_radius_m=6.0,
           singleton_share=0.05, patchiness=1.8, tilt_deg_max=8.0,
           scale_range=[2.5, 6.0]),
    seabed("sb_coral_spiky", 15.0, role="seabed-coral", depth=(2.0, 12.0),
           coast_m=[-600.0, 0.0], depth_peak_m=5.0,
           depth_half_width_m=4.0, clump_size_median=8, clump_radius_m=6.0,
           singleton_share=0.05, patchiness=1.8, tilt_deg_max=8.0,
           scale_range=[4.0, 9.0]),
    # Starfish: shallow and inshore only, within 250 m of the coast. The gate
    # is the SEA side of the shoreline: `coast_m` is signed and negative at
    # sea (scatter.py `Fields.coast`), so a [0, 250] gate was the LAND side
    # and placed 0 starfish.
    seabed("sb_starfish", 6.0, role="seabed-starfish", depth=(0.3, 8.0),
           coast_m=[-250.0, 0.0], depth_peak_m=1.5, depth_half_width_m=3.0,
           clump_size_median=3, clump_radius_m=4.0, singleton_share=0.4,
           tilt_deg_max=12.0, scale_range=[0.7, 1.35]),
    # Sponges: the deeper half of the bed, where the reef stops.
    seabed("sb_sponge", 8.0, role="seabed-sponge", depth=(2.0, 20.0),
           depth_peak_m=8.0, depth_half_width_m=7.0, clump_size_median=4,
           clump_radius_m=5.0, singleton_share=0.3, tilt_deg_max=10.0,
           scale_range=[0.8, 2.0]),
    # Sunken driftwood, inshore: what the sea takes back out again.
    *_seabed_split(("sb_driftwood_a", "sb_driftwood_b", "sb_driftwood_c",
                    "driftwood_a", "driftwood_b"), 1.5,
                   role="seabed-debris", depth=(0.5, 12.0),
                   # sea side of the shoreline (signed `coast_m`), as starfish
                   coast_m=[-300.0, 0.0], clump_size_median=1,
                   singleton_share=0.85, clump_radius_m=14.0,
                   scale_range=[0.8, 1.2]),
    # Bones on the floor: the drowned. Rare, and deep enough to be a find.
    *_seabed_split(("sb_skull", "sb_ribcage", "sb_mammoth_skull"), 0.25,
                   role="seabed-bones", depth=(2.0, 30.0),
                   clump_size_median=2, singleton_share=0.7,
                   clump_radius_m=3.0, scale_range=[0.9, 1.1]),
    # Lost cargo: a barrel, a basket, a bucket.
    *_seabed_split(("sb_barrel", "sb_basket", "sb_bucket"), 0.15,
                   role="seabed-clutter", depth=(1.0, 20.0),
                   clump_size_median=2, singleton_share=0.7,
                   clump_radius_m=4.0, scale_range=[0.95, 1.05]),
    # The two broken rowboat halves, which had `ocean` nowhere in their kinds.
    # Their freshwater layer is untouched; this is the sea's own copy.
    *_seabed_split(("rowboat_back", "rowboat_front"), 0.05,
                   role="seabed-boat", depth=(1.0, 15.0),
                   mined_mesh="dos/boats/rowboatbrokenback.nif",
                   clump_size_median=1, singleton_share=1.0,
                   clump_radius_m=0.0, scale_range=[0.9, 1.1]),
    # Algae mats had freshwater kinds only. The sea gets them too, shallow.
    seabed("algae_mat", 15.0, role="seabed-algae", depth=(0.3, 4.0),
           mined_mesh="landscape/grass/tbpalgae01.nif",
           depth_peak_m=1.0, depth_half_width_m=1.5, clump_size_median=8,
           clump_radius_m=6.0, tilt_deg_max=0.0, scale_range=[0.8, 1.4]),
]

# Region 0 is the ocean: no land vegetation is authored for it anywhere, so
# without this it would be the one region class the band never reached.
REGIONS[0] = {"id": "ocean", "layers": [],
              "note": "open water and sea bed — the underwater band only; "
                      "nothing in region 0 stands on dry land."}

for _spec in REGIONS.values():
    _spec["layers"].extend(json.loads(json.dumps(AQUATIC_BAND)))
    _spec["layers"].extend(json.loads(json.dumps(SEABED_BAND)))



# ===========================================================================
# --- rocks and dressing zones (16f) ---  keep additions inside this block
# ===========================================================================
#
# Every rock figure is read from the mined vanilla record at build time by
# worldgen/rock_dressing.py; the rules those figures support are stated once in
# docs/research/vegetation/rock-placement-rules.md. Nothing below types a
# sink, a tilt, a scale or a slope band.

#: Every LAND region class (0 is open ocean). A layer that belongs everywhere
#: carries this explicitly rather than an empty gate: `merge_palettes` reads an
#: empty `region_classes` as "the region whose palette holds it", so a
#: province-wide layer has to name its regions.
LAND_REGION_CLASSES = tuple(sorted(r for r in REGION_CLASSES if r != 0))

#: Ground the lowland rock scatter may stand on (mined rule 3).
_LOWLAND_ROCK_COVERS = ("GRASS_DIRT", "SCRUB", "TROP_GRASS", "LITTER",
                        "FOREST_FLOOR")

# --- upland rock, per region ------------------------------------------------
# Regions 1 and 2 keep the totals they shipped with (55 and 30 boulders/ha);
# the lowland classes get a thin scatter on their soft covers only.
REGIONS[1]["layers"] += rd.boulders_dry((1,), 55.0)
REGIONS[1]["layers"] += rd.rock_piles((1,), 8.0)
REGIONS[2]["layers"] += rd.boulders_dry((2,), 30.0)
REGIONS[2]["layers"] += rd.rock_piles((2,), 8.0)
for _region in (5, 9, 11, 13):
    REGIONS[_region]["layers"] += rd.boulders_dry(
        (_region,), 3.0, land_cover=_LOWLAND_ROCK_COVERS)

# --- province-wide rock -----------------------------------------------------
# Cliffs, cliff feet, wet rocks, surf and falls are decided by the GROUND and
# the water record, never by a land region: a cliff is a cliff in the jungle as
# much as in the mountains, and a rapid's bed rocks belong to the rapid. They
# are written ONCE, gated to every land class, and filed under region 1 purely
# because that is the palette a reader looks in for rock — the region key does
# no work here; `region_classes` does all of it.
_PROVINCE_ROCKS: list[dict] = []
_PROVINCE_ROCKS += rd.cliff_pieces(12.0)          # >= 28 deg ground, open backs in
_PROVINCE_ROCKS += rd.cliff_foot_piles(1.5, 15.0)  # fallen stone below a face
_PROVINCE_ROCKS += rd.wet_rocks(25.0)              # in and beside the water
_PROVINCE_ROCKS += rd.surf_rocks(40.0)             # rocky sea shore
_PROVINCE_ROCKS += rd.fall_rocks(60.0)             # falls, chutes, plunge pools
for _layer in _PROVINCE_ROCKS:
    _layer["region_classes"] = list(LAND_REGION_CLASSES)
REGIONS[1]["layers"] += _PROVINCE_ROCKS

# --- stone on the sea bed (2026-09-18) --------------------------------------
# The wet family stopped at 2.5 m of water, so below the surf line the sea bed
# held no stone at all. Three bands now run down it, on the same shoreline
# ramp as the rest of the sea-bed dressing, gated to `ocean` and to NO region
# class (the bed is not a land region - `region_classes` empty means every
# class, which is what puts stone on the floor of region 0 as well).
#
# The nine `wetrocks` meshes vanilla never placed carry the mined profile of
# the dry mesh each one is a retexture of; Shores of Skyrim's twelve rocks
# carry the MEAN of the three `rocks0*wet` profiles, since nobody has ever
# placed them anywhere. Both borrowings are stated in each layer's own note.
_SEABED_ROCKS: list[dict] = []
# Small stone, 14/ha at the shoreline: half to the three vanilla wet stones by
# mined count, half evenly across the twelve Shores pieces.
_SEABED_ROCKS += rd.seabed_rocks(rd.SEABED_WET_SMALL, 7.0, (0.3, 30.0),
                                 role="wet-rock")
_SHORE_MEAN = rd.shore_rock_mean()
_SEABED_ROCKS += rd.seabed_rocks(
    rd.SHORE_ROCKS, 7.0, (0.3, 30.0), role="wet-rock",
    shares={_s: 1.0 / len(rd.SHORE_ROCKS) for _s in rd.SHORE_ROCKS},
    profile=_SHORE_MEAN,
    borrowed_from=("the mean of the three `rocks0*wet` mined rows "
                   f"(n={_SHORE_MEAN['n']} between them)"),
    # Measured on the rebuilt kit: these are 0.07-0.16 m pebbles at native
    # size, not the small boulders their file sizes suggested, so they are
    # scaled up to read as 0.2-1.0 m bed stone.
    scale_range=[3.0, 6.0])
_SEABED_ROCKS += rd.seabed_rocks(rd.SEABED_WET_MEDIUM, 3.0, (1.0, 40.0),
                                 role="wet-rock")
_SEABED_ROCKS += rd.seabed_rocks(rd.SEABED_WET_LARGE, 0.8, (2.0, 45.0),
                                 role="wet-rock")
REGIONS[1]["layers"] += _SEABED_ROCKS

# --- authored dressing zones (deliverable 4) --------------------------------
# A zone overlay is ADDITIVE: it is appended to every region palette its
# polygon touches and suppresses nothing, so the region's own dressing still
# stands inside it. Which regions a polygon touches is a raster question the
# compiler answers, so the layer is gated on the zone id and on every land
# class; the zone raster does the rest.
_ZONE_LAYERS = dz.zone_layers()
for _layer in _ZONE_LAYERS:
    _layer["region_classes"] = list(LAND_REGION_CLASSES)
REGIONS[1]["layers"] += _ZONE_LAYERS

# --- the litter mask's twin (deliverable 10) --------------------------------
# Woody layers do not grow out of bare rock. The mask in the ground tint's
# alpha makes the GROUND under a canopy read as litter; this keeps the canopy
# off the rock in the first place. Regions 1 and 2 are the exception the
# mountains need: their own trees do stand on mountain rock.
_WOODY_ROLES = frozenset({
    "landmark-giant", "emergent", "canopy", "understory", "gallery",
    "gap-thicket", "green-wall", "bank-wall", "waterline-tree",
    "drowned-tree", "drowned-tree-dry", "basin-mangrove",
})
_BARE_ROCK_COVERS = (lc.BC_ROCK, lc.MOUNTAIN_ROCK, lc.DIRT_CLIFF)
for _region, _spec in REGIONS.items():
    _excluded = ([lc.BC_ROCK, lc.DIRT_CLIFF] if _region in (1, 2)
                 else list(_BARE_ROCK_COVERS))
    for _layer in _spec["layers"]:
        if _layer.get("role") in _WOODY_ROLES and not _layer.get("land_cover"):
            _layer["land_cover_not"] = _excluded


# ===========================================================================
# --- upland dressing (16f deliverable 11) ---  keep additions inside this block
# ===========================================================================
#
# Sixteen vanilla upland pieces shipped in flora-province-v1 that no palette
# placed: dead shrubs, tundra scrub, the Reach shrub, the thicket, the three
# mountain flowers, and the pine/aspen deadfall. They are DRESSING, not a
# stratum — the mountains and the hills read as bare ground between their
# stands, and this is what a player finds when they walk into that ground.
#
# Every slope gate below is the species' own mined slope p75 + 10 deg (the
# mined record is the evidence for where vanilla stood each piece; the +10
# is the same widening the rock layers use, so a piece vanilla put on a 23
# deg hillside is not refused the 30 deg one next to it). Sinks are NOT typed
# here: `composition.Composition` reads each species' mined `pivotOffsetM`
# from world/sources/placement/composition-rules.json.

#: Soil covers the upland dressing may stand on.
_UPLAND_SOIL_COVERS = ("GRASS_DIRT", "SCRUB", "TROP_GRASS", "PEAT",
                       "MUD_LEAVES")
#: ...plus the stony ones the dead shrubs and the rock-tolerant forbs hold.
_UPLAND_ROCK_COVERS = ("SCREE", "PEBBLES", "MOUNTAIN_ROCK", "MOSSY_ROCK")
_UPLAND_ALL_COVERS = _UPLAND_SOIL_COVERS + _UPLAND_ROCK_COVERS

#: `treepineforeststump02a` is the only one of the sixteen vanilla never
#: placed in Tamriel, so it has no mined row of its own. It takes
#: `treepineforeststump01`'s profile — the same authored pine stump at a
#: different break — exactly as `rock_dressing.MINED_ALIAS` does for
#: `moss_rockcliff01`. The same alias is written into composition-rules.json
#: so its SINK comes from the same evidence rather than a class default.
UPLAND_MINED_ALIAS = {
    S["pine_stump_b"]: S["pine_stump_a"],
}


def _cover_ids(names: tuple[str, ...]) -> list[int]:
    return [getattr(lc, name) for name in names]


def _upland_slope_max(species: str) -> float:
    """Mined slope p75 + 10 deg, the band this piece is allowed to stand on."""
    mined_id = UPLAND_MINED_ALIAS.get(S[species], S[species])
    return round(rd.mined(mined_id)["slope_p75"] + 10.0, 1)


def _mined_count(species: str) -> int:
    mined_id = UPLAND_MINED_ALIAS.get(S[species], S[species])
    return int(rd.mined(mined_id)["n"])


def dressing(species: str, per_ha: float, role: str, regions: tuple[int, ...],
             covers: tuple[str, ...], *, tier: str = "T2", **kw) -> dict:
    """One upland dressing layer: a mined slope band, a cover allow-list and
    the channel exclusion every dry-footed piece carries."""
    return layer(species, per_ha, tier=tier, role=role,
                 region_classes=list(regions),
                 land_cover=_cover_ids(covers),
                 slope_deg_max=_upland_slope_max(species),
                 channel_exclusion=True,
                 water_depth_m=kw.pop("water_depth_m", [-99.0, -0.2]),
                 **kw)


def _split_by_mined(species: tuple[str, ...], total_per_ha: float,
                    **kw) -> list[dict]:
    """A group total split across its species by their mined counts — the
    proportions vanilla itself placed them in."""
    counts = {name: _mined_count(name) for name in species}
    n = sum(counts.values())
    return [dressing(name, round(total_per_ha * counts[name] / n, 2), **kw)
            for name in species]


_UPLAND: list[dict] = []
# Dead shrubs: the province's driest silhouette, on soil AND on stone.
_UPLAND += [dressing("dead_shrub", 9.0, "dead-shrub", (1,), _UPLAND_ALL_COVERS,
                     clump_size_median=4, clump_radius_m=9.0,
                     scale_range=[0.67, 1.19], patchiness=1.1),
            dressing("dead_shrub", 9.0, "dead-shrub", (2,), _UPLAND_ALL_COVERS,
                     clump_size_median=4, clump_radius_m=9.0,
                     scale_range=[0.67, 1.19], patchiness=1.1)]
# Region 1's low scrub mat: four meshes at 10/ha between them, in the mined
# proportions, above the 100 m line where the mountains start.
_UPLAND += _split_by_mined(
    ("tundra_shrub_a", "tundra_shrub_b", "tundra_shrub_c", "tundra_scrub"),
    10.0, role="dead-shrub", regions=(1,), covers=_UPLAND_ALL_COVERS,
    clump_size_median=5, clump_radius_m=8.0, scale_range=[0.61, 1.10],
    altitude_m=[100.0, 9999.0], patchiness=1.2)
# Region 2's own two: the Reach shrub and the thicket.
_UPLAND += [dressing("reach_shrub", 6.0, "dead-shrub", (2,), _UPLAND_ALL_COVERS,
                     clump_size_median=5, clump_radius_m=8.0,
                     scale_range=[0.91, 1.24], patchiness=1.1),
            dressing("thicket", 12.0, "dead-shrub", (2,), _UPLAND_ALL_COVERS,
                     clump_size_median=6, clump_radius_m=7.0,
                     scale_range=[0.64, 1.18], patchiness=1.2)]
# Mountain flowers: 5/ha between the three hues in both upland regions,
# split by mined count. Region 1 keeps them above 100 m (the montane band).
_UPLAND += _split_by_mined(
    ("mtn_flower_purple", "mtn_flower_blue", "mtn_flower_red"), 5.0,
    role="mountain-forb", regions=(1,), covers=_UPLAND_ALL_COVERS,
    clump_size_median=6, clump_radius_m=6.0, scale_range=[0.90, 1.55],
    altitude_m=[100.0, 9999.0])
_UPLAND += _split_by_mined(
    ("mtn_flower_purple", "mtn_flower_blue", "mtn_flower_red"), 5.0,
    role="mountain-forb", regions=(2,), covers=_UPLAND_ALL_COVERS,
    clump_size_median=6, clump_radius_m=6.0, scale_range=[0.90, 1.55])
# Deadfall in the montane forest belt: fallen pine trunks and their stumps,
# on soil only (a log lies on the forest floor, not on scree), above 100 m
# where region 1's pine and juniper stand. T1 for the logs — a 15 m trunk is
# a hero silhouette; the stumps are ordinary mid instances.
_UPLAND += _split_by_mined(
    ("pine_log_a", "pine_log_b"), 1.5, role="deadfall", regions=(1,),
    covers=_UPLAND_SOIL_COVERS, tier="T1", clump_size_median=1,
    singleton_share=0.8, clump_radius_m=14.0, scale_range=[0.65, 1.10],
    altitude_m=[100.0, 9999.0], clearance_radius_m=2.0)
_UPLAND += _split_by_mined(
    ("pine_stump_a", "pine_stump_b"), 1.0, role="deadfall", regions=(1,),
    covers=_UPLAND_SOIL_COVERS, clump_size_median=1, singleton_share=0.8,
    clump_radius_m=12.0, scale_range=[0.42, 1.00],
    altitude_m=[100.0, 9999.0], clearance_radius_m=1.5)
# ...and the aspen pair in the hills, 1.5/ha between them in their mined
# proportions (139 logs to 158 stumps). Written as two calls rather than one
# split so the log keeps the T1 tier every fallen trunk carries.
_UPLAND += [dressing("aspen_log", 0.7, "deadfall", (2,), _UPLAND_SOIL_COVERS,
                     tier="T1", clump_size_median=1, singleton_share=0.8,
                     clump_radius_m=12.0, scale_range=[0.66, 1.00],
                     clearance_radius_m=1.5),
            dressing("aspen_stump", 0.8, "deadfall", (2,), _UPLAND_SOIL_COVERS,
                     clump_size_median=1, singleton_share=0.8,
                     clump_radius_m=12.0, scale_range=[0.88, 1.00],
                     clearance_radius_m=1.5)]

for _layer in _UPLAND:
    REGIONS[_layer["region_classes"][0]]["layers"].append(_layer)


# ===========================================================================
# --- thin classes on the record (16f deliverable 12) ---
# ===========================================================================
#
# Two region classes are thin strips on the paint and rich places in the
# record. Rather than widening the raster, their dressing is ALSO applied as
# an overlay keyed to the hydrology record itself (0065/0066: the compile
# realises the graph, it never re-derives it), gated on the water ENTITY or
# on the distance to a major reach rather than on which class the paint gave
# the texel. Regions 3 and 5 keep their own palettes where the raster paints
# them; these copies stand wherever the record says the same place is.
#
# The copies carry an `overlay-` role prefix. That is not decoration: a
# province-wide overlay is not part of any region's authored tree ladder, so
# `vegetation_ladder.is_stem_layer` refuses the prefix and the ladder keeps
# measuring what each region's own table authored (a T1 gallery copy added to
# thirteen regions would otherwise re-base every one of them).

HYDRO_GRAPH = (REPO_ROOT / "world" / "sources" / "hydrology"
               / "hydrology-graph.json")

#: The delta river and the radius around its mouth the overlay reaches.
DELTA_RIVER_ID = "river.889-484"
DELTA_MOUTH_RADIUS_M = 400.0
#: Body kinds the delta dressing belongs in around that mouth.
DELTA_BODY_KINDS = ("mudflat", "lagoon")
#: Roles of region 3's own layers the overlay repeats: the mudflat and
#: salt-marsh tiers (reeds, the salt sward, the mangrove edge).
DELTA_OVERLAY_ROLES = ("aquatic-reeds", "tall-grass", "waterline-tree",
                       "basin-mangrove")
#: Roles of region 5's that the corridor overlay repeats, and how far from a
#: band-3 reach centreline the gallery ribbon reaches.
CORRIDOR_OVERLAY_ROLES = ("gallery", "waterline-tree")
CORRIDOR_HALF_WIDTH_M = 60.0


def delta_entities(path: Path = HYDRO_GRAPH) -> list[str]:
    """Entity ids the delta overlay stands on, read from the graph.

    Every reach of the delta river, plus every mudflat or lagoon body whose
    bbox centre lies within 400 m of that river's mouth. Cell units become
    metres by the graph header's own `grid.metresPerSample`, which is how
    `compile_water` reads `bboxCells`.
    """
    graph = json.loads(path.read_text(encoding="utf-8"))
    mps = float(graph["grid"]["metresPerSample"])
    river = next(r for r in graph["rivers"] if r["id"] == DELTA_RIVER_ID)
    ids = list(river["reaches"])
    mouth_e, mouth_s = float(river["mouthEastM"]), float(river["mouthSouthM"])
    for body in graph["bodies"]:
        if body.get("kind") not in DELTA_BODY_KINDS or not body.get("bboxCells"):
            continue
        x0, y0, x1, y1 = body["bboxCells"]
        east = (x0 + x1) / 2.0 * mps
        south = (y0 + y1) / 2.0 * mps
        if math.hypot(east - mouth_e, south - mouth_s) <= DELTA_MOUTH_RADIUS_M:
            ids.append(body["id"])
    return ids


def _overlay_copies(region: int, roles: tuple[str, ...]) -> list[dict]:
    copies = []
    for entry in REGIONS[region]["layers"]:
        if entry.get("role") in roles:
            copy = json.loads(json.dumps(entry))
            copy["role"] = "overlay-" + copy["role"]
            copy["region_classes"] = list(LAND_REGION_CLASSES)
            copies.append(copy)
    return copies


def delta_overlay() -> list[dict]:
    entities = delta_entities()
    copies = _overlay_copies(3, DELTA_OVERLAY_ROLES)
    for copy in copies:
        copy["water_entities"] = entities
        copy["note"] = (f"delta dressing keyed to the hydrology record: the "
                        f"reaches of {DELTA_RIVER_ID} and the mudflat/lagoon "
                        f"bodies within {DELTA_MOUTH_RADIUS_M:.0f} m of its "
                        f"mouth, whatever class the region paint gives the "
                        f"texel (16f deliverable 12)")
    return copies


def corridor_overlay() -> list[dict]:
    copies = _overlay_copies(5, CORRIDOR_OVERLAY_ROLES)
    for copy in copies:
        copy["corridor_m"] = [0.0, CORRIDOR_HALF_WIDTH_M]
        copy["note"] = (f"the river corridor's gallery ribbon, applied within "
                        f"{CORRIDOR_HALF_WIDTH_M:.0f} m of any band-3 reach "
                        f"centreline province-wide (16f deliverable 12)")
    return copies


_DELTA_OVERLAY = delta_overlay()
_CORRIDOR_OVERLAY = corridor_overlay()
# Appended ONCE each (they already name every land class, like the province
# rock layers above): the palette a reader looks in for the delta's dressing
# is region 3's, and for the corridor's is region 5's.
REGIONS[3]["layers"] += _DELTA_OVERLAY
REGIONS[5]["layers"] += _CORRIDOR_OVERLAY


def build() -> dict:
    total = {}
    factors = multipliers()
    for region, spec in sorted(REGIONS.items()):
        apply_coastal_gradient(spec["layers"])
        rebase_stems(region, spec["layers"], factors.get(region, 1.0))
        per_ha = sum(l["instances_per_hectare"] for l in spec["layers"])
        stems = sum(l["instances_per_hectare"]
                    for l in spec["layers"] if is_stem_layer(l))
        entry = {"id": spec["id"], "layers": spec["layers"],
                 "targetInstancesPerHectare": round(per_ha, 1),
                 "authoredStemsPerHectare": round(stems, 2),
                 "ladderRatioTarget": TARGET_RATIOS[region],
                 "ladderMultiplierApplied": factors.get(region, 1.0)}
        if "note" in spec:
            entry["note"] = spec["note"]
        total[str(region)] = entry
    return {
        "id": "argonia-flora-v2",
        "schemaVersion": 3,
        "status": "EVIDENCE-BASED v2 (Phase 10 round 2), tree ladder re-based "
                  "2026-09-09 (decision 0048) — generated by "
                  "worldgen/build_palettes.py; edit THAT, then re-run it. "
                  "Structure and densities from the three research docs; "
                  "owner decisions 0036 Q1-Q4 still bind (landmark giants, "
                  "five exemplar areas, region rebalance).",
        "grounding": {
            "ecology": "docs/research/vegetation/tropical-vegetation-ecology-targets.md "
                       "§7 — per-landscape strata targets and spatial rules",
            "microSiting": "docs/research/vegetation/mod-vegetation-micro-siting.md — "
                           "M1 four water postures, M2 signed riparian, M3 "
                           "pool guilds, M5 groundcover carries the look",
            "architecture": "docs/research/openworld-vegetation-placement-"
                            "architecture.md — macro/meso/micro layering",
            "canonFlora": "world/sources/lore/topics/fauna-hazards.md § Flora",
            "regionClasses": "tooling/world-generation/worldgen/regions.py",
        },
        "conventions": {
            "generator": "worldgen/build_palettes.py — the archetypes "
                         "(strata, water postures, walls, guilds) encode the "
                         "evidence once; regions read like the ecology table",
            "water_depth_m": "standing water over ground; negative is height "
                             "above the local water table. Dry-tolerant "
                             "species gate [-99, +0.35]: the WADING rule (M1)"
                             " — never re-tighten to a water-table band, that "
                             "was the v1 sparse-jungle defect",
            "shore_m": "signed distance to the water's edge (+ land, − "
                       "water): reed belts, bank walls, mangrove banding, "
                       "gallery ribbons",
            "glade_band": "band on the shared openness field: interior "
                          "shrubs low end, green walls mid, gap thickets "
                          "high end",
            "guild": "per ~220 m tile, one water guild (M3): lilypad-pond / "
                     "reed-bed / drowned-thicket / kelp-forest; "
                     "guild_off_share keeps a thinned baseline where another "
                     "guild wins (round 4 — reed belts never vanish)",
            "coast_m / coast_boost_gain": "SIGNED distance to the OCEAN "
                    "(positive inland, negative at sea; salt "
                    "exposure, round 4): salt-tolerant species mix in near "
                    "any coast, salt-intolerant fade out over ~0.5-2 km "
                    "(research/world-terrain/mangrove-coastal-ecology.md §4); applied per "
                    "species by apply_coastal_gradient",
            "tier": "T1 hero statics, T2 instanced mid. Herb layer is "
                    "groundcover.json (T3 ring) — most of the 'dense' read "
                    "lives THERE (M5), not here",
            "densityScale": "global multiplier, owner's one knob",
            "ladder": "between-region tree density is NOT authored in the "
                      "region tables — it is re-based from "
                      "worldgen/vegetation_ladder.TARGET_RATIOS (jungle = "
                      "1.00, owner-held) and applied to the T1 non-rock stem "
                      "layers by build_palettes.rebase_stems. Change the "
                      "ladder there, not here",
        },
        "ladder": {
            "reference": "13 (tropical jungle) — held at its shipped level by "
                         "owner constraint 2026-09-09; every other class is "
                         "re-based relative to it (decision 0048)",
            "stemMeasure": "T1-tier layers excluding role rock / cliff-"
                           "dressing — see worldgen/vegetation_ladder.py",
            "targetRatios": TARGET_RATIOS,
            "measuredDeliveredPerHectare2026_09_09": MEASURED_DELIVERED_PER_HA,
            "measuredAttenuation2026_09_09": MEASURED_ATTENUATION,
            "pending": "these ratios are DESIGN targets; the delivered "
                       "numbers are whatever the last compile_scatter run "
                       "produced (test_vegetation_ladder::test_delivered_"
                       "ladder measures them)",
        },
        "byRegionClass": total,
        "densityScale": 1.0,
    }


def main() -> None:
    data = build()
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    layers = sum(len(e["layers"]) for e in data["byRegionClass"].values())
    print(f"wrote {OUT} — {len(data['byRegionClass'])} regions, {layers} layers")
    for region, entry in data["byRegionClass"].items():
        print(f"  {region:>2} {entry['id']:28s} "
              f"{entry['targetInstancesPerHectare']:7.1f}/ha authored")


if __name__ == "__main__":
    main()
