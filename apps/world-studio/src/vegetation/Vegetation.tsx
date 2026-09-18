/**
 * Vegetation renderer: the compiler's chunk bundles drawn as instanced meshes,
 * LOD chosen per instance by distance (module 65 §110 tiers T1/T2).
 *
 * Everything here is deliberately plain `InstancedMesh` rather than a library:
 * it is what any instancing wrapper is built on, it adds no dependency to
 * pin, and it is the honest baseline the budget probe should measure before
 * anything fancier is justified. The upgrade path (`@three.ez/instanced-mesh`
 * for BVH culling, octahedral impostors for T4) is module 65's, and should be
 * taken on evidence from that measurement rather than in advance.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { configureKitLoader, createKitLoader } from "@elder-souls/game-core/assets/kitLoader";
import { useKitDecoders } from "@elder-souls/game-core/assets/useKitDecoders";
import {
  buildFloraKit,
  mergeFloraKits,
  lodRings,
  maxDrawDistance,
  treeDrawDistance,
  SUBMERGED_MAX_DRAW_M,
  type FloraKit,
  type KitManifest,
} from "./floraKit";
import type { QualitySettings } from "@elder-souls/game-core/core/quality";
import {
  applyWindSwayWithShadow,
  updateWindSway,
  windStiffness,
  WIND_TUNE_ATTRIBUTE,
} from "@elder-souls/game-core/fx/windSway";
import { sharedWindUniforms } from "./windUniforms";
import {
  applyLodFadeWithShadow,
  createLodFadeUniforms,
  lodCopies,
  lodLadder,
  LOD_BAND_ATTRIBUTE,
  LOD_REBUILD_MOVE_M,
} from "@elder-souls/game-core/fx/lodFade";
import {
  OcclusionCellCache,
  OCCLUSION_MIN_DISTANCE_M,
} from "@elder-souls/game-core/render/terrainOcclusion";
import {
  collidersFor,
  isSolid,
  type FloraCollider,
  type SolidInstance,
} from "@elder-souls/game-core/physics/floraSolids";
import { lastWeatherSample } from "../weather/weatherState";
import { sharedChunkStore, type ChunksManifest } from "../character/chunkStore";
import { groundHeightM } from "./terrainHeight";
import {
  ANCHOR_PIVOT_TERRAIN,
  decodeVegetationBundle,
  readInstance,
  type VegetationBundle,
  type VegetationIndex,
} from "./vegetationBundle";

/** Chunks drawn around the focus. Beyond this a chunk is simply not built. */
const CHUNK_RING = 2;
/**
 * How close (metres, horizontal) a sea-bed instance must come to the focus
 * before the underwater kit is fetched: 3.3x the 120 m it draws at. A runner
 * (~7 m/s) needs ~40 s to close the 280 m gap; a 27 MB kit on a 20 Mbit/s
 * link takes ~11 s. Underwater spawns are inside it and fetch at once.
 */
const UNDERWATER_KIT_LEAD_M = 400;

/** Hard cap per (species, level) draw so a pathological chunk cannot stall. */
const MAX_PER_DRAW = 6000;

interface ChunkVegetation {
  key: string;
  originX: number;
  originZ: number;
  bundle: VegetationBundle;
}

interface DrawGroup {
  mesh: THREE.InstancedMesh;
  species: string;
  level: number;
}

export interface VegetationStats {
  chunks: number;
  instances: number;
  draws: number;
  triangles: number;
  /** Instances skipped by the per-species draw-distance cull. */
  culled: number;
  /** Instances drawn as their `_lod_flat` far billboard (T4). */
  billboardInstances: number;
  /** Instances dropped because a ridge stands between them and the camera
   * (`OcclusionCellCache`, one ray per 32 m cell). */
  occluded: number;
  /** Per-species drawn instances and world-Y range at this rebuild. Added
   * 2026-09-17 for the "underwater band invisible" probe: the aggregate
   * counts cannot tell a missing species from a distant one. */
  bySpecies: Record<string, { drawn: number; minY: number; maxY: number }>;
  /** Wall time of the last rebuild, ms: `bucket` is pass one (cull, ground,
   * LOD, bucket), `fill` is pass two (matrices, attributes, pool), `total`
   * the whole effect. Published so the walking stutter is measured, not
   * guessed (16f round 3). */
  rebuildMs: { total: number; bucket: number; fill: number };
}

function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}

/**
 * The `esWindTune` instanced attribute for one kit geometry, allocated once
 * and grown as needed. Cached on the geometry itself so a rebuild reuses the
 * same GPU buffer (see the call site for why a fresh attribute each time is
 * not free).
 */
function instancedAttribute(
  geometry: THREE.BufferGeometry,
  name: string,
  itemSize: number,
  instances: number,
): THREE.InstancedBufferAttribute {
  const existing = geometry.getAttribute(name) as
    | THREE.InstancedBufferAttribute
    | undefined;
  if (existing && existing.count >= instances) return existing;
  const grown = new THREE.InstancedBufferAttribute(
    new Float32Array(Math.max(instances, 64) * itemSize), itemSize);
  geometry.setAttribute(name, grown);
  return grown;
}

/** Flag an instanced buffer for upload, but only its FILLED prefix: pooled
 * buffers are over-allocated by 1.5x, and a bare `needsUpdate` would re-send
 * the slack on every rebuild. */
function uploadRange(attribute: THREE.BufferAttribute, floats: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, floats);
  attribute.needsUpdate = true;
}

