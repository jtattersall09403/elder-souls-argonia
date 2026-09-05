import { describe, expect, it } from "vitest";

import { WEAPON_CLASSES } from "../equipment/weaponClasses";
import type { RangedStats } from "../equipment/types";
import { NEUTRAL_RANGED_MODIFIERS } from "./ballistics";
import {
  AIM_RAISE_SECONDS,
  IDLE_BOW_CYCLE,
  advanceBowCycle,
  aimBlend,
  bowPose,
  isAiming,
  nockedArrowVisible,
  NOCK_REVEAL_FRACTION,
  type BowCycle,
  type BowInput,
} from "./bowShot";

const BOW = WEAPON_CLASSES.longbow.ranged as RangedStats;

const NOTHING: BowInput = { aimPressed: false, aimHeld: false, exitPressed: false };
const TAP: BowInput = { aimPressed: true, aimHeld: true, exitPressed: false };
const HOLDING: BowInput = { aimPressed: false, aimHeld: true, exitPressed: false };
const EXIT: BowInput = { aimPressed: false, aimHeld: false, exitPressed: true };

/** Run frames until `stop` says so, returning everything that happened. */
function run(
  cycle: BowCycle,
  input: BowInput | ((cycle: BowCycle, frame: number) => BowInput),
  frames: number,
  stamina = 100,
  modifiers = NEUTRAL_RANGED_MODIFIERS,
) {
  const dt = 1 / 60;
  let state = cycle;
  let spent = 0;
  const shots: { drawFraction: number }[] = [];
  let remaining = stamina;
  for (let frame = 0; frame < frames; frame += 1) {
    const next = typeof input === "function" ? input(state, frame) : input;
    const step = advanceBowCycle(state, next, BOW, remaining, dt, modifiers);
    state = step.cycle;
    spent += step.staminaSpent;
    remaining = Math.max(0, remaining - step.staminaSpent);
    if (step.shot) shots.push(step.shot);
  }
  return { cycle: state, spent, shots, remaining };
}

describe("raising the bow", () => {
  it("does nothing until the aim button is tapped", () => {
    expect(run(IDLE_BOW_CYCLE, NOTHING, 60).cycle.phase).toBe("lowered");
  });

  it("raises, nocks and settles ready without the opening tap starting a draw", () => {
    // The tap that raises the bow is still held on the next frame. It must not
    // run straight on into a pull the player never asked for.
    const raised = run(IDLE_BOW_CYCLE, TAP, 2);
    expect(raised.cycle.phase).toBe("raising");
    expect(raised.cycle.drawArmed).toBe(false);

    const settled = run(IDLE_BOW_CYCLE, (cycle, frame) => (frame === 0 ? TAP : NOTHING), 400);
    expect(settled.cycle.phase).toBe("ready");
    expect(settled.shots).toHaveLength(0);
  });

  it("blends the camera over the raise and holds at first person after", () => {
    expect(aimBlend(IDLE_BOW_CYCLE)).toBe(0);
    const mid = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : NOTHING),
      Math.round((AIM_RAISE_SECONDS / 2) * 60));
    expect(aimBlend(mid.cycle)).toBeGreaterThan(0.3);
    expect(aimBlend(mid.cycle)).toBeLessThan(0.8);
    const done = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : NOTHING), 400);
    expect(aimBlend(done.cycle)).toBe(1);
  });

  it("lowers on the exit button from any phase", () => {
    const ready = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : NOTHING), 400).cycle;
    const step = advanceBowCycle(ready, EXIT, BOW, 100, 1 / 60);
    expect(step.cycle).toEqual(IDLE_BOW_CYCLE);
    expect(step.exited).toBe(true);
    expect(isAiming(step.cycle)).toBe(false);
  });
});

