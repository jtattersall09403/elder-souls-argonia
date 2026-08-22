import { describe, expect, it } from "vitest";
import {
  compareAnimationProgression,
  evaluateAnimationTransitionMotion,
  evaluateBackstabWeaponRole,
  evaluateCriticalRecovery,
  evaluateCriticalDeathHold,
  evaluateGuardBreakPosture,
  evaluateRipostePhases,
  evaluateVisualFrames,
  evaluateWeaponContactAtDamage,
  quaternionAngularDistanceDegrees,
  quaternionWorldUpTiltDegrees,
} from "./visual-validation.mjs";

const point = (
  position = [0, 1, 0],
  quaternion = [0, 0, 0, 1],
  worldQuaternion,
) => ({
  position,
  quaternion,
  ...(worldQuaternion ? { worldQuaternion } : {}),
});

const zRotation = (degrees) => {
  const radians = degrees * Math.PI / 180;
  return [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)];
};

const rotateZ = ([x, y, z], degrees) => {
  const radians = degrees * Math.PI / 180;
  return [
    x * Math.cos(radians) - y * Math.sin(radians),
    x * Math.sin(radians) + y * Math.cos(radians),
    z,
  ];
};

const translate = (pointValue, translation) => pointValue.map((value, index) => value + translation[index]);

function sample({
  animation = "ROLL",
  clipTime = 0.1,
  meshGap = 0,
  correction = 0,
  supportMode = "penetration",
  actorBaseY = 0,
  bones = { pelvis: point(), head: point([0, 1.7, 0]) },
  weaponGrip = [0, 1, 0],
  weaponTip = [0, 1, 0.92],
  commandSerial = 0,
  rootWorldQuaternion = [0, 0, 0, 1],
  actionWeight = 1,
  blendedSupportProxy = false,
} = {}) {
  return {
    animation,
    commandSerial,
    clip: animation,
    clipTime,
    actionWeight,
    outgoingClip: null,
    outgoingActionWeight: 0,
    rootOffsetY: 0,
    rootWorldQuaternion,
    groundCorrectionY: correction,
    supportMode,
    blendedSupportProxy,
    actorBaseY,
    groundY: 0,
    soleGap: 0,
    meshGap,
    meshTop: 1.8,
    bones,
    weaponGrip,
    weaponTip,
  };
}

function frame(time, player, enemy = null) {
  return { time, player, enemy };
}

