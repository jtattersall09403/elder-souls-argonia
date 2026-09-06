import { describe, expect, it } from "vitest";
import { toEpochMinutes } from "@elder-souls/world-time";
import { computeLightRig } from "../../../../../apps/world-studio/src/sky/lightRig";
import { WaterEffects } from "./WaterEffects";
import { waterParticleRadiance } from "./waterParticleLighting";

describe("water particle HDR lighting", () => {
  it("keeps spray in the same radiometric space as the actual noon and moonlit sky rigs", () => {
    for (const [month, day, hour] of [[7, 17, 12], [5, 4, 23]]) {
      const epoch = toEpochMinutes({ era: 4, year: 201, month, day, minuteOfDay: hour * 60 });
      const rig = computeLightRig(epoch, 0.7, 0.4);
      const vector = (v: number[]) => ({ x: v[0], y: v[1], z: v[2] });
      const fx = new WaterEffects();
      fx.setIllumination(vector(rig.hazeAmbient), vector(rig.hazeSunLight), rig.sun.direction.y, rig.exposureTarget);
      const light = fx.diagnostics.illumination;
      const screenLuminance = light.exposedLinear.x * 0.2126 + light.exposedLinear.y * 0.7152 + light.exposedLinear.z * 0.0722;
      expect(screenLuminance).toBeGreaterThan(0.004);
      expect(screenLuminance).toBeLessThan(2);
      if (hour === 12) {
        expect(light.radiance.x).toBeGreaterThan(1000);
        // The previous 1.4 cap would crush the very same white material.
        expect(1.4 * rig.exposureTarget).toBeLessThan(screenLuminance / 100);
      }
      const material = fx.object3d.material;
      expect(material.toneMapped).toBe(true);
      expect(material.fragmentShader.match(/#include <tonemapping_fragment>/g)).toHaveLength(1);
      expect(material.fragmentShader.match(/#include <colorspace_fragment>/g)).toHaveLength(1);
      const crown = fx.object3d.children[0] as typeof fx.object3d;
      expect(crown.material.uniforms.lightColor).toBe(material.uniforms.lightColor);
      expect(crown.material.fragmentShader.match(/#include <tonemapping_fragment>/g)).toHaveLength(1);
      fx.dispose();
    }
  });

  it("retains the source colour and scales linearly, without an emissive white floor or display clamp", () => {
    const black = { x: 0, y: 0, z: 0 };
    expect(waterParticleRadiance(black, black, 1)).toEqual(black);
    const fx = new WaterEffects(); fx.setIllumination(black, black, -1, 20);
    expect(fx.diagnostics.illumination.visibility).toBe(0);
    expect(fx.object3d.material.uniforms.lightVisibility.value).toBe(0);
    expect(fx.object3d.material.fragmentShader).toContain("soft * lightVisibility");
    fx.dispose();
    const ambient = { x: 100, y: 80, z: 60 }, direct = { x: 2000, y: 1800, z: 1400 };
    const a = waterParticleRadiance(ambient, direct, 1);
    const b = waterParticleRadiance({ x: 200, y: 160, z: 120 }, { x: 4000, y: 3600, z: 2800 }, 1);
    expect(b.x).toBeCloseTo(a.x * 2); expect(a.x).toBeGreaterThan(a.z);
  });
});
