import { describe, expect, it } from "vitest";
import {
  SWIM_ENTER_IMMERSION,
  SWIM_LEAVE_IMMERSION,
  SWIM_REFERENCE_SPEED,
  SWIM_SAMPLE_ABOVE_BODY_CENTRE,
  buoyancyStep,
  swimBodyTarget,
  swimClipFor,
  swimStateFor,
  swimStrokeRate,
  swimVelocity,
  swimVerticalStep,
} from "./swim";

describe("swimStateFor (hysteresis, decision 0093)", () => {
  it("enters at immersion 0.62 and not below", () => {
    expect(SWIM_ENTER_IMMERSION).toBe(0.62);
    expect(swimStateFor({ immersion: 0.62, grounded: true, current: "grounded" })).toBe("swim");
    expect(swimStateFor({ immersion: 0.61, grounded: false, current: "grounded" })).toBe("grounded");
    expect(swimStateFor({ immersion: 1, grounded: false, current: "grounded" })).toBe("swim");
  });

  it("samples at the top of the 1.7 m body column: 0.62 is water 1.05 m deep, 0.45 is 0.765 m", () => {
    expect(SWIM_SAMPLE_ABOVE_BODY_CENTRE).toBeCloseTo(0.8, 10);
    // WaterWorld's immersion at the column top, feet at 0: (depth − 1.7) / 1.7 + 1 = depth / 1.7.
    expect(1.054 / 1.7).toBeCloseTo(SWIM_ENTER_IMMERSION, 3);
    expect(0.765 / 1.7).toBeCloseTo(SWIM_LEAVE_IMMERSION, 3);
  });

  it("leaves only under 0.45 with the feet on ground", () => {
    expect(SWIM_LEAVE_IMMERSION).toBe(0.45);
    expect(swimStateFor({ immersion: 0.44, grounded: true, current: "swim" })).toBe("grounded");
    expect(swimStateFor({ immersion: 0.44, grounded: false, current: "swim" })).toBe("swim");
    expect(swimStateFor({ immersion: 0.45, grounded: true, current: "swim" })).toBe("swim");
    // Between the thresholds a swimmer keeps swimming and a walker keeps walking.
    expect(swimStateFor({ immersion: 0.5, grounded: true, current: "swim" })).toBe("swim");
    expect(swimStateFor({ immersion: 0.5, grounded: true, current: "grounded" })).toBe("grounded");
  });
});

describe("swimVelocity", () => {
  it("swims at the stats model's reference speed, 1.60 m/s at Athletics 50", () => {
    expect(SWIM_REFERENCE_SPEED).toBeCloseTo(1.6, 10);
  });

  it("is camera-relative, as the walk: stick up with the camera behind a -z facing goes -z", () => {
    // cameraRelativeDirection(yaw 0) maps stick (0, 1) to world (0, 0, -1).
    const v = swimVelocity({ x: 0, y: 1 }, 0, 1.6);
    expect(v.x).toBeCloseTo(0, 10);
    expect(v.z).toBeCloseTo(-1.6, 10);
  });

  it("scales with the stick and never exceeds the speed", () => {
    const half = swimVelocity({ x: 0.5, y: 0 }, 0, 1.6);
    expect(Math.hypot(half.x, half.z)).toBeCloseTo(0.8, 10);
    const corner = swimVelocity({ x: 1, y: 1 }, 0.7, 1.6);
    expect(Math.hypot(corner.x, corner.z)).toBeCloseTo(1.6, 10);
    expect(swimVelocity({ x: 0, y: 0 }, 1, 1.6)).toEqual({ x: 0, z: 0 });
  });
});

describe("swimStrokeRate", () => {
  it("is 1 up to half stick (vanilla's slow stroke), 2 at full stick (the fast stroke), linear between", () => {
    expect(swimStrokeRate(0)).toBe(1);
    expect(swimStrokeRate(0.5)).toBe(1);
    expect(swimStrokeRate(0.75)).toBeCloseTo(1.5, 10);
    expect(swimStrokeRate(1)).toBe(2);
    expect(swimStrokeRate(1.4)).toBe(2);
  });
});