describe("rendered-pose visual metrics", () => {
  it("treats q and -q as the same rotation", () => {
    expect(quaternionAngularDistanceDegrees([0, 0, 0, 1], [0, 0, 0, -1])).toBeCloseTo(0);
  });

  it("measures actor world-up independently of yaw and tolerates only sub-degree noise", () => {
    const radians = 0.2 * Math.PI / 180;
    expect(quaternionWorldUpTiltDegrees([0, 1, 0, 6.123234262925839e-17])).toBeCloseTo(0);
    expect(quaternionWorldUpTiltDegrees([
      Math.sin(radians / 2),
      0,
      0,
      Math.cos(radians / 2),
    ])).toBeCloseTo(0.2);
  });

  it("rejects the known 3-9 degree actor-root tilt regression for both actors", () => {
    const tilted = (degrees, axis) => {
      const radians = degrees * Math.PI / 180;
      const halfSine = Math.sin(radians / 2);
      return axis === "x"
        ? [halfSine, 0, 0, Math.cos(radians / 2)]
        : [0, 0, halfSine, Math.cos(radians / 2)];
    };
    const telemetry = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(
        time,
        sample({ rootWorldQuaternion: tilted(3.2, "x") }),
        sample({ animation: "SWORD_IDLE", rootWorldQuaternion: tilted(9.4, "z") }),
      )),
    };
    const result = evaluateVisualFrames("actor-root-tilt", telemetry, {
      playerAnimations: ["ROLL"],
      enemyAnimations: ["SWORD_IDLE"],
    });

    expect(result.pass).toBe(false);
    expect(result.actorOrientationLimits.maxWorldUpTiltDegrees).toBe(1);
    expect(result.actors.player.maxWorldUpTiltDegrees).toBeCloseTo(3.2);
    expect(result.actors.enemy.maxWorldUpTiltDegrees).toBeCloseTo(9.4);
    expect(result.failures.join(" ")).toMatch(/player root world-up tilt/);
    expect(result.failures.join(" ")).toMatch(/enemy root world-up tilt/);
  });

  it("fails closed when an actor root orientation is missing", () => {
    const player = sample();
    delete player.rootWorldQuaternion;
    const result = evaluateVisualFrames("missing-actor-root", {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, player)),
    }, {
      playerAnimations: ["ROLL"],
      enemyAnimations: [],
    });

    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/root world-up orientation was not measurable/);
  });

  it("rejects focused combat staging when rigid-body centres collapse into overlap", () => {
    const visualFrames = [0.1, 0.133, 0.166].map((time, index) => ({
      ...frame(time, sample(), sample({ animation: "SWORD_IDLE" })),
      actorDistance: [1.6, 0.74, 0.92][index],
    }));
    const result = evaluateVisualFrames("focused-contact", { visualFrames }, {
      playerAnimations: ["ROLL"],
      enemyAnimations: ["SWORD_IDLE"],
      actorSeparation: { minDistanceMeters: 0.78 },
    });

    expect(result.pass).toBe(false);
    expect(result.actorSeparation).toMatchObject({
      samples: 3,
      minimumMeters: 0.74,
      requiredMinimumMeters: 0.78,
    });
    expect(result.failures.join(" ")).toMatch(/actor centre separation/);
  });

  it("measures root-yaw steps and reversals inside one locomotion run", () => {
    const yaw = (degrees) => {
      const radians = degrees * Math.PI / 180;
      return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
    };
    const visualFrames = [0, 1, 2, 3, 4, 5].map((index) => {
      const time = 0.1 + index / 30;
      return frame(
      time,
      sample({
        animation: "WALK",
        clipTime: time,
        rootWorldQuaternion: yaw([0, 2, 4, 6, -8, -6][index]),
      }),
      );
    });
    const result = evaluateVisualFrames("turn-jitter", { visualFrames }, {
      playerAnimations: ["WALK"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["WALK"],
        bones: ["pelvis"],
        maxRootAngularStepDegrees: 8,
        maxRootAngularJerkDegreesPerSecondSquared: 6000,
      }],
    });

    expect(result.pass).toBe(false);
    expect(result.motionChecks[0].maxRootAngularStepDegrees).toBeCloseTo(14);
    expect(result.motionChecks[0].maxRootAngularJerkDegreesPerSecondSquared).toBeGreaterThan(6000);
    expect(result.failures.join(" ")).toMatch(/root-yaw step/);
    expect(result.failures.join(" ")).toMatch(/root-yaw angular jerk/);
  });

  it("measures the rendered pose across a looping clip-time wrap", () => {
    const yaw = (degrees) => {
      const radians = degrees * Math.PI / 180;
      return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
    };
    const clipTimes = [0.55, 0.58, 0.61, 0.01];
    const headAngles = [0, 3, 6, 60];
    const visualFrames = clipTimes.map((clipTime, index) => frame(
      0.1 + index / 30,
      sample({
        animation: "RUN",
        clipTime,
        commandSerial: 7,
        bones: {
          pelvis: point(),
          head: point([0, 1.7, index === 3 ? 0.5 : 0], yaw(headAngles[index])),
        },
      }),
    ));
    const result = evaluateVisualFrames("run-loop-seam", { visualFrames }, {
      playerAnimations: ["RUN"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["RUN"],
        bones: ["head"],
        minLoopSeams: 1,
        maxLoopBoneAngularStepDegrees: 20,
        maxLoopBonePositionStepMeters: 0.2,
      }],
    });

    expect(result.pass).toBe(false);
    expect(result.motionChecks[0].loopSeams).toBe(1);
    expect(result.motionChecks[0].maxLoopBoneAngularStepDegrees).toBeCloseTo(54);
    expect(result.motionChecks[0].maxLoopBonePositionStepMeters).toBeCloseTo(0.5);
    expect(result.failures.join(" ")).toMatch(/loop-seam bone angular step/);
    expect(result.failures.join(" ")).toMatch(/loop-seam bone position step/);
  });

  it("does not misclassify a same-animation command restart as a loop seam", () => {
    const visualFrames = [
      frame(0.1, sample({ animation: "RUN", clipTime: 0.58, commandSerial: 7 })),
      frame(0.133, sample({ animation: "RUN", clipTime: 0.02, commandSerial: 8 })),
      frame(0.166, sample({ animation: "RUN", clipTime: 0.05, commandSerial: 8 })),
    ];
    const result = evaluateVisualFrames("run-restart", { visualFrames }, {
      playerAnimations: ["RUN"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["RUN"],
        bones: ["head"],
        minLoopSeams: 1,
      }],
    });

    expect(result.motionChecks[0].loopSeams).toBe(0);
    expect(result.failures.join(" ")).toMatch(/sampled 0 loop seams/);
  });

  it("rejects a duplicated looping endpoint that visibly holds the gait at wrap", () => {
    const yaw = (degrees) => {
      const radians = degrees * Math.PI / 180;
      return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
    };
    const frames = [
      [0.55, 0],
      [0.58, 4],
      [0.61, 8],
      [0.01, 8.1],
    ].map(([clipTime, angle], index) => frame(
      0.1 + index / 30,
      sample({
        animation: "RUN",
        clipTime,
        commandSerial: 9,
        bones: {
          pelvis: point(),
          head: point([0, 1.7, 0], yaw(angle)),
        },
      }),
    ));
    const result = evaluateVisualFrames("held-run-wrap", { visualFrames: frames }, {
      playerAnimations: ["RUN"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["RUN"],
        bones: ["head"],
        minLoopSeams: 1,
        minLoopPoseBoneAngularStepDegrees: 1,
      }],
    });

    expect(result.motionChecks[0].minLoopPoseBoneAngularStepDegrees).toBeCloseTo(0.1);
    expect(result.failures.join(" ")).toMatch(/loop-seam visible pose advance/);
  });

  it("passes supported poses and rejects mesh penetration and downward correction", () => {
    const expected = { playerAnimations: ["ROLL"], enemyAnimations: [] };
    const telemetry = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({ clipTime: time }))),
    };
    expect(evaluateVisualFrames("roll", telemetry, expected).pass).toBe(true);

    telemetry.visualFrames[1].player.meshGap = -0.08;
    telemetry.visualFrames[1].player.groundCorrectionY = -0.03;
    const result = evaluateVisualFrames("roll", telemetry, expected);
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/penetrated support/);
    expect(result.failures.join(" ")).toMatch(/negative\/downward/);
  });

  it("audits a blended sole solve against its own allowance, not the authored-pose limit", () => {
    const expected = { playerAnimations: ["ROLL"], enemyAnimations: [] };
    // A heel rotating through a blend can sit below both endpoint clips, so
    // the runtime lifts further than any authored pose demands. That frame is
    // still bounded, and it must not license the same lift on a settled pose.
    const blended = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({
        clipTime: time,
        correction: 0.095,
        blendedSupportProxy: true,
      }))),
    };
    expect(evaluateVisualFrames("backstab", blended, expected).pass).toBe(true);

    const settled = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({
        clipTime: time,
        correction: 0.095,
      }))),
    };
    const settledResult = evaluateVisualFrames("backstab", settled, expected);
    expect(settledResult.pass).toBe(false);
    expect(settledResult.failures.join(" ")).toMatch(/player ground correction 0\.095 exceeded 0\.08/);

    const overBlended = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({
        clipTime: time,
        correction: 0.12,
        blendedSupportProxy: true,
      }))),
    };
    const overResult = evaluateVisualFrames("backstab", overBlended, expected);
    expect(overResult.pass).toBe(false);
    expect(overResult.failures.join(" ")).toMatch(/blended-pose ground correction 0\.12 exceeded 0\.105/);
  });

  it("allows downward correction only for declared floor contact and rejects airborne pinning", () => {
    const expected = { playerAnimations: ["DEATH"], enemyAnimations: [] };
    const floorTelemetry = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({
        animation: "DEATH",
        clipTime: time,
        meshGap: 0.006,
        // Large floor-bound offsets are judged by the actual rendered surface,
        // not by an arbitrary correction magnitude intended for standing clips.
        correction: 0.2,
        supportMode: "floor-contact",
      }))),
    };
    expect(evaluateVisualFrames("death", floorTelemetry, expected).pass).toBe(true);

    floorTelemetry.visualFrames[1].player.meshGap = 0.08;
    expect(evaluateVisualFrames("death", floorTelemetry, expected).failures.join(" "))
      .toMatch(/floor-contact surface gap/);

    const airborneTelemetry = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({
        animation: "DEATH",
        clipTime: time,
        correction: 0.04,
        supportMode: "airborne",
      }))),
    };
    expect(evaluateVisualFrames("airborne", airborneTelemetry, expected).failures.join(" "))
      .toMatch(/airborne ground correction/);
  });

  it("judges Ecctrl suspension compression by the rendered surface, not correction magnitude", () => {
    const expected = { playerAnimations: ["JUMP_IDLE"], enemyAnimations: [] };
    const telemetry = {
      visualFrames: [0.1, 0.133, 0.166].map((time) => frame(time, sample({
        animation: "JUMP_IDLE",
        clipTime: time,
        correction: 0.23,
        supportMode: "airborne",
        actorBaseY: -0.18,
        meshGap: 0,
      }))),
    };
    const result = evaluateVisualFrames("landing-impact", telemetry, expected);
    expect(result.pass).toBe(true);
    expect(result.actors.player.suspensionCompressionSamples).toBe(3);

    telemetry.visualFrames[1].player.meshGap = -0.04;
    expect(evaluateVisualFrames("landing-impact", telemetry, expected).failures.join(" "))
      .toMatch(/penetrated support/);
  });

  it("catches arm rotation steps and jerk on the actual sampled skeleton", () => {
    const q = (degrees) => {
      const radians = degrees * Math.PI / 180;
      return [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
    };
    const times = [0.1, 0.133, 0.166, 0.199];
    const angles = [0, 2, 80, 82];
    const telemetry = {
      visualFrames: times.map((time, index) => frame(time, sample({
        animation: "JUMP_START",
        clipTime: time,
        bones: { upperArmL: point([0, 1.4, 0], q(angles[index])) },
      }))),
    };
    const result = evaluateVisualFrames("moving-landing", telemetry, {
      playerAnimations: ["JUMP_START"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["JUMP_START"],
        bones: ["upperArmL"],
        maxBoneAngularStepDegrees: 20,
        maxBoneAngularJerkDegreesPerSecondSquared: 1000,
      }],
    });
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/angular step/);
    expect(result.failures.join(" ")).toMatch(/angular jerk/);
    expect(result.motionChecks[0].worstBoneAngularStep.bone).toBe("upperArmL");
  });

  it("can isolate a source-clip interval so a brief internal snap cannot hide in whole-action limits", () => {
    const q = (degrees) => {
      const radians = degrees * Math.PI / 180;
      return [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
    };
    const clipTimes = [0.1, 0.2, 0.3, 0.4, 0.5];
    const angles = [0, 80, 82, 84, 164];
    const telemetry = {
      visualFrames: clipTimes.map((clipTime) => frame(clipTime, sample({
        animation: "CRITICAL_KNOCKDOWN",
        clipTime,
        bones: {
          pelvis: point(),
          upperArmL: point([0, 1.4, 0], q(angles[clipTimes.indexOf(clipTime)])),
        },
      }))),
    };
    const result = evaluateVisualFrames("riposte", telemetry, {
      playerAnimations: ["CRITICAL_KNOCKDOWN"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["CRITICAL_KNOCKDOWN"],
        bones: ["upperArmL"],
        sampleMinClipTimeSeconds: 0.15,
        sampleMaxClipTimeSeconds: 0.45,
        maxBoneAngularStepDegrees: 10,
      }],
    });

    expect(result.pass).toBe(true);
    expect(result.motionChecks[0]).toMatchObject({
      samples: 3,
      sampleMinClipTimeSeconds: 0.15,
      sampleMaxClipTimeSeconds: 0.45,
      maxBoneAngularStepDegrees: 2,
    });

    telemetry.visualFrames[3].player.bones.upperArmL.quaternion = q(120);
    const snapped = evaluateVisualFrames("riposte", telemetry, {
      playerAnimations: ["CRITICAL_KNOCKDOWN"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["CRITICAL_KNOCKDOWN"],
        bones: ["upperArmL"],
        sampleMinClipTimeSeconds: 0.15,
        sampleMaxClipTimeSeconds: 0.45,
        maxBoneAngularStepDegrees: 10,
      }],
    });
    expect(snapped.pass).toBe(false);
    expect(snapped.failures.join(" ")).toMatch(/bone angular step/);
  });

  it("measures articulation relative to the pelvis instead of false-flagging physics travel", () => {
    const bonesAt = (rootY, headOffsetY) => ({
      pelvis: point([0, rootY, 0]),
      head: point([0, rootY + headOffsetY, 0]),
    });
    const expected = {
      playerAnimations: ["JUMP_START"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["JUMP_START"],
        bones: ["head"],
        maxBonePositionStepMeters: 0.1,
        maxBoneVerticalSpeedMetersPerSecond: 4,
      }],
    };
    const telemetry = {
      visualFrames: [
        frame(0.1, sample({ animation: "JUMP_START", clipTime: 0.1, bones: bonesAt(0, 1.7) })),
        frame(0.133, sample({ animation: "JUMP_START", clipTime: 0.133, bones: bonesAt(0.4, 1.7) })),
        frame(0.166, sample({ animation: "JUMP_START", clipTime: 0.166, bones: bonesAt(0.8, 1.7) })),
      ],
    };
    expect(evaluateVisualFrames("jump", telemetry, expected).pass).toBe(true);

    telemetry.visualFrames[2].player.bones.head.position[1] += 0.45;
    const snapped = evaluateVisualFrames("jump", telemetry, expected);
    expect(snapped.pass).toBe(false);
    expect(snapped.failures.join(" ")).toMatch(/bone position step|bone vertical speed/);
  });

  it("measures bone displacement in the rotating pelvis frame while retaining real local snaps", () => {
    const pelvisTranslations = [[0, 1, 0], [0.3, 1.2, 0.1], [0.6, 1.4, 0.2]];
    const pelvisDegrees = [0, 45, 90];
    const actorAt = (index, localHeadOffset = [0, 0.7, 0]) => {
      const pelvisPosition = pelvisTranslations[index];
      const pelvisRotation = zRotation(pelvisDegrees[index]);
      const headPosition = translate(rotateZ(localHeadOffset, pelvisDegrees[index]), pelvisPosition);
      return sample({
        animation: "ROLL",
        clipTime: [0.1, 0.133, 0.166][index],
        bones: {
          pelvis: point(pelvisPosition, [0, 0, 0, 1], pelvisRotation),
          head: point(headPosition, [0, 0, 0, 1], pelvisRotation),
        },
      });
    };
    const expected = {
      playerAnimations: ["ROLL"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["ROLL"],
        bones: ["head"],
        maxBonePositionStepMeters: 0.05,
        maxBoneVerticalSpeedMetersPerSecond: 2,
      }],
    };
    const telemetry = {
      visualFrames: [0, 1, 2].map((index) => frame(
        [0.1, 0.133, 0.166][index],
        actorAt(index),
      )),
    };

    const rigidRotation = evaluateVisualFrames("roll", telemetry, expected);
    expect(rigidRotation.pass).toBe(true);
    expect(rigidRotation.motionChecks[0].maxBonePositionStepMeters).toBeCloseTo(0);
    expect(rigidRotation.motionChecks[0].maxBoneVerticalSpeedMetersPerSecond).toBeCloseTo(0);

    telemetry.visualFrames[2].player = actorAt(2, [0, 0.9, 0]);
    const localSnap = evaluateVisualFrames("roll", telemetry, expected);
    expect(localSnap.pass).toBe(false);
    expect(localSnap.motionChecks[0].maxBonePositionStepMeters).toBeCloseTo(0.2);
    expect(localSnap.failures.join(" ")).toMatch(/bone position step|bone vertical speed/);
  });

  it("rejects a one-shot that leaks beyond its authored playback out-point", () => {
    const telemetry = {
      visualFrames: [0.1, 0.2, 0.3].map((time, index) => frame(time, sample({
        animation: "JUMP_START",
        clipTime: [0.2, 0.55, 0.82][index],
      }))),
    };
    const result = evaluateVisualFrames("moving-landing", telemetry, {
      playerAnimations: ["JUMP_START"],
      enemyAnimations: [],
      motionChecks: [{
        actor: "player",
        animations: ["JUMP_START"],
        bones: [],
        maxClipTimeSeconds: 0.6,
      }],
    });
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/clip-time out-point/);
    expect(result.motionChecks[0].maxClipTimeAt).toBe(0.3);
  });
  it("detects launch playback that depends on the predecessor state", () => {
    const telemetry = (multiplier) => ({
      visualFrames: [0.1, 0.2, 0.3, 0.4].map((time) => frame(time, sample({
        animation: "JUMP_START",
        clipTime: (time - 0.1) * multiplier,
      }))),
    });
    expect(compareAnimationProgression(telemetry(1), telemetry(1), {
      animation: "JUMP_START",
    }).pass).toBe(true);
    expect(compareAnimationProgression(telemetry(1), telemetry(2), {
      animation: "JUMP_START",
    }).pass).toBe(false);
  });
});

