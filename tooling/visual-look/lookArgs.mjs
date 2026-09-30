// Argument parsing, subject classing and judge-brief assembly for look.mjs
// (pure functions: unit-tested in lookArgs.test.mjs, no browser).
import { readFileSync } from "node:fs";

export const CLASSES = ["fire-fixture", "hanging-fixture", "doorway", "walkway",
  "ground-contact", "interior-surface", "furniture-contact"];

export const USAGE = `usage:
  npm run look -- piece <kit> <assetId> [--class C[,C]] [--out DIR]
  npm run look -- composite <kit> <assetId> [...]       (same path: a composite is a kit asset)
  npm run look -- place <scene> <x> <z> [--radius M] [--class C] [--out DIR]
      (a workbench scene region: delegates to wb.py render, one Blender launch per view)
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
    else if (a.startsWith("--")) throw new Error(`unknown flag ${a}\n${USAGE}`);
    else pos.push(a);
  }
  const [mode, ...rest] = pos;
  if (mode === "piece" || mode === "composite") {
    if (rest.length !== 2) throw new Error(`${mode} needs <kit> <assetId>\n${USAGE}`);
    return { ...opts, mode, kit: rest[0], asset: rest[1] };
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
export function judgeBrief({ subject, images, classes, rows, facts }) {
  const pick = rows.filter((r) => r.cls === "all" || classes.includes(r.cls));
  return [
    `You are a visual judge (read-only). Read each image with the Read tool, then answer every question below.`,
    `Subject: ${subject}. Classes: ${classes.join(", ")}.`,
    `Facts measured by the tool (trust these over your eye for sizes): ${facts}`,
    `Images:`, ...images.map((p) => `- ${p}`),
    `Sheet key: tiles are front / 3-4 / side / top-down / eye-height 1.7 m / low grazing (or night for fire). Grey grid = ground plane at the piece's pivot height; grid spacing and bounds size are in each caption; green wire = the manifest bounds; white dots = the runtime flame anchors.`,
    `Questions (answer each: id, PASS / FAIL / UNSURE, the evidence in one line with a measurement against the grid where you can; UNSURE only when the view cannot show it, and say which view would):`,
    ...pick.map((r) => `- [${r.id}] ${r.question} Pass bar: ${r.bar}`),
    `Then list any OTHER defect you see that no question asked about (these become new look-list rows). Reply in <= 25 lines.`,
  ].join("\n");
}
