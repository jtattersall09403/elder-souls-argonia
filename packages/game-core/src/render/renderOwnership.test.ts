import { describe, expect, it } from "vitest";
import { createFrameRenderOwner, renderIfUnowned } from "./renderOwnership";

describe("frame render ownership (vol10 diag7 L2: an unmounted water pipeline blanked the frame)", () => {
  it("renders a frame when no pipeline is mounted, yields while one is, and resumes after it unmounts", () => {
    const owner = createFrameRenderOwner();
    let frames = 0;
    const render = () => { frames += 1; };
    expect(renderIfUnowned(owner, render)).toBe(true); // a scene with no water still draws
    const release = owner.claim(); // the water pipeline mounts
    expect(renderIfUnowned(owner, render)).toBe(false);
    release();
    release(); // a double release (StrictMode effect replay) never goes negative
    expect(owner.claimed).toBe(false);
    expect(renderIfUnowned(owner, render)).toBe(true);
    expect(frames).toBe(2);
  });
});
