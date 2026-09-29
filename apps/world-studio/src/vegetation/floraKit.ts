/**
 * Loads the compiled flora kit GLB and indexes it by semantic asset id.
 *
 * The kit builder exports one root node per asset (`bmv__landscape/trees/...`,
 * the id with its colon escaped) whose children are the base meshes plus a
 * decimated LOD chain marked with an `lod` extra. This turns that into the
 * shape a renderer wants: per species, an array of levels, each a list of
 * geometry/material pairs to instance.
 */

import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { QualitySettings } from "@elder-souls/game-core/core/quality";
import {
  BAYER4_THRESHOLDS,
  LOD_CULL_BAND_M,
  lodFadeFactors,
  lodPixelKept,
  type LodRung,
} from "@elder-souls/game-core/fx/lodFade";
import { cellRungs } from "@elder-souls/game-core/vegetation/cellBuild";

export interface KitLevel {
  readonly parts: {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    /** Alpha-tested foliage needs its own shadow depth material, or its
     * shadow is the whole leaf-card quad rather than the leaf shape. */
    depthMaterial?: THREE.Material;
  }[];
  readonly triangles: number;
}

export interface KitSpecies {
  readonly id: string;
  /** Level 0 is the full mesh; later entries are progressively decimated. */
  readonly levels: KitLevel[];
  /** Index into `levels` of the T4 flat-billboard mesh (the source pool's
   * `_lod_flat` variant, exported one past the decimated chain), or null
   * where the species ships none and the last decimated level is final. */
  readonly billboardIndex: number | null;
  /** Source-space height in metres at scale 1, for LOD distance choice. */
  readonly heightM: number;
  /** True where the mesh chain FOLDED to a single level: every mesh level is
   * the same geometry (today exactly the alpha-tested assets, which are never
   * decimated). Such a species runs one reach and then its card, not the
   * three-ring ladder — see `lodDistances`. */
  readonly folded: boolean;
  /** Trunk radius in metres at scale 1, from the kit's collision capsule.
   * Drives wind stiffness (`windStiffness`): fat trunks barely stir. Null
   * where the species has no trunk capsule (ground plants, aquatics), which
   * the caller reads as "no stiffening". */
  readonly trunkRadiusM: number | null;
  /** Manifest `category` (`tree`, `rock`, `aquatic-plant`, …) — the kit's own
   * vocabulary, carried through so the renderer can treat non-plants as the
   * non-plants they are. */
  readonly category: string | null;
  /** False for anything that is not a plant (rock, deadfall, container, misc,
   * ruin, architecture, clutter). A boulder that bends in the wind is the
   * owner's defect; the renderer must neither patch its material nor let it
   * inherit a plant's sway through a shared material. */
  readonly sways: boolean;
  /** True for the underwater-band species (and anything the manifest calls
   * aquatic): under water you can see a few dozen metres at best, so these
   * draw shorter and step down their LOD chain sooner. */
  readonly submerged: boolean;
  /** Bounds so far from the origin they are clearly stray geometry (the
   * algrass03b case: mesh ~83 m from its pivot). Renderers should skip these
   * — drawing them puts geometry underground or in the sky either way. */
  readonly suspect: boolean;
  /** Set where the species' card level draws an octahedral IMPOSTOR
   * (`installImpostors`): the tree's height in impostor texels. The rung
   * never starts where the tree is taller than that on screen. */
  readonly impostorPx?: number;
}

export type FloraKit = Map<string, KitSpecies>;

export interface KitManifestAsset {
  id: string;
  sizeM: [number, number, number];
  /** Origin → bbox max, kit source space (z-up); grounded assets have
   * `originOffsetM[2] ≈ sizeM[2]`. */
  originOffsetM?: [number, number, number];
  triangles: number;
  alphaTest?: boolean;
  /** True when the kit carries a `_lod_flat` billboard as the final level. */
  billboard?: boolean;
  doubleSided?: boolean;
  collision?: string;
  collisionFrame?: string;
  collisionCapsule?: { radiusM: number; heightM: number; baseOffsetM: [number, number, number] };
  /** Kit vocabulary. Land kit: tree, rock, shrub, aquatic-plant, plant,
   * fungus, deadfall, container, grass. Underwater kit adds ruin,
   * architecture, clutter, misc. */
  category?: string;
}

export interface KitManifest {
  kit: string;
  assets: KitManifestAsset[];
}