describe("drawing", () => {
  /** Raise, wait out the nock, then hold the button for `holdSeconds`. */
  function drawFor(holdSeconds: number, stamina = 1000) {
    const ready = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : NOTHING), 400).cycle;
    return run(ready, (_, frame) => (frame < holdSeconds * 60 ? HOLDING : NOTHING),
      Math.round(holdSeconds * 60) + 2, stamina);
  }

  it("reaches full draw in the bow's own draw time and no sooner", () => {
    expect(drawFor(BOW.drawSeconds * 0.5).shots[0].drawFraction).toBeLessThan(0.6);
    const full = drawFor(BOW.drawSeconds + 0.2);
    expect(full.shots[0].drawFraction).toBe(1);
  });

  it("holds at full draw rather than overdrawing", () => {
    expect(drawFor(BOW.drawSeconds * 2).shots[0].drawFraction).toBe(1);
  });

  it("fires on release, once", () => {
    expect(drawFor(1.5).shots).toHaveLength(1);
  });

  it("refuses to loose below the bow's minimum draw", () => {
    const twitch = drawFor(BOW.drawSeconds * BOW.minimumReleaseFraction * 0.5);
    expect(twitch.shots).toHaveLength(0);
    expect(twitch.cycle.phase).toBe("ready");
  });

  it("drains stamina while the string is back", () => {
    const brief = drawFor(0.5);
    const long = drawFor(2);
    expect(brief.spent).toBeGreaterThan(0);
    expect(long.spent).toBeGreaterThan(brief.spent * 2);
  });

  it("lets an exhausted draw slip home instead of firing", () => {
    // Barely any stamina: the pull starts, stalls and creeps back.
    const collapsed = drawFor(BOW.drawSeconds, 1);
    expect(collapsed.shots).toHaveLength(0);
    expect(collapsed.cycle.phase).toBe("ready");
  });
});

describe("the cycle after a shot", () => {
  it("makes the archer nock again before the next draw", () => {
    const ready = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : NOTHING), 400).cycle;
    const holdFrames = Math.round((BOW.drawSeconds + 0.2) * 60);
    const shot = run(ready, (_, frame) => (frame < holdFrames ? HOLDING : NOTHING), holdFrames + 2);
    expect(shot.shots).toHaveLength(1);
    expect(shot.cycle.phase).toBe("loosed");

    // Holding the button straight through the follow-through must not fire
    // again the instant the arrow is on the string.
    const straightOn = run(shot.cycle, HOLDING,
      Math.round((BOW.releaseRecoverySeconds + BOW.nockSeconds + BOW.drawSeconds) * 60));
    expect(straightOn.shots).toHaveLength(0);
  });

  it("takes about the historical cadence for a full aimed shot", () => {
    const dt = 1 / 60;
    let state: BowCycle = IDLE_BOW_CYCLE;
    let seconds = 0;
    let fired = false;
    // Tap to raise, then pull as soon as the arrow is on the string.
    for (let frame = 0; frame < 60 * 20 && !fired; frame += 1) {
      const pulling = state.phase === "ready" || (state.phase === "drawing" && state.drawFraction < 1);
      const input: BowInput = {
        aimPressed: frame === 0,
        aimHeld: frame === 0 || pulling,
        exitPressed: false,
      };
      const step = advanceBowCycle(state, input, BOW, 1000, dt);
      state = step.cycle;
      seconds += dt;
      if (step.shot) fired = true;
    }
    expect(fired).toBe(true);
    // Raise, nock, draw: within the longbow's 4-6 s band plus the raise.
    expect(seconds).toBeGreaterThan(BOW.nockSeconds + BOW.drawSeconds);
    expect(seconds).toBeLessThan(BOW.nockSeconds + BOW.drawSeconds + AIM_RAISE_SECONDS + 0.4);
  });
});

describe("player-stat hooks", () => {
  function drawWith(modifiers: typeof NEUTRAL_RANGED_MODIFIERS, holdSeconds: number) {
    const ready = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : NOTHING), 400).cycle;
    return run(ready, (_, frame) => (frame < holdSeconds * 60 ? HOLDING : NOTHING),
      Math.round(holdSeconds * 60) + 2, 1000, modifiers);
  }

  it("lets a faster archer reach full draw sooner", () => {
    const quick = drawWith({ ...NEUTRAL_RANGED_MODIFIERS, drawSpeed: 2 }, BOW.drawSeconds * 0.6);
    const normal = drawWith(NEUTRAL_RANGED_MODIFIERS, BOW.drawSeconds * 0.6);
    expect(quick.shots[0].drawFraction).toBeGreaterThan(normal.shots[0].drawFraction);
  });

  it("caps a weak archer short of full draw however long they hold", () => {
    const weak = drawWith({ ...NEUTRAL_RANGED_MODIFIERS, drawStrength: 0.6 }, BOW.drawSeconds * 3);
    expect(weak.shots[0].drawFraction).toBeCloseTo(0.6, 5);
  });
});

