import { spawn, spawnSync } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { chromium } from "playwright";
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
} from "./lib/visual-validation.mjs";
import {
  buildRunEvidenceSegments,
  buildRunTransitionSegments,
  compareRenderedRunPath,
} from "./lib/visual-run-contract.mjs";
import { compareActionRunPath } from "./lib/visual-action-run-contract.mjs";
import {
  buildInPixelFramePlan,
  normalizeRecordingFrameTimes,
  resolveRealFrameWindow,
  resolveRealTransitionFrameWindow,
  validateRenderedFrameIdentity,
} from "./lib/visual-frame-evidence.mjs";
import {
  decodeVisualFrameMarkerStream,
  VISUAL_FRAME_MARKER_HEIGHT,
  VISUAL_FRAME_MARKER_PROTOCOL,
  VISUAL_FRAME_MARKER_WIDTH,
} from "./lib/visual-frame-marker.mjs";
import { buildReviewMarkdown, REVIEW_PROMPTS } from "./lib/visual-review.mjs";
import { assertVisualRunId, visualRunDirectory } from "./lib/visual-run-directory.mjs";

const expectations = JSON.parse(await readFile(
  new URL("../../../packages/game-core/src/validation/visualScenarioExpectations.json", import.meta.url),
  "utf8",
));
const scenarioGroups = JSON.parse(await readFile(
  new URL("../../../packages/game-core/src/validation/visualScenarioGroups.json", import.meta.url),
  "utf8",
));
const animationExclusions = JSON.parse(await readFile(
  new URL("../../../packages/game-core/src/validation/visualAnimationExclusions.json", import.meta.url),
  "utf8",
));
const animationManifest = JSON.parse(await readFile(
  new URL("../../../packages/game-core/src/anim/generated/rig-skyrim-humanoid.animations.json", import.meta.url),
  "utf8",
));
const ALL_SCENARIOS = Object.keys(expectations);
const flags = new Set(process.argv.slice(2).filter((argument) => argument.startsWith("--")));
const requested = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
// A group name expands to its scenarios so an agent can record only the slice
// it changed. Recording all 28 scenes is the exception, not the routine.
const resolved = requested.flatMap((argument) => scenarioGroups[argument] ?? [argument]);
const unknown = resolved.filter((id) => !ALL_SCENARIOS.includes(id));
if (unknown.length) {
  throw new Error(
    `Unknown scenario/group: ${unknown.join(", ")}\n`
    + `Groups: ${Object.keys(scenarioGroups).join(", ")}\n`
    + `Scenarios: ${ALL_SCENARIOS.join(", ")}`,
  );
}
const scenarios = resolved.length ? [...new Set(resolved)] : ALL_SCENARIOS;
const partialSuite = scenarios.length !== ALL_SCENARIOS.length;

const root = process.cwd();
// Resolve Vite through Node rather than assuming ./node_modules. A git worktree
// has no node_modules of its own and resolves up to the main checkout. Vite's
// exports map hides ./bin, so go via its package.json and declared bin entry.
const vitePackagePath = createRequire(import.meta.url).resolve("vite/package.json");
const vitePackage = JSON.parse(await readFile(vitePackagePath, "utf8"));
const viteBin = join(
  dirname(vitePackagePath),
  typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin.vite,
);
const scenarioTimeoutMs = Number(process.env.VISUAL_TIMEOUT_MS ?? 240_000);
const viewport = flags.has("--tiny") ? { width: 400, height: 225 } : { width: 800, height: 450 };
const recorderViewport = {
  width: viewport.width,
  height: viewport.height + VISUAL_FRAME_MARKER_HEIGHT,
};
const recordVideo = !flags.has("--no-video");
const fastRendering = flags.has("--tiny") || flags.has("--no-video");
const prebuilt = flags.has("--prebuilt");
const runId = assertVisualRunId(
  process.env.VISUAL_RUN_ID ?? (recordVideo ? "latest" : "smoke-latest"),
);
const serverPort = Number.parseInt(process.env.VISUAL_PORT ?? "4173", 10);
if (!Number.isInteger(serverPort) || serverPort < 1024 || serverPort > 65535) {
  throw new Error("VISUAL_PORT must be an integer from 1024 through 65535");
}
const serverOrigin = `http://127.0.0.1:${serverPort}`;
const gameUrl = `${serverOrigin}/elder-souls-argonia/`;
const outputDir = visualRunDirectory(root, runId);
const videoScratch = await mkdtemp(join(tmpdir(), "combat-visual-"));
// A named run is an atomic evidence bundle. Mixing old scenario files with a
// partial rerun can make a failed or missing capture look reviewed.
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const completed = [];
const automatedFailures = [];
const probeFailures = [];
const crossScenarioFailures = [];