/**
 * The semantic id comes from glTF `extras`, never from the node name: three.js
 * sanitises node names for animation property paths and strips the slashes out
 * of `bmv__landscape/trees/cypress1`, which silently emptied the whole kit.
 * The name is kept only as a legible fallback.
 */
function assetIdOf(object: THREE.Object3D): string | null {
  const extras = (object.userData ?? {}) as { assetId?: string };
  if (typeof extras.assetId === "string") return extras.assetId;
  return object.name ? object.name.replace("__", ":") : null;
}

/** Triangles across a level's parts, for the identical-level test. */
function partTriangles(parts: KitLevel["parts"]): number {
  let total = 0;
  for (const part of parts) {
    const index = part.geometry.getIndex();
    total += (index ? index.count : part.geometry.attributes.position.count) / 3;
  }
  return total;
}

/** Level index from the exporter's `lod` extra; base meshes have none. */
function levelOf(object: THREE.Object3D): number {
  const extras = (object.userData ?? {}) as { lod?: number };
  return typeof extras.lod === "number" ? extras.lod : 0;
}

/** The kit builder flags the `_lod_flat` far-tier mesh with a `billboard`
 * extra (glTF extras, same channel as `lod` — never the node name). */
function isBillboard(object: THREE.Object3D): boolean {
  const extras = (object.userData ?? {}) as { billboard?: boolean };
  return extras.billboard === true;
}

/**
 * Manifest categories that are not plants. Nothing in this set sways: wind
 * displacing a boulder, a fallen log, a crate or a sunken wall is the owner's
 * round-16f defect, and no amount of amplitude tuning makes it right.
 */
export const NON_SWAYING_CATEGORIES = new Set([
  "rock", "deadfall", "container", "misc", "ruin", "architecture", "clutter",
]);

/** Categories that only ever stand under water. */
const SUBMERGED_CATEGORIES = new Set(["aquatic-plant", "aquatic"]);

/**
 * Metres. Draw ceiling for a submerged species: underwater sight lines are
 * short, and a kelp frond resolved at 400 m is triangles spent behind a wall
 * of scatter.
 */
export const SUBMERGED_MAX_DRAW_M = 120;

/** Submerged LOD rings are halved for the same reason. */
export const SUBMERGED_LOD_SCALE = 0.5;

