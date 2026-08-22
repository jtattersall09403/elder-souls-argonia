import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * A character is two tracked binaries: one rig carrying the skeleton and every
 * clip, and one body per race. The animation manifest's support curves and
 * fitted hurtbox were measured against exact bytes, so a working tree where the
 * manifest and the binaries disagree is a build that is subtly wrong rather
 * than obviously broken.
 */
describe("tracked runtime character assets", () => {
  it("byte-matches every rig and race body the roster declares", async () => {
    const roster = JSON.parse(await readFile(
      new URL("../actors/generated/races.json", import.meta.url),
      "utf8",
    )) as { rig: { asset: string; sha256: string }; races: Record<string, { asset: string; sha256: string }> };

    const tracked = [roster.rig, ...Object.values(roster.races)];
    expect(tracked.length).toBeGreaterThan(1);
    for (const entry of tracked) {
      expect(entry.sha256, entry.asset).toMatch(/^[a-f0-9]{64}$/);
      const bytes = await readFile(new URL(`../../../public/${entry.asset}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex"), entry.asset).toBe(entry.sha256);
    }
  });
});