describe("paired and semantic pose assertions", () => {
  const weaponContactOptions = {
    attackerActor: "player",
    victimActor: "enemy",
    victimHealthField: "enemyHealth",
    attackerAnimation: "RIPOSTE",
    victimReactionAnimation: "RIPOSTED_HIT1",
    maxAttackerBladeDistanceMeters: 0.25,
    minRoleSeparationMeters: 0.15,
    maxEarlyContactLeadSeconds: 0.08,
  };

  const riposteActor = (distance = "far") => sample({
    animation: "RIPOSTE",
    bones: { pelvis: point([0, 1, 0]), spine2: point([0, 1.4, 0]) },
    weaponGrip: distance === "contact" ? [0, 1.1, 0.5] : [2, 1, 0],
    weaponTip: distance === "contact" ? [0, 1.2, 1.3] : [2, 1, 1],
  });
  const riposteVictim = (animation = "GUARD_BREAK", victimBlade = "far") => sample({
    animation,
    bones: { pelvis: point([0, 1, 1]), spine2: point([0, 1.3, 1]) },
    weaponGrip: victimBlade === "contact" ? [0, 1.1, -0.2] : [3, 1, 0],
    weaponTip: victimBlade === "contact" ? [0, 1.2, 0.5] : [3, 1, 1],
  });

  it("gates paired damage on rendered attacker-blade contact at the victim reaction frame", () => {
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0.5, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 1, enemyHealth: 70, enemyAnimation: "RIPOSTED_HIT1" },
      ],
      visualFrames: [
        frame(0.5, riposteActor(), riposteVictim()),
        frame(0.933, riposteActor(), riposteVictim()),
        frame(1, riposteActor("contact"), riposteVictim()),
        frame(1.033, riposteActor("contact"), riposteVictim("RIPOSTED_HIT1")),
      ],
    };
    const result = evaluateWeaponContactAtDamage(telemetry, weaponContactOptions);
    expect(result.pass).toBe(true);
    expect(result.roles).toMatchObject({ attackerActor: "player", victimActor: "enemy" });
    expect(result.contactFrame.attackerBladeToVictimTorsoMeters).toBeLessThan(0.25);
    expect(result.contactFrame.victimBladeToAttackerTorsoMeters).toBeGreaterThan(0.25);
    expect(result.earliestUnacknowledgedContact).toBeNull();
  });

  it("keeps the same blade-contact geometry gate for a direct lethal death handoff", () => {
    const telemetry = {
      enemyHealth: 0,
      events: [
        { time: 0.5, enemyHealth: 40, enemyAnimation: "GUARD_BREAK" },
        { time: 1, enemyHealth: 0, enemyAnimation: "CRITICAL_DEATH" },
      ],
      visualFrames: [
        frame(0.5, riposteActor(), riposteVictim()),
        frame(0.933, riposteActor(), riposteVictim()),
        frame(1, riposteActor("contact"), riposteVictim()),
        frame(1.033, riposteActor("contact"), riposteVictim("CRITICAL_DEATH")),
      ],
    };
    const result = evaluateWeaponContactAtDamage(telemetry, {
      ...weaponContactOptions,
      victimReactionAnimation: "CRITICAL_DEATH",
    });
    expect(result.pass).toBe(true);
    expect(result.contactFrame.attackerBladeToVictimTorsoMeters).toBeLessThan(0.25);
    expect(result.contactFrame.victimClipTime).toBe(0.1);
  });

  it("rejects a distant damage frame and an earlier unacknowledged blade contact", () => {
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0.5, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 2, enemyHealth: 70, enemyAnimation: "RIPOSTED_HIT1" },
      ],
      visualFrames: [
        frame(0.5, riposteActor(), riposteVictim()),
        frame(1, riposteActor("contact"), riposteVictim()),
        frame(2, riposteActor(), riposteVictim()),
        frame(2.033, riposteActor(), riposteVictim("RIPOSTED_HIT1")),
      ],
    };
    const result = evaluateWeaponContactAtDamage(telemetry, weaponContactOptions);
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/damage\/reaction frame/);
    expect(result.failures.join(" ")).toMatch(/unacknowledged contact beat/);
    expect(result.earliestUnacknowledgedContact.leadSeconds).toBe(1);
  });

  it("rejects swapped paired weapon roles even when attacker contact is close", () => {
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0.5, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 1, enemyHealth: 70, enemyAnimation: "RIPOSTED_HIT1" },
      ],
      visualFrames: [
        frame(0.5, riposteActor(), riposteVictim()),
        frame(1, riposteActor("contact"), riposteVictim()),
        frame(1.033, riposteActor("contact"), riposteVictim("RIPOSTED_HIT1", "contact")),
      ],
    };
    const result = evaluateWeaponContactAtDamage(telemetry, weaponContactOptions);
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/role separation/);
  });

  it("uses the rendered swords to distinguish backstab attacker and victim roles", () => {
    const playerBefore = sample({
      animation: "BACKSTAB",
      bones: { pelvis: point([0, 1, 0]), spine2: point([0, 1.4, 0]) },
      weaponGrip: [2, 1, 0],
      weaponTip: [2, 1, 1],
    });
    const playerContact = sample({
      animation: "BACKSTAB",
      bones: { pelvis: point([0, 1, 0]), spine2: point([0, 1.4, 0]) },
      weaponGrip: [0, 1.1, 0.5],
      weaponTip: [0, 1.2, 1.3],
    });
    const enemy = sample({
      animation: "BACKSTABBED",
      bones: { pelvis: point([0, 1, 1]), spine2: point([0, 1.3, 1]) },
      weaponGrip: [3, 1, 0],
      weaponTip: [3, 1, 1],
    });
    const result = evaluateBackstabWeaponRole({
      enemyHealth: 70,
      events: [
        { time: 0.1, enemyHealth: 150 },
        { time: 2, enemyHealth: 70 },
      ],
      visualFrames: [frame(1.55, playerBefore, enemy), frame(1.9, playerContact, enemy), frame(2, playerContact, enemy)],
    });
    expect(result.pass).toBe(true);
    expect(result.playerBladeToEnemyTorso.minimumMeters).toBeLessThan(result.enemyBladeToPlayerTorso.minimumMeters);
  });

  it("requires a stable guard-break lead-in and contact-timed fresh riposte reaction", () => {
    const visualFrames = [];
    for (let index = 0; index < 46; index += 1) {
      const time = 0.5 + index / 30;
      visualFrames.push(frame(time,
        sample({ animation: "RIPOSTE", clipTime: time - 0.5 }),
        sample({ animation: time < 2 ? "GUARD_BREAK" : "RIPOSTED_HIT1", clipTime: time < 2 ? 0.55 : time - 2 }),
      ));
    }
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0.5, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 2, enemyHealth: 70, enemyAnimation: "RIPOSTED_HIT1" },
      ],
      visualFrames,
    };
    const contract = { victimReactionAnimation: "RIPOSTED_HIT1" };
    expect(evaluateRipostePhases(telemetry, contract).pass).toBe(true);
    visualFrames[20].enemy.animation = "SWORD_IDLE";
    expect(evaluateRipostePhases(telemetry, contract).pass).toBe(false);
  });

  it("requires the selected riposte victim source to begin at its immediate hit pose", () => {
    const visualFrames = [];
    for (let index = 0; index < 46; index += 1) {
      const time = 0.5 + index / 30;
      visualFrames.push(frame(time,
        sample({ animation: "RIPOSTE", clipTime: time - 0.5 }),
        sample({
          animation: time < 2 ? "GUARD_BREAK" : "RIPOSTED_HIT1",
          clipTime: time < 2 ? 0.55 : 0.1333 + time - 2,
        }),
      ));
    }
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0.5, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 2, enemyHealth: 70, enemyAnimation: "RIPOSTED_HIT1" },
      ],
      visualFrames,
    };
    const contract = {
      victimReactionAnimation: "RIPOSTED_HIT1",
      minVictimStartClipTimeSeconds: 0.12,
      maxVictimStartClipTimeSeconds: 0.21,
    };

    expect(evaluateRipostePhases(telemetry, contract).pass).toBe(true);
    visualFrames.at(-1).enemy.clipTime = 0.4;
    expect(evaluateRipostePhases(telemetry, contract).pass).toBe(false);
    expect(evaluateRipostePhases(telemetry, contract).failures.join(" ")).toMatch(/expected 0.12–0.21/);
  });

  it("gates the trimmed attacker contact and release against continuous HIT1 source time", () => {
    const visualFrames = Array.from({ length: 28 }, (_, index) => {
      const time = index / 30;
      // Production hit-stop lasts 0.13 wall seconds and advances the shared
      // action clocks at 8% speed. Source continuity must survive that visible
      // impact pause, while release wall time deliberately grows beyond the
      // underlying 0.5333s action-clock boundary.
      const actionTime = time <= 0.4
        ? time
        : time <= 0.5333
          ? 0.4 + (time - 0.4) * 0.08
          : 0.4 + 0.1333 * 0.08 + (time - 0.5333);
      const reacting = actionTime >= 0.4;
      return frame(
        time,
        sample({ animation: "RIPOSTE", clipTime: 0.1667 + actionTime }),
        sample({
          animation: reacting ? "RIPOSTED_HIT1" : "GUARD_BREAK",
          clipTime: reacting ? 0.1333 + actionTime - 0.4 : 0.55,
        }),
      );
    });
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 0.4, enemyHealth: 70, enemyAnimation: "RIPOSTED_HIT1" },
      ],
      visualFrames,
    };
    const contract = {
      victimReactionAnimation: "RIPOSTED_HIT1",
      minVictimStartClipTimeSeconds: 0.12,
      maxVictimStartClipTimeSeconds: 0.21,
      expectedAttackerContactElapsedSeconds: 0.4,
      expectedAttackerContactClipTimeSeconds: 0.5667,
      attackerReleaseClipTimeSeconds: 0.7,
      expectedAttackerReleaseWallElapsedSeconds: 0.6667,
      expectedVictimReleaseClipTimeSeconds: 0.2666,
      maxPhaseTimingErrorSeconds: 0.06,
    };

    const result = evaluateRipostePhases(telemetry, contract);
    expect(result.pass).toBe(true);
    expect(result.attackerContact).toMatchObject({
      elapsedSeconds: 0.4,
      clipTimeSeconds: 0.5667,
    });
    expect(result.releaseContinuity).toMatchObject({
      attackerElapsedSeconds: expect.closeTo(0.6667, 4),
      victimAnimation: "RIPOSTED_HIT1",
      // The first 30 Hz sample at/after the authored 0.7s release is one
      // source step beyond the exact 0.2666s boundary.
      victimClipTimeSeconds: expect.closeTo(0.2773, 4),
    });

    const releaseFrame = visualFrames.find((item) => item.player.clipTime >= 0.7);
    releaseFrame.enemy.clipTime = 0.5;
    const discontinuous = evaluateRipostePhases(telemetry, contract);
    expect(discontinuous.pass).toBe(false);
    expect(discontinuous.failures.join(" ")).toMatch(/victim clip time.*at attacker release/);
  });

  it("rejects a riposte victim that visibly re-rises or delays its authored fall", () => {
    const visualFrames = Array.from({ length: 31 }, (_, index) => {
      const time = index / 30;
      const reacting = time >= 0.4;
      const reactionTime = Math.max(0, time - 0.4);
      return frame(time,
        sample({ animation: "RIPOSTE", clipTime: time }),
        sample({
          animation: reacting ? "CRITICAL_KNOCKDOWN" : "GUARD_BREAK",
          clipTime: reacting ? 0.4 + reactionTime : 0.55,
          supportMode: reacting && reactionTime >= 0.5 ? "airborne" : "penetration",
          bones: {
            pelvis: point([0, 0.9 - reactionTime * 0.2, 0]),
            head: point([0, 1.5 - reactionTime * 0.5, 0]),
          },
        }),
      );
    });
    const telemetry = {
      enemyHealth: 70,
      events: [
        { time: 0, enemyHealth: 150, enemyAnimation: "GUARD_BREAK" },
        { time: 0.4, enemyHealth: 70, enemyAnimation: "CRITICAL_KNOCKDOWN" },
      ],
      visualFrames,
    };
    const contract = {
      minVictimStartClipTimeSeconds: 0.37,
      maxVictimStartClipTimeSeconds: 0.45,
      postBlendMotionWindowSeconds: 0.3,
      maxPostBlendHeadUpwardReboundMeters: 0.05,
      maxPostBlendPelvisUpwardReboundMeters: 0.04,
      maxReactionToAirborneSeconds: 0.65,
    };
    expect(evaluateRipostePhases(telemetry, contract).pass).toBe(true);

    const badPoseFrame = visualFrames.find((item) => Math.abs(item.time - 0.6) < 0.001);
    badPoseFrame.enemy.bones.head.position[1] += 0.2;
    badPoseFrame.enemy.bones.pelvis.position[1] += 0.15;
    const rebounded = evaluateRipostePhases(telemetry, contract);
    expect(rebounded.pass).toBe(false);
    expect(rebounded.failures.join(" ")).toMatch(/head rebounded upward/);
    expect(rebounded.failures.join(" ")).toMatch(/pelvis rebounded upward/);

    badPoseFrame.enemy.bones.head.position[1] -= 0.2;
    badPoseFrame.enemy.bones.pelvis.position[1] -= 0.15;
    for (const item of visualFrames) item.enemy.supportMode = "penetration";
    const delayed = evaluateRipostePhases(telemetry, contract);
    expect(delayed.pass).toBe(false);
    expect(delayed.failures.join(" ")).toMatch(/authored airborne fall/);
  });

  it("requires one continuous critical fall, floor phase, and visible recovery", () => {
    const visualFrames = [frame(
      -1 / 30,
      sample({ animation: "BACKSTAB", clipTime: 2.2 }),
      sample({
        animation: "BACKSTABBED",
        clipTime: 2.2,
        bones: { head: point([0, 1.55, 0]), pelvis: point([0, 0.95, 0]) },
      }),
    )];
    for (let index = 0; index <= 120; index += 1) {
      const clipTime = index / 30;
      const headHeight = clipTime < 1.65
        ? 1.55
        : clipTime < 2.55
          ? 0.55
          : 0.55 + (clipTime - 2.55) * 0.9;
      visualFrames.push(frame(clipTime,
        sample({ animation: "BACKSTAB", clipTime }),
        sample({
          animation: "CRITICAL_KNOCKDOWN",
          clipTime,
          meshGap: clipTime >= 1.65 && clipTime <= 2.55 ? 0.02 : 0.15,
          bones: { head: point([0, headHeight, 0]), pelvis: point([0, Math.max(0.3, headHeight - 0.6), 0]) },
        }),
      ));
    }
    visualFrames.push(frame(4.05, sample(), sample({ animation: "SWORD_IDLE", clipTime: 0.02 })));
    const recoveryOptions = {
      floorContactStartClipTimeSeconds: 1.65,
      floorContactEndClipTimeSeconds: 2.55,
      recoveredPoseStartClipTimeSeconds: 3.45,
      predecessorAnimation: "BACKSTABBED",
      maxTransitionBonePositionStepMeters: 0.18,
      maxTransitionBoneAngularStepDegrees: 30,
    };
    expect(evaluateCriticalRecovery({ visualFrames }, recoveryOptions).pass).toBe(true);

    visualFrames[65].enemy.animation = "DEATH";
    expect(evaluateCriticalRecovery({ visualFrames }, recoveryOptions).pass).toBe(false);
  });

  it("requires a lethal critical to reach and hold its audited prone out-point", () => {
    const visualFrames = [];
    for (let index = 0; index <= 90; index += 1) {
      const time = index / 30;
      const clipTime = Math.min(1.9, 1.433 + time);
      visualFrames.push(frame(time,
        sample({ animation: "RIPOSTE", clipTime: time }),
        sample({
          animation: "CRITICAL_DEATH",
          clipTime,
          meshGap: clipTime >= 1.65 ? 0.01 : 0.12,
          bones: { head: point([0, clipTime >= 1.65 ? 0.55 : 1.4, 0]), pelvis: point([0, 0.35, 0]) },
        }),
      ));
    }
    expect(evaluateCriticalDeathHold({ visualFrames }).pass).toBe(true);
    visualFrames.at(-1).enemy.animation = "SWORD_IDLE";
    expect(evaluateCriticalDeathHold({ visualFrames }).pass).toBe(false);
  });

  it("applies the same prone hold contract to an ordinary player death", () => {
    const visualFrames = [];
    for (let index = 0; index <= 90; index += 1) {
      const time = index / 30;
      const clipTime = Math.min(1.9, time);
      visualFrames.push(frame(time,
        sample({
          animation: "DEATH",
          clipTime,
          meshGap: clipTime >= 1.1 ? 0 : 0.08,
          bones: { head: point([0, clipTime >= 1.1 ? 0.45 : 1.4, 0]), pelvis: point([0, 0.3, 0]) },
        }),
        sample({ animation: "HEAVY", clipTime: time }),
      ));
    }
    expect(evaluateCriticalDeathHold({ visualFrames }, {
      actor: "player",
      animation: "DEATH",
      minStartClipTimeSeconds: 0,
      maxStartClipTimeSeconds: 0.08,
      floorContactStartClipTimeSeconds: 1.1,
      forbiddenRecoveryAnimations: ["SWORD_IDLE", "GET_UP"],
    }).pass).toBe(true);
  });

  it("rejects a guard break that collapses into a prolonged kneel", () => {
    const postureFrames = (headY, kneeY) => Array.from({ length: 10 }, (_, index) => frame(
      index / 30,
      sample({ animation: "LIGHT_1" }),
      sample({
        animation: "GUARD_BREAK",
        clipTime: index / 30,
        bones: {
          head: point([0, headY, 0]),
          calfL: point([0, kneeY, 0]),
          calfR: point([0, 0.55, 0]),
        },
      }),
    ));
    expect(evaluateGuardBreakPosture({ visualFrames: postureFrames(1.6, 0.5) }).pass).toBe(true);
    expect(evaluateGuardBreakPosture({ visualFrames: postureFrames(1.1, 0.1) }).pass).toBe(false);
  });
});