export function buildFloraKit(
  gltf: GLTF,
  manifest: KitManifest,
  /** True for the underwater-band kit: every species in it is submerged,
   * whatever category the manifest gives it (a sunken wall is still only ever
   * seen through water). */
  underwater = false,
): FloraKit {
  const heights = new Map(manifest.assets.map((a) => [a.id, a.sizeM[2]]));
  const anchors = new Map(
    manifest.assets.map((a) => {
      const originAboveBase = a.originOffsetM?.[2] ?? 0;
      // Bottom-anchor, then sink slightly so sloped ground doesn't reveal a
      // floating flat base. Grounded assets (origin at base) come out ~0.
      const anchor = originAboveBase - Math.min(0.15, 0.05 * a.sizeM[2]);
      const suspect =
        !Number.isFinite(anchor) ||
        Math.abs(originAboveBase) > 2 * Math.max(a.sizeM[0], a.sizeM[1], a.sizeM[2]) + 2;
      return [a.id, { anchor: suspect ? 0 : anchor, suspect }];
    }),
  );
  const trunkRadii = new Map(
    manifest.assets.map((a) => [a.id, a.collisionCapsule?.radiusM ?? null]),
  );
  const categories = new Map(manifest.assets.map((a) => [a.id, a.category ?? null]));
  const alphaTested = new Set(
    manifest.assets.filter((a) => a.alphaTest).map((a) => a.id),
  );
  const kit: FloraKit = new Map();
  // One depth material per source material: meshes share materials across
  // LOD levels, and the shadow pass must alpha-test the same texture.
  const depthMaterials = new Map<THREE.Material, THREE.MeshDepthMaterial>();

  for (const root of gltf.scene.children) {
    const id = assetIdOf(root);
    if (!id || !heights.has(id)) continue;
    const byLevel = new Map<number, KitLevel["parts"]>();
    let billboardLevel: number | null = null;
    let triangles = 0;

    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const level = levelOf(mesh);
      const material0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (isBillboard(mesh)) {
        // A card whose material lost its texture would draw as a solid
        // untextured rectangle at distance (the owner's "grey slab" defect).
        // Better to skip the card and let that species end on its last
        // decimated mesh level.
        if (!(material0 as THREE.MeshStandardMaterial)?.map) return;
        billboardLevel = level;
        // Lift the card out of its baked-in canopy shade (round-4 lever).
        // Materials are shared across a species' cards, so brighten once.
        const card = material0 as THREE.MeshStandardMaterial;
        // Only AUTHORED cards need it: they bake canopy shade into the paint.
        // A baked card (`cardSource: "baked"`) was rendered under flat white
        // light by the kit builder, so brightening it would blow it out.
        const baked = (mesh.userData ?? {}).cardSource === "baked";
        if (!baked && !card.userData.esBillboardBrightened) {
          card.color.multiplyScalar(BILLBOARD_BRIGHTNESS);
          card.userData.esBillboardBrightened = true;
        }
        // Bent normals (research doc §4.1 cause 3): a flat card's geometric
        // normal faces away from the sun half the time, rendering the card
        // near-black in full daylight. Grass-card practice is to light cards
        // as if they were ground — normals straight up.
        const normal = mesh.geometry.getAttribute("normal");
        if (normal) {
          for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
          normal.needsUpdate = true;
        }
      }
      const material = material0;
      // Foliage is alpha-*tested*, never blended: blending sorts wrongly
      // through a canopy and costs the most on exactly the devices that can
      // least afford it (module 65 §111). Billboards are always cutout cards
      // at 0.5, whatever the base asset's mode; a mesh level keeps the cutoff
      // GLTFLoader read from its MASK material (the NIF's own NiAlphaProperty
      // threshold, walk 5: mangroves test at 45-70/255, not 0.5).
      const std = material as THREE.MeshStandardMaterial;
      if ((alphaTested.has(id) || isBillboard(mesh)) && std) {
        std.alphaTest = !isBillboard(mesh) && std.alphaTest > 0 ? std.alphaTest : 0.5;
        std.transparent = false;
        std.depthWrite = true;
        std.side = THREE.DoubleSide;
      }
      // Join the shared atmosphere: WorldSky's patchScene applies the aerial
      // inscatter term to any material tagged esAerial (after its CSM patch).
      // Unpatched, plants ignore haze/mist and read as dark cut-outs pasted
      // over the weathered scene.
      material.userData.esAerial = true;
      let depthMaterial: THREE.MeshDepthMaterial | undefined;
      if (std?.alphaTest) {
        depthMaterial = depthMaterials.get(material);
        if (!depthMaterial) {
          depthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: std.map,
            alphaTest: std.alphaTest,
            side: THREE.DoubleSide,
          });
          depthMaterials.set(material, depthMaterial);
        }
      }
      const parts = byLevel.get(level) ?? [];
      parts.push({ geometry: mesh.geometry, material, depthMaterial });
      byLevel.set(level, parts);
      const index = mesh.geometry.getIndex();
      if (level === 0) {
        triangles += (index ? index.count : mesh.geometry.attributes.position.count) / 3;
      }
    });

    if (byLevel.size === 0) continue;
    // An alpha-tested part is never drawn decimated (16f round 5). Every
    // plant in the kit is built from dozens to hundreds of small separate
    // islands of triangles (leaf cards, twig cards, bark strips: median 2–16
    // triangles each) and collapse decimation shreds them into slivers with
    // scrambled UVs — the owner's leaves, branches and trunk strips that
    // vanished at the middle distance. Such a part keeps its base geometry at
    // every mesh level, and the identical-level rule below then folds the
    // chain to "full mesh, then card". Only an opaque part (none in the
    // land kit today) still steps down through the builder's decimation.
    const base = byLevel.get(0);
    if (base) {
      for (const [level, parts] of byLevel) {
        if (level === 0 || level === billboardLevel) continue;
        for (const part of parts) {
          const std = part.material as THREE.MeshStandardMaterial;
          if (!std?.alphaTest) continue;
          const source = base.find((b) => b.material === part.material);
          if (source) part.geometry = source.geometry;
        }
      }
    }
    // A level that is not smaller than the one before it is not a level:
    // the builder's decimation floors at ~300 triangles a part, so a small
    // mesh (every palm: 60–256 triangles a part) ships three identical
    // chains. Drawing them as three rungs stepped the same geometry against
    // itself at two rings for nothing; here they are one level (round 5).
    const levels: KitLevel[] = [];
    const kept: number[] = [];
    const sorted = [...byLevel.keys()].sort((a, b) => a - b);
    for (const level of sorted) {
      const parts = byLevel.get(level)!;
      if (level !== billboardLevel && kept.length > 0) {
        const previous = byLevel.get(kept[kept.length - 1])!;
        if (partTriangles(parts) >= partTriangles(previous)) continue;
      }
      kept.push(level);
      levels.push({ parts, triangles: level === 0 ? triangles : 0 });
    }
    const billboardIndex =
      billboardLevel === null ? null : kept.indexOf(billboardLevel);
    // Folded = ONE mesh level survives the dedupe. An alpha-tested species
    // whose kit carries part-aware tier levels (round 13, `lodTiers`: their
    // primitives own distinct materials, so the swap above leaves them) keeps
    // those levels and runs the multi-level ladder (`speciesRings`).
    const meshLevelCount = levels.length - (billboardIndex === null ? 0 : 1);
    kit.set(id, {
      id,
      levels,
      billboardIndex,
      heightM: heights.get(id) ?? 4,
      folded: alphaTested.has(id) && meshLevelCount <= 1,
      trunkRadiusM: trunkRadii.get(id) ?? null,
      category: categories.get(id) ?? null,
      sways: !NON_SWAYING_CATEGORIES.has(categories.get(id) ?? ""),
      submerged: underwater || SUBMERGED_CATEGORIES.has(categories.get(id) ?? ""),
      // Round-4 note: bbox-bottom anchoring (`anchorYM`) is GONE — bundle v2
      // species anchor by PIVOT with a baked sink (mined convention; the bbox
      // bottom is often a hanging frond tip and lifted trunks into the air).
      suspect: anchors.get(id)?.suspect ?? false,
    });
  }
  return kit;
}

