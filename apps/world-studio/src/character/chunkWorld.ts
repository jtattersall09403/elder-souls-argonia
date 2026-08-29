import type { EnvironmentContact, EnvironmentQuery, Vec3, WaterSample, WorldWaterQuery } from "@elder-souls/contracts";
import { SEA_LEVEL_Y } from "@elder-souls/contracts";
import { dayPhaseAt, moonAt, MOONS, sunAt } from "@elder-souls/world-time";
import { worldClock } from "../sky/timeState";
import { lastWeatherSample } from "../weather/weatherState";
import type { ChunkStore, ChunksManifest } from "./chunkStore";

/**
 * `EnvironmentQuery` (contracts §61) over the loaded terrain chunks plus the
 * land-cover control map — the first real implementation of the
 * character/world environment contract.
 *
 * Queries are answered in **runtime world space** (vertical ×5 baked, sea
 * level y = 0) and only from chunks already decoded by the `ChunkStore`; the
 * character mode keeps a ring of LOD-1 chunks loaded around the player.
 */
export class ChunkWorld implements EnvironmentQuery {
  private manifest: ChunksManifest | null = null;
  private verticalScale = 1;
  private cellMetres = 1403.8;
  private grid: [number, number] = [16, 16];
  /** Dominant land-cover material id per control texel (id0 channel). */
  private controlIds: Uint8Array | null = null;
  private controlSize = 0;
  private controlMetresPerTexel = 5.48352;
  private materialNames = new Map<number, string>();
  /** Region-class visibility (m) from the compiled climate profiles. */
  private regionVisibility = new Map<string, number>();
  /** Phase 8b: the authoritative water query, wired when its rasters load. */
  private waterWorld: WorldWaterQuery | null = null;

  setWaterWorld(world: WorldWaterQuery): void {
    this.waterWorld = world;
  }

  constructor(
    private readonly store: ChunkStore,
    private readonly baseUrl: string,
    /** Region/biome description at a world position (studio map rasters). */
    private readonly regionResolver?: (xM: number, zM: number) => { regionId: string; biomeId: string },
  ) {}

  /**
   * Set the live vertical scale (owner tuning; canonical value is decision
   * 0015's ×1, `chunks-web-manifest.verticalScaleAtGeometry`). Must match the
   * collider and render-mesh scale — CharacterMode keeps them in lockstep.
   */
  setVerticalScale(scale: number): void {
    this.verticalScale = scale;
  }

  async init(materialSet: string, verticalScale?: number): Promise<void> {
    this.manifest = await this.store.manifest();
    this.verticalScale = verticalScale ?? this.manifest.verticalScaleAtGeometry;
    this.cellMetres = this.manifest.chunkMetres;
    this.grid = this.manifest.grid;
    try {
      const materials = await (
        await fetch(`${this.baseUrl}textures/ground/${materialSet}/materials.json`)
      ).json();
      for (const m of materials.materials) this.materialNames.set(m.id, m.name);
      const image = new Image();
      image.src = `${this.baseUrl}province/refined/ground-control.png`;
      await image.decode();
      const size = image.width;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      const px = ctx.getImageData(0, 0, size, size).data;
      const ids = new Uint8Array(size * size);
      for (let i = 0; i < ids.length; i++) ids[i] = px[i * 4];
      this.controlIds = ids;
      this.controlSize = size;
      this.controlMetresPerTexel = (this.grid[0] * this.cellMetres) / size;
    } catch {
      /* material identification degrades gracefully to undefined */
    }
    try {
      const hydroMeta = await (await fetch(`${this.baseUrl}province/hydrology-meta.json`)).json();
      for (const [name, profile] of Object.entries(hydroMeta.climateProfiles ?? {})) {
        const vis = (profile as { visibility?: number }).visibility;
        if (typeof vis === "number") this.regionVisibility.set(name, vis);
      }
    } catch {
      /* visibility degrades gracefully to undefined */
    }
  }

  chunkCellAt(x: number, z: number): [number, number] {
    return [
      Math.max(0, Math.min(this.grid[0] - 1, Math.floor(x / this.cellMetres))),
      Math.max(0, Math.min(this.grid[1] - 1, Math.floor(z / this.cellMetres))),
    ];
  }