describe("occurrence-aware rendered transition metrics", () => {
  const transitionOptions = {
    actor: "player",
    fromAnimation: "RIPOSTE",
    fromOccurrence: 1,
    toAnimation: "SWORD_IDLE",
    toOccurrence: 3,
    transitionWindowSeconds: 0.2,
    bones: ["handR"],
    maxPelvisRelativeBoneStepMeters: 0.1,
    maxBoneAngularStepDegrees: 20,
    maxWeaponTipStepMeters: 0.15,
  };
  const q = (degrees) => {
    const radians = degrees * Math.PI / 180;
    return [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
  };
  const seamSample = (animation, commandSerial, handOffset, weaponOffset, degrees = 0, root = 0) => sample({
    animation,
    commandSerial,
    bones: {
      pelvis: point([root, 1, 0]),
      handR: point([root + handOffset, 1.35, 0], q(degrees)),
    },
    weaponGrip: [root + handOffset, 1.35, 0],
    weaponTip: [root + weaponOffset, 1.35, 0.92],
  });
  const seamTelemetry = (bad = false, transitionRoot = 0.05) => ({
    visualFrames: [
      frame(0, seamSample("SWORD_IDLE", 1, 0, 0)),
      frame(0.033, seamSample("PARRY", 2, 0, 0)),
      frame(0.066, seamSample("SWORD_IDLE", 3, 0, 0)),
      frame(0.099, seamSample("RIPOSTE", 4, 0, 0)),
      frame(0.132, seamSample("RIPOSTE", 4, 0.02, 0.03)),
      frame(0.165, seamSample("SWORD_IDLE", 5, bad ? 0.25 : 0.04, bad ? 0.55 : 0.06, bad ? 40 : 4, transitionRoot)),
      frame(0.198, seamSample("SWORD_IDLE", 5, bad ? 0.27 : 0.05, bad ? 0.58 : 0.08, bad ? 42 : 6, transitionRoot)),
    ],
  });

  it("measures the declared occurrence edge without confusing earlier idle runs", () => {
    const result = evaluateAnimationTransitionMotion(seamTelemetry(), transitionOptions);
    expect(result.pass).toBe(true);
    expect(result.edge).toMatchObject({
      fromOccurrence: 1,
      toOccurrence: 3,
      fromCommandSerial: 4,
      toCommandSerial: 5,
    });
    expect(result.worstPelvisRelativeBoneStep.meters).toBeLessThan(0.1);
  });

  it("rejects limb translation, local rotation, and rendered weapon-tip pops", () => {
    const result = evaluateAnimationTransitionMotion(seamTelemetry(true), transitionOptions);
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/moved handR/);
    expect(result.failures.join(" ")).toMatch(/rotated handR/);
    expect(result.failures.join(" ")).toMatch(/weapon tip/);
  });

  it("can remove actor translation from the weapon-tip seam for airborne transitions", () => {
    const telemetry = seamTelemetry(false, 0.6);
    const worldResult = evaluateAnimationTransitionMotion(telemetry, transitionOptions);
    const actorRelativeResult = evaluateAnimationTransitionMotion(telemetry, {
      ...transitionOptions,
      weaponTipSpace: "pelvis-relative",
    });
    expect(worldResult.pass).toBe(false);
    expect(worldResult.failures.join(" ")).toMatch(/world rendered weapon tip/);
    expect(actorRelativeResult.pass).toBe(true);
    expect(actorRelativeResult.worstRenderedWeaponTipStep.space).toBe("pelvis-relative");
  });

  it("removes rigid pelvis rotation from pelvis-relative bone and weapon-tip seams", () => {
    const rotatingSample = (animation, commandSerial, degrees) => {
      const pelvisPosition = [0.2, 1, -0.1];
      const pelvisRotation = zRotation(degrees);
      const handPosition = translate(rotateZ([0.35, 0.35, 0], degrees), pelvisPosition);
      const weaponTip = translate(rotateZ([0.35, 0.35, 0.92], degrees), pelvisPosition);
      return sample({
        animation,
        commandSerial,
        bones: {
          pelvis: point(pelvisPosition, [0, 0, 0, 1], pelvisRotation),
          handR: point(handPosition, [0, 0, 0, 1], pelvisRotation),
        },
        weaponGrip: handPosition,
        weaponTip,
      });
    };
    const telemetry = {
      visualFrames: [
        frame(0, rotatingSample("SWORD_IDLE", 1, 0)),
        frame(0.033, rotatingSample("PARRY", 2, 0)),
        frame(0.066, rotatingSample("SWORD_IDLE", 3, 0)),
        frame(0.099, rotatingSample("RIPOSTE", 4, 0)),
        frame(0.132, rotatingSample("RIPOSTE", 4, 30)),
        frame(0.165, rotatingSample("SWORD_IDLE", 5, 60)),
        frame(0.198, rotatingSample("SWORD_IDLE", 5, 90)),
      ],
    };

    const worldResult = evaluateAnimationTransitionMotion(telemetry, transitionOptions);
    const pelvisFrameResult = evaluateAnimationTransitionMotion(telemetry, {
      ...transitionOptions,
      weaponTipSpace: "pelvis-relative",
    });
    expect(worldResult.pass).toBe(false);
    expect(worldResult.failures.join(" ")).toMatch(/world rendered weapon tip/);
    expect(pelvisFrameResult.pass).toBe(true);
    expect(pelvisFrameResult.worstPelvisRelativeBoneStep.meters).toBeCloseTo(0);
    expect(pelvisFrameResult.worstRenderedWeaponTipStep.meters).toBeCloseTo(0);
  });

  it("fails when the configured occurrences are not one adjacent rendered edge", () => {
    const result = evaluateAnimationTransitionMotion(seamTelemetry(), {
      ...transitionOptions,
      toOccurrence: 2,
    });
    expect(result.pass).toBe(false);
    expect(result.failures.join(" ")).toMatch(/not an adjacent rendered transition/);
  });
});