/**
 * LOD distances, scaled by how big the thing is: a 60 m landmark tree has to
 * keep its silhouette much further out than a knee-high fern, and one fixed
 * ring would either pop the tree or waste triangles on the fern.
 *
 * There are TWO ladders, because there are two kinds of chain in the kit.
 *
 *  - A REAL chain (an opaque species that still decimates) keeps three rings:
 *    full mesh to height × 2.5 inside 18–60 m, the 0.35 decimation to
 *    height × 5 inside 50–140 m, the 0.12 decimation to height × 8 inside
 *    100–260 m, then its flat card.
 *  - A FOLDED chain (`folded`: every mesh level is the same geometry, which
 *    today is every alpha-tested plant — decimation shreds leaf cards, 16f
 *    round 5) has nothing to step down to, so the extra rings only stepped
 *    one geometry against itself while charging full-mesh triangles out to
 *    260 m. It gets ONE reach, `clamp(heightM * 5, 30, 140)`, and the card
 *    takes over there.
 *
 * The folded numbers are the frame's triangle budget (decision 0084: ~4 M
 * triangles a frame on the owner's M2) read against Skyrim's own practice —
 * full tree meshes only inside its ~140 m loaded grid, sub-2 m plants treated
 * as grass (hence the 30 m floor).
 *
 * The mid reach (the folded reach, and ring 1 of a real chain) depends on the
 * quality band (owner walk 2, 2026-09-27: "big trees switch to cards too
 * close in medium and high"); `LOD_REACH_BY_BAND` holds the three rows, and
 * `low` keeps the round-9 numbers above.
 */
export function lodDistances(
  heightM: number,
  folded = false,
  band: QualitySettings["name"] = "low",
): number[] {
  const mid = LOD_REACH_BY_BAND[band];
  if (folded) {
    const reach = Math.min(mid.maxM, Math.max(mid.foldedMinM, heightM * mid.perHeightM));
    return [reach, reach, reach];
  }
  // Measured 2026-09-16 at the jungle site: the old rings (full mesh to
  // height × 6, capped 150 m) drew 3.1 M triangles in character view and
  // 4.7 M from the air — ~2,800 full canopy meshes at 5–12 k triangles
  // each. Shipped open worlds hold full geometry to a few tens of metres and
  // hand over to decimated levels and cards well inside 300 m. Ring 0 (full
  // mesh) ends at height × 2.5 inside 18–60 m; ring 1 (the 0.35 decimation)
  // at the band's reach (low: height × 5 inside 50–140 m; medium: × 7 inside
  // 60–200 m; high: × 9 inside 80–280 m); ring 2 (the 0.12 decimation) at
  // height × 8 inside 100–260 m, held 20 m past ring 1; beyond it a billboard
  // species runs on its flat card, the rest on the deep level to their draw
  // distance.
  const ring0 = Math.min(60, Math.max(MIN_MESH_LOD_REACH_M, heightM * 2.5));
  const ring1 = Math.min(mid.maxM, Math.max(mid.minM, heightM * mid.perHeightM));
  const ring2 = Math.min(260, Math.max(100, heightM * 8));
  return [ring0, Math.max(ring1, ring0 + 10), Math.max(ring2, ring1 + 20)];
}

