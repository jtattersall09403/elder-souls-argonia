import { describe, expect, it } from "vitest";
import { SoundEventBus } from "./events";
import { FakeAudioBackend } from "./fakeBackend";
import { AudioManager, type AudioManagerOptions } from "./manager";
import { shippedManifest } from "./testManifest";

const manifest = shippedManifest();
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Seeded LCG so every roll is reproducible. */
function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function rig(opts: Partial<AudioManagerOptions> = {}) {
  const fetched: string[] = [];
  const backend = new FakeAudioBackend((bytes) => {
    const id = dec.decode(bytes);
    return manifest.assets[id].durationS;
  });
  const byFile = new Map(Object.entries(manifest.assets).map(([id, a]) => [a.file, id]));
  const mgr = new AudioManager({
    backend,
    manifest,
    baseUrl: "/audio/",
    random: seeded(),
    wallClock: () => backend.time,
    fetchBytes: async (url) => {
      fetched.push(url);
      return enc.encode(byFile.get(url.replace("/audio/", ""))!).buffer as ArrayBuffer;
    },
    ...opts,
  });
  return { backend, mgr, fetched };
}

describe("AudioManager: events", () => {
  it("streams the clip on first use, then plays on the event's bus within the set's variance", async () => {
    const { backend, mgr, fetched } = rig();
    mgr.play({ type: "combat.hit", weapon: "blade", target: "flesh" });
    expect(backend.voices).toHaveLength(0);
    await flush();
    expect(fetched).toHaveLength(1);
    const v = backend.voices[0];
    expect(v.spec.bus).toBe("combat");
    const set = manifest.sets["combat.impact.blade.flesh"];
    const db = 20 * Math.log10(v.spec.gain);
    expect(Math.abs(db - set.gainDb)).toBeLessThanOrEqual(set.dbVariance + 1e-9);
    expect(Math.abs(v.spec.rate - 1)).toBeLessThanOrEqual(set.pitchVariancePct / 100 + 1e-9);
  });

  it("never plays the same variant twice running", async () => {
    const { backend, mgr } = rig();
    await mgr.prefetch(["combat.swing.blade"]);
    for (let i = 0; i < 12; i++) mgr.play({ type: "combat.swing", weapon: "blade" });
    const clips = backend.voices.map((v) => v.spec.clip);
    for (let i = 1; i < clips.length; i++) expect(clips[i]).not.toBe(clips[i - 1]);
  });

  it("plays what a SoundEventBus carries once attached, and stops when detached", async () => {
    const { backend, mgr } = rig();
    await mgr.prefetch(["combat.bow.nock"]);
    const bus = new SoundEventBus();
    const off = mgr.attach(bus);
    bus.emit({ type: "bow.nock" });
    off();
    bus.emit({ type: "bow.nock" });
    expect(backend.voices).toHaveLength(1);
  });

  it("culls positional events beyond the distance limit without loading them", async () => {
    const { backend, mgr, fetched } = rig({ listenerPosition: () => ({ x: 0, y: 0, z: 0 }), maxDistanceM: 30 });
    mgr.play({ type: "combat.swing", weapon: "blade", at: { x: 100, y: 0, z: 0 } });
    mgr.play({ type: "combat.swing", weapon: "blade", at: { x: 10, y: 0, z: 0 } });
    await flush();
    expect(fetched).toHaveLength(1);
    expect(backend.voices[0].position).toEqual({ x: 10, y: 0, z: 0 });
  });

  it("plays a streamed one-shot where the event happened, even if the caller reuses its vector", async () => {
    const { backend, mgr } = rig();
    const scratch = { x: 1, y: 2, z: 3 };
    mgr.play({ type: "combat.hit", weapon: "blade", target: "flesh", at: scratch });
    scratch.x = 99; // the caller's next frame
    await flush();
    expect(backend.voices[0].position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("ignores an event at a non-finite position", async () => {
    const { backend, mgr } = rig();
    await mgr.prefetch(["combat.bow.nock"]);
    mgr.play({ type: "bow.nock", at: { x: NaN, y: 0, z: 0 } });
    expect(backend.voices).toHaveLength(0);
  });

  it("drops a one-shot whose clip arrived too late to be in sync", async () => {
    const { backend, mgr } = rig({ lateDropS: 0.1 });
    mgr.play({ type: "bow.release" });
    backend.advance(0.5); // the fetch took half a second
    await flush();
    expect(backend.voices).toHaveLength(0);
    await mgr.prefetch(["combat.bow.fire"]);
    mgr.play({ type: "bow.release" }); // every variant resident now: plays at once
    expect(backend.voices).toHaveLength(1);
  });

  it("at the one-shot budget, steals the oldest lowest-priority one-shot, never a higher one", async () => {
    const { backend, mgr } = rig({ maxOneShots: 3 });
    await mgr.prefetch(["ambient.marsh.birds-marsh3-night-a01-sd", "combat.swing.blade"]);
    mgr.playSet("ambient.marsh.birds-marsh3-night-a01-sd");
    backend.advance(0.01);
    mgr.play({ type: "combat.swing", weapon: "blade" });
    mgr.play({ type: "combat.swing", weapon: "blade" });
    mgr.play({ type: "combat.swing", weapon: "blade" }); // budget full: the bird goes
    expect(backend.voices[0].stopAt).not.toBeNull();
    expect(mgr.stats().oneShots).toBe(3);
    mgr.playSet("ambient.marsh.birds-marsh3-night-a01-sd"); // lower than every live voice: refused
    expect(backend.voices).toHaveLength(4);
  });

  it("releases a stolen voice's clip once, so a clip another voice still plays stays loaded", async () => {
    const { backend, mgr } = rig({ maxOneShots: 1, idleUnloadS: 0 });
    const set = "combat.sheathe.blade-1h"; // one variant: both plays share the clip
    expect(manifest.sets[set].variants).toHaveLength(1);
    await mgr.prefetch([set]);
    mgr.playSet(set);
    mgr.playSet(set); // steals the first
    backend.advance(0.001); // the stolen voice ends
    mgr.update();
    expect(mgr.cache.isResident(manifest.sets[set].variants[0])).toBe(true);
  });
});

describe("AudioManager: ambience beds (decision 0094 §4 runtime crossfade)", () => {
  const BED = "weather.rain.heavy";

  it("starts a bed at loopStart, then crossfades each cycle into the next inside the pad", async () => {
    const { backend, mgr } = rig({ bedFadeS: 2, lookaheadS: 0.5 });
    mgr.setAmbience({ beds: [{ set: BED, gain: 1 }], details: [] });
    await flush();
    const loop = manifest.assets[manifest.sets[BED].variants[0]].loop!;
    const length = loop.endS - loop.startS;
    const group = backend.groups[0];
    expect(group.ramps[0]).toMatchObject({ rampS: 2 }); // the bed fades in on its group
    const first = backend.voices[0];
    expect(first.spec).toMatchObject({ offsetS: loop.startS, fadeInS: 0, fadeOutS: loop.fadeS, group: { id: group.id } });
    expect(first.spec.durationS).toBeCloseTo(length + loop.fadeS);
    backend.advance(length - 0.4);
    mgr.update();
    const second = backend.voices[1];
    // The next cycle fades in exactly where the previous one fades out: [length, length + fadeS].
    expect(second.startAt).toBeCloseTo(length);
    expect(second.spec).toMatchObject({ offsetS: loop.startS, fadeInS: loop.fadeS, fadeOutS: loop.fadeS });
    expect(first.endAt).toBeCloseTo(second.startAt + loop.fadeS);
    for (let i = 0; i < 30; i++) {
      backend.advance(0.25);
      mgr.update();
      expect(mgr.stats().bedVoices).toBeLessThanOrEqual(2);
    }
  });

  it("changes a bed's level on its group only: no voice envelope is touched", async () => {
    const { backend, mgr } = rig({ bedFadeS: 2 });
    mgr.setAmbience({ beds: [{ set: BED, gain: 1 }], details: [] });
    await flush();
    const specs = backend.voices.map((v) => ({ ...v.spec }));
    mgr.setAmbience({ beds: [{ set: BED, gain: 0.5 }], details: [] });
    expect(backend.voices.map((v) => v.spec)).toEqual(specs);
    expect(backend.groups[0].ramps.at(-1)!.gain).toBeCloseTo(0.5 * 10 ** (manifest.sets[BED].gainDb / 20));
  });

  it("fades out a bed that leaves the selection, then frees its group and clip", async () => {
    const { backend, mgr } = rig({ bedFadeS: 2 });
    mgr.setAmbience({ beds: [{ set: BED, gain: 1 }], details: [] });
    await flush();
    mgr.setAmbience({ beds: [], details: [] });
    expect(backend.groups[0].ramps.at(-1)).toMatchObject({ gain: 0, rampS: 2 });
    for (let i = 0; i < 12; i++) {
      backend.advance(0.25);
      mgr.update();
    }
    expect(mgr.stats().beds).toBe(0);
    expect(backend.groups[0].releasedAt).not.toBeNull();
    backend.advance(0.1);
    expect(backend.playing()).toHaveLength(0);
  });

  it("brings a fading bed back on the same group instead of stacking a second one", async () => {
    const { backend, mgr } = rig({ bedFadeS: 2 });
    mgr.setAmbience({ beds: [{ set: BED, gain: 1 }], details: [] });
    await flush();
    mgr.setAmbience({ beds: [], details: [] });
    backend.advance(0.5);
    mgr.update();
    mgr.setAmbience({ beds: [{ set: BED, gain: 1 }], details: [] });
    for (let i = 0; i < 12; i++) {
      backend.advance(0.25);
      mgr.update();
    }
    expect(backend.groups).toHaveLength(1);
    expect(backend.groups[0].releasedAt).toBeNull();
    expect(backend.groupGainAt(backend.groups[0])).toBeCloseTo(10 ** (manifest.sets[BED].gainDb / 20));
  });

  it("keeps the beds still fading out within one more full set", async () => {
    const { backend, mgr } = rig({ maxBeds: 2, bedFadeS: 4 });
    const sel = (sets: string[]) => ({ beds: sets.map((set) => ({ set, gain: 1 })), details: [] });
    mgr.setAmbience(sel(["weather.rain.heavy", "weather.rain.light"]));
    await flush();
    mgr.setAmbience(sel(["weather.rain.medium", "ambient.water.river"]));
    await flush();
    mgr.setAmbience(sel(["ambient.water.stream", "ambient.water.coast-waves"]));
    await flush();
    backend.advance(0.25);
    mgr.update();
    // 2 wanted + at most 2 fading; the first pair's fades were cut short.
    expect(mgr.stats().beds).toBeLessThanOrEqual(4);
  });

  it("ranks beds by the level that plays, the set's own gain included", async () => {
    const { mgr } = rig({ maxBeds: 1 });
    // frogs: -9.69 dB set gain x 1; wind bed: 0 dB x 0.5 (-6 dB): the wind is louder.
    mgr.setAmbience({
      beds: [
        { set: "ambient.marsh.frogs-night", gain: 1 },
        { set: "ambient.marsh.wind-bed-reach-lp", gain: 0.5 },
      ],
      details: [],
    });
    await flush();
    expect(manifest.sets["ambient.marsh.frogs-night"].gainDb).toBeLessThan(-6);
    expect([...(mgr as unknown as { beds: Map<string, unknown> }).beds.keys()]).toEqual(["amb:ambient.marsh.wind-bed-reach-lp"]);
  });

  it("plays at most maxBeds beds, the loudest", async () => {
    const { mgr } = rig({ maxBeds: 2 });
    const beds = ["weather.rain.heavy", "weather.rain.light", "weather.rain.medium", "ambient.water.river"].map((set, i) => ({
      set,
      gain: 1 - i * 0.1,
    }));
    mgr.setAmbience({ beds, details: [] });
    expect(mgr.stats().beds).toBe(2);
  });

  it("a long gap between updates does not fire every detail at once", async () => {
    const { backend, mgr } = rig();
    await mgr.prefetch(["weather.thunder.distant"]);
    mgr.setAmbience({ beds: [], details: [{ set: "weather.thunder.distant", perMinute: 6, gain: 1 }] });
    mgr.update();
    backend.advance(300); // a hidden tab
    mgr.update();
    expect(backend.voices.length).toBeLessThanOrEqual(1);
  });

  it("rolls details as a Poisson process at their rate", async () => {
    const { backend, mgr } = rig();
    await mgr.prefetch(["weather.thunder.distant"]);
    mgr.setAmbience({ beds: [], details: [{ set: "weather.thunder.distant", perMinute: 6, gain: 1 }] });
    mgr.update();
    for (let i = 0; i < 1200; i++) {
      backend.advance(0.5); // frame gaps at the roll ceiling
      mgr.update();
      await flush(); // a variant unloaded while idle streams back in
    }
    // 10 minutes at 6/min: ~57 expected; a seeded draw.
    expect(backend.voices.length).toBeGreaterThan(40);
    expect(backend.voices.length).toBeLessThan(80);
  });
});

describe("AudioManager: positional emitters", () => {
  it("plays only in hearing range, follows its source on its group, and unloads when far and idle", async () => {
    const listener = { x: 0, y: 0, z: 0 };
    const { backend, mgr } = rig({ listenerPosition: () => listener, maxDistanceM: 40, idleUnloadS: 5 });
    mgr.addEmitter("torch", "object.torch.burn", { x: 5, y: 1, z: 0 });
    mgr.update();
    await flush();
    const g = backend.groups[0];
    expect(g.placement.position).toEqual({ x: 5, y: 1, z: 0 });
    mgr.moveEmitter("torch", { x: 6, y: 1, z: 0 });
    expect(g.placement.position).toEqual({ x: 6, y: 1, z: 0 });
    listener.x = 200; // walk away
    for (let i = 0; i < 40; i++) {
      backend.advance(0.25);
      mgr.update();
    }
    expect(backend.playing()).toHaveLength(0);
    expect(mgr.stats().resident).toBe(0);
    listener.x = 0; // and back: it streams in again
    backend.advance(0.25);
    mgr.update();
    await flush();
    expect(backend.playing().length).toBeGreaterThan(0);
    mgr.removeEmitter("torch");
    expect(mgr.stats().emitters).toBe(0);
  });

  it("does not flap at the edge of hearing range", async () => {
    const listener = { x: 0, y: 0, z: 0 };
    const { backend, mgr } = rig({ listenerPosition: () => listener, maxDistanceM: 40 });
    mgr.addEmitter("falls", "ambient.waterfall.small", { x: 39, y: 0, z: 0 });
    mgr.update();
    await flush();
    for (const x of [-2, 2, -3, 3, -2]) {
      listener.x = x; // wobbling across 40 m
      backend.advance(0.1);
      mgr.update();
    }
    expect(backend.groups).toHaveLength(1);
    expect(mgr.stats().beds).toBe(1);
  });

  it("plays only the nearest maxEmitters", async () => {
    const { mgr } = rig({ listenerPosition: () => ({ x: 0, y: 0, z: 0 }), maxEmitters: 2 });
    for (let i = 0; i < 5; i++) mgr.addEmitter(`t${i}`, "object.torch.burn", { x: 5 + i, y: 0, z: 0 });
    mgr.update();
    expect(mgr.stats().beds).toBe(2);
    expect(mgr.stats().emitters).toBe(5);
  });

  it("follows a move made while its clip is still loading", async () => {
    const { backend, mgr } = rig({ listenerPosition: () => ({ x: 0, y: 0, z: 0 }) });
    mgr.addEmitter("torch", "object.torch.burn", { x: 1, y: 0, z: 0 });
    mgr.update(); // loading starts
    mgr.moveEmitter("torch", { x: 2, y: 0, z: 0 });
    await flush();
    expect(backend.groups[0].placement.position).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("re-adding an emitter with another set swaps the sound", async () => {
    const { backend, mgr } = rig({ listenerPosition: () => ({ x: 0, y: 0, z: 0 }) });
    mgr.addEmitter("w", "ambient.water.river", { x: 5, y: 0, z: 0 });
    mgr.update();
    await flush();
    mgr.addEmitter("w", "ambient.waterfall.small", { x: 5, y: 0, z: 0 });
    mgr.update();
    await flush();
    const clips = backend.voices.map((v) => v.spec.clip.durationS);
    const river = manifest.assets[manifest.sets["ambient.water.river"].variants[0]].durationS;
    expect(clips.some((d) => d !== river)).toBe(true); // the waterfall streamed in and plays
    for (let i = 0; i < 8; i++) {
      backend.advance(0.25);
      mgr.update();
    }
    expect(mgr.stats().beds).toBe(1); // the river faded out and went
  });

  it("two near-equal emitters at the budget edge do not swap back and forth", async () => {
    const listener = { x: 0, y: 0, z: 0 };
    const { backend, mgr } = rig({ listenerPosition: () => listener, maxEmitters: 1 });
    mgr.addEmitter("a", "object.torch.burn", { x: 10, y: 0, z: 0 });
    mgr.addEmitter("b", "object.torch.burn", { x: -10.5, y: 0, z: 0 });
    mgr.update();
    await flush();
    for (const x of [0.4, -0.4, 0.6, -0.6, 0.4]) {
      listener.x = x; // wobbling around the midpoint
      backend.advance(0.25);
      mgr.update();
      await flush();
    }
    expect(backend.groups).toHaveLength(1);
  });

  it("refuses a one-shot set as an emitter", () => {
    const { mgr } = rig();
    mgr.addEmitter("x", "combat.swing.blade", { x: 0, y: 0, z: 0 });
    expect(mgr.stats().emitters).toBe(0);
  });
});

describe("AudioManager: failures and teardown", () => {
  it("does not refetch a failing clip every frame", async () => {
    let calls = 0;
    const { backend, mgr } = rig({
      listenerPosition: () => ({ x: 0, y: 0, z: 0 }),
      fetchBytes: async () => {
        calls++;
        throw new Error("404");
      },
    });
    mgr.addEmitter("torch", "object.torch.burn", { x: 1, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) {
      backend.advance(0.25); // 15 s of frames, each re-ranking the emitter
      mgr.update();
      await flush();
    }
    expect(calls).toBeLessThanOrEqual(manifest.sets["object.torch.burn"].variants.length); // each take tried at most once
  });

  it("retries a wanted bed whose load failed, spaced by the cache", async () => {
    let fail = true;
    const { backend, mgr } = rig();
    const realFetch = (mgr.cache as unknown as { fetchBytes: (u: string) => Promise<ArrayBuffer> }).fetchBytes;
    (mgr.cache as unknown as { fetchBytes: (u: string) => Promise<ArrayBuffer> }).fetchBytes = (u) =>
      fail ? Promise.reject(new Error("net")) : realFetch(u);
    mgr.setAmbience({ beds: [{ set: "weather.rain.heavy", gain: 1 }], details: [] });
    await flush();
    expect(mgr.stats().beds).toBe(0);
    fail = false;
    for (let i = 0; i < 140; i++) {
      backend.advance(0.25); // past the 30 s retry spacing
      mgr.update();
      await flush();
    }
    expect(mgr.stats().beds).toBe(1);
    expect(backend.playing().length).toBeGreaterThan(0);
  });

  it("an update after dispose starts nothing", async () => {
    const { backend, mgr } = rig();
    mgr.setAmbience({ beds: [{ set: "weather.rain.heavy", gain: 1 }], details: [] });
    mgr.dispose();
    backend.advance(1);
    mgr.update();
    await flush();
    expect(mgr.stats().beds).toBe(0);
    expect(backend.voices).toHaveLength(0);
  });

  it("a disposed manager ignores direct calls, even for resident clips", async () => {
    const { backend, mgr } = rig({ listenerPosition: () => ({ x: 0, y: 0, z: 0 }) });
    await mgr.prefetch(["combat.bow.nock"]);
    mgr.dispose();
    mgr.play({ type: "bow.nock" });
    mgr.setAmbience({ beds: [{ set: "weather.rain.heavy", gain: 1 }], details: [] });
    mgr.addEmitter("t", "object.torch.burn", { x: 1, y: 0, z: 0 });
    await flush();
    expect(backend.voices).toHaveLength(0);
    expect(mgr.stats().beds + mgr.stats().emitters).toBe(0);
  });

  it("a clip that arrives after dispose plays nothing", async () => {
    const { backend, mgr } = rig();
    mgr.play({ type: "bow.nock" });
    mgr.dispose();
    await flush();
    expect(backend.voices).toHaveLength(0);
  });
});

describe("AudioManager: before the first gesture", () => {
  it("drops one-shots while the context is suspended, plays once unlocked", async () => {
    const { backend, mgr } = rig();
    backend.running = false;
    await mgr.prefetch(["combat.bow.nock"]);
    mgr.play({ type: "bow.nock" });
    expect(backend.voices).toHaveLength(0);
    await mgr.unlock();
    mgr.play({ type: "bow.nock" });
    expect(backend.voices).toHaveLength(1);
  });

  it("a stolen voice fades out instead of cutting", async () => {
    const { backend, mgr } = rig({ maxOneShots: 1 });
    await mgr.prefetch(["combat.swing.blade"]);
    mgr.play({ type: "combat.swing", weapon: "blade" });
    mgr.play({ type: "combat.swing", weapon: "blade" });
    expect(backend.voices[0].stopFadeS).toBeGreaterThan(0);
  });
});

describe("AudioManager: buses, acoustic state, streaming", () => {
  it("underwater muffles the world buses and leaves the UI alone", () => {
    const { backend, mgr } = rig();
    mgr.setAcousticState("underwater");
    expect(backend.busLowpass.get("combat")).toBe(400);
    expect(backend.busLowpass.get("ambience")).toBe(400);
    expect(backend.busLowpass.get("ui")).toBeNull();
    mgr.setAcousticState("exterior");
    expect(backend.busLowpass.get("combat")).toBeNull();
  });

  it("unlock resumes the backend; volume reaches the bus", async () => {
    const { backend, mgr } = rig();
    await mgr.unlock();
    expect(backend.resumed).toBe(true);
    mgr.setVolume("movement", 0.5);
    expect(backend.busGain.get("movement")).toBeCloseTo(0.5);
  });

  it("keeps a scene's prefetched sets resident until unpinned", async () => {
    const { backend, mgr } = rig({ idleUnloadS: 10 });
    await mgr.prefetch(["combat.bow.nock"]);
    for (let i = 0; i < 60; i++) {
      backend.advance(0.5);
      mgr.update();
    }
    expect(mgr.stats().resident).toBe(3);
    mgr.unpin(["combat.bow.nock"]);
    backend.advance(0.25);
    mgr.update();
    expect(mgr.stats().resident).toBe(0);
  });

  it("unloads idle clips after the idle time, never one that is playing", async () => {
    const { backend, mgr } = rig({ idleUnloadS: 10 });
    await mgr.prefetch(["combat.bow.nock"]);
    mgr.unpin(["combat.bow.nock"]);
    mgr.setAmbience({ beds: [{ set: "weather.rain.light", gain: 1 }], details: [] });
    await flush();
    const before = mgr.stats().resident;
    for (let i = 0; i < 60; i++) {
      backend.advance(0.5);
      mgr.update();
    }
    expect(mgr.stats().resident).toBe(before - 3); // the three nock variants went; the bed stayed
    expect(backend.released).toHaveLength(3);
  });

  it("keeps idle decoded audio under its ceiling by dropping the least recently used idle clips", async () => {
    const { backend, mgr } = rig({ maxIdleDecodedBytes: 2_000_000 });
    await mgr.prefetch(["weather.thunder.distant", "weather.thunder.extra"]);
    mgr.unpin(["weather.thunder.distant", "weather.thunder.extra"]); // pinned clips are exempt
    backend.advance(0.25);
    mgr.update();
    expect(mgr.stats().decodedBytes).toBeLessThanOrEqual(2_000_000);
  });
});
