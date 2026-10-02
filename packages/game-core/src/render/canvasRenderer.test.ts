import { describe, expect, it, vi } from "vitest";

let made = 0;
vi.mock("./createRenderer", () => ({
  requestedBackend: () => "webgpu",
  activeBackend: () => "webgpu",
  createRenderer: async () => { made++; await Promise.resolve(); return { id: made, dispose() {} }; },
}));

const { canvasRenderer } = await import("./canvasRenderer");

describe("canvasRenderer", () => {
  it("makes one renderer when R3F configures the same canvas twice during the await (walk 10 night rain)", async () => {
    made = 0;
    const gl = canvasRenderer();
    const canvas = {};
    const [a, b] = await Promise.all([gl({ canvas }), gl({ canvas })]);
    expect(a).toBe(b);
    expect(made).toBe(1);
  });

  it("makes a fresh renderer for the canvas once the old one is disposed", async () => {
    made = 0;
    const gl = canvasRenderer();
    const canvas = {};
    const a = await gl({ canvas });
    a.dispose();
    const b = await gl({ canvas });
    expect(b).not.toBe(a);
    expect(made).toBe(2);
  });
});
