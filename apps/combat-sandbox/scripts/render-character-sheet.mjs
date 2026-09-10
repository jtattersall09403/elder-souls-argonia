/**
 * Render a character contact sheet from the running sandbox.
 *
 * The sheets under `docs/evidence/races/` are the evidence that a shipped
 * character build looks like what the roster says it does. They used to be
 * made by a throwaway browser probe, so they could not be re-shot; this script
 * is that missing tool.
 *
 *   node scripts/render-character-sheet.mjs \
 *     --roster playable --sex male \
 *     --out ../../docs/evidence/races/current-defaults.png
 *
 * ## Why the game renderer
 *
 * Every shot is a Playwright screenshot of the real sandbox, through the real
 * three.js material stack, the real FaceTint/skin-tint path and the real scene
 * lights. An offline render would prove a mesh we do not ship.
 *
 * ## What is pinned, and why
 *
 * A re-shoot after an appearance change is only worth having if it is a real
 * pixel diff, so nothing in the frame is allowed to drift between runs:
 *
 * - **Pose.** The `portrait` visual scenario has no input cues: the character
 *   stands in `IDLE` while the scenario driver advances the fixed 1/30 s
 *   simulation clock, and the shot is taken the moment the driver reports
 *   done. Same step count every run, so the same point in the IDLE cycle every
 *   run. Pinned at the end of the scenario rather than frame 0 because frame 0
 *   is the T-pose blend-in, which shows the rig rather than the character.
 * - **Camera.** Fixed world position, look-at and vertical field of view per
 *   shot, declared in `visualScenarios.ts` (`PORTRAIT_SHOTS`). Deliberately
 *   *not* fitted to the head bone: a frame that adapted to each build would
 *   hide the height and head differences the sheet exists to show.
 * - **Light.** The sandbox arena's ambient, hemisphere and directional lights
 *   are static constants in `CombatScene`. There is no time of day and no
 *   weather here, so there is nothing to freeze.
 * - **Kit.** Armour, off-hand, quiver, nocked arrow and the carried main-hand
 *   weapon are all hidden, which is what the sheet's subtitle promises.
 *
 * ## Donor names
 *
 * Card labels name the `Skyrim.esm` NPC whose FaceGen the build wears, and
 * they show a **tidied editor id**, not the in-game display name. The real
 * name cannot be read on this machine and the reason is a vault gap; the
 * measurement and the fix are in the comment above `tidyEditorId` below. There
 * is deliberately no name table in this file: a table would rot the first time
 * a donor changed.
 *
 * Supersampling: each shot is rendered at twice its panel size and scaled down
 * with lanczos, because the sandbox caps its device pixel ratio at 1 whenever a
 * visual scenario is running.
 */
import { chromium } from "playwright";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import process from "node:process";

const SHEET_WIDTH = 3200;
const SHEET_HEIGHT = 1480;
const HEADER_HEIGHT = 110;
const COLUMNS = 5;
const CARD_WIDTH = 640;
const CARD_HEIGHT = 685;
/** The card's panel: inset from its slot, so the grid reads as ten cards. */
const CARD_INSET_X = 12;
const CARD_INSET_Y = 8;
const CARD_BOX_WIDTH = CARD_WIDTH - 2 * CARD_INSET_X;
const CARD_BOX_HEIGHT = CARD_HEIGHT - 2 * CARD_INSET_Y;
const PANEL_TOP = 130;
const PANEL_HEIGHT = 500;
const FACE_PANEL_X = 26;
const FACE_PANEL_WIDTH = 310;
const BODY_PANEL_X = 356;
const BODY_PANEL_WIDTH = 230;
const SUPERSAMPLE = 2;
const BACKGROUND = "0x101418";
const CARD_FILL = "0x1B2028";
const CARD_EDGE = "0x2E3742";
const INK = "0xE8E1D2";
const INK_QUIET = "0x9AA3AE";
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

/**
 * Where the sheet-only alternates live. They are deliberately not in
 * `packages/character-assets/files/`: the game must not be able to load a body
 * it does not ship, so the renderer serves them itself, out of `dist/`, for the
 * length of the run.
 */
const VARIANT_DIRECTORY = "tooling/asset-pipeline/output/sheet-variants";