describe("death outranks the aim", () => {
  it("lowers a drawn bow the moment the archer is interrupted", () => {
    const drawn = run(IDLE_BOW_CYCLE, (_, frame) => (frame === 0 ? TAP : HOLDING), 400).cycle;
    expect(isAiming(drawn)).toBe(true);
    const killed = advanceBowCycle(
      drawn,
      { aimPressed: false, aimHeld: true, exitPressed: false, interrupted: true },
      BOW,
      1000,
      1 / 60,
    );
    expect(isAiming(killed.cycle)).toBe(false);
    expect(killed.exited).toBe(true);
    // And the aim cannot re-open while the interruption stands, however hard
    // the button is held: this is what stopped a dead archer shooting.
    const after = advanceBowCycle(
      killed.cycle,
      { aimPressed: true, aimHeld: true, exitPressed: false, interrupted: true },
      BOW,
      1000,
      1 / 60,
    );
    expect(isAiming(after.cycle)).toBe(false);
    expect(after.shot).toBeNull();
  });
});

describe("the shaft comes out of the quiver", () => {
  it("shows nothing on the string until the hand has been back for it", () => {
    expect(nockedArrowVisible({ ...IDLE_BOW_CYCLE, phase: "ready" })).toBe(false);
    expect(nockedArrowVisible({
      ...IDLE_BOW_CYCLE, phase: "drawing", drawFraction: NOCK_REVEAL_FRACTION * 0.5,
    })).toBe(false);
    expect(nockedArrowVisible({
      ...IDLE_BOW_CYCLE, phase: "drawing", drawFraction: 1,
    })).toBe(true);
  });
});

describe("moving with the bow up", () => {
  const PROFILE = {
    idle: "BOW_IDLE", draw: "BOW_DRAW", drawn: "BOW_DRAWN", release: "BOW_RELEASE",
    locomotion: {
      walk: "BOW_WALK", walkBack: "BOW_WALK_BACK",
      strafeLeft: "BOW_STRAFE_LEFT", strafeRight: "BOW_STRAFE_RIGHT", run: "BOW_RUN",
    },
    drawnLocomotion: {
      walk: "BOW_DRAWN_WALK", walkBack: "BOW_DRAWN_WALK_BACK",
      strafeLeft: "BOW_DRAWN_STRAFE_LEFT", strafeRight: "BOW_DRAWN_STRAFE_RIGHT",
    },
  } as const;

  it("strides on the drawn set while the bow is raised", () => {
    const ready: BowCycle = { ...IDLE_BOW_CYCLE, phase: "ready" };
    expect(bowPose(ready, PROFILE, "strafeLeft").animation).toBe("BOW_DRAWN_STRAFE_LEFT");
    expect(bowPose(ready, PROFILE, "walkBack").animation).toBe("BOW_DRAWN_WALK_BACK");
    // No drawn run exists in vanilla, and an archer at draw does not run.
    expect(bowPose(ready, PROFILE, "run").animation).toBe("BOW_DRAWN_WALK");
  });

  it("keeps the carry set when the bow is down", () => {
    expect(bowPose(IDLE_BOW_CYCLE, PROFILE, "run").animation).toBe("BOW_RUN");
    expect(bowPose(IDLE_BOW_CYCLE, PROFILE, "strafeRight").animation).toBe("BOW_STRAFE_RIGHT");
  });

  it("holds the draw pose standing still, where its clip time is the draw", () => {
    const drawing: BowCycle = { ...IDLE_BOW_CYCLE, phase: "drawing", drawFraction: 0.5 };
    const pose = bowPose(drawing, PROFILE, "still");
    expect(pose.animation).toBe("BOW_DRAW");
    expect(pose.clipTime).toBeGreaterThan(0);
  });
});
