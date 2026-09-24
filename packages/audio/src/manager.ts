import type { AcousticState, AmbienceSelection } from "./ambience";
import type { AudioBackend, GroupHandle, Vec3, VoiceHandle } from "./backend";
import { BUSES, CATEGORY_BUS, WORLD_BUSES, dbToGain, type BusId } from "./buses";
import { AssetCache, type FetchBytes } from "./cache";
import { candidateSets, type SoundEvent, type SoundEventBus } from "./events";
import type { AssetId, AudioManifest, SoundCategory, SoundSetId } from "./manifest";

/**
 * The AudioManager (module 57 §107; decision 0095): one per game session,
 * constructed by the app and injected — never a module singleton. It owns
 * the buses, the unlock, the streaming cache, event playback with variant
 * and variance, the voice budgets, the ambience bed player (the runtime
 * crossfade loop of decision 0094 §4), positional emitters and the detail
 * scheduler. The engine is behind `AudioBackend`; the clock is the backend's.
 *
 * Call `update()` once per frame (or at least every `lookaheadS / 2`).
 */
export interface AudioManagerOptions {
  backend: AudioBackend;
  manifest: AudioManifest;
  /** The audio root URL ending in `/`: `${import.meta.env.BASE_URL}audio/` (see `@elder-souls/audio/plugin`). */
  baseUrl: string;
  fetchBytes?: FetchBytes;
  /** Injected randomness (variants, variance, detail rolls); pass a seeded one for determinism. */
  random?: () => number;
  /** Where the listener is, for distance culling, emitters and detail placement (the app's camera). */
  listenerPosition?: () => Vec3 | null;
  /**
   * Voice budgets (research §4.3: ~24 on mid devices). Steady state: beds +
   * emitters + one-shots (4 + 4 + 12 = 20 by default). Transitions add the
   * beds and emitters still fading out, never more than one more full set
   * of each (the oldest fading one is cut short beyond that), so the worst
   * case is 28 for the length of a fade. A bed or emitter plays two voices
   * only during its 50 ms cycle crossfade.
   */
  maxBeds?: number;
  maxEmitters?: number;
  maxOneShots?: number;
  /** Positional events and emitters farther than this are not played or loaded (m). */
  maxDistanceM?: number;
  /** A one-shot whose clip arrives later than this after its event is dropped (s). */
  lateDropS?: number;
  /** Crossfade between ambience selections (s). */
  bedFadeS?: number;
  /** How far ahead the next bed cycle is scheduled (s). */
  lookaheadS?: number;
  maxIdleDecodedBytes?: number;
  idleUnloadS?: number;
  /** Wall clock for load-retry spacing (see `AssetCacheOptions.wallClock`). */
  wallClock?: () => number;
}

/** One-shot priority when the one-shot budget is full: the lowest, oldest voice is stolen. */
const PRIORITY: Readonly<Record<SoundCategory, number>> = {
  ui: 5,
  music: 5,
  combat: 4,
  movement: 3,
  object: 2,
  weather: 2,
  ambient: 1,
};
/** Ambient and weather one-shots are not tied to an action: a late arrival still plays (s). */
const AMBIENT_LATE_S = 5;
/** Distance model per category (m): reference distance of full level. */
const REF_DISTANCE: Readonly<Record<SoundCategory, number>> = {
  ui: 1,
  music: 1,
  combat: 2,
  movement: 1.5,
  object: 2,
  weather: 8,
  ambient: 5,
};
/** Detail rolls never cover more than this much elapsed time in one update (s). */
const MAX_DETAIL_DT_S = 0.5;
/** An audible emitter ranks as if this much nearer, so two near-equal emitters do not swap back and forth. */
const EMITTER_RANK_STICKINESS = 0.85;
/** A fade cut short to keep the fading beds within budget (s). */
const CUT_FADE_S = 0.1;
/** A stolen one-shot ramps out over this long instead of cutting mid-waveform (s). */
const STEAL_FADE_S = 0.03;
/** Fade for an emitter entering or leaving hearing range (s). */
const EMITTER_FADE_S = 1;
/** Housekeeping (emitter ranking, bed retries, cache eviction) runs this often, not every frame (s). */
const HOUSEKEEPING_S = 0.25;
/** An audible emitter keeps playing until 10 % beyond the range it started in (no flapping at the edge). */
const EMITTER_HYSTERESIS = 1.1;

