import { describe, expect, it, vi } from "vitest";
import { WorkerPool } from "three/examples/jsm/utils/WorkerPool.js";

let built = 0;

vi.mock("three/examples/jsm/loaders/KTX2Loader.js", () => {
  class KTX2Loader {
    dispose = vi.fn();
    workerPool = new WorkerPool();
    workerLimit = 4;
    constructor() { built += 1; }
    setTranscoderPath() { return this; }
    detectSupport() { return this; }
    setWorkerLimit(n: number) { this.workerLimit = n; return this; }
    init = vi.fn(async () => undefined);
  }
  return { KTX2Loader };
});

const gls: { gl: unknown } = { gl: null };
vi.mock("@react-three/fiber", () => ({ useThree: (sel: (s: { gl: unknown }) => unknown) => sel({ gl: gls.gl }) }));

const { kitDecodersFor, installKitDecoders, kitDecoderBuilds, KTX2_WORKERS } = await import("./kitLoader");
const { useKitDecoders } = await import("./useKitDecoders");
type KitRenderer = import("./kitLoader").KitRenderer;

const renderer = () => ({ dispose: vi.fn() }) as unknown as KitRenderer;
const BASE = "/";

describe("kit decoders are owned by the renderer", () => {
  it("mounting and unmounting a consumer 50 times builds the loader once", () => {
    const gl = renderer();
    gls.gl = gl;
    const before = built;
    const first = useKitDecoders(BASE);
    for (let i = 0; i < 50; i++) expect(useKitDecoders(BASE)).toBe(first);
    expect(built - before).toBe(1);
    expect(kitDecoderBuilds(gl)).toBe(1);
    expect(first.ktx2.dispose).not.toHaveBeenCalled();
    expect((first.ktx2 as unknown as { workerLimit: number }).workerLimit).toBe(KTX2_WORKERS);
  });

  it("installs and inits at startup, and disposes with the renderer", async () => {
    const gl = renderer();
    const rendererDispose = (gl as unknown as { dispose: ReturnType<typeof vi.fn> }).dispose;
    const d = await installKitDecoders(gl, BASE);
    expect(d.ktx2.init).toHaveBeenCalledTimes(1);
    expect(kitDecodersFor(gl, BASE)).toBe(d);
    gl.dispose();
    expect(d.ktx2.dispose).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(kitDecoderBuilds(gl)).toBe(0);
  });

  it("a worker that errors rejects its pending task instead of parking it", async () => {
    const d = kitDecodersFor(renderer(), BASE);
    const pool = (d.ktx2 as unknown as { workerPool: WorkerPool }).workerPool;
    const workers: EventTarget[] = [];
    pool.setWorkerCreator(() => {
      const w = Object.assign(new EventTarget(), { postMessage: vi.fn(), terminate: vi.fn() });
      workers.push(w);
      return w as unknown as Worker;
    });
    pool.setWorkerLimit(1);
    const first = pool.postMessage({ n: 1 }, []);
    const second = pool.postMessage({ n: 2 }, []);
    workers[0].dispatchEvent(new Event("error"));
    expect(await first).toEqual({ data: { type: "error", error: "KTX2 worker failed" } });
    expect(workers).toHaveLength(2);
    workers[1].dispatchEvent(Object.assign(new Event("message"), { data: { type: "transcode" } }));
    expect(await second).toMatchObject({ data: { type: "transcode" } });
  });
});
