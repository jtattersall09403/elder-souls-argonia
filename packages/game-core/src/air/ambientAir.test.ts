import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AIR_PATCH_BAND, AIR_SPECIES, AIR_SPRITE_MAX_PX, airBlinkEnvelope, airSpriteSize, AIR_WATER_MIN_DEPTH_M, AirSwarm, airAmounts, airHoverFloorY, airPatchBand,
  airWaterGate, seededRandom, type AirConditions } from "./ambientAir";
import { PRECIP_LAYER } from "../water/render/waterMaterial";

/**
 * The presence rules are the part of this layer worth testing: they are the
 * "derive where and when it makes sense" the owner asked for, and each one is
 * a claim about the animal or the particle rather than a look. Every claim
 * below is one of those statements, asserted.
 */

const MARSH_NIGHT: AirConditions = {
  sunAltDeg: -20,
  humidity: 0.85,
  rain: 0,
  cloud: 0.1,
  windSpeed: 1,
  aboveGroundM: 2,
};

const at = (over: Partial<AirConditions>): AirConditions => ({ ...MARSH_NIGHT, ...over });

describe("ambient air presence rules (owner 2026-09-10)", () => {
  it("puts fireflies over the wet marsh at night, and nowhere by day", () => {
    expect(airAmounts(MARSH_NIGHT).fireflies).toBeGreaterThan(0.6);
    expect(airAmounts(at({ sunAltDeg: 40 })).fireflies).toBe(0);
  });

  it("grounds fireflies in rain and in wind", () => {
    expect(airAmounts(at({ rain: 1 })).fireflies).toBe(0);
    // And in ORDINARY rain: local rain intensity rarely reaches 1 even under
    // forced rain, so a plain (1 - rain) left them flying through a shower —
    // which is exactly what the owner saw with w=rain.
    expect(airAmounts(at({ rain: 0.3 })).fireflies).toBe(0);
    // A drizzle thins them well before it clears them.
    expect(airAmounts(at({ rain: 0.12 })).fireflies).toBeLessThan(
      airAmounts(MARSH_NIGHT).fireflies * 0.7,
    );
    expect(airAmounts(at({ windSpeed: 14 })).fireflies).toBe(0);
    // A stiff breeze thins them well before it clears them.
    expect(airAmounts(at({ windSpeed: 7 })).fireflies).toBeLessThan(
      airAmounts(MARSH_NIGHT).fireflies,
    );
  });

  it("keeps fireflies off the dry uplands even at night", () => {
    expect(airAmounts(at({ humidity: 0.2 })).fireflies).toBe(0);
  });

  it("swarms midges at dawn and dusk only — not midday, not midnight", () => {
    const dusk = airAmounts(at({ sunAltDeg: -1 })).midges;
    expect(dusk).toBeGreaterThan(0.4);
    expect(airAmounts(at({ sunAltDeg: -20 })).midges).toBeLessThan(0.05);
    expect(airAmounts(at({ sunAltDeg: 40 })).midges).toBeLessThan(0.05);
  });

  it("flies dragonflies in the middle of a warm day, opposite the midges", () => {
    const noon = at({ sunAltDeg: 40 });
    expect(airAmounts(noon).dragonflies).toBeGreaterThan(0.5);
    // They share the water with the midges but not the hour.
    expect(airAmounts(at({ sunAltDeg: -1 })).dragonflies).toBe(0);
    expect(airAmounts(noon).midges).toBeLessThan(0.05);
    // Same wet-ground and calm-air requirements as everything else here.
    expect(airAmounts({ ...noon, humidity: 0.2 }).dragonflies).toBe(0);
    expect(airAmounts({ ...noon, windSpeed: 14 }).dragonflies).toBe(0);
  });

  it("shows pollen only in daylight, and washes it out in rain", () => {
    const sunnyDay = at({ sunAltDeg: 35, cloud: 0.05, humidity: 0.6 });
    expect(airAmounts(sunnyDay).pollen).toBeGreaterThan(0.5);
    // It is lit, not luminous: no sun, nothing to see.
    expect(airAmounts(at({ sunAltDeg: -20 })).pollen).toBe(0);
    expect(airAmounts({ ...sunnyDay, rain: 1 }).pollen).toBe(0);
    // Overcast leaves no beam for it to hang in.
    expect(airAmounts({ ...sunnyDay, cloud: 0.95 }).pollen).toBe(0);
  });

  it("needs wind to bring leaves down", () => {
    const day = at({ sunAltDeg: 35, windSpeed: 0.5 });
    expect(airAmounts(day).leaves).toBe(0);
    expect(airAmounts({ ...day, windSpeed: 8 }).leaves).toBeGreaterThan(0.5);
  });

  it("fades everything out above the canopy — measured from the GROUND", () => {
    // The distinction is the bug this test now pins. Gating on height above
    // SEA LEVEL switched the whole layer off at a marsh sitting 203 m up, in
    // a province whose terrain reaches 651 m. Standing on that marsh, the eye
    // is 2 m above the ground and everything should be flying.
    for (const [id, amount] of Object.entries(airAmounts(at({ aboveGroundM: 120 })))) {
      expect(amount, `${id} at 120 m up`).toBe(0);
    }
    expect(airAmounts(at({ aboveGroundM: 2 })).fireflies).toBeGreaterThan(0.6);
  });

  it("never returns an amount outside 0..1", () => {
    for (const alt of [-40, -6, 0, 8, 45, 89]) {
      for (const hum of [0, 0.5, 1]) {
        for (const wind of [0, 5, 25]) {
          for (const rain of [0, 0.5, 1]) {
            const a = airAmounts(at({ sunAltDeg: alt, humidity: hum, windSpeed: wind, rain }));
            for (const [id, v] of Object.entries(a)) {
              expect(Number.isFinite(v), `${id} finite`).toBe(true);
              expect(v, `${id} @ alt ${alt} hum ${hum} wind ${wind} rain ${rain}`).toBeGreaterThanOrEqual(0);
              expect(v).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it("keeps fireflies low and lets the ground bound them from below", () => {
    const ff = AIR_SPECIES.fireflies;
    // Owner round 3: never much above head height. The band's TOP sits below
    // the camera, so it cannot rise into the canopy.
    expect(ff.topBelowCameraM, "firefly band top").toBeGreaterThan(0.5);
    // And it must run deep enough to reach the ground on a slope — the
    // terrain's depth buffer hides whatever falls below the surface, so extra
    // depth is free and a shallow band would hover.
    expect(ff.depthM, "firefly band depth").toBeGreaterThanOrEqual(4);
    for (const sp of Object.values(AIR_SPECIES)) {
      expect(sp.depthM, `${sp.id} depth`).toBeGreaterThan(0);
    }
  });

  it("keeps particles out of the gap between the camera and the character", () => {
    // In third person the player stands a few metres ahead of the eye. A
    // particle nearer than that hangs in front of the character and reads as
    // being on the lens, which the owner reported as distracting.
    // Fireflies sit just past the character: far enough not to hang in the
    // gap, near enough that the big readable ones are not all lost.
    expect(AIR_SPECIES.fireflies.nearClipM).toBeGreaterThanOrEqual(3.0);
    // Dragonflies are held much further out (owner): you should meet a knot
    // by walking into it, never have one appear in front of the camera.
    expect(AIR_SPECIES.dragonflies.nearClipM).toBeGreaterThanOrEqual(8.0);
    for (const sp of Object.values(AIR_SPECIES)) {
      expect(sp.nearClipM, `${sp.id} near clip`).toBeGreaterThan(0);
    }
  });

  it("distributes unevenly rather than as one uniform cloud", () => {
    // Every species carries a world-anchored patch scale, so walking takes
    // you through dense pockets and near-empty ground.
    for (const sp of Object.values(AIR_SPECIES)) {
      expect(sp.patchM, `${sp.id} patch size`).toBeGreaterThan(5);
      // Patches smaller than the clump radius would just fight the clumping.
      expect(sp.patchM, `${sp.id} patch vs clump`).toBeGreaterThan(sp.clusterRadius);
    }
  });

  it("covers every declared species, so a new one cannot be silently unlit", () => {
    const amounts = airAmounts(MARSH_NIGHT);
    for (const id of Object.keys(AIR_SPECIES)) {
      expect(Object.hasOwn(amounts, id), `no presence rule for "${id}"`).toBe(true);
    }
  });
});

describe("the swarm is deterministic (standard 4)", () => {
  it("produces the same field from the same seed, on any machine", () => {
    const a = seededRandom(0x5eeda12);
    const b = seededRandom(0x5eeda12);
    const draw = (r: () => number) => Array.from({ length: 64 }, () => r());
    expect(draw(a)).toEqual(draw(b));
  });

  it("spreads uniformly over 0..1 rather than clustering on a bad hash", () => {
    const r = seededRandom(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.min(9, Math.floor(r() * 10))] += 1;
    for (const b of buckets) expect(b).toBeGreaterThan(1500);
  });
});

describe("the swarm materials are node materials with their slots filled (decision 0107)", () => {
  it("every species builds a transparent, non-writing, unfogged node material drawn as instanced quads", () => {
    for (const species of Object.values(AIR_SPECIES)) {
      const sw = new AirSwarm(species, seededRandom(5));
      const m = sw.material;
      expect(m.isNodeMaterial, species.id).toBe(true);
      expect(m.vertexNode, species.id).toBeTruthy();
      expect(m.fragmentNode, species.id).toBeTruthy();
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
      expect(m.depthTest).toBe(true);
      expect(m.fog).toBe(false);
      expect(m.blending).toBe(species.additive ? THREE.AdditiveBlending : THREE.NormalBlending);
      const g = sw.points.geometry as THREE.InstancedBufferGeometry;
      expect(g.instanceCount).toBe(species.count);
      expect(g.getAttribute("aBase").count).toBe(species.count);
      expect(sw.points.renderOrder).toBe(6);
      sw.dispose();
    }
  });

});

describe("blink envelope and sprite size (the maths the vertex stage mirrors)", () => {
  it("a firefly is dark at the start of its period, peaks early and is dark for most of it", () => {
    expect(airBlinkEnvelope(0)).toBe(0);
    expect(airBlinkEnvelope(0.16)).toBeCloseTo(1, 9);
    expect(airBlinkEnvelope(0.3)).toBeGreaterThan(0);
    expect(airBlinkEnvelope(0.3)).toBeLessThan(1);
    for (const ph of [0.6, 0.75, 0.99]) expect(airBlinkEnvelope(ph)).toBe(0);
    // the phase wraps
    expect(airBlinkEnvelope(1.16)).toBeCloseTo(airBlinkEnvelope(0.16), 9);
  });
  it("sprites scale with 1/distance, clamp at the maximum and fade below a pixel", () => {
    const near = airSpriteSize(22, 1, 1, 1);
    expect(near.px).toBe(AIR_SPRITE_MAX_PX);
    expect(near.alpha).toBe(1);
    expect(airSpriteSize(22, 1, 1, 10).px).toBeCloseTo(22, 9);
    expect(airSpriteSize(22, 1, 2, 10).px).toBeCloseTo(44, 9);
    const far = airSpriteSize(9, 1, 1, 180);
    expect(far.px).toBe(1);
    expect(far.alpha).toBeCloseTo(0.25, 9);
  });
});

describe("the air layer draws after the water surface", () => {
  // On layer 0 the water pass painted over every particle in front of water,
  // which is every midge and dragonfly (owner 2026-09-11). Same fix as rain.
  it("puts every swarm on the post-water layer", () => {
    for (const species of Object.values(AIR_SPECIES)) {
      const swarm = new AirSwarm(species, seededRandom(3));
      expect(swarm.points.layers.mask, species.id).toBe(1 << PRECIP_LAYER);
    }
  });
});

describe("over water the band hovers from the SURFACE, not the ground (owner 2026-09-13, Phase 16c)", () => {
  it("midges and dragonflies carry a hover height; the floor is the water surface plus it", () => {
    for (const id of ["midges", "dragonflies"]) {
      const sp = AIR_SPECIES[id];
      expect(sp.hoverAboveWaterM, `${id} hover`).toBeGreaterThan(0);
      expect(sp.hoverBandM, `${id} band`).toBeGreaterThan(0);
      // a 2 m deep pond whose surface is at 12.0: the cloud sits just over
      // the water, never 2 m up from the bed (the ground-based rule gave
      // ground + hover = 10.0 + hover, under the surface)
      const surfaceY = 12.0;
      const bedY = 10.0;
      const floor = airHoverFloorY(sp, surfaceY, 0);
      expect(floor).toBeCloseTo(surfaceY + sp.hoverAboveWaterM!, 9);
      expect(floor!).toBeGreaterThan(bedY + sp.hoverAboveWaterM!);
      // the band spreads up from the floor, never below it
      expect(airHoverFloorY(sp, surfaceY, 1)).toBeCloseTo(surfaceY + sp.hoverAboveWaterM! + sp.hoverBandM!, 9);
      expect(airHoverFloorY(sp, surfaceY, 0.5)!).toBeGreaterThan(floor!);
    }
    // dry ground: no floor (the terrain bounds the band), and a species
    // without a hover height never reads the water
    expect(airHoverFloorY(AIR_SPECIES.midges, null, 0)).toBeNull();
    expect(airHoverFloorY(AIR_SPECIES.fireflies, 12.0, 0)).toBeNull();
  });

  it("binding the compiled surface raster switches the floor on and off", () => {
    const sw = new AirSwarm(AIR_SPECIES.midges, seededRandom(1));
    expect(sw.material.vertexNode).toBeTruthy();
    // binding the surface enables it; clearing it hands the band back to the ground
    sw.setWater({ texture: new THREE.Texture(), size: 4, metresPerPixel: 10, minM: -10, spanM: 20, depthMinM: -6,
      depthSpanM: 30.6, buriedM: -2.5, liftM: () => -0.2 });
    expect((sw.uniforms.uAirWaterDepth.value as THREE.Vector4).w).toBe(1);
    expect((sw.uniforms.uAirHover.value as THREE.Vector3).z).toBeCloseTo(-0.2, 9);
    sw.setWater(null);
    expect((sw.uniforms.uAirWaterDepth.value as THREE.Vector4).w).toBe(0);
    // pollen has no hover height: binding does nothing
    const pollen = new AirSwarm(AIR_SPECIES.pollen, seededRandom(2));
    pollen.setWater({ texture: new THREE.Texture(), size: 4, metresPerPixel: 10, minM: -10, spanM: 20, depthMinM: -6,
      depthSpanM: 30.6, buriedM: -2.5, liftM: () => 0 });
    expect((pollen.uniforms.uAirWaterDepth.value as THREE.Vector4).w).toBe(0);
    sw.dispose(); pollen.dispose();
  });
});

describe("hover species exist only over standing water, in localised knots (owner 2026-09-14, 16c round 2)", () => {
  it("a dry cell draws nothing; a wet cell draws — and the lift counts", () => {
    // before the gate a dry lowland cell got alpha 1 (nothing in vAlpha read
    // the water at all: the floor only lifted the band where there WAS water)
    expect(airWaterGate(-3, 0)).toBe(0);          // buried ground
    expect(airWaterGate(-0.5, 0)).toBe(0);        // a dry, floodable table cell
    expect(airWaterGate(0.05, 0)).toBe(0);        // a damp film is not standing water
    expect(airWaterGate(0.4, 0)).toBe(1);
    expect(airWaterGate(AIR_WATER_MIN_DEPTH_M, 0)).toBe(1);
    // a dry-season draw-down empties a shallow pool of its midges
    expect(airWaterGate(0.4, -0.3)).toBe(0);
  });

  it("binding a surface to a hover species enables the gate; the habitat alone never does", () => {
    const water = { texture: new THREE.Texture(), habitat: new THREE.Texture(), size: 4, metresPerPixel: 10, minM: -10,
      spanM: 20, depthMinM: -6, depthSpanM: 30.6, buriedM: -2.5, liftM: () => 0 };
    const sw = new AirSwarm(AIR_SPECIES.dragonflies, seededRandom(1));
    sw.setWater(water);
    expect(sw.uniforms.uAirWaterDepth.value.w).toBe(1);
    expect(sw.uniforms.uAirWaterTex.value).toBe(water.texture);
    expect(sw.uniforms.uAirHabitatW.value.w).toBe(1);
    // fireflies bind the raster for the habitat but keep the ground
    const ff = new AirSwarm(AIR_SPECIES.fireflies, seededRandom(1));
    ff.setWater(water);
    expect(ff.uniforms.uAirWaterDepth.value.w).toBe(0);
    expect(ff.uniforms.uAirHabitat.value).toBe(water.habitat);
    ff.setWater(null);
    expect(ff.uniforms.uAirHabitatW.value.w).toBe(0);
    expect(ff.uniforms.uAirHabitat.value).not.toBe(water.habitat);
    sw.dispose(); ff.dispose();
  });

  it("hover species use the high patch band so most of the water is empty; the ground species keep the broad one", () => {
    for (const id of ["midges", "dragonflies"]) {
      expect(airPatchBand(AIR_SPECIES[id])).toEqual(AIR_PATCH_BAND.water);
      // knots tens of metres apart, wider than the clump
      expect(AIR_SPECIES[id].patchM).toBeGreaterThanOrEqual(40);
      const sw = new AirSwarm(AIR_SPECIES[id], seededRandom(2));
      expect((sw.uniforms.uPatchBand.value as THREE.Vector2).toArray()).toEqual([...AIR_PATCH_BAND.water]);
      sw.dispose();
    }
    for (const id of ["fireflies", "pollen", "leaves"]) expect(airPatchBand(AIR_SPECIES[id])).toEqual(AIR_PATCH_BAND.ground);
    expect(AIR_PATCH_BAND.water[0]).toBeGreaterThan(AIR_PATCH_BAND.ground[1] * 0.75);
    const sw = new AirSwarm(AIR_SPECIES.fireflies, seededRandom(3));
    expect(sw.uniforms.uPatchBand.value.toArray()).toEqual([...AIR_PATCH_BAND.ground]);
    sw.dispose();
  });
});

describe("habitat weights (16f)", () => {
  it("every species names where the record says it lives, and the weights are sane", () => {
    for (const sp of Object.values(AIR_SPECIES)) {
      expect(sp.habitat, `${sp.id} habitat`).toBeDefined();
      for (const w of sp.habitat!) expect(w).toBeGreaterThanOrEqual(0);
      expect(Math.max(...sp.habitat!)).toBeGreaterThan(0);
    }
    // fireflies gather on wet ground and under canopy, never keyed to open water alone
    expect(AIR_SPECIES.fireflies.habitat).toEqual([0, 1, 1]);
    // midges and dragonflies want standing water
    expect(AIR_SPECIES.dragonflies.habitat![0]).toBe(1);
    expect(AIR_SPECIES.midges.habitat![0]).toBe(1);
  });
  it("a ground species that binds the raster for its habitat is not gated to open water", () => {
    // fireflies have no hover height: binding water must leave the depth gate off
    expect(AIR_SPECIES.fireflies.hoverAboveWaterM).toBeUndefined();
  });
});