/** Bus filters per acoustic state (§106; research §4.4). Absent = open, 0 dB. */
export const ACOUSTIC_PROFILES: Readonly<
  Record<AcousticState, Partial<Record<BusId, { lowpassHz: number | null; gainDb: number }>>>
> = {
  exterior: {},
  // Level under canopy is the ambience selection's job (rain and wind scale by canopy); the bus only dulls the top end.
  canopy: { weather: { lowpassHz: 6000, gainDb: 0 } },
  interior: { ambience: { lowpassHz: 800, gainDb: -12 }, weather: { lowpassHz: 800, gainDb: -12 } },
  underwater: Object.fromEntries(WORLD_BUSES.map((b) => [b, { lowpassHz: 400, gainDb: -6 }])),
};

function finite(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

interface OneShot {
  voice: VoiceHandle;
  priority: number;
  startedAt: number;
}

/** A looping bed or emitter: cycles of one clip crossfading inside a group whose level the manager ramps. */
interface Bed {
  /** `amb:<set>` for an ambience bed, `emit:<id>` for a positional emitter. */
  key: string;
  set: SoundSetId;
  asset: AssetId;
  position: Vec3 | null;
  /** Linear level (the set's static gain applied), what the group ramps to. */
  level: number;
  group: GroupHandle | null;
  /** Live cycle voices (two only during a crossfade). */
  voices: VoiceHandle[];
  /** When the current cycle reaches loopEnd (backend clock); null until started. */
  cycleEnd: number | null;
  /** When a leaving bed's fade-out completes; null while it stays. */
  leaveEnd: number | null;
}

interface Emitter {
  set: SoundSetId;
  at: Vec3;
  gain: number;
}

export class AudioManager {
  readonly cache: AssetCache;
  private readonly random: () => number;
  private readonly maxBeds: number;
  private readonly maxEmitters: number;
  private readonly maxOneShots: number;
  private readonly maxDistance: number;
  private readonly lateDrop: number;
  private readonly bedFade: number;
  private readonly lookahead: number;
  private oneShots: OneShot[] = [];
  private beds = new Map<string, Bed>();
  private emitters = new Map<string, Emitter>();
  private details: AmbienceSelection["details"] = [];
  private lastVariant = new Map<SoundSetId, number>();
  private volume = new Map<BusId, number>(BUSES.map((b) => [b, 1]));
  private acoustic: AcousticState = "exterior";
  private lastUpdate: number | null = null;
  private unsubscribers: (() => void)[] = [];
  private displaced = 0;
  private disposed = false;
  private lastRank = -Infinity;
  /** The current ambience selection's beds, re-ensured each housekeeping pass (a failed load retries). */
  private wantedBeds = new Map<string, { set: SoundSetId; gain: number }>();

  constructor(private readonly o: AudioManagerOptions) {
    this.cache = new AssetCache({
      backend: o.backend,
      manifest: o.manifest,
      baseUrl: o.baseUrl,
      fetchBytes: o.fetchBytes,
      maxIdleDecodedBytes: o.maxIdleDecodedBytes,
      idleUnloadS: o.idleUnloadS,
      wallClock: o.wallClock,
    });
    this.random = o.random ?? Math.random;
    this.maxBeds = o.maxBeds ?? 4;
    this.maxEmitters = o.maxEmitters ?? 4;
    this.maxOneShots = o.maxOneShots ?? 12;
    this.maxDistance = o.maxDistanceM ?? 60;
    this.lateDrop = o.lateDropS ?? 0.15;
    this.bedFade = o.bedFadeS ?? 4;
    this.lookahead = o.lookaheadS ?? 0.5;
    for (const b of BUSES) this.applyBus(b, 0);
  }

  /** Call from the first user gesture (autoplay policy). */
  unlock(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return this.o.backend.resume();
  }

  setVolume(bus: BusId, linear: number): void {
    if (this.disposed) return;
    this.volume.set(bus, Math.max(0, linear));
    this.applyBus(bus, 0.05);
  }

  /** Play every event emitted on `bus`; returns the detach function. */
  attach(bus: SoundEventBus): () => void {
    if (this.disposed) return () => undefined;
    const off = bus.subscribe((e) => this.play(e));
    this.unsubscribers.push(off);
    return off;
  }

  /** Resolve an event to its set and play it. */
  play(event: SoundEvent): void {
    if (this.disposed) return;
    const set = candidateSets(event).find((id) => this.o.manifest.sets[id]);
    if (set) this.playSet(set, event.at ?? null);
  }

  /** Play one variant of a one-shot set, positional when `at` is given. */
  playSet(setId: SoundSetId, where: Vec3 | null = null, gainScale = 1): void {
    if (this.disposed) return;
    // Copied: callers pass scratch vectors they reuse, and a streamed clip starts later.
    const at = where ? { x: where.x, y: where.y, z: where.z } : null;
    if (at && !finite(at)) return; // a NaN position would throw in the panner
    const set = this.o.manifest.sets[setId];
    if (!set || set.loop) return;
    // Before the first gesture the context is suspended and its clock stands
    // still: a one-shot queued now would fire late, all at once, on unlock.
    if (!this.o.backend.isRunning()) return;
    if (at && this.distanceTo(at) > this.maxDistance) return;
    const i = this.pickVariant(setId, set.variants.length);
    const asset = set.variants[i];
    const db = set.gainDb + (set.variantGainDb?.[i] ?? 0) + (this.random() * 2 - 1) * set.dbVariance;
    const rate = 1 + ((this.random() * 2 - 1) * set.pitchVariancePct) / 100;
    const requested = this.o.backend.now();
    const start = () => this.startOneShot(asset, set.category, dbToGain(db) * gainScale, rate, at);
    if (this.cache.get(asset)) {
      start();
      return;
    }
    const late = set.category === "ambient" || set.category === "weather" ? AMBIENT_LATE_S : this.lateDrop;
    this.cache.load(asset).then(
      () => {
        if (!this.disposed && this.o.backend.now() - requested <= late) start();
      },
      () => undefined,
    );
  }

  /**
   * Fetch and decode a scene's sets on entry and keep them resident (exempt
   * from idle unloading) until `unpin` on exit: an action sound must never
   * wait on a fetch in the middle of a fight.
   */
  async prefetch(sets: Iterable<SoundSetId>): Promise<void> {
    if (this.disposed) return;
    const loads: Promise<unknown>[] = [];
    for (const id of sets) {
      for (const a of this.o.manifest.sets[id]?.variants ?? []) {
        this.cache.pin(a);
        loads.push(this.cache.load(a));
      }
    }
    await Promise.allSettled(loads);
  }

  /** Let a scene's prefetched sets unload again when idle. */
  unpin(sets: Iterable<SoundSetId>): void {
    if (this.disposed) return;
    for (const id of sets) for (const a of this.o.manifest.sets[id]?.variants ?? []) this.cache.unpin(a);
  }

  /**
   * The ambience target (from `selectAmbience`): beds not in it fade out over
   * `bedFadeS`, new beds fade in, kept (or returning) beds ramp to their new
   * level. At most `maxBeds` play: the loudest.
   */
  setAmbience(sel: AmbienceSelection): void {
    if (this.disposed) return;
    const loudest = [...sel.beds]
      .filter((b) => this.o.manifest.sets[b.set]?.loop)
      // Loudest by the level that plays: the set's own gain times the selection's.
      .sort((a, b) => this.levelOf(b.set, b.gain) - this.levelOf(a.set, a.gain) || a.set.localeCompare(b.set))
      .slice(0, this.maxBeds);
    const want = new Map(loudest.map((b) => [`amb:${b.set}`, { set: b.set, gain: b.gain }]));
    this.wantedBeds = want;
    for (const [key, bed] of this.beds) if (key.startsWith("amb:") && !want.has(key)) this.leaveBed(bed, this.bedFade);
    for (const [key, b] of want) this.keepBed(key, b.set, b.gain, null, this.bedFade);
    this.capFading("amb:", this.maxBeds);
    this.details = sel.details.filter((d) => this.o.manifest.sets[d.set]);
  }

  /**
   * A positional looping emitter (a river's nearest point, a waterfall, a
   * carried torch). The nearest `maxEmitters` within `maxDistanceM` play;
   * the rest fade out over 1 s, and their clips may unload. Register the
   * emitters of the LOADED cells only (the streamer adds and removes them
   * with the cells): ranking runs every 0.25 s over all registered emitters.
   */
  addEmitter(id: string, setId: SoundSetId, at: Vec3, gain = 1): void {
    if (this.disposed || !finite(at)) return;
    if (!this.o.manifest.sets[setId]?.loop) return;
    this.emitters.set(id, { set: setId, at: { ...at }, gain });
    this.lastRank = -Infinity; // rank on the next update, not up to 0.25 s later
    const bed = this.beds.get(`emit:${id}`);
    if (bed && bed.set === setId && bed.leaveEnd === null) this.setBedLevel(bed, gain, this.bedFade);
    this.moveEmitter(id, at);
  }

  moveEmitter(id: string, at: Vec3): void {
    if (this.disposed) return;
    const e = this.emitters.get(id);
    if (!e || !finite(at)) return;
    e.at = { ...at };
    const bed = this.beds.get(`emit:${id}`);
    if (bed) this.placeBed(bed, e.at);
  }

  removeEmitter(id: string): void {
    if (this.disposed) return;
    this.emitters.delete(id);
    const bed = this.beds.get(`emit:${id}`);
    if (bed) this.leaveBed(bed, EMITTER_FADE_S);
  }

  /** The acoustic state stack's bus filters (underwater muffles the world, not the UI). */
  setAcousticState(state: AcousticState, rampS = 0.3): void {
    if (this.disposed) return;
    this.acoustic = state;
    for (const b of BUSES) this.applyBus(b, rampS);
  }

  /**
   * Per-frame: schedule bed cycles, retire faded beds, roll details; every
   * 0.25 s also rank emitters, retry wanted beds and unload idle clips.
   */
  update(): void {
    if (this.disposed) return;
    const now = this.o.backend.now();
    const dt = this.lastUpdate === null ? 0 : Math.max(0, now - this.lastUpdate);
    this.lastUpdate = now;
    if (now - this.lastRank >= HOUSEKEEPING_S || now < this.lastRank) {
      this.lastRank = now;
      this.updateEmitters();
      // A wanted bed whose load failed is tried again (the cache spaces the retries).
      for (const [key, b] of this.wantedBeds) if (!this.beds.has(key)) this.startBed(key, b.set, b.gain, null, this.bedFade);
      this.cache.evict();
    }
    for (const bed of [...this.beds.values()]) {
      if (bed.leaveEnd !== null && now >= bed.leaveEnd) this.retireBed(bed);
      else this.scheduleCycle(bed, now);
    }
    if (dt > 0) {
      // After a gap (a hidden tab, a stall) roll one frame's worth, not the whole gap at once.
      const rollDt = Math.min(dt, MAX_DETAIL_DT_S);
      for (const d of this.details) {
        const p = 1 - Math.exp((-d.perMinute / 60) * rollDt);
        if (this.random() < p) this.playSet(d.set, this.detailPosition(d.radiusM), d.gain);
      }
    }
  }

  stats(): {
    oneShots: number;
    beds: number;
    bedVoices: number;
    emitters: number;
    acoustic: AcousticState;
  } & ReturnType<AssetCache["stats"]> {
    let bedVoices = 0;
    for (const b of this.beds.values()) bedVoices += b.voices.length;
    return {
      oneShots: this.oneShots.length,
      beds: this.beds.size,
      bedVoices,
      emitters: this.emitters.size,
      acoustic: this.acoustic,
      ...this.cache.stats(),
    };
  }

  /** Stop everything; clip loads still in flight resolve into nothing. */
  dispose(): void {
    this.disposed = true;
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    for (const s of this.oneShots) this.o.backend.stop(s.voice);
    for (const b of this.beds.values()) if (b.group) this.o.backend.releaseGroup(b.group);
    this.oneShots = [];
    this.beds.clear();
    this.emitters.clear();
    this.wantedBeds.clear();
    this.details = [];
  }

  // -- buses and one-shots -----------------------------------------------------

  private applyBus(bus: BusId, rampS: number): void {
    const p = ACOUSTIC_PROFILES[this.acoustic][bus];
    this.o.backend.setBusGain(bus, (this.volume.get(bus) ?? 1) * dbToGain(p?.gainDb ?? 0), rampS);
    if (bus !== "master") this.o.backend.setBusLowpass(bus, p?.lowpassHz ?? null, rampS);
  }

  private distanceTo(at: Vec3): number {
    const l = this.o.listenerPosition?.();
    return l ? Math.hypot(at.x - l.x, at.y - l.y, at.z - l.z) : 0;
  }

  /** Random variant, never the same one twice running (Skyrim's no-repeat pick). */
  private pickVariant(setId: SoundSetId, n: number): number {
    if (n <= 1) return 0;
    const last = this.lastVariant.get(setId);
    let i = Math.floor(this.random() * (last === undefined ? n : n - 1));
    if (last !== undefined && i >= last) i++;
    this.lastVariant.set(setId, i);
    return i;
  }

  private startOneShot(asset: AssetId, category: SoundCategory, gain: number, rate: number, at: Vec3 | null): void {
    const clip = this.cache.get(asset);
    if (!clip || !this.makeRoom(PRIORITY[category])) return;
    const voice = this.o.backend.start({
      clip,
      bus: CATEGORY_BUS[category],
      gain,
      rate,
      position: at,
      refDistance: REF_DISTANCE[category],
      maxDistance: this.maxDistance,
    });
    const shot: OneShot = { voice, priority: PRIORITY[category], startedAt: this.o.backend.now() };
    this.oneShots.push(shot);
    this.cache.retain(asset);
    // The single release point: stolen, stopped or finished, the clip is released once.
    this.o.backend.onEnded(voice, () => {
      this.oneShots = this.oneShots.filter((s) => s !== shot);
      this.cache.release(asset);
    });
  }

  /** Free a one-shot slot for `priority`; false when every live one-shot outranks it. */
  private makeRoom(priority: number): boolean {
    if (this.oneShots.length < this.maxOneShots) return true;
    let victim: OneShot | null = null;
    for (const s of this.oneShots) {
      if (s.priority > priority) continue;
      if (!victim || s.priority < victim.priority || (s.priority === victim.priority && s.startedAt < victim.startedAt)) victim = s;
    }
    if (!victim) return false;
    // Out of the count now; its onEnded releases the clip when the stop lands.
    this.oneShots = this.oneShots.filter((s) => s !== victim);
    this.o.backend.stop(victim.voice, undefined, STEAL_FADE_S);
    return true;
  }

  // -- beds and emitters -------------------------------------------------------

  private levelOf(setId: SoundSetId, gain: number): number {
    return dbToGain(this.o.manifest.sets[setId]?.gainDb ?? 0) * gain;
  }

  /** Make a bed sound at `gain`: start it, ramp it, or bring it back if it was fading out. */
  private keepBed(key: string, setId: SoundSetId, gain: number, position: Vec3 | null, fadeS: number): void {
    let bed = this.beds.get(key);
    if (bed && bed.set !== setId) {
      // The key now names another sound (an emitter re-added with a new set): the old
      // bed fades out under a key of its own while the new one starts under this one.
      this.beds.delete(key);
      bed.key = `${key}~${this.displaced++}`;
      this.beds.set(bed.key, bed);
      this.leaveBed(bed, fadeS);
      bed = undefined;
    }
    if (!bed) {
      this.startBed(key, setId, gain, position, fadeS);
      return;
    }
    if (position && (!bed.position || bed.position.x !== position.x || bed.position.y !== position.y || bed.position.z !== position.z)) {
      this.placeBed(bed, position);
    }
    const wasLeaving = bed.leaveEnd !== null;
    const level = this.levelOf(setId, gain);
    bed.leaveEnd = null;
    if (wasLeaving || Math.abs(level - bed.level) > 1e-4) this.setBedLevel(bed, gain, fadeS);
  }

  /** A bed's position, applied to its group now or when the group is created after loading. */
  private placeBed(bed: Bed, at: Vec3): void {
    bed.position = at;
    if (bed.group) this.o.backend.setGroupPosition(bed.group, at);
  }

  private setBedLevel(bed: Bed, gain: number, fadeS: number): void {
    bed.level = this.levelOf(bed.set, gain);
    if (bed.group) this.o.backend.setGroupGain(bed.group, bed.level, fadeS);
  }

  private startBed(key: string, setId: SoundSetId, gain: number, position: Vec3 | null, fadeS: number): void {
    const set = this.o.manifest.sets[setId];
    if (!set?.loop) return;
    // A bed set's variants are alternative takes of one bed: one is picked per entry.
    const asset = set.variants[this.pickVariant(setId, set.variants.length)];
    const bed: Bed = {
      key,
      set: setId,
      asset,
      position,
      level: this.levelOf(setId, gain),
      group: null,
      voices: [],
      cycleEnd: null,
      leaveEnd: null,
    };
    this.beds.set(key, bed);
    this.cache.load(asset).then(
      () => {
        if (this.disposed || this.beds.get(key) !== bed) return;
        if (bed.leaveEnd !== null) {
          this.beds.delete(key); // left before it was heard
          return;
        }
        this.cache.retain(asset);
        bed.group = this.o.backend.createGroup(CATEGORY_BUS[set.category], {
          position: bed.position,
          refDistance: REF_DISTANCE[set.category],
          maxDistance: this.maxDistance,
        });
        this.o.backend.setGroupGain(bed.group, bed.level, fadeS);
        this.startCycle(bed, this.o.backend.now(), 0);
      },
      () => {
        if (this.beds.get(key) === bed) this.beds.delete(key);
      },
    );
  }

  /** Fade a bed out over `fadeS`; it keeps cycling until the fade ends, then `retireBed` frees it. */
  private leaveBed(bed: Bed, fadeS: number): void {
    if (bed.leaveEnd !== null) return;
    bed.leaveEnd = this.o.backend.now() + fadeS;
    if (bed.group) this.o.backend.setGroupGain(bed.group, 0, fadeS);
  }

  private retireBed(bed: Bed): void {
    if (this.beds.get(bed.key) === bed) this.beds.delete(bed.key);
    if (bed.group) {
      this.o.backend.releaseGroup(bed.group);
      this.cache.release(bed.asset);
    }
  }

  /**
   * One loop cycle (decision 0094 §4): from loopStart for the loop's length,
   * running on `fadeS` into the pad. Its envelope is fixed at start: it fades
   * in over `fadeInS` and out over the pad, where the next cycle fades in.
   */
  private startCycle(bed: Bed, at: number, fadeInS: number): void {
    const clip = this.cache.get(bed.asset);
    const loop = this.o.manifest.assets[bed.asset]?.loop;
    if (!clip || !loop || !bed.group) return;
    const length = loop.endS - loop.startS;
    const voice = this.o.backend.start({
      clip,
      group: bed.group,
      gain: 1,
      rate: 1,
      offsetS: loop.startS,
      durationS: length + loop.fadeS,
      startAt: at,
      fadeInS,
      fadeOutS: loop.fadeS,
    });
    bed.voices.push(voice);
    bed.cycleEnd = at + length;
    this.o.backend.onEnded(voice, () => {
      bed.voices = bed.voices.filter((v) => v !== voice);
    });
  }

  private scheduleCycle(bed: Bed, now: number): void {
    if (bed.cycleEnd === null || bed.cycleEnd - now > this.lookahead) return;
    if (bed.leaveEnd !== null && bed.cycleEnd >= bed.leaveEnd) return;
    const loop = this.o.manifest.assets[bed.asset]?.loop;
    if (loop) this.startCycle(bed, Math.max(bed.cycleEnd, now), loop.fadeS);
  }

  /** Beds of one kind still fading out may not exceed `limit`: the oldest fades are cut short (0.1 s). */
  private capFading(prefix: string, limit: number): void {
    const fading = [...this.beds.values()]
      .filter((b) => b.key.startsWith(prefix) && b.leaveEnd !== null)
      .sort((a, b) => (a.leaveEnd ?? 0) - (b.leaveEnd ?? 0));
    const now = this.o.backend.now();
    for (const bed of fading.slice(0, Math.max(0, fading.length - limit))) {
      if ((bed.leaveEnd ?? 0) - now <= CUT_FADE_S) continue;
      bed.leaveEnd = now + CUT_FADE_S;
      if (bed.group) this.o.backend.setGroupGain(bed.group, 0, CUT_FADE_S);
    }
  }

  /** Nearest `maxEmitters` in range play (with hysteresis); the rest fade out. */
  private updateEmitters(): void {
    const ranked: { id: string; d: number }[] = [];
    for (const [id, e] of this.emitters) {
      const d = this.distanceTo(e.at);
      const bed = this.beds.get(`emit:${id}`);
      const audible = bed !== undefined && bed.leaveEnd === null;
      if (d <= this.maxDistance * (audible ? EMITTER_HYSTERESIS : 1)) ranked.push({ id, d: audible ? d * EMITTER_RANK_STICKINESS : d });
    }
    ranked.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
    const keep = new Set(ranked.slice(0, this.maxEmitters).map((r) => r.id));
    for (const [id, e] of this.emitters) {
      const key = `emit:${id}`;
      if (keep.has(id)) this.keepBed(key, e.set, e.gain, e.at, EMITTER_FADE_S);
      else {
        const bed = this.beds.get(key);
        if (bed) this.leaveBed(bed, EMITTER_FADE_S);
      }
    }
    this.capFading("emit:", this.maxEmitters);
  }

  private detailPosition(radius?: [number, number]): Vec3 | null {
    const l = this.o.listenerPosition?.();
    if (!radius || !l) return null;
    const a = this.random() * Math.PI * 2;
    const r = radius[0] + this.random() * (radius[1] - radius[0]);
    return { x: l.x + Math.cos(a) * r, y: l.y, z: l.z + Math.sin(a) * r };
  }
}
