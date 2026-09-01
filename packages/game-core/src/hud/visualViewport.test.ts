import { describe, expect, it } from "vitest";
import { publishVisualViewport } from "./visualViewport";

/**
 * The rule the phone-layout bug kept breaking: a full-screen panel must be
 * sized by what is visible, not by the layout viewport.
 */

function fakeElement() {
  const values = new Map<string, string>();
  return {
    style: { setProperty: (name: string, value: string) => values.set(name, value) },
    values,
  } as unknown as HTMLElement & { values: Map<string, string> };
}

describe("publishing the visible rectangle", () => {
  it("reports the visual viewport's size and offset in pixels", () => {
    const target = fakeElement();
    publishVisualViewport(target, {
      width: 844.5, height: 390.25, offsetLeft: 34, offsetTop: 0,
    } as VisualViewport);
    expect(target.values.get("--visual-width")).toBe("844px");
    expect(target.values.get("--visual-height")).toBe("390px");
    expect(target.values.get("--visual-left")).toBe("34px");
    expect(target.values.get("--visual-top")).toBe("0px");
  });

  it("rounds the size down, never up", () => {
    // Half a device pixel of overhang is still a clipped border on some
    // browsers, and one lost pixel is invisible. Overhang is the bug.
    const target = fakeElement();
    publishVisualViewport(target, {
      width: 411.99, height: 730.99, offsetLeft: 0, offsetTop: 0,
    } as VisualViewport);
    expect(target.values.get("--visual-width")).toBe("411px");
    expect(target.values.get("--visual-height")).toBe("730px");
  });

  it("falls back to filling the parent where the API is absent", () => {
    const target = fakeElement();
    publishVisualViewport(target, null);
    expect(target.values.get("--visual-width")).toBe("100%");
    expect(target.values.get("--visual-height")).toBe("100%");
    expect(target.values.get("--visual-left")).toBe("0px");
    expect(target.values.get("--visual-top")).toBe("0px");
  });
});
