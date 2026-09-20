import { describe, expect, it, vi } from "vitest";
import type * as THREE from "three";

const disposals: ReturnType<typeof vi.fn>[] = [];

vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => {
  class KTX2Loader {
    dispose = vi.fn();
    constructor() {
      disposals.push(this.dispose);
    }
    setTranscoderPath() { return this; }
    detectSupport() { return this; }
  }
  return { KTX2Loader };
});

const { kitDecodersFor, retainKitDecoders, releaseKitDecoders } = await import("./kitLoader");

const renderer = () => ({}) as THREE.WebGLRenderer;
const BASE = "/";

describe("kit decoder lifetime", () => {
  it("keeps the decoders while a consumer still holds them", () => {
    const gl = renderer();
    const first = retainKitDecoders(gl, BASE);
    const second = retainKitDecoders(gl, BASE);
    expect(second).toBe(first);
    releaseKitDecoders(gl, BASE);
    expect(first.ktx2.dispose).not.toHaveBeenCalled();
    expect(kitDecodersFor(gl, BASE)).toBe(first);
  });

  it("disposes on the last release and builds fresh decoders after it", () => {
    const gl = renderer();
    const first = retainKitDecoders(gl, BASE);
    retainKitDecoders(gl, BASE);
    releaseKitDecoders(gl, BASE);
    releaseKitDecoders(gl, BASE);
    expect(first.ktx2.dispose).toHaveBeenCalledTimes(1);
    const next = kitDecodersFor(gl, BASE);
    expect(next).not.toBe(first);
    expect(next.ktx2).not.toBe(first.ktx2);
  });

  it("ignores a release with nothing held", () => {
    const gl = renderer();
    expect(() => releaseKitDecoders(gl, BASE)).not.toThrow();
    const only = kitDecodersFor(gl, BASE);
    expect(only.ktx2.dispose).not.toHaveBeenCalled();
  });
});
