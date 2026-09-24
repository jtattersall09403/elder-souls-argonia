import type { BusId } from "./buses";
import type { AudioBackend, ClipHandle, GroupHandle, Placement, Vec3, VoiceHandle, VoiceSpec } from "./backend";

export interface FakeVoice {
  id: number;
  spec: VoiceSpec;
  startAt: number;
  /** When it ends on its own (s), from offset, duration and rate. */
  endAt: number;
  stopAt: number | null;
  /** Release fade applied by `stop` (s). */
  stopFadeS: number;
  position: Vec3 | null;
  ended: boolean;
}

export interface FakeGroup {
  id: number;
  bus: BusId;
  placement: Placement;
  /** Every level change: linear from the level at `at` to `gain` over `rampS`. */
  ramps: { gain: number; rampS: number; at: number }[];
  releasedAt: number | null;
}

/**
 * A deterministic in-memory backend for tests (and for app tests that inject
 * the manager): a manual clock, decoded "clips" that know only their length,
 * and a record of every voice, group ramp and bus change.
 */
export class FakeAudioBackend implements AudioBackend {
  time = 0;
  resumed = false;
  /** Tests set false to model a context suspended until the first gesture. */
  running = true;
  readonly voices: FakeVoice[] = [];
  readonly groups: FakeGroup[] = [];
  readonly busGain = new Map<BusId, number>();
  readonly busLowpass = new Map<BusId, number | null>();
  readonly released: ClipHandle[] = [];
  private callbacks = new Map<number, () => void>();
  private nextId = 1;

  /** `durationOf(bytes)`: how long a decoded clip is; default 1 s. */
  constructor(private readonly durationOf: (bytes: ArrayBuffer) => number = () => 1) {}

  now(): number {
    return this.time;
  }

  isRunning(): boolean {
    return this.running;
  }

  async resume(): Promise<void> {
    this.resumed = true;
    this.running = true;
  }

  async decode(bytes: ArrayBuffer): Promise<ClipHandle> {
    const durationS = this.durationOf(bytes);
    return { durationS, decodedBytes: Math.round(durationS * 48000 * 4) };
  }

  release(clip: ClipHandle): void {
    this.released.push(clip);
  }

  setBusGain(bus: BusId, gain: number): void {
    this.busGain.set(bus, gain);
  }

  setBusLowpass(bus: BusId, hz: number | null): void {
    this.busLowpass.set(bus, hz);
  }

  createGroup(bus: BusId, placement: Placement = {}): GroupHandle {
    const g: FakeGroup = { id: this.nextId++, bus, placement: { ...placement }, ramps: [], releasedAt: null };
    this.groups.push(g);
    return { id: g.id };
  }

  setGroupGain(group: GroupHandle, gain: number, rampS: number): void {
    this.group(group).ramps.push({ gain, rampS, at: this.time });
  }

  setGroupPosition(group: GroupHandle, position: Vec3): void {
    this.group(group).placement.position = position;
  }

  releaseGroup(group: GroupHandle, at?: number): void {
    const t = at ?? this.time;
    this.group(group).releasedAt = t;
    for (const v of this.voices) if (v.spec.group?.id === group.id) this.stop(v, t);
  }

  start(spec: VoiceSpec): VoiceHandle {
    const startAt = spec.startAt ?? this.time;
    const played = spec.durationS ?? spec.clip.durationS - (spec.offsetS ?? 0);
    const v: FakeVoice = {
      id: this.nextId++,
      spec,
      startAt,
      endAt: startAt + played / (spec.rate || 1),
      stopAt: null,
      stopFadeS: 0,
      position: spec.position ?? null,
      ended: false,
    };
    this.voices.push(v);
    return { id: v.id };
  }

  setPosition(voice: VoiceHandle, position: Vec3): void {
    this.voice(voice).position = position;
  }

  stop(voice: VoiceHandle, at?: number, fadeS = 0): void {
    const v = this.voice(voice);
    v.stopFadeS = fadeS;
    const t = (at ?? this.time) + fadeS;
    v.stopAt = v.stopAt === null ? t : Math.min(v.stopAt, t);
  }

  onEnded(voice: VoiceHandle, cb: () => void): void {
    this.callbacks.set(voice.id, cb);
  }

  /** Move the clock on and fire the end of every voice that has finished. */
  advance(seconds: number): void {
    this.time += seconds;
    for (const v of this.voices) {
      if (v.ended) continue;
      const end = Math.min(v.endAt, v.stopAt ?? Infinity);
      if (end <= this.time + 1e-9) {
        v.ended = true;
        const cb = this.callbacks.get(v.id);
        this.callbacks.delete(v.id);
        cb?.();
      }
    }
  }

  /** Voices sounding now. */
  playing(): FakeVoice[] {
    return this.voices.filter((v) => !v.ended && v.startAt <= this.time + 1e-9);
  }

  /** A group's level at time `t`: each ramp runs linearly from the level at its start until the next begins. */
  groupGainAt(group: GroupHandle, t = this.time): number {
    const ramps = this.group(group).ramps.filter((r) => r.at <= t);
    let level = 0;
    ramps.forEach((r, i) => {
      const until = Math.min(t, ramps[i + 1]?.at ?? t);
      const u = r.rampS <= 0 ? 1 : Math.min(1, (until - r.at) / r.rampS);
      level += (r.gain - level) * u;
    });
    return level;
  }

  group(h: GroupHandle): FakeGroup {
    const g = this.groups.find((x) => x.id === h.id);
    if (!g) throw new Error(`no group ${h.id}`);
    return g;
  }

  private voice(h: VoiceHandle | FakeVoice): FakeVoice {
    const v = this.voices.find((x) => x.id === h.id);
    if (!v) throw new Error(`no voice ${h.id}`);
    return v;
  }
}
