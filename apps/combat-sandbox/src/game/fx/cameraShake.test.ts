import { describe, expect, it } from "vitest";
import { HIT_SHAKE_PROFILES, createHitShake, hitShakeEnvelope, sampleHitShake } from "./cameraShake";

describe("hit camera shake", () => {
  it("uses a stronger and longer impulse when the player is hit", () => {
    expect(HIT_SHAKE_PROFILES.playerHit.position).toBeGreaterThan(HIT_SHAKE_PROFILES.enemyHit.position);
    expect(HIT_SHAKE_PROFILES.playerHit.rotation).toBeGreaterThan(HIT_SHAKE_PROFILES.enemyHit.rotation);
    expect(HIT_SHAKE_PROFILES.playerHit.duration).toBeGreaterThan(HIT_SHAKE_PROFILES.enemyHit.duration);
  });

  it("scales heavy blows and critical attacks above normal hits", () => {
    expect(HIT_SHAKE_PROFILES.playerHeavyHit.position).toBeGreaterThan(HIT_SHAKE_PROFILES.playerHit.position);
    expect(HIT_SHAKE_PROFILES.enemyHeavyHit.position).toBeGreaterThan(HIT_SHAKE_PROFILES.enemyHit.position);
    expect(HIT_SHAKE_PROFILES.execution.position).toBeGreaterThan(HIT_SHAKE_PROFILES.playerHeavyHit.position);
  });

  it("uses a valid landing impulse that is subtler than a normal hit", () => {
    const landing = createHitShake("landing", 5);
    expect(landing.profile).toEqual(HIT_SHAKE_PROFILES.landing);
    expect(landing.profile.duration).toBeGreaterThan(0);
    expect(landing.profile.position).toBeGreaterThan(0);
    expect(landing.profile.rotation).toBeGreaterThan(0);
    expect(landing.profile.duration).toBeLessThan(HIT_SHAKE_PROFILES.enemyHit.duration);
    expect(landing.profile.position).toBeLessThan(HIT_SHAKE_PROFILES.enemyHit.position);
    expect(landing.profile.rotation).toBeLessThan(HIT_SHAKE_PROFILES.enemyHit.rotation);
  });

  it("has a fast attack and decays completely by the end of the impulse", () => {
    const duration = HIT_SHAKE_PROFILES.playerHit.duration;
    expect(hitShakeEnvelope(0, duration)).toBe(0);
    expect(hitShakeEnvelope(0.025, duration)).toBeGreaterThan(hitShakeEnvelope(duration * 0.5, duration));
    expect(hitShakeEnvelope(duration, duration)).toBe(0);
  });

  it("returns deterministic six-axis displacement within the configured amplitude", () => {
    const impulse = createHitShake("enemyHit", 3, 0.5);
    impulse.elapsed = 0.04;
    const first = sampleHitShake(impulse);
    const second = sampleHitShake(impulse);
    expect(first).toEqual(second);
    expect(Math.abs(first.x)).toBeLessThan(HIT_SHAKE_PROFILES.enemyHit.position * 1.5);
    expect(Math.abs(first.pitch)).toBeLessThan(HIT_SHAKE_PROFILES.enemyHit.rotation * 1.5);
  });
});
