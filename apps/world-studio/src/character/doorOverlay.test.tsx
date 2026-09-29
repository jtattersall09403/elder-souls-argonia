import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOGUE, text } from "@elder-souls/text-catalogue";
import { DOOR_TEXT } from "@elder-souls/game-core/interior/doors";
import { DoorOverlay, createDoorOverlayChannel } from "./doorOverlay";

describe("door overlay (walk 2 D2)", () => {
  it("is not a drei <Html> in the canvas: that projected its world-origin anchor, 3 km from any door", () => {
    const src = readFileSync(new URL("./InteriorDoors.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "@react-three\/drei"/);
    expect(src).not.toMatch(/<Html\b/);
  });

  it("renders the prompt, the fade and the error line as plain full-screen DOM", () => {
    const channel = createDoorOverlayChannel();
    channel.setPrompt({ kind: "enter", textId: DOOR_TEXT.enter, doorId: "door.x" });
    channel.setError("KeebaHouseFisher.json: HTTP 404");
    channel.setFade(0.6);
    const html = renderToStaticMarkup(<DoorOverlay channel={channel} />);
    expect(html).toContain('data-door-prompt="enter"');
    expect(html).toContain(text(CATALOGUE, DOOR_TEXT.enter));
    expect(html).toContain("[E]");
    expect(html).toContain("KeebaHouseFisher.json: HTTP 404");
    expect(html).toMatch(/data-door-fade="true" style="[^"]*opacity:0.6/);
    // Absolutely placed in the view's own box: no projected transform.
    expect(html).toMatch(/data-door-overlay="true" style="position:absolute;inset:0/);
    expect(html).not.toMatch(/translate3d|matrix3d/);
  });

  it("shows the closed line with no [E], and nothing when there is no prompt", () => {
    const channel = createDoorOverlayChannel();
    channel.setPrompt({ kind: "closed", textId: DOOR_TEXT.closed, doorId: "door.y" });
    const closed = renderToStaticMarkup(<DoorOverlay channel={channel} />);
    expect(closed).toContain(text(CATALOGUE, DOOR_TEXT.closed));
    expect(closed).not.toContain("[E]");
    channel.setPrompt(null);
    expect(renderToStaticMarkup(<DoorOverlay channel={channel} />)).not.toContain("data-door-prompt");
  });

  it("shows the catalogue's loading line inside the fade while a cell loads, and none otherwise (walk 4 c)", () => {
    const channel = createDoorOverlayChannel(1);
    expect(renderToStaticMarkup(<DoorOverlay channel={channel} />)).not.toContain("data-door-loading");
    channel.setLoading(DOOR_TEXT.loading);
    const html = renderToStaticMarkup(<DoorOverlay channel={channel} />);
    expect(html).toMatch(/data-door-fade="true"[^>]*>\s*<div data-door-loading/);
    expect(html).toContain(text(CATALOGUE, DOOR_TEXT.loading));
  });

  it("names the building on the loading line when the door carries a name, and falls back to the plain line (walk 4)", () => {
    const channel = createDoorOverlayChannel(1);
    channel.setLoading(DOOR_TEXT.loadingNamed, "the Poler's Hut");
    const named = renderToStaticMarkup(<DoorOverlay channel={channel} />);
    expect(named).toContain(text(CATALOGUE, DOOR_TEXT.loadingNamed).replace("{name}", "the Poler&#x27;s Hut"));
    expect(named).not.toContain("{name}");
    channel.setLoading(DOOR_TEXT.loading, null);
    expect(renderToStaticMarkup(<DoorOverlay channel={channel} />)).toContain(text(CATALOGUE, DOOR_TEXT.loading));
  });

  it("shows a swing door's Open prompt with the action key", () => {
    const channel = createDoorOverlayChannel();
    channel.setPrompt({ kind: "swing", textId: "text.door.prompt-open", doorId: "d.swing" });
    const html = renderToStaticMarkup(<DoorOverlay channel={channel} />);
    expect(html).toContain(text(CATALOGUE, "text.door.prompt-open"));
    expect(html).toContain("[E]");
  });

  it("notifies subscribers only when the prompt or error changes", () => {
    const channel = createDoorOverlayChannel();
    let calls = 0;
    channel.subscribe(() => { calls += 1; });
    const p = { kind: "enter" as const, textId: DOOR_TEXT.enter, doorId: "d" };
    channel.setPrompt(p);
    channel.setPrompt({ ...p });
    channel.setError(null);
    channel.setFade(1);
    expect(calls).toBe(1);
  });
});
