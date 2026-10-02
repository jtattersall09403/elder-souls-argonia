// Argument parsing, subject classing and judge-brief assembly for look.mjs
// (pure functions: unit-tested in lookArgs.test.mjs, no browser).
import { readFileSync } from "node:fs";

export const CLASSES = ["fire-fixture", "hanging-fixture", "doorway", "walkway",
  "ground-contact", "interior-surface", "furniture-contact", "ground-paint", "building-seam"];

export const USAGE = `usage:
  npm run look -- piece <kit> <assetId> [--class C[,C]] [--out DIR]
  npm run look -- composite <kit> <assetId> [...]       (same path: a composite is a kit asset)
  npm run look -- place <scene> <x> <z> [--radius M] [--class C] [--out DIR]
      (a workbench scene region: wb.py render --shots, one Blender launch for every view)
  npm run look -- fixtures [<kit> <assetId> ...] [--fire-dir DIR] [--out DIR]
      (the real flame shader on the real kit piece at the loader's anchors, day and night,
       front / 3-4 / flame close-up; no pairs = the default fixture list)
  npm run look -- preset [<presetId> ...] [--out DIR]
      (a fire preset alone over 6 frames, day and night; no ids = every preset)
  npm run look -- seam <placeId> <placement-id-suffix> [--bearing DEG] [--out DIR]
      (a building's base on its own padded ground from 6 m at 1.2 m, with and without the
       place's ground paint: trampled ring + contact shade; 480x270, one frame each)
default --out tooling/.reports/look/`;

/** argv (after the script) -> { mode, kit, asset, scene, x, z, radius, classes, out }. */
export function parseArgs(argv) {
  const opts = { classes: null, out: "tooling/.reports/look", radius: 6 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--class") opts.classes = argv[++i].split(",");
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--radius") opts.radius = Number(argv[++i]);
    else if (a === "--fire-dir") opts.fireDir = argv[++i];
    else if (a === "--bearing") opts.bearing = Number(argv[++i]);
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}\n${USAGE}`);
    else pos.push(a);
  }
  const [mode, ...rest] = pos;
  if (mode === "piece" || mode === "composite") {
    if (rest.length !== 2) throw new Error(`${mode} needs <kit> <assetId>\n${USAGE}`);
    return { ...opts, mode, kit: rest[0], asset: rest[1] };
  }
  if (mode === "fixtures") {
    const keys = rest.flatMap((a) => (a.includes("|") ? [a.split("|")] : [a])).flat();
    if (keys.length % 2) throw new Error(`fixtures takes <kit> <assetId> pairs\n${USAGE}`);
    const fixtures = [];
    for (let i = 0; i < keys.length; i += 2) fixtures.push(`${keys[i]}|${keys[i + 1]}`);
    return { ...opts, mode, fixtures };
  }
  if (mode === "preset") return { ...opts, mode, presets: rest };
  if (mode === "seam") {
    if (rest.length !== 2) throw new Error(`seam needs <placeId> <placement-id-suffix>\n${USAGE}`);
    return { ...opts, mode, place: rest[0], suffix: rest[1] };
  }
  if (mode === "place") {
    const [scene, x, z] = rest;
    if (rest.length !== 3 || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) {
      throw new Error(`place needs <scene> <x> <z>\n${USAGE}`);
    }
    return { ...opts, mode, scene, x: Number(x), z: Number(z) };
  }
  throw new Error(USAGE);
}

/** The look-list classes of a kit manifest row (the judge's rows come from these). */
export function classesFor(row, kit = "") {
  const id = String(row?.id ?? "").toLowerCase();
  const kind = row?.light?.fixtureKind;
  const out = [];
  if ((row?.flames?.length ?? 0) > 0 || ["campfire", "brazier", "candle", "torch", "lantern"].includes(kind)
      || /campfire|torch|candle|brazier|fireplace/.test(id)) out.push("fire-fixture");
  if (row?.anchorClass === "hanging") out.push("hanging-fixture");
  if (/door/.test(id)) out.push("doorway");
  if (/boardwalk|walkway|dock|bridge|plank|pier|stair/.test(id)) out.push("walkway");
  if (row?.category === "furniture" || /table|chair|bench|bed|shelf|stool/.test(id)) out.push("furniture-contact");
  if (/-int$|interior/.test(kit) && /wall|floor|ceiling|corner|hall|room/.test(id)) out.push("interior-surface");
  if (out.length === 0 || /tent|hut|house|shack|shelter/.test(id)) {
    if (!out.includes("ground-contact") && row?.anchorClass !== "hanging") out.push("ground-contact");
  }
  return out;
}

/** Rows of look-lists.md: [{ cls, id, question, bar }]. */
export function readLookList(path) {
  return readFileSync(path, "utf8").split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| class") && !l.startsWith("| ---"))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .map(([cls, id, question, bar]) => ({ cls, id, question, bar }));
}

/** The ready-to-paste Sonnet judge brief. */
/** Each mode states the key of the sheet it actually draws (a judge told about a grid that is not there guesses). */
export const PIECE_SHEET_KEY = "tiles are front / 3-4 / side / top-down / eye-height 1.7 m / low grazing (or night for fire). Grey grid = ground plane at the piece's pivot height; grid spacing and bounds size are in each caption; green wire = the manifest bounds; white dots = the runtime flame anchors.";
export const FIXTURE_SHEET_KEY = "3 columns x 2 rows: front, three-quarter from above, close-up on the flame (a section: geometry more than 1.2 flame heights in front of the flame is clipped, by design); top row day, bottom row night. No grid or bounds wire: sizes and anchors are in the facts line (box = bounds in metres, anchors = flame anchor positions).";
export const PLACE_SHEET_KEY = "workbench render shots of the placed region, one view per image, no grid or bounds wire; judge scale against the placed pieces (a door is about 2 m, eye height 1.7 m).";
export function judgeBrief({ subject, images, classes, rows, facts, sheetKey = PIECE_SHEET_KEY }) {
  const pick = rows.filter((r) => r.cls === "all" || classes.includes(r.cls));
  return [
    `You are a visual judge (read-only). Read each image with the Read tool, then answer every question below.`,
    `Subject: ${subject}. Classes: ${classes.join(", ")}.`,
    `Facts measured by the tool (trust these over your eye for sizes): ${facts}`,
    `Images:`, ...images.map((p) => `- ${p}`),
    `Sheet key: ${sheetKey}`,
    `Questions (answer each: id, PASS / FAIL / UNSURE, the evidence in one line with a measurement against the grid where you can; UNSURE only when the view cannot show it, and say which view would):`,
    ...pick.map((r) => `- [${r.id}] ${r.question} Pass bar: ${r.bar}`),
    `Then list any OTHER defect you see that no question asked about (these become new look-list rows). Reply in <= 25 lines.`,
  ].join("\n");
}