/**
 * The mid LOD reach per quality band: `perHeightM` × the species height,
 * clamped to `minM`–`maxM` (a folded species to `foldedMinM`–`maxM`). Low is
 * the round-9 ladder (decision 0084's triangle budget); medium and high hold
 * big trees as meshes further out (owner walk 2, 2026-09-27; decision 0075
 * addendum 2026-09-27).
 */
export const LOD_REACH_BY_BAND: Record<
  QualitySettings["name"],
  { perHeightM: number; minM: number; foldedMinM: number; maxM: number }
> = {
  low: { perHeightM: 5, minM: 50, foldedMinM: 30, maxM: 140 },
  medium: { perHeightM: 7, minM: 60, foldedMinM: 40, maxM: 200 },
  high: { perHeightM: 9, minM: 80, foldedMinM: 50, maxM: 280 },
};

/**
 * Floor on the full-mesh ring. Height × 6 gives a 2 m shrub only 12 m of full
 * mesh and 33 m before it becomes a flat card — which is why the uplands
 * screenshot (owner round 4, 1.59 km E / 1.63 km S) showed dark leaf-shaped
 * cutouts a few strides away. Small plants are cheap individually, but not in
 * the aggregate: measured at the jungle at rest, the near rung is 2.5 M of the
 * 2.6 M vegetation triangles, and jungle plants sitting ON this floor (a 1 m
 * plant is a ~273-triangle mesh out to the floor) are a large share of it.
 * 18 m holds real geometry past the distance the player can read a card at,
 * and drops the tail the 24 m floor was paying for.
 */
export const MIN_MESH_LOD_REACH_M = 18;

/**
 * Billboard cards bake shadowed-canopy lighting into their atlas texture, so
 * in bright open air they read darker than the meshes they replace (owner
 * round 4: "distant trees read near-black"). Scale the card material's colour
 * to compensate. One constant on purpose — the next tune is a one-line change,
 * and the owner judges the value on the deployed build.
 */
export const BILLBOARD_BRIGHTNESS = 1.25;

/**
 * Per-species draw distance (T-tier cull): beyond this an instance is not
 * drawn at all. Scaled by height so a 1 m fern leaves the scene ~80–100 m out
 * while a 30 m cypress persists past the chunk ring edge (~1,170 m). This is
 * what makes dense understory affordable — most instances are small plants
 * that must not cost draws at two kilometres.
 */
export function maxDrawDistance(heightM: number): number {
  // Small plants leave at 60–80 m; a 20 m tree persists to 700 m; nothing
  // is drawn past 900 m (the chunk ring is ~1.2 km, but a card at that
  // distance is a few pixels).
  return Math.min(900, Math.max(60, heightM * 35));
}

/**
 * A TREE never vanishes inside the loaded chunk ring (owner, 16f round 4:
 * "when not occluded and within visibility distance they should draw, in low
 * quality, at a high distance — looking out from the mountains"). Its draw
 * distance is the ring's own reach — the far corner of the outermost loaded
 * chunk — so the only limit is the chunk ring itself, and the fade-out band
 * sits beyond anything that is loaded. Beyond ring 2 a tree is its baked
 * card (two quads), so the price of the last kilometre is card instances,
 * never mesh: at the jungle site (1.11 km E / 5.21 km S) 13.3 k trees stood
 * inside the old 900 m cap and 17.8 k inside 1.1 km, 26.6 k in the whole
 * 5×5 ring. Terrain occlusion still culls what a ridge hides.
 */
export function treeDrawDistance(chunkRing: number, chunkMetres: number): number {
  return (chunkRing + 1) * chunkMetres * Math.SQRT2;
}