const DEFAULT_TITLE = "Current race defaults: close face and full body";
const DEFAULT_SUBTITLE = "Actual game renderer • vanilla Skyrim FaceGen, FaceTint, "
  + "body tint and weight • armour and weapons hidden";

const SHOTS = [
  { shot: "face", width: FACE_PANEL_WIDTH, height: PANEL_HEIGHT, offsetX: FACE_PANEL_X, caption: "FACE" },
  { shot: "body", width: BODY_PANEL_WIDTH, height: PANEL_HEIGHT, offsetX: BODY_PANEL_X, caption: "FULL BODY" },
];

function parseArguments(argv) {
  const options = {
    roster: "playable",
    sex: "male",
    title: DEFAULT_TITLE,
    subtitle: DEFAULT_SUBTITLE,
    out: null,
    headed: false,
    prebuilt: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--headed") { options.headed = true; continue; }
    if (argument === "--prebuilt") { options.prebuilt = true; continue; }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (!(key in options)) throw new Error(`Unknown flag: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} needs a value`);
    options[key] = value;
    index += 1;
  }
  if (!["playable", "variants"].includes(options.roster)) {
    throw new Error(`--roster must be "playable" or "variants" (got "${options.roster}")`);
  }
  if (!["male", "female", "both"].includes(options.sex)) {
    throw new Error(`--sex must be male, female or both (got "${options.sex}")`);
  }
  if (!options.out) throw new Error("--out is required");
  return options;
}

const options = parseArguments(process.argv.slice(2));
const root = process.cwd();
const repoRoot = resolve(root, "../..");
const outPath = resolve(root, options.out);

/** The sexes a run covers, in the order the cards are laid out. */
const sexes = options.sex === "both" ? ["male", "female"] : [options.sex];

/**
 * Cards from a schema-2 roster: ten races, twenty builds, one GLB each. Both
 * `--roster playable` and `--roster variants` read this shape, because the
 * pipeline emits the same manifest for its sheet-only roster as for the
 * shipped one.
 */
function cardsFromRoster(roster, source) {
  if (roster.schemaVersion !== 2) {
    throw new Error(`${source} is schemaVersion ${roster.schemaVersion}; this reads version 2`);
  }
  const cards = [];
  for (const sex of sexes) {
    for (const build of Object.values(roster.builds ?? {})) {
      if (build.sex !== sex) continue;
      cards.push({
        buildId: build.id,
        raceLabel: roster.races?.[build.race]?.label ?? build.race,
        sex: build.sex,
        donor: build.faceGen ?? null,
        // Kept whole for the sheet-only roster, whose builds have to be handed
        // to the page: they are not in the shipped one.
        roster: build,
      });
    }
  }
  if (!cards.length) {
    throw new Error(
      `${source} has no ${sexes.join(" or ")} builds. `
      + `It carries: ${Object.keys(roster.builds ?? {}).join(", ") || "nothing"}`,
    );
  }
  return cards;
}

async function readPlayableRoster() {
  const path = join(repoRoot, "packages/game-core/src/actors/generated/races.json");
  return cardsFromRoster(JSON.parse(await readFile(path, "utf8")), "The shipped roster");
}

/**
 * The sheet-only alternates: a second donor per race and sex, built to compare
 * faces and never shipped as playable. The pipeline puts them beside its own
 * output rather than in `packages/character-assets/`.
 */
async function readVariantRoster() {
  const directory = join(repoRoot, VARIANT_DIRECTORY);
  const candidates = ["roster.json", "races.json", "manifest.json"];
  for (const name of candidates) {
    let raw;
    try {
      raw = await readFile(join(directory, name), "utf8");
    } catch {
      continue;
    }
    return cardsFromRoster(JSON.parse(raw), join(directory, name));
  }
  throw new Error(
    `--roster variants needs a roster manifest in ${directory}, and there is none.\n`
    + `Looked for: ${candidates.join(", ")}.\n`
    + "Build it first with, from tooling/asset-pipeline:\n"
    + "  python3 -m pipeline.build_races --roster sheet-variants --skip-reference\n"
    + "Or use --roster playable for the shipped builds.",
  );
}

