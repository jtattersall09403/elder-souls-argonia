import { describe, expect, it } from "vitest";
import {
  buildCatalogue,
  bySurface,
  DuplicateTextError,
  MalformedTextIdError,
  text,
  textFingerprint,
  type TextEntry,
} from "./catalogue.js";
import {
  CATALOGUE,
  SYSTEM_TEXT,
  COMBAT_SANDBOX_TEXT,
  EQUIPMENT_TEXT,
  FERRY_TEXT,
} from "./entries.js";

/** Every exported block, so a new block cannot be added without the count moving. */
const BLOCKS = [SYSTEM_TEXT, COMBAT_SANDBOX_TEXT, EQUIPMENT_TEXT, FERRY_TEXT];
const ALL = BLOCKS.flat();

const entry = (over: Partial<TextEntry> = {}): TextEntry => ({
  id: "text.system.example",
  surface: "system",
  text: "You have died.",
  ...over,
});

describe("the catalogue enforces engineering standard 4", () => {
  it("rejects a malformed ID", () => {
    expect(() => buildCatalogue([entry({ id: "died" })])).toThrow(MalformedTextIdError);
    expect(() => buildCatalogue([entry({ id: "text.System.Example" })])).toThrow(
      MalformedTextIdError,
    );
    // Two segments is not enough: text.<area>.<name>.
    expect(() => buildCatalogue([entry({ id: "text.died" })])).toThrow(
      MalformedTextIdError,
    );
  });

  it("rejects the same ID twice", () => {
    expect(() => buildCatalogue([entry(), entry({ text: "Something else." })])).toThrow(
      DuplicateTextError,
    );
  });

  it("rejects the same prose under two IDs — the tell of two agents writing one line twice", () => {
    const line = "Your breath is running out, and the surface is a long way above.";
    expect(() =>
      buildCatalogue([
        entry({ id: "text.system.breath-a", text: line }),
        entry({ id: "text.system.breath-b", text: line }),
      ]),
    ).toThrow(DuplicateTextError);
  });

  it("allows short UI labels to repeat, because they legitimately do", () => {
    const built = buildCatalogue([
      entry({ id: "text.ui.inventory-close", surface: "ui", text: "Close" }),
      entry({ id: "text.ui.map-close", surface: "ui", text: "Close" }),
    ]);
    expect(built.size).toBe(2);
  });

  it("ignores punctuation and case when comparing prose", () => {
    expect(textFingerprint("With this death, a root is severed.")).toBe(
      textFingerprint("with this death — a root is severed"),
    );
  });

  it("throws on a missing lookup rather than returning a placeholder", () => {
    expect(() => text(CATALOGUE, "text.system.nonexistent")).toThrow();
  });
});

describe("the shipped entries", () => {
  it("build", () => {
    expect(CATALOGUE.size).toBe(ALL.length);
  });

  it("expose a surface view for the voice reviewer to iterate", () => {
    // The reviewer sweeps one surface at a time, so every surface in use must
    // come back complete. Counting from the blocks rather than from a literal
    // means adding text cannot silently leave a surface unreviewed.
    for (const surface of new Set(ALL.map((e) => e.surface))) {
      expect(bySurface(CATALOGUE, surface).length, surface).toBe(
        ALL.filter((e) => e.surface === surface).length,
      );
    }
  });

  it("carry a note on every entry — context is what the voice review reads", () => {
    // `ui` chrome is exempt: a button reading "Max reach" has no context a
    // reviewer could use. Everything with a voice must explain itself.
    for (const e of ALL) {
      if (e.surface === "ui") continue;
      expect(e.note, e.id).toBeTruthy();
    }
  });
});