function waitForServer(url, child, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((resolveReady, reject) => {
    const poll = async () => {
      if (child.exitCode !== null) {
        return reject(new Error(
          `Vite preview exited with code ${child.exitCode} before ${url} became ready`,
        ));
      }
      try {
        const response = await fetch(url);
        if (response.ok) return resolveReady();
      } catch {
        // Vite is still starting.
      }
      if (Date.now() - start >= timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(poll, 150);
    };
    poll();
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slug(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

function collectMissing(actual, expected, label) {
  const missing = expected.filter((value) => !actual.includes(value));
  return missing.length ? [`${label} missing ${missing.join(", ")}; observed ${actual.join(", ")}`] : [];
}

function semanticFailures(scenario, telemetry, expected) {
  const failures = [
    ...collectMissing(telemetry.observedPlayerActions, expected.playerActions, `${scenario} player actions`),
    ...collectMissing(telemetry.observedPlayerAnimations, expected.playerAnimations, `${scenario} player animations`),
    ...collectMissing(telemetry.observedEnemyActions, expected.enemyActions, `${scenario} enemy actions`),
    ...collectMissing(telemetry.observedEnemyAnimations, expected.enemyAnimations, `${scenario} enemy animations`),
  ];
  for (const actor of ["player", "enemy"]) {
    const declaredActions = expected[`${actor}Actions`];
    const requiredRuns = expected.requiredActionRuns?.[actor];
    if (!Array.isArray(declaredActions) || declaredActions.length === 0) {
      if (requiredRuns !== undefined && (!Array.isArray(requiredRuns) || requiredRuns.length > 0)) {
        failures.push(`${scenario}: ${actor} has an action-run path without declared actions`);
      }
      continue;
    }
    if (!Array.isArray(requiredRuns) || requiredRuns.length === 0) {
      failures.push(`${scenario}: ${actor} is missing a requiredActionRuns path`);
      continue;
    }
    const result = compareActionRunPath({ telemetry, actor, requiredRuns });
    failures.push(...result.failures.map((failure) => `${scenario} ${actor} FSM: ${failure}`));
  }
  if (expected.enemyHealthLessThan !== undefined && telemetry.enemyHealth >= expected.enemyHealthLessThan) {
    failures.push(`${scenario}: expected enemy health below ${expected.enemyHealthLessThan}, observed ${telemetry.enemyHealth}`);
  }
  if (expected.enemyHealthGreaterThan !== undefined && telemetry.enemyHealth <= expected.enemyHealthGreaterThan) {
    failures.push(`${scenario}: expected enemy health above ${expected.enemyHealthGreaterThan}, observed ${telemetry.enemyHealth}`);
  }
  if (expected.playerHealthLessThan !== undefined && telemetry.playerHealth >= expected.playerHealthLessThan) {
    failures.push(`${scenario}: expected player health below ${expected.playerHealthLessThan}, observed ${telemetry.playerHealth}`);
  }
  if (expected.playerHealthGreaterThan !== undefined && telemetry.playerHealth <= expected.playerHealthGreaterThan) {
    failures.push(`${scenario}: expected player health above ${expected.playerHealthGreaterThan}, observed ${telemetry.playerHealth}`);
  }
  if (expected.playerHealthEquals !== undefined && telemetry.playerHealth !== expected.playerHealthEquals) {
    failures.push(`${scenario}: expected player health ${expected.playerHealthEquals}, observed ${telemetry.playerHealth}`);
  }
  return failures;
}

function runProcess(command, arguments_, label) {
  const result = spawnSync(command, arguments_, { encoding: "utf8" });
  if (result.error?.code === "ENOENT") throw new Error(`${label} requires ${command} on PATH`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function runBinaryProcess(command, arguments_, label) {
  const result = spawnSync(command, arguments_, { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") throw new Error(`${label} requires ${command} on PATH`);
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${result.stderr?.toString() || result.stdout?.toString()}`);
  }
  return result.stdout;
}

async function requireNonEmptyArtifact(path, label) {
  let artifact;
  try {
    artifact = await stat(path);
  } catch {
    throw new Error(`${label} did not produce ${path}`);
  }
  if (!artifact.isFile() || artifact.size === 0) {
    throw new Error(`${label} produced an empty artifact at ${path}`);
  }
}

function videoDuration(path) {
  const output = runProcess("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path,
  ], "video duration probe");
  const duration = Number.parseFloat(output);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Could not measure video duration for ${path}`);
  return duration;
}

function videoFrameTimes(path) {
  const output = runProcess("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=best_effort_timestamp_time",
    "-of", "csv=p=0", path,
  ], "video frame probe");
  const times = output
    .split(/\r?\n/)
    .map((value) => Number.parseFloat(value))
    .filter(Number.isFinite);
  if (!times.length) throw new Error(`Could not enumerate real video frames for ${path}`);
  return normalizeRecordingFrameTimes(times);
}

function numberedFramePath(directory, prefix, index) {
  return join(directory, `${prefix}-${String(index).padStart(6, "0")}.png`);
}

function videoFrameMarkers(path, expectedFrameCount) {
  const pixels = runBinaryProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", path,
    "-map", "0:v:0",
    "-vf", `crop=${VISUAL_FRAME_MARKER_WIDTH}:${VISUAL_FRAME_MARKER_HEIGHT}:0:0,format=gray`,
    "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], "in-pixel frame-marker decode");
  const frameBytes = VISUAL_FRAME_MARKER_WIDTH * VISUAL_FRAME_MARKER_HEIGHT;
  if (pixels.length % frameBytes !== 0) {
    throw new Error(`In-pixel frame-marker decode emitted a partial frame (${pixels.length} bytes)`);
  }
  const frameCount = pixels.length / frameBytes;
  if (frameCount !== expectedFrameCount) {
    throw new Error(
      `Frame-marker decode found ${frameCount} frames; timestamp probe found ${expectedFrameCount}`,
    );
  }
  return decodeVisualFrameMarkerStream(pixels, frameCount);
}

/** Rebuild from exact pixel-coded production frames, then crop the test gutter. */
async function normalizeRecording(rawVideo, output, simulationDuration) {
  const processingStartedAt = Date.now();
  const rawDuration = videoDuration(rawVideo);
  const rawFrameTimes = videoFrameTimes(rawVideo);
  const markerResults = videoFrameMarkers(rawVideo, rawFrameTimes.length);
  const markerFrames = markerResults.map((result) => result.frame ?? null);
  const plan = buildInPixelFramePlan(
    rawFrameTimes,
    markerFrames,
    simulationDuration,
    { framesPerSecond: FRAME_EVIDENCE_FPS },
  );
  const retimeScratch = await mkdtemp(join(videoScratch, "retime-"));
  const sourceFrames = join(retimeScratch, "source");
  const outputFrames = join(retimeScratch, "output");
  await mkdir(sourceFrames);
  await mkdir(outputFrames);
  try {
    const sourceFrameOrdinal = new Map(
      plan.selectedSourceFrames.map((sourceFrame, ordinal) => [sourceFrame, ordinal]),
    );
    const sourceSelection = plan.selectedSourceFrames
      .map((sourceFrame) => `eq(n,${sourceFrame})`)
      .join("+");
    runProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", rawVideo,
      // Remove the test-only marker before retaining the selected lossless
      // production pixels. Every later derivative can then reuse this exact
      // sequence without ever exposing the marker gutter.
      "-vf", `select='${sourceSelection}',crop=iw:ih-${VISUAL_FRAME_MARKER_HEIGHT}:0:${VISUAL_FRAME_MARKER_HEIGHT}`,
      "-fps_mode", "passthrough", "-compression_level", "1", "-start_number", "0",
      "-y", join(sourceFrames, "source-%06d.png"),
    ], "simulation-clock source-frame extraction");
    await requireNonEmptyArtifact(
      numberedFramePath(sourceFrames, "source", 0),
      "simulation-clock source-frame extraction",
    );
    await requireNonEmptyArtifact(
      numberedFramePath(sourceFrames, "source", plan.selectedSourceFrames.length - 1),
      "simulation-clock source-frame extraction",
    );

    await Promise.all(plan.frames.map((frame) => link(
      numberedFramePath(sourceFrames, "source", sourceFrameOrdinal.get(frame.sourceFrame)),
      numberedFramePath(outputFrames, "frame", frame.outputFrame),
    )));
    runProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-framerate", String(plan.framesPerSecond), "-start_number", "0",
      "-i", join(outputFrames, "frame-%06d.png"),
      "-frames:v", String(plan.outputFrameCount), "-an", "-vf", "format=yuv420p",
      "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-crf", "34", "-b:v", "0",
      "-y", output,
    ], "normal-speed simulation-clock recording encode");
  } catch (error) {
    await rm(retimeScratch, { recursive: true, force: true });
    throw error;
  }
  try {
    const encodedFrameTimes = videoFrameTimes(output);
    if (encodedFrameTimes.length !== plan.outputFrameCount) {
      throw new Error(
        `Simulation-clock recording encoded ${encodedFrameTimes.length} frames; expected ${plan.outputFrameCount}`,
      );
    }
    const normalization = {
      strategy: plan.strategy,
      rawDuration: Number(rawDuration.toFixed(3)),
      rawDecodedFrames: rawFrameTimes.length,
      sourceStart: Number(rawFrameTimes[plan.firstSourceFrame].toFixed(5)),
      sourceDuration: Number((
        rawFrameTimes[plan.lastSourceFrame] - rawFrameTimes[plan.firstSourceFrame]
      ).toFixed(5)),
      simulationDuration: Number(simulationDuration.toFixed(3)),
      framesPerSecond: plan.framesPerSecond,
      outputFrames: plan.outputFrameCount,
      outputDuration: Number(plan.outputDuration.toFixed(5)),
      candidateSourceFrames: plan.lastSourceFrame - plan.firstSourceFrame + 1,
      uniqueSourceFrames: plan.uniqueSourceFrameCount,
      explicitHeldFrames: 0,
      maximumSourceTimingErrorMs: Number((plan.maximumSimulationError * 1_000).toFixed(3)),
      skippedRawPrefixFrames: plan.skippedRawPrefixFrames,
      decodedMarkerFrames: markerResults.filter(({ frame }) => Number.isInteger(frame)).length,
      minimumMarkerContrast: Number(Math.min(
        ...markerResults.filter(({ frame }) => Number.isInteger(frame)).map(({ minimumContrast }) => minimumContrast),
      ).toFixed(3)),
      markerExcludedFromReviewPixels: true,
      derivativeSource: "selected marker-free lossless frame sequence",
      processingWallTimeMs: Date.now() - processingStartedAt,
    };
    return {
      normalization,
      encodedFrameTimes,
      frameSequence: {
        pattern: join(outputFrames, "frame-%06d.png"),
        framesPerSecond: plan.framesPerSecond,
        outputFrameCount: plan.outputFrameCount,
      },
      disposeFrameSequence: () => rm(retimeScratch, { recursive: true, force: true }),
      frameMap: {
        version: 2,
        clock: "production-simulation-seconds",
        alignment: "decoded-in-pixel-frame-marker",
        markerProtocol: {
          version: VISUAL_FRAME_MARKER_PROTOCOL.version,
          width: VISUAL_FRAME_MARKER_WIDTH,
          height: VISUAL_FRAME_MARKER_HEIGHT,
          excludedFromReviewedDerivativesByGutterCrop: true,
        },
        framesPerSecond: plan.framesPerSecond,
        simulationDuration: Number(simulationDuration.toFixed(5)),
        outputDuration: Number(plan.outputDuration.toFixed(5)),
        frames: plan.frames.map((frame) => ({
          outputFrame: frame.outputFrame,
          simulationTime: Number(frame.simulationTime.toFixed(5)),
          rawSourceFrame: frame.sourceFrame,
          rawRecordingTime: Number(frame.sourceRecordingTime.toFixed(5)),
          decodedSourceMarkerFrame: frame.sourceMarkerFrame,
          mappedSourceSimulationTime: Number(frame.sourceSimulationTime.toFixed(5)),
          simulationErrorMs: Number((frame.simulationError * 1_000).toFixed(3)),
        })),
      },
    };
  } catch (error) {
    await rm(retimeScratch, { recursive: true, force: true });
    throw error;
  }
}

function frameSequenceInput(frameSequence, startNumber = 0) {
  return [
    "-framerate", String(frameSequence.framesPerSecond),
    "-start_number", String(startNumber),
    "-i", frameSequence.pattern,
  ];
}

function makeContactSheet(frameSequence, output, duration) {
  const sampleRate = 12 / Math.max(0.1, duration);
  runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", ...frameSequenceInput(frameSequence),
    "-t", String(duration),
    "-vf", `fps=${sampleRate},scale=320:-1,tile=4x3:padding=2:margin=2`,
    "-frames:v", "1", "-compression_level", "1", "-y", output,
  ], "full-scene contact sheet");
}

/** Compact animated evidence the human reviewer can open without video tooling. */
function makeAgentReviewGif(frameSequence, output, duration) {
  runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", ...frameSequenceInput(frameSequence),
    "-t", String(duration),
    "-filter_complex",
    "fps=15,scale=600:-2:flags=lanczos,split[frames][paletteInput];[paletteInput]palettegen=max_colors=96[palette];[frames][palette]paletteuse=dither=bayer:bayer_scale=3",
    "-loop", "0", "-y", output,
  ], "normal-speed human review GIF");
}

