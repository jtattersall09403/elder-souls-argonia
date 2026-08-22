export type HitShakeKind = "enemyHit" | "enemyHeavyHit" | "playerHit" | "playerHeavyHit" | "block" | "parry" | "execution" | "landing";

export type HitShakeProfile = {
  duration: number;
  position: number;
  rotation: number;
};

export type HitShakeImpulse = {
  elapsed: number;
  profile: HitShakeProfile;
  seed: number;
  side: number;
};

export type HitShakeSample = {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
};

export const HIT_SHAKE_PROFILES: Record<HitShakeKind, HitShakeProfile> = {
  enemyHit: { duration: 0.16, position: 0.028, rotation: 0.006 },
  enemyHeavyHit: { duration: 0.25, position: 0.058, rotation: 0.011 },
  playerHit: { duration: 0.28, position: 0.075, rotation: 0.014 },
  playerHeavyHit: { duration: 0.38, position: 0.115, rotation: 0.022 },
  block: { duration: 0.19, position: 0.04, rotation: 0.008 },
  parry: { duration: 0.22, position: 0.052, rotation: 0.01 },
  execution: { duration: 0.46, position: 0.14, rotation: 0.027 },
  landing: { duration: 0.14, position: 0.015, rotation: 0.0025 },
};

export function createHitShake(kind: HitShakeKind, seed: number, side = 0): HitShakeImpulse {
  return {
    elapsed: 0,
    profile: HIT_SHAKE_PROFILES[kind],
    seed,
    side: Math.max(-1, Math.min(1, side)),
  };
}

export function hitShakeEnvelope(elapsed: number, duration: number) {
  if (duration <= 0 || elapsed < 0 || elapsed >= duration) return 0;
  const progress = elapsed / duration;
  const attack = Math.min(1, elapsed / Math.min(0.025, duration * 0.12));
  return attack * (1 - progress) ** 2;
}

export function sampleHitShake(impulse: HitShakeImpulse): HitShakeSample {
  const { elapsed, profile, seed, side } = impulse;
  const envelope = hitShakeEnvelope(elapsed, profile.duration);
  if (envelope <= 0) return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };

  // Two frequencies per axis produce an impact vibration without frame-to-frame
  // random jumps. The side term gives a small cue for the direction of the hit.
  const wave = (frequency: number, phase: number) =>
    Math.sin(seed * 1.618 + phase + elapsed * frequency) * 0.68
    + Math.sin(seed * 0.733 + phase * 1.91 + elapsed * frequency * 1.83) * 0.32;
  const directionalKick = side * Math.sin(Math.PI * Math.min(1, elapsed / profile.duration));

  return {
    x: profile.position * envelope * (wave(63, 0.2) + directionalKick * 0.42),
    y: profile.position * envelope * wave(79, 1.7) * 0.54,
    z: profile.position * envelope * wave(51, 3.1) * 0.32,
    pitch: profile.rotation * envelope * wave(57, 0.9),
    yaw: profile.rotation * envelope * (wave(71, 2.4) + directionalKick * 0.35),
    roll: profile.rotation * envelope * (wave(47, 4.2) * 0.55 - directionalKick * 0.48),
  };
}