/**
 * The ring ladder a species runs at a quality scale, submerged or not — the
 * one place `Vegetation.tsx` gets its rings. Ring 0 (full mesh) is never
 * scaled down, or plants beside the camera would regress to cards (the
 * round-2 defect); the outer rings scale, and are then held in order so a
 * scaled ring never falls inside the one before it (the round-4 inverted
 * ladder). A FOLDED species has one reach, not three: it IS scaled by
 * `drawScale` (there is no near rung to protect — the card takes over), but
 * never below `MIN_MESH_LOD_REACH_M`. Rung edges are hard steps in distance (`LOD_BAND_M` is 0; since walk 5 they cross-fade in time, `LOD_FADE_S`), so
 * there is no minimum band width left to enforce: a narrow rung is simply a
 * short interval, not a fade that never completes. `band` picks the mid
 * reach row (`LOD_REACH_BY_BAND`); callers pass the quality preset's name.
 */
export function lodRings(
  heightM: number,
  drawScale: number,
  submerged: boolean,
  folded = false,
  band: QualitySettings["name"] = "low",
): number[] {
  const rings = lodDistances(heightM, folded, band)
    .map((r, i) =>
      folded
        ? Math.max(MIN_MESH_LOD_REACH_M, r * drawScale)
        : i === 0
          ? r
          : r * drawScale,
    )
    .map((r) => (submerged ? r * SUBMERGED_LOD_SCALE : r));
  for (let i = 1; i < rings.length; i++) {
    rings[i] = Math.max(rings[i], rings[i - 1]);
  }
  return rings;
}

/**
 * SCREEN-SPACE HAND-OVER (walk 5, 2026-09-29). Where a species carries more
 * than one mesh level (round 13's part-aware mid and far levels for the heavy
 * trees), each hand-over happens where the plant's projected height falls to
 * a pixel threshold at the reference view, 1080 px tall with a 60° vertical
 * field of view: `d = heightM × 540 / (tan 30° × px)`, about 935 × height /
 * px. In medium the 66 m emergent giant leaves its full mesh at 195 m and
 * becomes the card at 390 m (the folded ladder carded it at 160 m), the 42 m
 * canopy tree at 248 m (was 160 m), a 22 m willow at 128 m. A species with
 * ONE mesh level keeps the folded reach above (the card is the only step down,
 * and the budget measured for it stands).
 */
export const SCREEN_REF_HEIGHT_PX = 1080;
export const SCREEN_REF_FOV_DEG = 60;

/** Projected height in pixels of `heightM` at `distanceM`, reference view. */
export function projectedHeightPx(heightM: number, distanceM: number): number {
  return (heightM * SCREEN_REF_HEIGHT_PX / 2)
    / (Math.tan((SCREEN_REF_FOV_DEG * Math.PI) / 360) * Math.max(distanceM, 1e-6));
}

/** Distance at which `heightM` projects to `px` pixels, reference view. */
export function distanceAtPx(heightM: number, px: number): number {
  return (heightM * SCREEN_REF_HEIGHT_PX / 2)
    / (Math.tan((SCREEN_REF_FOV_DEG * Math.PI) / 360) * px);
}

/**
 * Pixel height at which a multi-level species leaves each level, by quality
 * band: [full -> mid, mid -> far, far -> card]. Round 13 validated its tiers
 * (silhouette IoU >= 0.90 over 8 views) at mid from 2.5 x height (<= 374 px)
 * and far from 5 x height (<= 187 px); no threshold here hands over nearer
 * than that. The card thresholds are what the triangle budget allows
 * (decision 0084, vegetation <= ~1.5 M a frame with its shadow), measured
 * with the gate harness (`__measure__/vegGate.measure.test.ts`) at the
 * jungle site: report tooling/.reports/16k/walk5/perf/veg.md.
 */
export const HANDOVER_PX: Record<QualitySettings["name"], readonly [number, number, number]> = {
  low: [370, 320, 300],
  medium: [320, 200, 160],
  high: [280, 170, 130],
};

/**
 * The radius inside which a plant that is not a tree (a bush, a fern, a
 * fungus, deadfall, scatter) is always its full mesh, by quality band, NOT
 * scaled by the draw scale: the folded reach (40 m x 0.8 = 32 m in medium, 18
 * m floor on low) put bushes through their tier step a few strides away (owner
 * walk 5). Sized from the triangle budget with the gate harness: the full-mesh
 * non-tree triangles in view at the jungle site (report
 * tooling/.reports/16k/walk5/perf/veg.md).
 */
