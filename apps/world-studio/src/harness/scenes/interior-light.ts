/**
 * Harness scene "interior-light" (decision 0112 §6): a published cell's window
 * light from the interior light record, turned to the door it is entered by and
 * lit by the real ephemeris, in the real froxel medium. The walls are a plain
 * box around the cell's apertures (the cell's kits are too heavy for
 * SwiftShader); each aperture is a pale pane, its shaft the medium's.
 *
 *   harness.html?sys=interior-light&cell=KeebaHouseFisher&facing=167.5&t=08:00[&d=8-17]
 *
 * `vol=0` draws the room without the medium (a debugging aid); `exposure` (default 2) brightens a shot.
 * The scene reports its offset, light direction, kind, dust and lit beams in the summary.
 * `facing` is the exterior door's outward bearing (a settlement door's
 * `facingDeg`); `t` the clock; `d` month-day (default the studio's 17 Last Seed).
 * The runtime path is the same functions InteriorDoors.tsx calls:
 * windowSkyLight, cellCompassOffsetDeg, worldToCellDirection, WindowBeams,
 * interiorFogProfile.
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import { DEFAULT_INSTANT, moonsAt, sunAt, toEpochMinutes } from "@elder-souls/world-time";
import type { HarnessContext, HarnessScene } from "../types";
import { Volumetrics } from "@elder-souls/game-core/air/volumetrics/froxelGrid";
import { applyVolumetrics } from "@elder-souls/game-core/air/volumetrics/volumetricNodes";
import {
  WindowBeams, cellCompassOffsetDeg, interiorLightOf, pluginWindowApertures, windowSkyLight, worldToCellDirection,
} from "@elder-souls/game-core/air/volumetrics/windowApertures";
import { interiorFogProfile } from "@elder-souls/game-core/interior/interiorEnvironment";

const SUN_IRRADIANCE = 3; // harness units (volumetricsScene.ts)
const q = new URLSearchParams(location.search);

const scene: HarnessScene = {
  name: "interior-light",
  expectDark: true,
  async build(ctx: HarnessContext) {
    const cellId = q.get("cell") ?? "KeebaHouseFisher";
    const facing = Number(q.get("facing") ?? "180");
    const [hh, mm] = (q.get("t") ?? "08:00").split(":").map(Number);
    const [mo, dd] = (q.get("d") ?? `${DEFAULT_INSTANT.month + 1}-${DEFAULT_INSTANT.day}`).split("-").map(Number);
    const epoch = toEpochMinutes({ ...DEFAULT_INSTANT, month: mo - 1, day: dd, minuteOfDay: hh * 60 + mm });
    const row = interiorLightOf(cellId);
    const windows = pluginWindowApertures(cellId);
    if (!row || !windows.length) throw new Error(`interior-light: ${cellId} has no windows in the record`);
    const bundle = await (await fetch(`province/interiors/${cellId}.json`)).json();
    const floorY: number = bundle.arrivalMarker.positionM[1];
    const offset = cellCompassOffsetDeg(facing, bundle.arrivalMarker.yawDeg);

    // the room: the apertures' box grown 2 m, floor at the arrival marker, ceiling above the highest pane
    const box = new THREE.Box3();
    for (const w of windows) box.expandByPoint(w.centre);
    box.expandByScalar(2);
    box.min.y = floorY; box.max.y = Math.max(box.max.y, floorY + 3.5);
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const s = new THREE.Scene();
    s.background = new THREE.Color(0);
    ctx.renderer.toneMappingExposure = Number(q.get("exposure") ?? "2");
    const wall = new MeshStandardNodeMaterial({ color: 0x6f655a, roughness: 1, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), wall);
    room.position.copy(mid);
    s.add(room, new THREE.HemisphereLight(0x303238, 0x1a1510, 0.4));
    const pane = new MeshBasicNodeMaterial({ color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(0.6), side: THREE.DoubleSide });
    for (const w of windows) {
      const r = Math.sqrt(w.areaM2 / Math.PI);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.6, r * 1.6), pane);
      m.position.copy(w.centre);
      m.lookAt(w.centre.clone().add(w.outward));
      s.add(m);
    }
    // camera: in the room's far corner from the mean window, eye height, looking at the room middle
    // windows on opposite walls cancel: then stand away from the first one (a zero mean normalises to NaN)
    const sum = windows.reduce((a, w) => a.add(w.outward), new THREE.Vector3());
    const meanOut = (sum.length() > 0.3 * windows.length ? sum : windows[0].outward.clone()).setY(0).normalize();
    const eye = mid.clone().addScaledVector(meanOut, -0.4 * Math.max(size.x, size.z));
    eye.y = floorY + 1.7;
    const camera = new THREE.PerspectiveCamera(75, ctx.width / ctx.height, 0.1, 200);
    camera.position.copy(eye);
    camera.lookAt(mid.x, floorY + 1.2, mid.z);
    camera.updateMatrixWorld();

    const sky = { dir: new THREE.Vector3(), tint: new THREE.Color() };
    const strength = windowSkyLight(sunAt(epoch), moonsAt(epoch), sky.dir, sky.tint);
    worldToCellDirection(sky.dir, offset, sky.dir);
    const beams = new WindowBeams(windows, 10);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const origin = new THREE.Vector3();
    const player = new THREE.Vector3(mid.x, floorY, mid.z);
    for (let i = 0; i < 3; i++) beams.update(origin, sky.dir, strength * SUN_IRRADIANCE, sky.tint, player, frustum, 1);
    const apertures = beams.out;
    const profile = interiorFogProfile({ bundle }, 0);
    const report = {
      cellId, facing, offset, time: `${hh}:${mm}`, strength, lightDir: sky.dir.toArray().map((v) => +v.toFixed(3)),
      kind: row.kind, dust: row.dust, dustDensity: profile.dustDensity, lit: apertures.length,
      sunBeams: apertures.filter((a) => a.direction.distanceTo(sky.dir) < 1e-6).length,
    };

    const vol = new Volumetrics({
      renderer: ctx.renderer, backend: ctx.backend,
      terrain: { groundHeight: () => floorY - 50, water: () => ({ height: -1e4, mask: 0 }), seaMask: () => 0, wetness: () => 0 },
      crowns: () => [],
    });
    vol.setBand("high");
    vol.grids.bakeAll(camera.position.x, camera.position.z);
    const V = tsl as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (q.get("vol") !== "0") (s as THREE.Scene & { fogNode?: unknown }).fogNode = V.Fn(() => applyVolumetrics(vol, V.output, V.positionView.z.negate(), V.screenUV))();
    const dark = new THREE.Color(0, 0, 0);
    const update = (t: number) => vol.update({ camera, timeS: t, sunDir: new THREE.Vector3(0, 1, 0), sunIrradiance: dark,
      skyIrradiance: dark, lights: [], apertures, interior: profile, mistDepthM: 22 });
    update(0);
    return { scene: s, camera, report, frame: (t: number) => { for (let k = 0; k < 12; k++) update(t + 1); } };
  },
};
export default scene;