describe("swimClipFor (dominant direction in body space)", () => {
  const facingNegZ = { x: 0, z: -1 };
  it("treads water when the stick is still", () => {
    expect(swimClipFor({ x: 0, z: 0 }, facingNegZ, 0)).toBe("SWIM_IDLE");
    expect(swimClipFor({ x: 0, z: -0.05 }, facingNegZ, 0.05)).toBe("SWIM_IDLE");
  });

  it("picks forward, back, left or right by the larger body-space component", () => {
    expect(swimClipFor({ x: 0.2, z: -1 }, facingNegZ, 1)).toBe("SWIM_FORWARD");
    expect(swimClipFor({ x: 0.2, z: 1 }, facingNegZ, 1)).toBe("SWIM_BACK");
    // Facing -z, the body's right is +x.
    expect(swimClipFor({ x: 1, z: -0.2 }, facingNegZ, 1)).toBe("SWIM_RIGHT");
    expect(swimClipFor({ x: -1, z: -0.2 }, facingNegZ, 1)).toBe("SWIM_LEFT");
    // Facing +z, the body's right is -x.
    expect(swimClipFor({ x: -1, z: 0 }, { x: 0, z: 1 }, 1)).toBe("SWIM_RIGHT");
  });
});

describe("swimBodyTarget", () => {
  it("holds the chest (0.35 m above the body centre) at the surface over deep water", () => {
    expect(swimBodyTarget(-0.2, null)).toBeCloseTo(-0.55, 10);
    expect(swimBodyTarget(-0.2, -2.4)).toBeCloseTo(-0.55, 10);
  });

  it("stands the body on ground the feet reach rather than pulling it through", () => {
    // Ground 0.5 m under the surface: the standing body centre (0.9 m up) is higher.
    expect(swimBodyTarget(-0.2, -0.7)).toBeCloseTo(0.2, 10);
  });
});

describe("buoyancyStep (critically damped, 8 rad/s)", () => {
  function run(offset: number, velocity: number, seconds: number) {
    const dt = 1 / 60;
    let e = offset;
    let v = velocity;
    let min = e;
    let max = e;
    const trace: number[] = [];
    for (let t = 0; t < seconds; t += dt) {
      const step = buoyancyStep(e, v, dt);
      e += step.velocity * dt;
      v = step.nextVelocity;
      min = Math.min(min, e);
      max = Math.max(max, e);
      trace.push(e);
    }
    return { e, min, max, trace };
  }

  it("absorbs an 8 m/s plunge with the chest dipping under 3 cm below the surface", () => {
    const r = run(0.646, -8, 2);
    expect(r.min).toBeGreaterThan(-0.03);
    expect(Math.abs(r.e)).toBeLessThan(0.001);
  });

  it("rises to the surface from below without bobbing past it by 3 cm", () => {
    const r = run(-0.3, 0, 2);
    expect(r.max).toBeLessThan(0.03);
    expect(Math.abs(r.e)).toBeLessThan(0.001);
  });

  it("settles from above without overshooting by 3 cm", () => {
    const r = run(0.5, 0, 2);
    expect(r.min).toBeGreaterThan(-0.03);
  });

  it("is within 1 cm of the surface a second after a still start 0.3 m off", () => {
    const r = run(0.3, 0, 1);
    expect(Math.abs(r.e)).toBeLessThan(0.01);
  });
});

describe("swimVerticalStep", () => {
  const dt = 1 / 60;
  it("floats on the spring over deep water", () => {
    const step = swimVerticalStep({ bodyY: -0.3, surfaceHeight: -0.2, groundHeight: null, floatVelocity: 0, dt });
    expect(step).toEqual(buoyancyStep(-0.3 - swimBodyTarget(-0.2, null), 0, dt));
  });

  it("stands at once on ground the feet reach, with no lag up a ramp", () => {
    // Ground 0.4 m under the surface: standing height (0.9 m) is above the float target.
    const step = swimVerticalStep({ bodyY: 0.35, surfaceHeight: -0.2, groundHeight: -0.6, floatVelocity: 0, dt });
    expect(step.velocity).toBeCloseTo((0.3 - 0.35) / dt, 10);
    expect(step.nextVelocity).toBeCloseTo(step.velocity, 10);
  });

  it("keeps floating where the ground is too deep to stand on", () => {
    const step = swimVerticalStep({ bodyY: -0.55, surfaceHeight: -0.2, groundHeight: -1.5, floatVelocity: 0, dt });
    expect(step.velocity).toBeCloseTo(0, 10);
  });
});