export const SMALL_PLANT_TOP_TIER_M: Record<QualitySettings["name"], number> = {
  low: 35,
  medium: 50,
  high: 65,
};

/**
 * The rings a species runs, from what its kit actually carries: `meshLevels`
 * mesh levels (the card excluded). One level: the folded reach
 * (`lodRings`), with a non-tree plant's full mesh held to at least
 * `SMALL_PLANT_TOP_TIER_M`. Two or more: the screen-space hand-over, clamped
 * so ring 0 is never under `MIN_MESH_LOD_REACH_M` and never nearer than the
 * folded reach it replaces for a non-tree plant. Submerged species scale as in
 * `lodRings`.
 */
export function speciesRings(
  species: {
    heightM: number;
    meshLevels: number;
    category: string | null;
    submerged: boolean;
    folded: boolean;
    /** `KitSpecies.impostorPx`: the card rung is an impostor. */
    impostorPx?: number;
  },
  drawScale: number,
  band: QualitySettings["name"] = "low",
): number[] {
  const small = species.category !== "tree" && !species.submerged;
  // An impostor rung starts no nearer than where the tree's projected height
  // falls to its texel height (screen-size hand-over; walk-5 impostor lane).
  const impostorFrom = species.impostorPx
    ? distanceAtPx(species.heightM, species.impostorPx) * (species.submerged ? SUBMERGED_LOD_SCALE : 1)
    : 0;
  if (species.meshLevels <= 1) {
    const rings = lodRings(species.heightM, drawScale, species.submerged, species.folded, band)
      .map((r) => Math.max(r, impostorFrom));
    if (!small) return rings;
    const floor = SMALL_PLANT_TOP_TIER_M[band];
    return rings.map((r) => Math.max(r, floor));
  }
  const px = HANDOVER_PX[band];
  const scale = species.submerged ? SUBMERGED_LOD_SCALE : 1;
  const floor0 = small ? SMALL_PLANT_TOP_TIER_M[band] : MIN_MESH_LOD_REACH_M;
  const h = species.heightM;
  // Never nearer than round 13 validated its tiers: mid at clamp(2.5 h,
  // 18, 60) m, far at clamp(5 h, 50, 140) m (a 3 m juniper's 30 px card
  // distance is 30 m, but its far tier was only checked from 50 m).
  const validated = [
    Math.min(60, Math.max(MIN_MESH_LOD_REACH_M, h * 2.5)),
    Math.min(140, Math.max(50, h * 5)),
    0,
  ];
  const rings = px.map((p, i) => Math.max(distanceAtPx(h, p), validated[i]) * scale);
  rings[0] = Math.max(rings[0], floor0 * scale);
  // The card never comes nearer than the folded ladder put it: a species that
  // gained tiers only ever gains mesh distance.
  rings[2] = Math.max(rings[2], lodRings(h, drawScale, species.submerged, true, band)[0],
    impostorFrom);
  // Two mesh levels: the second runs to the card, so rings 1 and 2 are one.
  if (species.meshLevels === 2) rings[1] = rings[2];
  for (let i = 1; i < rings.length; i++) rings[i] = Math.max(rings[i], rings[i - 1]);
  // Every shipped mesh level gets a rung in every band: each level ends no
  // nearer than where it starts times the band's own pixel step between the
  // two hand-overs (the screen-size span the band gives it unclamped). Without
  // it the low band's 18 m floor on ring 0 met the card at 18 m and a
  // two-level tree went base -> card, never drawing its far level (round 13d).
  const ends = species.meshLevels === 2 ? [0, 2] : [0, 1, 2];
  for (let k = 1; k < ends.length; k++) {
    const [a, b] = [ends[k - 1], ends[k]];
    rings[b] = Math.max(rings[b], rings[a] * (px[a] / px[b]));
  }
  if (species.meshLevels === 2) rings[1] = rings[2];
  return rings;
}

/**
 * Swap a species' CARD level for its octahedral impostor (walk-5 impostor
 * lane; decision 0108 §5). The impostor takes the card's rung, not a new one:
 * it is two triangles against the card's four and reads the tree from every
 * direction, so a card after it would only be a worse picture of the same
 * thing. A species with no card, or whose impostor GLB lacks a texture,
 * keeps what it had. `parts` come from game-core `impostorPart`.
 */