function mergeIntervals(segments, fallbackDuration) {
  const intervals = segments
    .map((segment) => ({ start: segment.start, end: segment.end, labels: [`${segment.actor}:${segment.animation}`] }))
    .sort((first, second) => first.start - second.start);
  if (!intervals.length) return [{ start: 0, end: Math.max(0.1, fallbackDuration), labels: ["missing-action-probe"] }];
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + 0.08) {
      previous.end = Math.max(previous.end, interval.end);
      previous.labels.push(...interval.labels.filter((label) => !previous.labels.includes(label)));
    } else {
      merged.push({ ...interval });
    }
  }
  return merged.map((interval) => ({
    ...interval,
    duration: Number(Math.max(0.1, interval.end - interval.start).toFixed(3)),
  }));
}

const CLOSE_CROP = "crop=trunc(iw*0.58/2)*2:trunc(ih*0.58/2)*2:(iw-ow)/2:(ih-oh)/2";
const FRAME_EVIDENCE_FPS = 30;

function makeActionCloseup(frameSequence, output, intervals) {
  const filters = intervals.map((interval, index) => (
    `[0:v]trim=start=${interval.start}:end=${interval.end},setpts=PTS-STARTPTS,${CLOSE_CROP},scale=960:540:flags=lanczos[v${index}]`
  ));
  filters.push(`${intervals.map((_, index) => `[v${index}]`).join("")}concat=n=${intervals.length}:v=1:a=0[outv]`);
  runProcess("ffmpeg", [
    "-hide_banner", "-loglevel", "error", ...frameSequenceInput(frameSequence),
    "-filter_complex", filters.join(";"), "-map", "[outv]", "-an", "-r", "30",
    "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-crf", "32", "-b:v", "0",
    "-y", output,
  ], "action-only close-up encode");
}