/**
 * Card labels name the donor NPC. They are derived from the roster's
 * `faceGen.editorId`, tidied — NOT from a lookup table here, which would rot
 * the first time a donor changed.
 *
 * The real display name (`FULL`) cannot be read on this machine, and this is a
 * vault gap rather than a code one. Measured 2026-09-10: `Skyrim.esm` sets the
 * localised flag, so every donor's `FULL` is a four-byte string id — Dravin's
 * is 61944 — and the tables those ids index (`Skyrim_English.STRINGS` and its
 * `.DL`/`.IL` siblings) are absent from the asset vault, as is the
 * `Skyrim - Interface.bsa` that would carry them. One donor,
 * `EncWarlockIce03BossHighElfM`, emits no `FULL` at all and does not inherit
 * one, so in game it shows its race name.
 *
 * When those files land in the vault the fix is small and belongs in
 * `pipeline/npc_records.py`, which already parses the record: add `FULL` and a
 * STRINGS lookup, put the name in the roster, and read it here instead.
 */
/** `KharagGroShurkul` → `Kharag Gro Shurkul`: legible, and visibly a fallback. */
function tidyEditorId(editorId) {
  return String(editorId ?? "unknown")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
}

function runFfmpeg(arguments_, label) {
  const result = spawnSync("ffmpeg", arguments_, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") throw new Error(`${label} requires ffmpeg on PATH`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}): ${result.stderr}`);
}

/** ffmpeg's filter parser eats these before drawtext ever sees the string. */
function escapeDrawText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "’")
    .replaceAll("%", "\\%")
    .replaceAll(",", "\\,")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
}

function drawText({ text, x, y, size, font, colour = INK, centred = false }) {
  const xExpression = centred ? `${x}-text_w/2` : String(x);
  return `drawtext=fontfile=${font}:text='${escapeDrawText(text)}'`
    + `:x=${xExpression}:y=${y}:fontsize=${size}:fontcolor=${colour}`;
}

function cardOrigin(index) {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return {
    x: Math.round((SHEET_WIDTH - COLUMNS * CARD_WIDTH) / 2) + column * CARD_WIDTH,
    y: HEADER_HEIGHT + row * CARD_HEIGHT,
  };
}