  /** Runtime-space terrain height via bilinear filtering of the LOD-1 grid. */
  groundHeight(x: number, z: number): number | null {
    const [cx, cy] = this.chunkCellAt(x, z);
    const grid = this.store.loaded(cx, cy, "1");
    if (!grid) return null;
    const lx = (x - grid.meta.originM[0]) / grid.metresPerSample;
    const lz = (z - grid.meta.originM[1]) / grid.metresPerSample;
    const x0 = Math.max(0, Math.min(grid.nx - 2, Math.floor(lx)));
    const z0 = Math.max(0, Math.min(grid.ny - 2, Math.floor(lz)));
    const fx = Math.max(0, Math.min(1, lx - x0));
    const fz = Math.max(0, Math.min(1, lz - z0));
    const h = grid.heights;
    const h00 = h[z0 * grid.nx + x0];
    const h10 = h[z0 * grid.nx + x0 + 1];
    const h01 = h[(z0 + 1) * grid.nx + x0];
    const h11 = h[(z0 + 1) * grid.nx + x0 + 1];
    const trueMetres = (h00 * (1 - fx) + h10 * fx) * (1 - fz)
      + (h01 * (1 - fx) + h11 * fx) * fz;
    return trueMetres * this.verticalScale;
  }

  groundMaterialAt(x: number, z: number): string | undefined {
    if (!this.controlIds) return undefined;
    const tx = Math.max(0, Math.min(this.controlSize - 1, Math.floor(x / this.controlMetresPerTexel)));
    const tz = Math.max(0, Math.min(this.controlSize - 1, Math.floor(z / this.controlMetresPerTexel)));
    return this.materialNames.get(this.controlIds[tz * this.controlSize + tx]);
  }

  queryEnvironment(position: Vec3): EnvironmentContact {
    const ground = this.groundHeight(position.x, position.z);
    const region = this.regionResolver?.(position.x, position.z);
    const contact: EnvironmentContact = {
      mudDepth: 0,
      biomeId: region?.biomeId ?? "unknown",
      regionId: region?.regionId ?? "unknown",
      hazardIds: [],
    };
    // World time and light (module 55 §94): the one clock the renderer uses.
    const epoch = worldClock.epochMinutes();
    contact.light = {
      dayPhase: dayPhaseAt(epoch),
      sunAltitudeDeg: (sunAt(epoch).altitude * 180) / Math.PI,
      moonPhaseFraction: moonAt(epoch, MOONS[0]).illuminatedFraction,
      seasonScalar: worldClock.season().s,
      visibilityM: region ? this.regionVisibility.get(region.regionId) : undefined,
    };
    // Weather (Phase 8c, module 55 §98): the same deterministic sample the
    // renderer draws this frame (camera-local — the player IS the camera in
    // studio modes). Weather visibility caps the region's baseline.
    const wx = lastWeatherSample();
    if (wx) {
      contact.weather = {
        state: wx.state,
        rainIntensity: wx.rainIntensity,
        windDirXZ: wx.windDirXZ,
        windSpeedMS: wx.windSpeedMS,
        visibilityM: wx.visibilityM,
        wetness: wx.wetness,
        grip: wx.grip,
      };
      contact.light.visibilityM = Math.min(
        contact.light.visibilityM ?? Number.POSITIVE_INFINITY,
        wx.visibilityM,
      );
    }
    if (ground === null) return contact;
    contact.groundHeight = ground;
    contact.groundMaterial = this.groundMaterialAt(position.x, position.z);
    // Support normal from central differences one LOD-1 sample out.
    const step = 5.48352;
    const west = this.groundHeight(position.x - step, position.z);
    const east = this.groundHeight(position.x + step, position.z);
    const north = this.groundHeight(position.x, position.z - step);
    const south = this.groundHeight(position.x, position.z + step);
    if (west !== null && east !== null && north !== null && south !== null) {
      const nx = (west - east) / (2 * step);
      const nz = (north - south) / (2 * step);
      const length = Math.hypot(nx, 1, nz);
      contact.supportNormal = { x: nx / length, y: 1 / length, z: nz / length };
    }
    // Phase 8b: the authoritative water query (module 60 §38) — same data as
    // the renderer. Queries are runtime-scaled, WaterWorld is true-metre; the
    // vertical scale converts on the way in and out.
    if (this.waterWorld) {
      const vs = this.verticalScale;
      const w = this.waterWorld.sample(
        { x: position.x, y: position.y / vs, z: position.z },
        worldClock.epochMinutes(),
      );
      if (w.depth > 0) {
        contact.water = {
          ...w,
          surfaceHeight: w.surfaceHeight * vs,
          depth: w.depth * vs,
        };
      }
    } else if (ground < SEA_LEVEL_Y) {
      // pre-8b fallback while the water rasters load: flat sea at y=0
      const water: WaterSample = {
        waterBodyId: "sea",
        surfaceHeight: SEA_LEVEL_Y,
        surfaceNormal: { x: 0, y: 1, z: 0 },
        flowVelocity: { x: 0, y: 0, z: 0 },
        depth: SEA_LEVEL_Y - ground,
        immersion: Math.max(0, Math.min(1, (SEA_LEVEL_Y - position.y) / 1.7 + 1)),
        turbidity: 0.5,
        salinity: 1,
        temperature: 22,
        hazardIds: [],
      };
      contact.water = water;
    }
    return contact;
  }
}