/**
 * Metres. A vegetation mesh casts into the shadow cascades only while its
 * bounding sphere's centre is within this of the focus. The character CSM
 * reaches 300 m over 2 cascades; trees further out contribute nothing a
 * player can see and cost a full alpha-tested depth pass each.
 */
const SHADOW_CAST_RANGE_M = 60;   // 120 m cast every near canopy into both cascades (2026-09-16)

/**
 * Block slot for a (species, level) small enough to stay unsplit. Distinct
 * from the four quarters because the wind-tune attribute is per block: two
 * buckets sharing a slot would share one attribute and re-tune each other.
 */
const UNSPLIT_BLOCK = 4;

/** Per-block geometry views, cached on the source kit geometry. */
const BLOCK_GEOMETRIES = Symbol("esBlockGeometries");

/**
 * A view of a kit geometry for one neighbourhood block: the same index and
 * the same vertex attributes (by reference — no buffer is copied or
 * uploaded twice), with room for its own `esWindTune` instanced attribute.
 * Cached on the source so a rebuild reuses it; block 0 is the source itself.
 */
function blockGeometry(source: THREE.BufferGeometry, block: number): THREE.BufferGeometry {
  if (block === 0) return source;
  const host = source as unknown as
    { [BLOCK_GEOMETRIES]?: Map<number, THREE.BufferGeometry> };
  let cache = host[BLOCK_GEOMETRIES];
  if (!cache) {
    cache = new Map();
    host[BLOCK_GEOMETRIES] = cache;
  }
  const cached = cache.get(block);
  if (cached) return cached;
  const view = new THREE.BufferGeometry();
  view.setIndex(source.getIndex());
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name === WIND_TUNE_ATTRIBUTE || name === LOD_BAND_ATTRIBUTE) continue;
    view.setAttribute(name, attribute);
  }
  for (const group of source.groups) view.addGroup(group.start, group.count, group.materialIndex);
  source.computeBoundingSphere();
  source.computeBoundingBox();
  view.boundingSphere = source.boundingSphere ? source.boundingSphere.clone() : null;
  view.boundingBox = source.boundingBox ? source.boundingBox.clone() : null;
  cache.set(block, view);
  return view;
}

