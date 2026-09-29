/**
 * Harness scene "air": every ambient-air species swarm and the sun shafts,
 * built from the real package classes (game-core/air), over a lit ground
 * plane. Conditions: a humid marsh; each species gets the larger of its dusk
 * and its daytime amount so all five swarms draw (each is its own pipeline),
 * and the shafts get a 40° sun under full canopy.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import type { HarnessContext, HarnessScene } from "../types";
import {
  AIR_SPECIES,
  AirSwarm,
  airAmounts,
  seededRandom,
  type AirConditions,
} from "@elder-souls/game-core/air/ambientAir";
import { SunShafts, sunShaftIntensity } from "@elder-souls/game-core/air/sunShafts";
import { PRECIP_LAYER } from "@elder-souls/game-core/water/render/waterMaterial";


const MARSH: AirConditions = { sunAltDeg: 40, humidity: 0.85, rain: 0, cloud: 0.1, windSpeed: 3, aboveGroundM: 2 };

const harnessScene: HarnessScene = {
  name: "air",
  async build(ctx: HarnessContext) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6f8398);

    const sunAlt = (40 * Math.PI) / 180;
    const sunDir = new THREE.Vector3(Math.cos(sunAlt) * 0.6, Math.sin(sunAlt), -Math.cos(sunAlt) * 0.8).normalize();
    const sun = new THREE.DirectionalLight(0xfff1dc, 3);
    sun.position.copy(sunDir).multiplyScalar(50);
    scene.add(sun, new THREE.HemisphereLight(0xbcd0e6, 0x3a3222, 1));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      new MeshStandardNodeMaterial({ color: 0x4d5a36, roughness: 1 }),
    );
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.1, 600);
    camera.position.set(0, 1.7, 0);
    camera.lookAt(0, 1.0, -10);
    camera.layers.enable(PRECIP_LAYER);

    const rand = seededRandom(0x5eeda12);
    const swarms = Object.values(AIR_SPECIES).map((s) => new AirSwarm(s, rand));
    const dusk = airAmounts({ ...MARSH, sunAltDeg: -3, windSpeed: 1 });
    const day = airAmounts(MARSH);
    for (const s of swarms) scene.add(s.points);
    const shafts = new SunShafts(undefined, seededRandom(0x511af75));
    scene.add(shafts.mesh);
    const shaftAmount = sunShaftIntensity({ ...MARSH, canopy: 1 });
    const sunColour = new THREE.Color(1.0, 0.93, 0.74);
    const lit = { x: 0.8, y: 0.8, z: 0.75 };

    const frame = (t: number) => {
      for (const s of swarms) {
        const id = s.species.id;
        s.update(
          Math.max(dusk[id] ?? 0, day[id] ?? 0, 0.5),
          camera, t, ctx.renderer.getPixelRatio(), sunDir, [1, 0], MARSH.windSpeed, lit, 1, 1200,
        );
      }
      shafts.update(shaftAmount, camera, sunDir, sunColour, 1);
    };
    frame(0);
    return { scene, camera, frame };
  },
};

export default harnessScene;