function waitForServer(url, child, listening, timeoutMs = 30_000) {
  const start = Date.now();
  return new Promise((ready, reject) => {
    const poll = async () => {
      if (child.exitCode !== null) {
        return reject(new Error(`Vite preview exited with code ${child.exitCode} before ${url} was ready`));
      }
      try {
        const response = await fetch(url);
        if (response.ok && listening()) return ready();
      } catch {
        // Still starting.
      }
      if (Date.now() - start >= timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(poll, 150);
    };
    poll();
  });
}

const cards = options.roster === "variants" ? await readVariantRoster() : await readPlayableRoster();
if (cards.length > COLUMNS * 2) {
  throw new Error(`The sheet holds ${COLUMNS * 2} cards; this roster asks for ${cards.length}`);
}

// Same server spin-up as the visual-scenario capture: Vite resolved through
// Node rather than ./node_modules, so a git worktree without its own install
// still finds it.
const require_ = createRequire(import.meta.url);
const vitePackagePath = require_.resolve("vite/package.json");
const vitePackage = JSON.parse(await readFile(vitePackagePath, "utf8"));
const viteBin = join(
  dirname(vitePackagePath),
  typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin.vite,
);
const port = Number.parseInt(process.env.SHEET_PORT ?? "4177", 10);
const gameUrl = `http://127.0.0.1:${port}/elder-souls-argonia/`;

const scratch = await mkdtemp(join(tmpdir(), "character-sheet-"));
// Preview must serve the sources under review; reusing an old dist/ would
// quietly shoot a stale character. `--prebuilt` is for reshooting against a
// dist/ you have just built yourself.
if (!options.prebuilt) {
  const built = spawnSync(process.execPath, [viteBin, "build"], { cwd: root, encoding: "utf8" });
  if (built.status !== 0) throw new Error(`Sheet build failed: ${built.stderr || built.stdout}`);
}

// The alternates are served for this run only, from the same `dist/` the
// preview serves, at the path their roster names (`sheet-variants/x.glb`).
if (options.roster === "variants") {
  await cp(
    join(repoRoot, VARIANT_DIRECTORY),
    join(root, "dist/sheet-variants"),
    { recursive: true },
  );
}

const vite = spawn(
  process.execPath,
  [viteBin, "preview", "--base", "/elder-souls-argonia/", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
vite.stdout.on("data", (chunk) => { serverLog += chunk; });
vite.stderr.on("data", (chunk) => { serverLog += chunk; });

let browser;
const shots = [];
try {
  await waitForServer(gameUrl, vite, () => serverLog.includes("Local:"));
  browser = await chromium.launch({
    headless: !options.headed,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  // One context keeps the decoded rig, shaders and HTTP cache warm across
  // forty page loads.
  const context = await browser.newContext({ deviceScaleFactor: 1 });

  for (const card of cards) {
    for (const { shot, width, height, offsetX } of SHOTS) {
      const page = await context.newPage();
      const failures = [];
      page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
      await page.setViewportSize({ width: width * SUPERSAMPLE, height: height * SUPERSAMPLE });
      if (options.roster === "variants") {
        // Handed to the page rather than merged into the shipped roster: this
        // body is evidence, not a character anyone can pick.
        await page.addInitScript(
          (build) => { window.__PORTRAIT_SHEET_BUILD__ = build; },
          card.roster,
        );
      }
      const query = new URLSearchParams({ scenario: "portrait", build: card.buildId, shot });
      await page.goto(`${gameUrl}?${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.__COMBAT_VISUAL_SCENARIO__?.ready === true,
        undefined,
        { timeout: 60_000 },
      );
      const deadline = Date.now() + 120_000;
      let done = false;
      while (Date.now() < deadline) {
        done = await page.evaluate(() => window.__COMBAT_VISUAL_SCENARIO__?.done === true);
        if (done) break;
        await page.waitForTimeout(50);
      }
      if (!done) throw new Error(`${card.buildId} ${shot}: the portrait scenario never finished`);
      const path = join(scratch, `${card.buildId}-${shot}.png`);
      await page.screenshot({ path });
      await page.close();
      if (failures.length) throw new Error(`${card.buildId} ${shot}: ${failures.join("; ")}`);
      shots.push({ buildId: card.buildId, shot, path, width, height, offsetX });
      process.stdout.write(`shot ${card.buildId} ${shot}\n`);
    }
  }
} finally {
  await browser?.close();
  vite.kill("SIGTERM");
}

// One ffmpeg invocation composes the whole sheet: a flat background, a card
// panel per build, every shot scaled down from its supersampled render and
// overlaid in its slot, then all the type drawn on top.
const inputs = [
  "-f", "lavfi", "-i", `color=c=${BACKGROUND}:s=${SHEET_WIDTH}x${SHEET_HEIGHT}`,
];
for (const shot of shots) inputs.push("-i", shot.path);

const filters = [];
const panelRectangles = [];
const boxes = [];
cards.forEach((card, index) => {
  const origin = cardOrigin(index);
  boxes.push(
    `drawbox=x=${origin.x + CARD_INSET_X}:y=${origin.y + CARD_INSET_Y}`
    + `:w=${CARD_BOX_WIDTH}:h=${CARD_BOX_HEIGHT}:color=${CARD_FILL}:t=fill`,
    `drawbox=x=${origin.x + CARD_INSET_X}:y=${origin.y + CARD_INSET_Y}`
    + `:w=${CARD_BOX_WIDTH}:h=${CARD_BOX_HEIGHT}:color=${CARD_EDGE}:t=2`,
  );
});
filters.push(`[0:v]${boxes.join(",")}[bg]`);

let stage = "[bg]";
shots.forEach((shot, index) => {
  const card = cards.findIndex((entry) => entry.buildId === shot.buildId);
  const origin = cardOrigin(card);
  const x = origin.x + CARD_INSET_X + shot.offsetX;
  const y = origin.y + CARD_INSET_Y + PANEL_TOP;
  // ffmpeg reads a NaN overlay coordinate as zero rather than failing, which
  // once put every panel off the sheet and still produced a plausible file.
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`${shot.buildId} ${shot.shot}: panel position is not a whole number (${x}, ${y})`);
  }
  panelRectangles.push({ buildId: shot.buildId, shot: shot.shot, x, y, width: shot.width, height: shot.height });
  filters.push(`[${index + 1}:v]scale=${shot.width}:${shot.height}:flags=lanczos[p${index}]`);
  filters.push(`${stage}[p${index}]overlay=${x}:${y}[s${index}]`);
  stage = `[s${index}]`;
});

const labels = [
  drawText({ text: options.title, x: 28, y: 20, size: 40, font: FONT_BOLD }),
  drawText({ text: options.subtitle, x: 30, y: 70, size: 22, font: FONT, colour: INK_QUIET }),
];
cards.forEach((card, index) => {
  const origin = cardOrigin(index);
  const left = origin.x + CARD_INSET_X;
  const top = origin.y + CARD_INSET_Y;
  labels.push(drawText({
    text: `${card.raceLabel} — ${card.sex}`,
    x: left + FACE_PANEL_X, y: top + 22, size: 30, font: FONT_BOLD,
  }));
  labels.push(drawText({
    text: tidyEditorId(card.donor?.editorId),
    x: left + FACE_PANEL_X, y: top + 62, size: 22, font: FONT, colour: INK_QUIET,
  }));
  for (const shot of SHOTS) {
    labels.push(drawText({
      text: shot.caption,
      x: left + shot.offsetX, y: top + PANEL_TOP - 30, size: 18, font: FONT_BOLD, colour: INK_QUIET,
    }));
  }
});
filters.push(`${stage}${labels.join(",")}[out]`);

await mkdir(dirname(outPath), { recursive: true });
runFfmpeg([
  "-hide_banner", "-loglevel", "error", "-y",
  ...inputs,
  "-filter_complex", filters.join(";"),
  "-map", "[out]", "-frames:v", "1", outPath,
], "character contact sheet");

// Geometry is checked numerically rather than by looking: the sheet is the
// owner's to judge, but an empty, mis-sized or mis-placed one is this script's
// bug, and both have shipped before.
const probe = spawnSync("ffprobe", [
  "-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=width,height", "-of", "csv=p=0", outPath,
], { encoding: "utf8" });
const dimensions = probe.stdout.trim();
if (dimensions !== `${SHEET_WIDTH},${SHEET_HEIGHT}`) {
  throw new Error(`Sheet came out ${dimensions}, expected ${SHEET_WIDTH},${SHEET_HEIGHT}`);
}
for (const rectangle of panelRectangles) {
  const stats = spawnSync("ffprobe", [
    "-v", "error", "-f", "lavfi",
    "-i", `movie=${outPath},crop=${rectangle.width}:${rectangle.height}:${rectangle.x}:${rectangle.y},signalstats`,
    "-show_entries", "frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.YMIN,lavfi.signalstats.YMAX",
    "-of", "default=nw=0:nk=0",
  ], { encoding: "utf8" });
  // Read by name: signalstats emits its tags in its own order, not the order
  // they were asked for.
  const read = (tag) => Number(
    stats.stdout.match(new RegExp(`lavfi\\.signalstats\\.${tag}=([\\d.]+)`))?.[1],
  );
  const average = read("YAVG");
  const low = read("YMIN");
  const high = read("YMAX");
  // A panel that never rendered, or landed somewhere else, is the card fill:
  // dark and flat. Every real shot carries a lit backdrop and a shaded body,
  // so it is neither. Measured on the ten-build male sheet: the darkest panel
  // averages 47 luma over a range of 233.
  if (!(average > 20) || !(high - low > 60)) {
    throw new Error(
      `${rectangle.buildId} ${rectangle.shot}: the panel at (${rectangle.x}, ${rectangle.y}) is flat `
      + `(luma average ${average}, range ${low}–${high}) — nothing was drawn there`,
    );
  }
}
await rm(scratch, { recursive: true, force: true });

await writeFile(`${outPath}.json`, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  roster: options.roster,
  sexes,
  cards: cards.map((card) => ({
    buildId: card.buildId,
    donorFormId: card.donor?.formId ?? null,
    donorName: tidyEditorId(card.donor?.editorId),
    donorNameSource: "tidied editor id (Skyrim.esm FULL is a localised string id and the STRINGS tables are not in the vault)",
  })),
}, null, 2)}\n`);

process.stdout.write(`${outPath}\n`);