export function Vegetation({
  focusRef,
  baseUrl,
  verticalScale = 1,
  onStats,
  quality,
  onSolids,
  shapesRef,
}: {
  /** Same shape the chunk terrain uses: ground position, not a camera. */
  focusRef: React.MutableRefObject<{ x: number; z: number }>;
  baseUrl: string;
  verticalScale?: number;
  onStats?: (stats: VegetationStats) => void;
  quality?: QualitySettings;
  /** Solid instances (trunks, boulders, root arches) placed this rebuild, in
   * final world positions. Character mode turns these into Rapier colliders;
   * fly mode passes nothing and pays nothing. Injected rather than published
   * to a global so the two apps stay uncoupled. */
  onSolids?: (solids: SolidInstance[]) => void;
  /** Filled once the kit is loaded with the collider shape set per species —
   * ROCKS AS THEIR OWN TRIANGLES, which only this component can build because
   * only it holds the kit geometry. The collider ring reads it rather than
   * re-fetching the manifest and boxing everything. */
  shapesRef?: React.MutableRefObject<Map<string, FloraCollider[]> | null>;
}) {
  const chunkRing = quality?.vegChunkRing ?? CHUNK_RING;
  const drawScale = quality?.vegDrawScale ?? 1;
  const root = useRef<THREE.Group>(null);
  // Streamed terrain, for re-grounding baked instance heights: the compiler
  // bakes Y from its own raster, which can sit a metre off the rendered mesh
  // on banks/slopes — enough to float a root arch (owner round 3).
  const store = sharedChunkStore(baseUrl);
  const [chunksManifest, setChunksManifest] = useState<ChunksManifest | null>(null);
  const [index, setIndex] = useState<VegetationIndex | null>(null);
  /** Both kit manifests: the land kit and the 16f underwater band kit. */
  const [manifest, setManifest] = useState<KitManifest | null>(null);
  const [underwaterManifest, setUnderwaterManifest] = useState<KitManifest | null>(null);
  const loaded = useRef(new Map<string, ChunkVegetation>());
  const pending = useRef(new Set<string>());
  const groups = useRef<DrawGroup[]>([]);
  /**
   * Persistent instanced meshes keyed `species|level|block|part`, alive for
   * the component's life (the ground-cover ring's mechanism 7). A rebuild
   * used to dispose and recreate every mesh, re-uploading every buffer 16 m
   * apart — the walking stutter. Now a rebuild writes into the pooled mesh,
   * grows it by 1.5x only when it is too small, and parks an unfilled one at
   * `count = 0`. Disposed on unmount only.
   */
  const pool = useRef(new Map<string, THREE.InstancedMesh>());
  useEffect(() => {
    const live = pool.current;
    const group = root.current;
    return () => {
      for (const mesh of live.values()) {
        group?.remove(mesh);
        mesh.dispose();
      }
      live.clear();
    };
  }, []);
  /** Last state the chunk-ring scan ran against (see the scan guard). */
  const lastScan = useRef<
    { cx: number; cz: number; loaded: number; pending: number } | null>(null);

  // Two kits, one renderer: the palettes place land species (trees, shrubs,
  // rocks) and the 16f underwater band (kelp, corals, shell beds, wrecks),
  // which ship in separate GLBs. The land kit loads up front (Suspense); the
  // 27 MB underwater kit loads ON DEMAND, the first time a rebuild meets an
  // instance whose species only that kit holds within UNDERWATER_KIT_LEAD_M
  // of the focus (16f round 4). The sea bed draws to SUBMERGED_MAX_DRAW_M
  // (120 m), so the request goes out well before a walker can see the bed;
  // an underwater spawn requests it on the first rebuild, the same moment it
  // used to start loading. The chunk ring is NOT the trigger: rivers and
  // lakes carry bed dressing too, so 210 of the province's 256 chunks hold a
  // sea-bed species and no 5x5 ring is without one.
  // Kits ship KTX2/meshopt-compressed (pipeline/kit_compress.py); the
  // decoders are the renderer's, shared by every kit load.
  const decoders = useKitDecoders(baseUrl);
  const gltf = useLoader(GLTFLoader, `${baseUrl}kits/flora-province-v1.glb`,
    (loader) => configureKitLoader(loader, decoders));
  const [underwaterGltf, setUnderwaterGltf] = useState<GLTF | null>(null);
  const [underwaterWanted, setUnderwaterWanted] = useState(false);
  useEffect(() => {
    if (!underwaterWanted) return;
    let cancelled = false;
    createKitLoader(decoders).loadAsync(`${baseUrl}kits/underwater-v1.glb`)
      .then((g) => { if (!cancelled) setUnderwaterGltf(g); })
      .catch((error: unknown) => {
        console.error("[vegetation] underwater kit failed to load", error);
      });
    return () => { cancelled = true; };
  }, [baseUrl, underwaterWanted, decoders]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${baseUrl}province/vegetation/vegetation-index.json`).then((r) => r.json()),
      fetch(`${baseUrl}kits/flora-province-v1.kit.json`).then((r) => r.json()),
      fetch(`${baseUrl}kits/underwater-v1.kit.json`).then((r) => r.json()),
    ])
      .then(([i, m, u]) => {
        if (!cancelled) {
          setIndex(i as VegetationIndex);
          setManifest(m as KitManifest);
          setUnderwaterManifest(u as KitManifest);
        }
      })
      // Never silent: a bundle index or kit manifest that fails to load is
      // the whole scatter layer missing, and a swallowed rejection was how
      // "every tree and rock vanished" reached the owner with no console line.
      .catch((error: unknown) => {
        console.error("[vegetation] index or kit manifest failed to load", error);
      });
    store.manifest()
      .then((m) => { if (!cancelled) setChunksManifest(m); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  const kit: FloraKit | null = useMemo(() => {
    if (!manifest || !underwaterManifest) return null;
    // First wins on a duplicate id: a few assets (tbp_seaweed06,
    // waterkelptall02/03) ship in both kits, and the palettes were authored
    // against the land kit's copy.
    const land = buildFloraKit(gltf, manifest);
    const merged = underwaterGltf
      ? mergeFloraKits(land, buildFloraKit(underwaterGltf, underwaterManifest, true))
      : land;
    if (import.meta.env.DEV) {
      console.info(`[vegetation] kit: ${merged.size} assets (flora${underwaterGltf ? " + underwater" : ""})`);
    }
    return merged;
  }, [gltf, underwaterGltf, manifest, underwaterManifest]);

  // Collider shapes, built ONCE per kit load. A `convex` species (every rock,
  // boulder pile and cliff shell) collides as its own LOD0 triangles: a box
  // around a 30 m cliff walls off the ledge it exists to offer, and a box
  // around a boulder pile stops the player a metre short of the stone. The
  // geometry comes from the kit the renderer already holds, so nothing is
  // fetched or decoded twice.
  useEffect(() => {
    if (!shapesRef || !kit || !manifest || !underwaterManifest) return;
    const assets = new Map(
      [...underwaterManifest.assets, ...manifest.assets].map((a) => [a.id, a]),
    );
    const geometryFor = (assetId: string) => {
      const parts = kit.get(assetId)?.levels[0]?.parts;
      if (!parts?.length) return null;
      // One merged array pair across the level's parts, index offsets applied.
      let vertexCount = 0;
      let indexCount = 0;
      for (const part of parts) {
        const position = part.geometry.getAttribute("position");
        const index = part.geometry.getIndex();
        vertexCount += position.count;
        indexCount += index ? index.count : position.count;
      }
      const positions = new Float32Array(vertexCount * 3);
      const index = new Uint32Array(indexCount);
      let vertexAt = 0;
      let indexAt = 0;
      for (const part of parts) {
        const position = part.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          positions[(vertexAt + i) * 3] = position.getX(i);
          positions[(vertexAt + i) * 3 + 1] = position.getY(i);
          positions[(vertexAt + i) * 3 + 2] = position.getZ(i);
        }
        const partIndex = part.geometry.getIndex();
        const count = partIndex ? partIndex.count : position.count;
        for (let i = 0; i < count; i++) {
          index[indexAt + i] = (partIndex ? partIndex.getX(i) : i) + vertexAt;
        }
        vertexAt += position.count;
        indexAt += count;
      }
      return { positions, index };
    };
    const shapes = new Map<string, FloraCollider[]>();
    for (const id of kit.keys()) {
      shapes.set(id, collidersFor(assets.get(id), geometryFor));
    }
    shapesRef.current = shapes;
  }, [kit, manifest, underwaterManifest, shapesRef]);

  // Rebuild the instanced meshes whenever the set of loaded chunks changes —
  // or the CAMERA has moved far enough that per-instance LOD choices are
  // stale. The camera, not the focus: the shader steps levels on the camera
  // distance, so the copies must be chosen from the same point (round 5 —
  // the character-position choice left the camera, orbiting 5.8 m around
  // the character, outside the copies' reach and drew half-trees).
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Dev-only: force a rebuild at the current focus, so a headless probe
    // (whose software GL runs at well under 1 fps, too slow to walk the
    // 16 m that triggers one) can time the pooled steady state.
    const host = window as unknown as { __STUDIO_VEGETATION_REBUILD__?: () => void };
    host.__STUDIO_VEGETATION_REBUILD__ = () => setRevision((r) => r + 1);
    return () => { delete host.__STUDIO_VEGETATION_REBUILD__; };
  }, []);
  const lastBuildEye = useRef<{ x: number; z: number } | null>(null);
  /** Eye of the rebuild already SCHEDULED (not yet committed). Comparing
   * against the committed eye re-fired `setRevision` every frame until
   * React ran the effect; comparing against the pending one fires once per
   * crossing. */
  const pendingBuildEye = useRef<{ x: number; z: number } | null>(null);
  // The trigger is the rebuild distance `LOD_MARGIN_M` is sized from: past
  // it an instance may be drawn at the wrong level until the rebuild lands
  // (never half-drawn — see lodFade.ts). The 0.75 s throttle is what keeps
  // a fast fly-through from re-walking the instances every frame.
  const REBUILD_MOVE_M = LOD_REBUILD_MOVE_M;
  const REBUILD_MIN_INTERVAL_S = 0.75;
  const lastBuildTime = useRef(0);
  /** The REAL camera, for the LOD fade uniform and the occlusion eye. The
   * focus is a ground position and in fly mode is nowhere near the camera. */
  const cameraPos = useRef(new THREE.Vector3(NaN, NaN, NaN));

  // Wind sway (module 55 §98): one uniform block shared by every plant
  // material AND its shadow-depth twin, fed from the same weather sample the
  // sky, rain and waves read — so the world gusts together.
  const wind = sharedWindUniforms;
  // LOD crossfade: one uniform block for every vegetation material and its
  // depth twin. Local to this renderer (the groundcover ring has no LOD chain
  // to fade between), so no new shared singleton.
  const lodFade = useMemo(() => createLodFadeUniforms(), []);

  useFrame((state) => {
    const weather = lastWeatherSample();
    if (weather) updateWindSway(wind, state.clock.elapsedTime, weather);
    // Every frame, and from the camera rather than the built-in
    // `cameraPosition`: in the shadow pass that uniform is the light.
    lodFade.esLodViewPos.value.copy(state.camera.position);
    cameraPos.current.copy(state.camera.position);
    if (!index || !root.current) return;
    const focus = focusRef.current;
    const size = index.chunkMetres;
    const eye = cameraPos.current;
    const last = pendingBuildEye.current ?? lastBuildEye.current;
    // A fast camera (fly mode) crosses 16 m several times a second; every
    // crossing re-walks ~80,000 instances on the main thread, which is the
    // "hang" while flying. Rebuild at most once per REBUILD_MIN_INTERVAL_S;
    // the LOD is a fraction of a second stale at speed, nothing else.
    const now = state.clock.elapsedTime;
    if (last && Math.hypot(eye.x - last.x, eye.z - last.z) > REBUILD_MOVE_M
        && now - lastBuildTime.current >= REBUILD_MIN_INTERVAL_S) {
      lastBuildTime.current = now;
      pendingBuildEye.current = { x: eye.x, z: eye.z };
      setRevision((r) => r + 1);
    }
    const cx = Math.floor(focus.x / size);
    const cz = Math.floor(focus.z / size);
    // The ring scan builds a key string per chunk, so run it only when the
    // set it could change has changed: the focus chunk, or an arrival. It
    // used to allocate 25 strings every frame for a no-op.
    const scan = lastScan.current;
    if (scan && scan.cx === cx && scan.cz === cz
        && scan.loaded === loaded.current.size && scan.pending === pending.current.size) {
      return;
    }
    lastScan.current = {
      cx, cz, loaded: loaded.current.size, pending: pending.current.size,
    };

    for (let dz = -chunkRing; dz <= chunkRing; dz++) {
      for (let dx = -chunkRing; dx <= chunkRing; dx++) {
        const key = chunkKey(cx + dx, cz + dz);
        if (!index.chunks[key] || loaded.current.has(key) || pending.current.has(key)) {
          continue;
        }
        pending.current.add(key);
        fetch(`${baseUrl}province/vegetation/chunk_${key}_vegetation.bin`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
          .then((buffer) => {
            loaded.current.set(key, {
              key,
              originX: (cx + dx) * size,
              originZ: (cz + dz) * size,
              bundle: decodeVegetationBundle(buffer),
            });
            pendingBuildEye.current = null;
            setRevision((r) => r + 1);
          })
          .catch(() => undefined)
          .finally(() => pending.current.delete(key));
      }
    }
  });

  useEffect(() => {
    const group = root.current;
    if (!group || !kit || !index) return;

    const rebuildStart = performance.now();
    // Nothing is destroyed here (mechanism 7): every pooled mesh this
    // rebuild does not fill is parked at `count = 0` at the end.
    groups.current = [];

    // One instanced mesh per (species, LOD level, geometry part) across ALL
    // loaded chunks, not per chunk: per-chunk meshes cost a draw call each and
    // measured 449 draws for 13 chunks, which is the wrong end of the budget
    // to be spending on bookkeeping.
    const focus = focusRef.current;
    // Every distance below is from the CAMERA (`eye`), the point the shader
    // steps on; the focus only names the chunk neighbourhood's blocks.
    // Before the first frame has sampled the camera, the focus stands in
    // (character mode's camera orbits within 6 m of it, inside the margin).
    const eye = Number.isFinite(cameraPos.current.x)
      ? cameraPos.current
      : new THREE.Vector3(focus.x, 0, focus.z);
    lastBuildEye.current = { x: eye.x, z: eye.z };
    pendingBuildEye.current = null;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    // Pass one: bucket every instance by the draw it belongs to.
    //
    // A bucket stores the COMPOSE INPUTS, not matrices: a `Matrix4` per
    // instance was ~81k throwaway objects per rebuild at chunk ring 2. Pass
    // two composes each one into a single scratch matrix and copies it into
    // the instance buffer with `setMatrixAt`.
    const PLACEMENT_STRIDE = 7; // x, y, z, tiltX, yaw, tiltZ, scale
    interface Bucket {
      species: string;
      level: number;
      /** Neighbourhood block (0-8) — see `blockIndexOf`. */
      block: number;
      /** Flat placement tuples, `PLACEMENT_STRIDE` numbers per instance. */
      placements: number[];
      count: number;
      /** Flat (stiffness − 1, sink) pairs, parallel to `placements`. */
      windTune: number[];
      /** Flat (dIn, dOut, wIn, wOut) quads, parallel to `placements`. */
      bands: number[];
      /** Extents of the instance PIVOTS, for the bounding sphere: tracked
       * here so the sphere never has to read the instance matrices back. */
      minX: number; minY: number; minZ: number;
      maxX: number; maxY: number; maxZ: number;
      maxScale: number;
    }
    const emptyExtents = () => ({
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity, maxScale: 0,
    });
    const extend = (b: Bucket, x: number, y: number, z: number, sc: number) => {
      if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
      if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
      if (sc > b.maxScale) b.maxScale = sc;
    };
    // Farthest a kit vertex can lie from its pivot at scale 1: the height
    // (pivot at the base) and half the wider horizontal side, from the
    // manifest's `sizeM` (x, y horizontal; z up).
    const reachM = new Map<string, number>();
    for (const a of [...(manifest?.assets ?? []), ...(underwaterManifest?.assets ?? [])]) {
      if (!reachM.has(a.id)) {
        reachM.set(a.id, Math.hypot(a.sizeM[2], Math.max(a.sizeM[0], a.sizeM[1]) / 2));
      }
    }
    const buckets = new Map<string, Bucket>();
    // Solid instances collected as they are placed — the collider ring needs
    // the same final world position the mesh got, sink and re-grounding
    // included, or the invisible wall stands somewhere the tree does not.
    const solidByAsset = new Map(
      // Land kit first: the underwater band's plants and debris are
      // bed-anchored and carry no collision, so a shared id keeps its land
      // (solid) reading.
      [...(underwaterManifest?.assets ?? []), ...(manifest?.assets ?? [])]
        .map((a) => [a.id, isSolid(a)]),
    );
    const solids: SolidInstance[] = [];
    // A chunk instance can sit anywhere in its 468 m square, so chunk-level
    // culls must allow for the worst case: focus at one corner, instance at
    // the opposite one.
    const halfDiagonal = index.chunkMetres * Math.SQRT1_2;
    // One InstancedMesh per species spanning the whole 5x5 neighbourhood
    // (~2.3 km) can never be frustum-rejected, so `frustumCulled` bought
    // nothing. The neighbourhood is instead QUARTERED at the focus chunk's
    // centre lines — chunks before the focus on an axis go to 0, the focus
    // chunk and those after it to 1 — and a mesh is built per (species,
    // level, quarter): a quarter behind the camera is genuinely rejected,
    // for 4x the bucket count rather than the 9x a finer grid cost (measured
    // ~554 potential draws at 9 blocks, too many for the browser).
    const focusChunkX = Math.floor(focus.x / index.chunkMetres);
    const focusChunkZ = Math.floor(focus.z / index.chunkMetres);
    const blockAxis = (delta: number): number => (delta < 0 ? 0 : 1);
    let culled = 0;
    let billboardInstances = 0;
    let occluded = 0;
    // One occlusion ray per 32 m cell, from the camera, against the streamed
    // ground. The canopy top is the tallest species in the kit, so a cell is
    // only called hidden when even that would be hidden.
    let tallestM = 0;
    for (const species of kit.values()) {
      if (species.heightM > tallestM) tallestM = species.heightM;
    }
    const sampleGround = chunksManifest
      ? (x: number, z: number) => {
          // Rendered space, like the camera: the terrain mesh is drawn at
          // `verticalScale`, so an unscaled sample would compare a true-metre
          // hill against a scaled sight line.
          const h = groundHeightM(store, chunksManifest, x, z);
          return h === null ? null : h * verticalScale;
        }
      : () => null;
    const occlusion = new OcclusionCellCache(
      { x: eye.x, y: eye.y, z: eye.z }, sampleGround, tallestM,
    );
    // Species the underwater kit alone holds: meeting one while that kit is
    // not loaded is the request for it (see the loader above).
    const underwaterOnly = new Set(underwaterManifest?.assets.map((a) => a.id) ?? []);
    for (const a of manifest?.assets ?? []) underwaterOnly.delete(a.id);
    let needsUnderwater = false;
    for (const chunk of loaded.current.values()) {
      const centreX = chunk.originX + index.chunkMetres / 2;
      const centreZ = chunk.originZ + index.chunkMetres / 2;
      const chunkDistance = Math.hypot(eye.x - centreX, eye.z - centreZ);
      const blockIndex =
        blockAxis(Math.round(chunk.originZ / index.chunkMetres) - focusChunkZ) * 2
        + blockAxis(Math.round(chunk.originX / index.chunkMetres) - focusChunkX);

      for (const speciesGroup of chunk.bundle.species) {
        if (speciesGroup.count === 0) continue;
        const id = index.speciesOrder?.[speciesGroup.index];
        const entry = id ? kit.get(id) : undefined;
        if (!entry) {
          // A sea-bed species the (unloaded) underwater kit holds: request
          // the kit once one of its instances comes within the lead distance.
          if (id && !needsUnderwater && underwaterOnly.has(id)) {
            const positions = speciesGroup.positions;
            for (let i = 0; i < speciesGroup.count; i++) {
              const dx = positions[i * 3] - eye.x;
              const dz = positions[i * 3 + 2] - eye.z;
              if (dx * dx + dz * dz <= UNDERWATER_KIT_LEAD_M * UNDERWATER_KIT_LEAD_M) {
                needsUnderwater = true;
                break;
              }
            }
          }
          continue;
        }
        if (entry.suspect) {
          // Broken bounds (geometry far from the pivot): drawing it puts the
          // mesh underground or in the sky either way. A sourcing job.
          culled += speciesGroup.count;
          continue;
        }

        // Per-species draw-distance cull (T tiers): understory vanishes a
        // hundred metres out, canopy persists to the ring edge. This is what
        // keeps the coming density increase affordable — most instances are
        // small plants that must not render at two kilometres.
        // Submerged species draw shorter: underwater sight lines are a few
        // dozen metres, so a kelp bed resolved at 400 m is triangles behind a
        // wall of water and scatter.
        // A tree on land is the exception: it draws to the loaded ring's own
        // reach (as its baked card beyond ring 2) and never vanish-fades
        // inside it — visible from the mountains (owner, round 4).
        const maxDraw = entry.submerged
          ? Math.min(maxDrawDistance(entry.heightM) * drawScale, SUBMERGED_MAX_DRAW_M)
          : entry.category === "tree"
            ? treeDrawDistance(chunkRing, index.chunkMetres)
            : maxDrawDistance(entry.heightM) * drawScale;
        if (chunkDistance - halfDiagonal > maxDraw) {
          culled += speciesGroup.count;
          continue;
        }

        // Quality scales the outer rings, so lower tiers shift work toward
        // the cheap levels — never the near ring, and never inverted (see
        // `lodRings`). The ladder tiles [0, maxDraw) with one kit level per
        // rung; a species whose chain is shorter than the rings (a rock: one
        // level, no card) gets one rung and one copy.
        const rings = lodRings(entry.heightM, drawScale, entry.submerged);
        const meshLevels = entry.billboardIndex ?? entry.levels.length;
        const ladder = lodLadder(rings, meshLevels, entry.billboardIndex, maxDraw);
        // A land tree's ladder ends past the loaded ring: nothing to vanish.
        const vanishes = entry.submerged || entry.category !== "tree";
        const count = Math.min(speciesGroup.count, MAX_PER_DRAW);
        for (let i = 0; i < count; i++) {
          const inst = readInstance(speciesGroup, i);
          const instDistance = Math.hypot(inst.x - eye.x, inst.z - eye.z);
          if (instDistance > maxDraw) {
            culled++;
            continue;
          }
          // Terrain occlusion: a ridge between the camera and this instance
          // means nothing it draws reaches a pixel. Only beyond
          // OCCLUSION_MIN_DISTANCE_M — a rebuild is 16 m apart, and a near
          // instance popping back is worse than the triangles it saved.
          if (instDistance > OCCLUSION_MIN_DISTANCE_M
              && occlusion.occluded(inst.x, inst.z)) {
            occluded++;
            continue;
          }
          // Anchor per the mined authoring conventions (bundle v2,
          // docs/research/vegetation/vegetation-composition-rules.md): terrain species
          // put their PIVOT on the live streamed ground minus a baked sink —
          // never the bbox bottom, whose lowest point is often a hanging
          // frond tip and lifted whole trunks into the air ("tiptoe trees",
          // owner round 3). Water-surface species (lilypads) and attachments
          // (vines on hosts) keep their baked absolute Y and must NOT be
          // re-grounded to terrain. Sink is world metres, not × verticalScale
          // (which exaggerates terrain only).
          let y: number;
          if (speciesGroup.anchorMode === ANCHOR_PIVOT_TERRAIN) {
            const ground = chunksManifest
              ? groundHeightM(store, chunksManifest, inst.x, inst.z)
              : null;
            y = (ground ?? inst.y) * verticalScale - inst.sink;
          } else {
            y = inst.y * verticalScale;
          }
          // LOD per INSTANCE, from the camera distance: the copies this
          // instance is emitted into are every ladder rung the camera can
          // reach before the next rebuild, each stepping to its neighbour
          // only where that neighbour was emitted too (`lodCopies`). The
          // shader then keeps exactly one copy per pixel at the live camera
          // distance — a hard step at each rung, a short dither only at the
          // vanish. Beyond the last ring a billboard species runs on its
          // baked card; species without one keep their last mesh level.
          const emissions = lodCopies(instDistance, ladder, vanishes);
          const drewCard = entry.billboardIndex !== null && emissions.some(
            (e) => e.level === entry.billboardIndex && instDistance >= e.band[0]);
          // Wind tuning is per instance because both terms are: stiffness
          // scales with the trunk's radius AT THIS SCALE, and the sink is
          // drawn per instance from the species' range. A non-swaying species
          // (rock, log, crate, sunken wall) is pushed to stiffness 0 as well
          // as having its material left unpatched — it may SHARE a material
          // with a plant, and then the only thing standing between a boulder
          // and a bending boulder is this number.
          const trunkRadius = entry.trunkRadiusM;
          const stiffness = !entry.sways
            ? -1
            : trunkRadius === null ? 0 : windStiffness(trunkRadius, inst.scale) - 1;
          const sink = speciesGroup.anchorMode === ANCHOR_PIVOT_TERRAIN ? inst.sink : 0;
          for (const { level, band } of emissions) {
            const key = `${id}|${level}|${blockIndex}`;
            let bucket = buckets.get(key);
            if (!bucket) {
              bucket = {
                species: id!, level, block: blockIndex,
                placements: [], count: 0, windTune: [], bands: [], ...emptyExtents(),
              };
              buckets.set(key, bucket);
            }
            bucket.placements.push(
              inst.x, y, inst.z, inst.tiltX, inst.yaw, inst.tiltZ, inst.scale);
            bucket.count++;
            extend(bucket, inst.x, y, inst.z, inst.scale);
            bucket.windTune.push(stiffness, sink);
            bucket.bands.push(band[0], band[1], band[2], band[3]);
          }
          if (drewCard) billboardInstances++;
          if (onSolids && solidByAsset.get(id!)) {
            solids.push({
              species: id!, x: inst.x, y, z: inst.z,
              yaw: inst.yaw, tiltX: inst.tiltX, tiltZ: inst.tiltZ,
              scale: inst.scale,
            });
          }
        }
      }
    }

    // Between the passes: a (species, level) with few instances is not worth
    // quartering. Splitting it multiplies draws for a mesh whose whole set
    // would be submitted in one cheap call anyway, and most buckets in a
    // jungle neighbourhood hold a handful. Under this many instances across
    // the neighbourhood, the quarters are merged back into one unsplit
    // bucket with its own bounding sphere.
    const UNSPLIT_BELOW = 120;
    const byLevel = new Map<string, Bucket[]>();
    for (const bucket of buckets.values()) {
      const key = `${bucket.species}|${bucket.level}`;
      const list = byLevel.get(key);
      if (list) list.push(bucket);
      else byLevel.set(key, [bucket]);
    }
    for (const [key, list] of byLevel) {
      if (list.length < 2) continue;
      let total = 0;
      for (const bucket of list) total += bucket.count;
      if (total >= UNSPLIT_BELOW) continue;
      const merged: Bucket = {
        species: list[0].species, level: list[0].level,
        block: UNSPLIT_BLOCK, placements: [], count: total, windTune: [],
        bands: [], ...emptyExtents(),
      };
      for (const bucket of list) {
        extend(merged, bucket.minX, bucket.minY, bucket.minZ, bucket.maxScale);
        extend(merged, bucket.maxX, bucket.maxY, bucket.maxZ, bucket.maxScale);
        for (const value of bucket.placements) merged.placements.push(value);
        for (const value of bucket.windTune) merged.windTune.push(value);
        for (const value of bucket.bands) merged.bands.push(value);
        buckets.delete(`${key}|${bucket.block}`);
      }
      buckets.set(`${key}|${UNSPLIT_BLOCK}`, merged);
    }

    const bucketMs = performance.now() - rebuildStart;
    // Pass two: one InstancedMesh per bucket per geometry part, from the pool.
    const filled = new Set<string>();
    let instances = 0;
    let triangles = 0;
    const bySpecies: VegetationStats["bySpecies"] = {};
    for (const bucket of buckets.values()) {
      {
        const seen = bySpecies[bucket.species]
          ?? (bySpecies[bucket.species] = { drawn: 0, minY: Infinity, maxY: -Infinity });
        seen.drawn += bucket.count;
        for (let i = 0; i < bucket.count; i++) {
          const y = bucket.placements[i * PLACEMENT_STRIDE + 1];
          if (y < seen.minY) seen.minY = y;
          if (y > seen.maxY) seen.maxY = y;
        }
      }
      const entry = kit.get(bucket.species)!;
      // `level` is clamped to a valid index where it is chosen, so this is a
      // real lookup, not a fallback.
      const parts = entry.levels[bucket.level].parts;
      instances += bucket.count;
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        // Per-instance wind tuning lives on the geometry, so each (species,
        // level, BLOCK) mesh needs its own copy of that attribute: blocks
        // share a kit geometry, and one shared attribute would let the last
        // block written re-tune every other block's wind. `blockGeometry`
        // hands back a per-block view that SHARES every real vertex buffer
        // and is cached across rebuilds, so the extra cost is one small
        // object per (part, block), not a duplicated mesh.
        const geometry = blockGeometry(part.geometry, bucket.block);
        // The attribute is cached on that geometry and GROWN in place rather
        // than reallocated. A fresh InstancedBufferAttribute every rebuild
        // would strand its GPU buffer (nothing disposes a bare attribute).
        // Over-allocation is harmless: the InstancedMesh draws `count`
        // instances, not the attribute's length.
        const windTune = instancedAttribute(
          geometry, WIND_TUNE_ATTRIBUTE, 2, bucket.count);
        windTune.array.set(bucket.windTune);
        uploadRange(windTune, bucket.count * 2);
        // The crossfade band, same per-block story as the wind tune.
        const bands = instancedAttribute(
          geometry, LOD_BAND_ATTRIBUTE, 4, bucket.count);
        bands.array.set(bucket.bands);
        uploadRange(bands, bucket.count * 4);
        const meshKey = `${bucket.species}|${bucket.level}|${bucket.block}|${partIndex}`;
        let mesh = pool.current.get(meshKey);
        if (!mesh || mesh.instanceMatrix.count < bucket.count) {
          // Too small (or new): grow by 1.5x so a neighbourhood that keeps
          // creeping up by a few instances does not reallocate every 16 m.
          if (mesh) { group.remove(mesh); mesh.dispose(); }
          mesh = new THREE.InstancedMesh(
            geometry, part.material, Math.max(64, Math.ceil(bucket.count * 1.5)));
          mesh.frustumCulled = true;
          mesh.boundingSphere = new THREE.Sphere();
          pool.current.set(meshKey, mesh);
          group.add(mesh);
        }
        mesh.count = bucket.count;
        filled.add(meshKey);
        const isCard =
          entry.billboardIndex !== null && bucket.level === entry.billboardIndex;
        mesh.receiveShadow = !isCard;
        if (part.depthMaterial) mesh.customDepthMaterial = part.depthMaterial;
        // Sway the mesh tiers only. Cards are the far/impostor tier — sway is
        // invisible there and the research is explicit that wind never runs
        // on it. The shadow-depth twin is patched in the same call: patch the
        // colour material alone and every tree's shadow stands still while
        // the tree moves.
        if (!isCard && entry.sways) {
          applyWindSwayWithShadow(part.material, part.depthMaterial, wind);
        }
        // The fade runs on EVERY tier, cards included: the card tier is where
        // the worst pop was, and the discard is the first statement in the
        // fragment shader, so it works on opaque rock materials and in the
        // depth pass too.
        applyLodFadeWithShadow(part.material, part.depthMaterial, lodFade);
        for (let i = 0; i < bucket.count; i++) {
          const at = i * PLACEMENT_STRIDE;
          position.set(
            bucket.placements[at], bucket.placements[at + 1], bucket.placements[at + 2]);
          euler.set(
            bucket.placements[at + 3], bucket.placements[at + 4],
            bucket.placements[at + 5], "YXZ");
          quaternion.setFromEuler(euler);
          scale.setScalar(bucket.placements[at + 6]);
          mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
        }
        uploadRange(mesh.instanceMatrix, bucket.count * 16);
        // Bounding sphere from the bucket's own pivot extents plus the
        // species' reach at its largest scale — `computeBoundingSphere()`
        // read every instance matrix back per rebuild.
        const sphere = mesh.boundingSphere!;
        sphere.center.set(
          (bucket.minX + bucket.maxX) / 2, (bucket.minY + bucket.maxY) / 2,
          (bucket.minZ + bucket.maxZ) / 2);
        sphere.radius =
          Math.hypot(bucket.maxX - bucket.minX, bucket.maxY - bucket.minY,
            bucket.maxZ - bucket.minZ) / 2
          + (reachM.get(bucket.species) ?? entry.heightM) * bucket.maxScale;
        // Shadows: only the NEAREST mesh level, and only where the cascades
        // can see it. Levels 0–1 casting across the whole neighbourhood was
        // two extra alpha-tested, wind-displaced depth passes over every
        // species in ~2.3 km of jungle. The flag is recomputed here, on the
        // rebuild, never per frame.
        const centre = mesh.boundingSphere?.center;
        mesh.castShadow =
          bucket.level === 0
          && centre !== undefined
          && Math.hypot(centre.x - focus.x, centre.z - focus.z) <= SHADOW_CAST_RANGE_M;
        groups.current.push({ mesh, species: bucket.species, level: bucket.level });
        const geometryIndex = geometry.getIndex();
        triangles +=
          ((geometryIndex ? geometryIndex.count : geometry.attributes.position.count) / 3)
          * bucket.count;
      }
    }

    // Park every pooled mesh this rebuild did not fill: drawn nothing, but
    // its buffers stay for the next crossing.
    for (const [meshKey, mesh] of pool.current) {
      if (!filled.has(meshKey)) mesh.count = 0;
    }
    const totalMs = performance.now() - rebuildStart;
    const rebuildMs = {
      total: Math.round(totalMs * 10) / 10,
      bucket: Math.round(bucketMs * 10) / 10,
      fill: Math.round((totalMs - bucketMs) * 10) / 10,
    };
    if (import.meta.env.DEV) {
      console.debug(
        `vegetation rebuild ${rebuildMs.total} ms (bucket ${rebuildMs.bucket}, fill ${rebuildMs.fill}), `
        + `${groups.current.length} draws, ${instances} instances, pool ${pool.current.size}`);
    }
    const stats: VegetationStats = {
      chunks: loaded.current.size,
      instances,
      draws: groups.current.length,
      triangles: Math.round(triangles),
      culled,
      billboardInstances,
      occluded,
      bySpecies,
      rebuildMs,
    };
    onStats?.(stats);
    onSolids?.(solids);
    if (needsUnderwater) setUnderwaterWanted(true);
    // Same convention as the sky and water debug hooks: probes read the
    // numbers rather than guessing them from a screenshot.
    (window as unknown as { __STUDIO_VEGETATION_DEBUG__?: VegetationStats })
      .__STUDIO_VEGETATION_DEBUG__ = stats;
    if (import.meta.env.DEV) {
      // Dev-only probe handle (2026-09-17): the drawn meshes themselves, so a
      // probe can hide a species and measure what it was painting.
      (window as unknown as { __STUDIO_VEGETATION_MESHES__?: DrawGroup[] })
        .__STUDIO_VEGETATION_MESHES__ = groups.current;
    }
  }, [kit, index, manifest, underwaterManifest, revision, verticalScale, onStats, onSolids, focusRef,
      drawScale, chunksManifest, store, wind, lodFade]);

  return <group ref={root} name="vegetation" />;
}