async function makeMotionStrips(frameSequence, scenarioDir, segments, frameTimes) {
  const stripsDir = join(scenarioDir, "motion-strips");
  await mkdir(stripsDir, { recursive: true });
  const strips = [];
  for (const [index, segment] of segments.entries()) {
    const filename = `${String(index + 1).padStart(3, "0")}-${segment.actor}-${slug(segment.animation)}-part-${segment.part}-of-${segment.parts}.png`;
    const relativePath = `motion-strips/${filename}`;
    const frameWindow = resolveRealFrameWindow(
      frameTimes,
      segment,
      { minimum: 1, label: `${segment.actor} ${segment.animation} dense motion strip` },
    );
    const stripFrames = frameWindow.count;
    const stripColumns = Math.min(5, Math.ceil(Math.sqrt(stripFrames * 16 / 9)));
    const stripRows = Math.ceil(stripFrames / stripColumns);
    const output = join(stripsDir, filename);
    runProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      ...frameSequenceInput(frameSequence, frameWindow.firstFrameIndex),
      "-vf", `${CLOSE_CROP},scale=320:180:flags=lanczos,tile=${stripColumns}x${stripRows}:nb_frames=${stripFrames}:padding=2:margin=2`,
      "-frames:v", "1", "-compression_level", "1", "-y", output,
    ], `${segment.actor} ${segment.animation} dense motion strip`);
    await requireNonEmptyArtifact(output, `${segment.actor} ${segment.animation} dense motion strip`);
    strips.push({
      ...segment,
      path: relativePath,
      samplesPerSecond: FRAME_EVIDENCE_FPS,
      realRecordingFrames: stripFrames,
      firstRecordingFrame: frameWindow.firstFrameIndex,
      lastRecordingFrame: frameWindow.lastFrameIndex,
      firstSimulationTime: Number(frameWindow.firstFrameTime.toFixed(5)),
      lastSimulationTime: Number(frameWindow.lastFrameTime.toFixed(5)),
    });
  }
  return strips;
}

