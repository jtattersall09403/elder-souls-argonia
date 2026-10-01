import { describe, expect, it } from "vitest";
import { PermanentFetchError, TransientFetchError, fetchWithRetry, withRetry } from "./fetchRetry";

const noWait = { pause: async () => {} };
const answer = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ status }) }) as Response;

describe("settlement fetch retry (16k walk 7: one dropped request killed the layer on a phone)", () => {
  it("a dropped connection that comes back resolves on a later attempt", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; if (n < 3) throw new TypeError("Failed to fetch"); return answer(200); }) as typeof fetch;
    const r = await fetchWithRetry("kit.json", { ...noWait, fetchFn });
    expect(r.ok).toBe(true);
    expect(n).toBe(3);
  });

  it("gives up after the bounded attempts with a transient error, waiting longer each time", async () => {
    const waits: number[] = [];
    const fetchFn = (async () => answer(503)) as typeof fetch;
    await expect(fetchWithRetry("kit.json", { attempts: 4, baseDelayMs: 100, fetchFn,
      pause: async (ms) => { waits.push(ms); } })).rejects.toBeInstanceOf(TransientFetchError);
    expect(waits).toEqual([100, 200, 400]);
  });

  it("a 404 is the data's fault: no retry, a permanent error", async () => {
    let n = 0;
    const fetchFn = (async () => { n++; return answer(404); }) as typeof fetch;
    await expect(fetchWithRetry("kit.json", { ...noWait, fetchFn })).rejects.toBeInstanceOf(PermanentFetchError);
    expect(n).toBe(1);
  });

  it("withRetry retries any other loader failure (a GLB request)", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; if (n < 2) throw new Error("net"); return "gltf"; }, noWait))
      .resolves.toBe("gltf");
  });
});
