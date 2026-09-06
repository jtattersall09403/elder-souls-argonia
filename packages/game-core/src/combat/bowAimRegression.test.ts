import { expect, it } from "vitest";
import { aimElevation } from "../ai/enemyBow";
import { DEFAULT_ARROW } from "../equipment/arrows";
import { integrateTrajectory } from "./ballistics";
import { LOCOMOTION_STATES, clipConfig } from "../anim/animationManifest";

it("can aim downhill and compensate the same gravity used by the projectile",()=>{
  const arrow=DEFAULT_ARROW.physics;
  const elevation=aimElevation(40,arrow,12,-2,1);
  expect(elevation).not.toBeNull();
  expect(elevation!).toBeLessThan(0);
  const flight=integrateTrajectory(40,elevation!,arrow,{launchHeightMeters:3,sampleEvery:.001});
  const nearest=flight.samples.reduce((a,b)=>Math.abs(a.x-12)<Math.abs(b.x-12)?a:b);
  expect(nearest.y).toBeCloseTo(1,1);
  expect(aimElevation(40,arrow,12,-2,2)!).toBeGreaterThan(elevation!);
  expect(aimElevation(2,arrow,50,0)).toBeNull();
});
it("every drawn stride uses a repeating locomotion clock",()=>{
  for(const state of ["BOW_DRAWN_WALK","BOW_DRAWN_WALK_BACK","BOW_DRAWN_STRAFE_LEFT","BOW_DRAWN_STRAFE_RIGHT"] as const){
    expect(LOCOMOTION_STATES.has(state)).toBe(true);
    expect(clipConfig(state).looping).toBe(true);
    expect(clipConfig(state).groundTrack?.length).toBeGreaterThan(10);
  }
});