async function makeTransitionStrips(frameSequence, scenarioDir, segments, frameTimes) {
  const stripsDir = join(scenarioDir, "transition-boundaries");
  await mkdir(stripsDir, { recursive: true });
  const strips = [];
  for (const [index, segment] of segments.entries()) {
    const transition = `${slug(segment.fromAnimation)}-to-${slug(segment.toAnimation)}`;
    const filename = `${String(index + 1).padStart(3, "0")}-${segment.actor}-${transition}.png`;
    const relativePath = `transition-boundaries/${filename}`;
    const frameWindow = resolveRealTransitionFrameWindow(
      frameTimes,
      segment,
      {
        minimum: 2,
        label: `${segment.actor} ${segment.fromAnimation} to ${segment.toAnimation} transition strip`,
      },
    );
    const stripFrames = frameWindow.count;
    const stripColumns = Math.min(5, Math.ceil(Math.sqrt(stripFrames * 16 / 9)));
    const stripRows = Math.ceil(stripFrames / stripColumns);
    const output = join(stripsDir, filename);
    runProcess("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      ...frameSequenceInput(frameSequence, frameWindow.firstFrameIndex),
      "-vf", `${CLOSE_CROP},scale=320:180:flags=lanczos,tile=${stripColumns}x${stripRows}:nb_frames=${stripFrames}:padding=2:margin=2`,
      "-frames:v", "1", "-compression_level", "1", "-y", output,
    ], `${segment.actor} ${segment.fromAnimation} to ${segment.toAnimation} transition strip`);
    await requireNonEmptyArtifact(
      output,
      `${segment.actor} ${segment.fromAnimation} to ${segment.toAnimation} transition strip`,
    );
    strips.push({
      ...segment,
      path: relativePath,
      samplesPerSecond: FRAME_EVIDENCE_FPS,
      realRecordingFrames: stripFrames,
      firstRecordingFrame: frameWindow.firstFrameIndex,
      lastRecordingFrame: frameWindow.lastFrameIndex,
      firstSimulationTime: Number(frameWindow.firstFrameTime.toFixed(5)),
      lastSimulationTime: Number(frameWindow.lastFrameTime.toFixed(5)),
      beforeTransitionFrames: frameWindow.beforeTransitionFrames,
      atOrAfterTransitionFrames: frameWindow.atOrAfterTransitionFrames,
    });
  }
  return strips;
}

/**
 * Report which runtime animations no scenario reaches. This is a nudge, not a
 * gate: an agent adding a new clip should be able to record it before the
 * scenario registry has caught up.
 */
function coverage() {
  const coveredAnimations = new Set(Object.values(expectations).flatMap((expected) => [
    ...expected.playerAnimations,
    ...expected.enemyAnimations,
  ]));
  const missing = Object.keys(animationManifest.animations)
    .filter((animation) => !(animation in animationExclusions))
    .filter((animation) => !coveredAnimations.has(animation));
  if (missing.length) {
    console.warn(`WARN no scenario covers runtime animation(s): ${missing.join(", ")}`);
  }
  return { covered: [...coveredAnimations].sort(), excluded: animationExclusions, missing };
}

