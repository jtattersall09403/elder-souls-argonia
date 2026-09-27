import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import { ScreenOverlay, createScreenOverlayChannel } from "../character/screenOverlay";
import { TravelOverlay } from "./travelOverlay";

// Walk 2 RB rec: the travel prompt, notice and menu sat in a drei
// `<Html fullscreen>` inside the canvas, anchored at the world origin like the
// door prompt was (D2), so they could project off screen. They are now DOM
// over the canvas, fed through the screen-overlay channel.
describe("travel overlay (walk 2, same defect as D2)", () => {
  it("is not a full-screen drei <Html> in the canvas", () => {
    const src = readFileSync(new URL("./TravelSockets.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/<Html\s[^>]*fullscreen/);
  });

  it("draws the prompt, the notice and the load error as plain DOM through the channel", () => {
    const channel = createScreenOverlayChannel();
    channel.set("travel", <TravelOverlay loadError="travel-services.json: HTTP 404"
      prompt={{ role: "ferryman" }} notice={text(CATALOGUE, "text.travel.arrived")} menu={null}
      onTravel={() => undefined} onClose={() => undefined} />);
    const html = renderToStaticMarkup(<ScreenOverlay channel={channel} />);
    expect(html).toMatch(/data-screen-overlay="true" style="position:absolute;inset:0/);
    expect(html).toContain("data-travel-prompt");
    expect(html).toContain("ferryman");
    expect(html).toContain("[E]");
    expect(html).toContain(text(CATALOGUE, "text.travel.arrived"));
    expect(html).toContain("travel-services.json: HTTP 404");
    expect(html).not.toMatch(/translate3d|matrix3d/);
  });

  it("clears a slot, and notifies only when a slot changes", () => {
    const channel = createScreenOverlayChannel();
    let calls = 0;
    channel.subscribe(() => { calls += 1; });
    const node = <span data-x />;
    channel.set("travel", node);
    channel.set("travel", node);
    expect(calls).toBe(1);
    channel.set("travel", null);
    expect(calls).toBe(2);
    expect(renderToStaticMarkup(<ScreenOverlay channel={channel} />)).not.toContain("data-x");
  });
});
