import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The known-answer test for `measure-contact-windows.mjs --critical`.
 *
 * This tool decides where a paired execution lands, and its numbers go straight
 * into a `PairedCriticalProfile` — get them wrong and the attacker swings at
 * air, which is not something a unit test elsewhere would catch. The only
 * defence is that it must reproduce the one execution that *was* audited by
 * hand, frame by frame against rendered geometry, and shipped with the owner's
 * approval: the one-handed RIPOSTE.
 *
 * An earlier version of this tool did not reproduce it, and the honest response
 * at the time was to refuse to use its output for anything else. This test is
 * what stops that state of affairs recurring silently — if it fails, no
 * execution measured by the tool should be trusted until it passes again.
 *
 * The audited values, from the profile in `equipment/movesets/oneHanded.ts` and
 * the provenance in the pipeline's animation config:
 *
 *   startingSeparation   0.90 m
 *   contact              source 0.5667 s, i.e. 0.400 s into the trimmed clip
 *   withdrawal           source 0.70 s   (so contact must be clear before it)
 *   trim                 source 0.1667 .. 1.30 s
 *
 * Tolerance is one frame of the 30 Hz source throughout. Anything tighter would
 * fail on the sampling grid rather than on a real disagreement.
 */

const SCRIPT = fileURLToPath(new URL("../measure-contact-windows.mjs", import.meta.url));
/** One frame of the 30 Hz source, plus a hair for the 120 Hz sampling grid. */
const FRAME = 1 / 30 + 1e-3;

function measure(args) {
  const output = execFileSync(process.execPath, [SCRIPT, "--critical", ...args], {
    encoding: "utf8",
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
  });
  const recommendation = output.match(
    /-> startingSeparation ([\d.]+), contact ([\d.]+)s, release ([\d.]+)s/,
  );
  const trim = output.match(
    /trim playbackStartTime ([\d.]+) playbackEndTime ([\d.]+)\s+\(contact at ([\d.]+)s/,
  );
  if (!recommendation || !trim) throw new Error(`no recommendation in:\n${output}`);
  return {
    separation: Number(recommendation[1]),
    contact: Number(recommendation[2]),
    release: Number(recommendation[3]),
    trimStart: Number(trim[1]),
    trimEnd: Number(trim[2]),
    contactIntoTrim: Number(trim[3]),
  };
}

describe("the critical measurement reproduces the hand-audited riposte", () => {
  const measured = measure(["RIPOSTE"]);

  it("chooses the separation the audit chose", () => {
    expect(measured.separation).toBe(0.9);
  });

  it("finds contact at the source's own annotated contact frame", () => {
    expect(measured.contact).toBeCloseTo(0.5667, 1);
    expect(Math.abs(measured.contact - 0.5667)).toBeLessThan(FRAME);
  });

  it("has the blade clear again before the authored withdrawal", () => {
    expect(measured.release).toBeLessThan(0.7);
  });

  it("reproduces the audited trim", () => {
    expect(Math.abs(measured.trimStart - 0.1667)).toBeLessThan(FRAME);
    expect(Math.abs(measured.trimEnd - 1.3)).toBeLessThan(FRAME);
  });

  it("puts contact where the shipped profile puts it inside the trimmed clip", () => {
    // `damageProgress` is derived from this: 0.400 s into a 1.133 s action.
    expect(measured.contactIntoTrim).toBeCloseTo(0.4, 2);
  });

  it("rejects the stray blade pass the audit rejected", () => {
    // The clip brushes its victim at source ~0.10 s before driving in. The
    // audit called that out by name; picking it would trim the execution to a
    // moment where nothing meaningful happens.
    expect(measured.contact).toBeGreaterThan(0.3);
  });
});

describe("the two-handed executions it was then used for", () => {
  it("places a greatsword further out than a sword, and an axe further still", () => {
    // Not a tuned number: it falls out of the rule (the furthest separation
    // that still reaches the torso) applied to longer weapons. If these ever
    // invert, something is wrong with the weapon capsules.
    const greatsword = measure(["--weapon", "steel-greatsword", "GREATSWORD_RIPOSTE"]);
    const greataxe = measure(["--weapon", "steel-battleaxe", "GREATAXE_RIPOSTE"]);
    expect(greatsword.separation).toBeGreaterThan(0.9);
    expect(greataxe.separation).toBeGreaterThan(greatsword.separation);
    for (const measured of [greatsword, greataxe]) {
      expect(measured.contactIntoTrim).toBeCloseTo(0.4, 2);
      expect(measured.release).toBeGreaterThan(measured.contact);
    }
  });
});