async function writeReviewBundle(crossScenarioAnalysis) {
  const generatedAt = new Date().toISOString();
  const semanticAnimationCoverage = coverage();
  const statuses = {
    automated: automatedFailures.length ? "FAIL" : "PASS",
    probe: probeFailures.length ? "FAIL" : "PASS",
    cross: crossScenarioAnalysis.pass === true ? "PASS" : crossScenarioAnalysis.pass === false ? "FAIL" : "NOT RUN",
  };
  const markdown = buildReviewMarkdown({
    generatedAt,
    runId,
    scenarios: completed,
    automatedStatus: statuses.automated,
    probeStatus: statuses.probe,
  });
  await writeFile(join(outputDir, "review.md"), markdown);

  const stripFigure = (scenario, path, caption) => `
      <figure><img loading="lazy" src="./${encodeURIComponent(scenario)}/${path}" alt="${escapeHtml(caption)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  const cards = completed.map(({ scenario, label, telemetry, evidence, analysis }) => {
    const strips = evidence.strips.map((strip) => stripFigure(
      scenario,
      strip.path,
      `${strip.actor} · ${strip.animation} · ${strip.start}s–${strip.end}s`,
    )).join("");
    const transitionStrips = evidence.transitionBoundaryStrips.map((strip) => stripFigure(
      scenario,
      strip.path,
      `${strip.actor} · ${strip.fromAnimation} → ${strip.toAnimation} · boundary ${strip.transitionTime}s`,
    )).join("");
    const failures = [...analysis.failures ?? []];
    return `<article id="${escapeHtml(scenario)}">
      <h2>${escapeHtml(scenario)} — ${escapeHtml(label)}</h2>
      ${failures.length ? `<p class="fail">Automated probes flagged this scene:</p><ul class="fail">${failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("")}</ul>` : ""}
      ${recordVideo
        ? `<video controls muted preload="metadata" src="./${encodeURIComponent(scenario)}/recording.webm"></video>
      <p>Action close-up:</p>
      <video controls loop muted preload="metadata" src="./${encodeURIComponent(scenario)}/action-closeup.webm"></video>
      <details><summary>Normal-speed GIF (same pixels, no video player needed)</summary><img loading="lazy" src="./${encodeURIComponent(scenario)}/normal-speed-review.gif" alt="${escapeHtml(scenario)} normal-speed animated review"></details>`
        : "<p><strong>No-video check run: nothing to watch here.</strong></p>"}
      <details><summary>Frame-by-frame strips (open if something looked off)</summary>
        <div class="strips">${strips || "<p>None generated.</p>"}</div>
        <h4>Transition boundaries</h4>
        <div class="strips">${transitionStrips || "<p>None sampled.</p>"}</div>
      </details>
      <details><summary>Diagnostics (motion analysis + telemetry)</summary><pre>${escapeHtml(JSON.stringify(analysis, null, 2))}</pre><pre>${escapeHtml(JSON.stringify(telemetry, null, 2))}</pre></details>
    </article>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Animation review · ${escapeHtml(runId)}</title><style>
body{margin:0;background:#151616;color:#e8e1d2;font:15px/1.45 system-ui,sans-serif}header,main{max-width:1100px;margin:auto;padding:24px}article{background:#222424;border:1px solid #474944;border-radius:8px;margin:0 0 26px;padding:18px}h1,h2,h3,h4{font-family:Georgia,serif}video,img{display:block;width:100%;max-height:620px;object-fit:contain;background:#080909;margin:12px 0}figure{margin:16px 0}figcaption{color:#c6bdad}summary{cursor:pointer;margin:12px 0;color:#c6bdad}ul{padding-left:24px}li{margin:6px 0}.fail{color:#f2a08a}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>
<header><h1>Animation review · ${escapeHtml(runId)}</h1><p>Generated ${escapeHtml(generatedAt)} · ${completed.length} scene${completed.length === 1 ? "" : "s"}</p>
<p>Watch each scene once at normal speed, then write your verdict and notes in <code>review.md</code> next to this file. Open the strips only if the normal-speed watch raised a question.</p>
<ul>${REVIEW_PROMPTS.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}</ul></header><main>${cards}</main></body></html>`;
  await writeFile(join(outputDir, "review.html"), html);
  await writeFile(join(outputDir, "run.json"), `${JSON.stringify({
    runId,
    generatedAt,
    recordVideo,
    fastRendering,
    partialSuite,
    viewport,
    automatedAssertions: automatedFailures.length ? "fail" : "pass",
    probeAssertions: probeFailures.length ? "fail" : "pass",
    crossScenarioAssertions: crossScenarioAnalysis.pass === true ? "pass" : crossScenarioAnalysis.pass === false ? "fail" : "not-run",
    semanticAnimationCoverage,
    scenarios: completed.map(({ scenario }) => scenario),
    scenarioEvidence: Object.fromEntries(completed.map(({ scenario, evidence }) => [scenario, evidence])),
    failures: {
      automated: automatedFailures,
      probes: probeFailures,
      crossScenario: crossScenarioFailures,
    },
  }, null, 2)}\n`);
}

// Preview must always serve the sources under review. Reusing an old dist/
// silently validated stale code in exactly the workflow this suite guards.
if (!prebuilt) {
  runProcess(process.execPath, [viteBin, "build"], "production visual build");
}

const vite = spawn(
  process.execPath,
  [viteBin, "preview", "--base", "/elder-souls-argonia/", "--host", "127.0.0.1", "--port", String(serverPort), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
vite.stdout.on("data", (chunk) => { serverLog += chunk; });
vite.stderr.on("data", (chunk) => { serverLog += chunk; });

let browser;
let context;
try {
  await waitForServer(gameUrl, vite);
  browser = await chromium.launch({
    headless: !flags.has("--headed"),
    channel: flags.has("--new-headless") ? "chromium" : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const contextOptions = { viewport: recorderViewport, deviceScaleFactor: 1 };
  if (recordVideo) contextOptions.recordVideo = { dir: videoScratch, size: recorderViewport };
  // One context keeps decoded GLBs, scripts, shaders, and HTTP cache warm.
  context = await browser.newContext(contextOptions);

  for (const scenario of scenarios) {
    const scenarioDir = join(outputDir, scenario);
    await mkdir(scenarioDir, { recursive: true });
    const page = await context.newPage();
    const video = page.video();
    const browserFailures = [];
    page.on("pageerror", (error) => browserFailures.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) => browserFailures.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`));
    const query = new URLSearchParams({ scenario });
    if (recordVideo) query.set("recording", "1");
    if (flags.has("--hitboxes")) query.set("hitboxes", "1");
    if (fastRendering) query.set("fast", "1");
    // The application-level readiness assertion below already waits for the
    // loaded actor, physics world, and warm-up. Playwright explicitly
    // discourages networkidle for test readiness; it adds a fixed quiet wait
    // to every isolated scenario without strengthening this gate.
    await page.goto(`${gameUrl}?${query}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__COMBAT_VISUAL_SCENARIO__?.ready === true,
      undefined,
      { timeout: 30_000 },
    );
    const deadline = Date.now() + scenarioTimeoutMs;
    let status;
    // Poll only two scalars. Serializing the growing frame probe each poll made
    // long paired scenes progressively slower; full telemetry is copied once.
    while (Date.now() < deadline) {
      status = await page.evaluate(() => {
        const telemetry = window.__COMBAT_VISUAL_SCENARIO__;
        return telemetry ? { done: telemetry.done, elapsed: telemetry.elapsed } : null;
      });
      if (status?.done) break;
      await page.waitForTimeout(100);
    }
    if (!status?.done) {
      await page.screenshot({
        path: join(scenarioDir, "timeout.png"),
        clip: { x: 0, y: VISUAL_FRAME_MARKER_HEIGHT, ...viewport },
      });
      throw new Error(`${scenario}: timed out at simulation time ${status?.elapsed ?? "unknown"}s`);
    }
    // Transfer the large, plain-data probe as one JSON string. Playwright's
    // recursive structured-value serializer is disproportionately expensive
    // for hundreds of frames containing bone and mesh arrays.
    const serializedTelemetry = await page.evaluate(() => {
      const telemetry = window.__COMBAT_VISUAL_SCENARIO__;
      return telemetry ? JSON.stringify(telemetry) : null;
    });
    if (!serializedTelemetry) throw new Error(`${scenario}: telemetry was not published`);
    const telemetry = JSON.parse(serializedTelemetry);
    const renderedFrameIdentity = validateRenderedFrameIdentity(
      telemetry.visualFrames,
      telemetry.events,
      { framesPerSecond: FRAME_EVIDENCE_FPS },
    );
    await page.screenshot({
      path: join(scenarioDir, "final.png"),
      clip: { x: 0, y: VISUAL_FRAME_MARKER_HEIGHT, ...viewport },
    });
    await page.close();

    await writeFile(join(scenarioDir, "telemetry.json"), `${JSON.stringify(telemetry, null, 2)}\n`);
    const expected = expectations[scenario];
    const semantic = semanticFailures(scenario, telemetry, expected);
    semantic.push(...browserFailures.map((failure) => `${scenario}: ${failure}`));
    automatedFailures.push(...semantic);

    const analysis = evaluateVisualFrames(scenario, telemetry, expected);
    if (scenario === "backstab") {
      analysis.backstabWeaponRole = evaluateBackstabWeaponRole(telemetry, expected.backstabWeaponRole);
      if (!analysis.backstabWeaponRole.pass) {
        analysis.failures.push(...analysis.backstabWeaponRole.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    if (scenario === "riposte") {
      analysis.ripostePhases = evaluateRipostePhases(telemetry, expected.ripostePhases);
      if (!analysis.ripostePhases.pass) {
        analysis.failures.push(...analysis.ripostePhases.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    if (expected.riposteWeaponContact) {
      analysis.riposteWeaponContact = evaluateWeaponContactAtDamage(
        telemetry,
        expected.riposteWeaponContact,
      );
      if (!analysis.riposteWeaponContact.pass) {
        analysis.failures.push(...analysis.riposteWeaponContact.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    if (expected.criticalRecovery) {
      analysis.criticalRecovery = evaluateCriticalRecovery(telemetry, expected.criticalRecovery);
      if (!analysis.criticalRecovery.pass) {
        analysis.failures.push(...analysis.criticalRecovery.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    if (expected.criticalDeathHold) {
      analysis.criticalDeathHold = evaluateCriticalDeathHold(telemetry, expected.criticalDeathHold);
      if (!analysis.criticalDeathHold.pass) {
        analysis.failures.push(...analysis.criticalDeathHold.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    if (scenario === "guard-break") {
      analysis.guardBreakPosture = evaluateGuardBreakPosture(telemetry, expected.standingPosture);
      if (!analysis.guardBreakPosture.pass) {
        analysis.failures.push(...analysis.guardBreakPosture.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    analysis.transitionMotionChecks = (expected.transitionMotionChecks ?? []).map((check) => (
      evaluateAnimationTransitionMotion(telemetry, check)
    ));
    for (const transitionCheck of analysis.transitionMotionChecks) {
      if (!transitionCheck.pass) {
        analysis.failures.push(...transitionCheck.failures.map((failure) => `${scenario}: ${failure}`));
        analysis.pass = false;
      }
    }
    const animationRunContracts = {};
    for (const actor of ["player", "enemy"]) {
      const expectedAnimations = expected[`${actor}Animations`];
      const requiredRuns = expected.requiredAnimationRuns?.[actor];
      if ((!Array.isArray(expectedAnimations) || expectedAnimations.length === 0) && requiredRuns === undefined) {
        continue;
      }
      if (!Array.isArray(requiredRuns) || requiredRuns.length === 0) {
        analysis.failures.push(`${scenario}: ${actor} is missing a requiredAnimationRuns path`);
        analysis.pass = false;
        continue;
      }
      const contract = compareRenderedRunPath({ telemetry, actor, requiredRuns });
      animationRunContracts[actor] = contract;
      if (!contract.pass) {
        analysis.failures.push(...contract.failures.map((failure) => `${scenario}: ${actor} animation path: ${failure}`));
        analysis.pass = false;
      }
    }
    analysis.animationRunContracts = animationRunContracts;
    probeFailures.push(...analysis.failures);
    await writeFile(join(scenarioDir, "motion-analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);

    const renderedRuns = Object.values(animationRunContracts).flatMap((contract) => contract.runs);
    const segments = buildRunEvidenceSegments(renderedRuns, telemetry.elapsed);
    const transitionSegments = Object.values(animationRunContracts)
      .flatMap((contract) => buildRunTransitionSegments(contract.runs, telemetry.elapsed))
      .sort((first, second) => (
        first.transitionTime - second.transitionTime || first.actor.localeCompare(second.actor)
      ));
    if (!segments.length) probeFailures.push(`${scenario}: no required animation-run evidence was found`);
    const intervals = mergeIntervals(segments, telemetry.elapsed);
    let normalization = null;
    let strips = [];
    let transitionBoundaryStrips = [];
    if (recordVideo) {
      if (!video) throw new Error(`${scenario}: Playwright did not create a video`);
      const rawVideo = await video.path();
      const recording = join(scenarioDir, "recording.webm");
      const rawVideoDuration = videoDuration(rawVideo);
      const retimedRecording = await normalizeRecording(
        rawVideo,
        recording,
        telemetry.elapsed,
      );
      try {
        normalization = retimedRecording.normalization;
        await writeFile(
          join(scenarioDir, "recording-frame-map.json"),
          `${JSON.stringify(retimedRecording.frameMap, null, 2)}\n`,
        );
        const semanticBoundaries = telemetry.events.map((event) => {
          const simulationFrame = Math.round(event.time * FRAME_EVIDENCE_FPS);
          const mapped = retimedRecording.frameMap.frames[simulationFrame] ?? null;
          if (mapped && mapped.decodedSourceMarkerFrame !== simulationFrame) {
            throw new Error(
              `${scenario}: rendered event boundary ${simulationFrame} decoded as marker ${mapped.decodedSourceMarkerFrame}`,
            );
          }
          return {
            time: event.time,
            simulationFrame,
            decodedSourceMarkerFrame: mapped?.decodedSourceMarkerFrame ?? null,
            playerAnimation: event.playerAnimation,
            enemyAnimation: event.enemyAnimation,
          };
        });
        await writeFile(join(scenarioDir, "capture-alignment.json"), `${JSON.stringify({
          rawVideoDuration: Number(rawVideoDuration.toFixed(3)),
          alignmentAuthority: "decoded in-pixel simulation-frame marker",
          firstReviewedFrame: retimedRecording.frameMap.frames[0],
          renderedFrameIdentity,
          semanticBoundaries,
          normalization,
          recordingFrameMap: "recording-frame-map.json",
        }, null, 2)}\n`);
        // Reuse the exact selected, marker-free lossless source sequence for
        // every derivative. This avoids repeatedly seeking and decoding the
        // lossy WebM while keeping all evidence on the same 30 Hz frame map.
        const frameSequence = retimedRecording.frameSequence;
        makeContactSheet(frameSequence, join(scenarioDir, "contact-sheet.png"), telemetry.elapsed);
        makeAgentReviewGif(frameSequence, join(scenarioDir, "normal-speed-review.gif"), telemetry.elapsed);
        makeActionCloseup(frameSequence, join(scenarioDir, "action-closeup.webm"), intervals);
        const simulationFrameTimes = retimedRecording.encodedFrameTimes;
        strips = await makeMotionStrips(frameSequence, scenarioDir, segments, simulationFrameTimes);
        transitionBoundaryStrips = await makeTransitionStrips(
          frameSequence,
          scenarioDir,
          transitionSegments,
          simulationFrameTimes,
        );
      } finally {
        await retimedRecording.disposeFrameSequence();
      }
    }
    const evidence = {
      normalSpeedRecording: recordVideo ? "recording.webm" : null,
      agentReviewGif: recordVideo ? "normal-speed-review.gif" : null,
      actionCloseup: recordVideo ? "action-closeup.webm" : null,
      fullSceneOverview: recordVideo ? "contact-sheet.png" : "final.png",
      captureAlignment: recordVideo ? "capture-alignment.json" : null,
      recordingFrameMap: recordVideo ? "recording-frame-map.json" : null,
      normalization,
      intervals,
      strips,
      transitionBoundaryStrips,
      animationRunContracts: Object.fromEntries(Object.entries(animationRunContracts).map(([actor, contract]) => [actor, {
        pass: contract.pass,
        expectedStates: contract.expectedStates,
        observedStates: contract.observedStates,
      }])),
    };
    await writeFile(join(scenarioDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    completed.push({ scenario, label: telemetry.label, telemetry, evidence, analysis });
    const statusLabel = semantic.length || !analysis.pass || !segments.length ? "FAIL" : "PASS";
    console.log(`${statusLabel} ${scenario}${recordVideo ? "" : " (no video)"}`);
  }

  let crossScenarioAnalysis = { pass: null, reason: "stationary-landing and moving-landing were not both captured" };
  const stationaryLanding = completed.find(({ scenario }) => scenario === "stationary-landing");
  const movingLanding = completed.find(({ scenario }) => scenario === "moving-landing");
  if (stationaryLanding && movingLanding) {
    crossScenarioAnalysis = compareAnimationProgression(
      stationaryLanding.telemetry,
      movingLanding.telemetry,
      { actor: "player", animation: "JUMP_START", maxClipTimeDelta: 0.08, maxDurationDelta: 0.05 },
    );
    crossScenarioFailures.push(...crossScenarioAnalysis.failures);
  }
  await writeFile(join(outputDir, "cross-scenario-analysis.json"), `${JSON.stringify(crossScenarioAnalysis, null, 2)}\n`);
  await writeReviewBundle(crossScenarioAnalysis);
  if (recordVideo) {
    console.log(`\nWATCH  ${join(outputDir, "review.html")}`);
    console.log(`NOTES  ${join(outputDir, "review.md")}`);
  }

  const failures = [...automatedFailures, ...probeFailures, ...crossScenarioFailures];
  if (failures.length) throw new Error(`Visual validation failed:\n${failures.join("\n")}`);
} catch (error) {
  if (serverLog) process.stderr.write(serverLog);
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  vite.kill("SIGTERM");
  await rm(videoScratch, { recursive: true, force: true });
}