export function installImpostors(
  kit: FloraKit,
  impostors: ReadonlyMap<string, { part: KitLevel["parts"][number]; contentPx: number }>,
): FloraKit {
  const out: FloraKit = new Map(kit);
  for (const [id, { part, contentPx }] of impostors) {
    const species = kit.get(id);
    if (!species || species.billboardIndex === null) continue;
    const levels = species.levels.map((level, i) =>
      i === species.billboardIndex ? { parts: [part], triangles: 2 } : level);
    out.set(id, { ...species, levels, impostorPx: contentPx });
  }
  return out;
}

/**
 * Withhold the card of every species whose impostor is still downloading
 * (walk-5 impostor ship): the impostors load after the startup window, never
 * in the startup payload, and until they arrive the species' last MESH level
 * runs to the draw distance (no card rung, `lodLadder` with a null card), so
 * coverage has no gap and the tree never shows a card it is about to swap.
 */
export function withholdCards(kit: FloraKit, ids: Iterable<string>): FloraKit {
  const out: FloraKit = new Map(kit);
  for (const id of ids) {
    const species = kit.get(id);
    if (!species || species.billboardIndex === null
      || species.billboardIndex !== species.levels.length - 1) continue;
    out.set(id, {
      ...species,
      levels: species.levels.slice(0, species.billboardIndex),
      billboardIndex: null,
    });
  }
  return out;
}

/**
 * Merges two built kits into one index. The renderer draws species from both
 * the land kit (`flora-province-v1`) and the 16f underwater band kit
 * (`underwater-v1`), and a handful of ids ship in BOTH (tbp_seaweed06,
 * waterkelptall02/03). FIRST WINS: the land kit is passed first because the
 * palettes were authored against its copy of those shared assets.
 */
export function mergeFloraKits(first: FloraKit, second: FloraKit): FloraKit {
  const merged: FloraKit = new Map(first);
  for (const [id, species] of second) {
    if (!merged.has(id)) merged.set(id, species);
  }
  return merged;
}

/** The lowest, a middle and the highest Bayer threshold. */
const COVERAGE_BAYERS = [BAYER4_THRESHOLDS[0], BAYER4_THRESHOLDS[7], BAYER4_THRESHOLDS[15]];

/**
 * The band-coverage invariant (walk 5, 2026-09-29) for one emitted ladder, as
 * failure lines (empty = holds): the rungs run contiguously from 0 to
 * `maxDraw`, and at every metre and around every rung edge each screen pixel
 * is kept by EXACTLY one rung (inside the vanish window, at most one). A gap
 * is a plant invisible at some distance that reappears nearer — the walk-5
 * "pop in, then pop out". Shared by `ladderCoverage.test.ts` (every species
 * shape) and the real-kit ladder tests (`floraKitFarOnly.test.ts`).
 */
export function ladderCoverageFailures(
  ladder: readonly LodRung[],
  vanishes: boolean,
  maxDraw: number,
  label: string,
): string[] {
  const failures: string[] = [];
  if (ladder.length === 0 || ladder[0].lo !== 0) failures.push(`${label} does not start at 0`);
  for (let i = 1; i < ladder.length; i++) {
    if (ladder[i].lo !== ladder[i - 1].hi) failures.push(`${label} gap/overlap at rung ${i}`);
  }
  if (ladder.length && Math.abs(ladder[ladder.length - 1].hi - maxDraw) > 1e-6) {
    failures.push(`${label} ends at ${ladder[ladder.length - 1].hi}, not ${maxDraw}`);
  }
  const rungs = cellRungs(ladder, vanishes);
  const solidTo = vanishes ? maxDraw - LOD_CULL_BAND_M : maxDraw * 1.2;
  const ds: number[] = [];
  for (let d = 0; d <= maxDraw + LOD_CULL_BAND_M + 1; d += 1) ds.push(d);
  for (const r of ladder) for (const e of [-0.5, -1e-3, 0, 1e-3, 0.5]) ds.push(Math.max(0, r.hi + e));
  for (const d of ds) {
    for (const bayer of COVERAGE_BAYERS) {
      let kept = 0;
      for (const r of rungs) if (lodPixelKept(lodFadeFactors(r.band, d), bayer)) kept++;
      if (d < solidTo ? kept !== 1 : kept > 1) failures.push(`${label} d${d} kept ${kept}`);
    }
  }
  return failures;
}
