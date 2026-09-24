import type { AudioListener, Object3D } from "three";
import { AudioListener as ThreeAudioListener } from "three";
import type { AudioBackend, ClipHandle, GroupHandle, Placement, Vec3, VoiceHandle, VoiceSpec } from "./backend";
import { BUSES, type BusId } from "./buses";

/**
 * The three.js engine behind `AudioBackend` (module 57 §107): three's
 * `AudioListener` owns the AudioContext and follows the camera the app gives
 * it; voices are plain Web Audio nodes (buffer source → envelope gain →
 * [equal-power panner] → bus or group), so the manager can pool, steal and
 * schedule them sample-exactly. `PositionalAudio` is not used per voice: it
 * hard-codes HRTF panning (research §3.1: too expensive per voice on mid
 * devices) and needs a scene-graph node per sound.
 *
 * Import from `@elder-souls/audio/three` so non-rendering consumers (tests,
 * tools) never pull three in.
 */

interface ThreeClip extends ClipHandle {
  readonly buffer: AudioBuffer;
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** The envelope scheduled at start, to know its level at any time. */
  envelope: { at: number; gain: number; fadeInS: number; fadeOutS: number; end: number };
  panner: PannerNode | null;
  group: number | null;
  ended: (() => void) | null;
}

interface Group {
  gain: GainNode;
  level: LinearParam;
  panner: PannerNode | null;
}

const OPEN_LOWPASS_HZ = 22050;

/**
 * One automation stream on an AudioParam, tracked in JS so a new ramp starts
 * from the value the param actually has NOW (Firefox lacks
 * `cancelAndHoldAtTime`, and `param.value` does not report a ramp in flight).
 */
class LinearParam {
  private from: number;
  private to: number;
  private t0 = 0;
  private t1 = 0;

  constructor(
    private readonly param: AudioParam,
    initial: number,
  ) {
    this.from = this.to = initial;
    param.value = initial;
  }

  valueAt(t: number): number {
    if (t >= this.t1 || this.t1 <= this.t0) return this.to;
    if (t <= this.t0) return this.from;
    return this.from + ((this.to - this.from) * (t - this.t0)) / (this.t1 - this.t0);
  }

  rampTo(value: number, rampS: number, now: number): void {
    const start = this.valueAt(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(start, now);
    this.param.linearRampToValueAtTime(value, now + Math.max(rampS, 0.001));
    this.from = start;
    this.to = value;
    this.t0 = now;
    this.t1 = now + Math.max(rampS, 0.001);
  }
}

/** A voice's scheduled envelope level at time t (linear fade in, hold, linear fade out to its end). */
function envelopeAt(e: Voice["envelope"], t: number): number {
  let level = e.gain;
  if (e.fadeInS > 0 && t < e.at + e.fadeInS) level = (e.gain * Math.max(0, t - e.at)) / e.fadeInS;
  if (e.fadeOutS > 0 && t > e.end - e.fadeOutS) level = Math.min(level, (e.gain * Math.max(0, e.end - t)) / e.fadeOutS);
  return level;
}

/** The exponential counterpart of LinearParam, for filter frequencies (perceptually even ramps). */
class ExpParam {
  private from: number;
  private to: number;
  private t0 = 0;
  private t1 = 0;

  constructor(
    private readonly param: AudioParam,
    initial: number,
  ) {
    this.from = this.to = initial;
    param.value = initial;
  }

  valueAt(t: number): number {
    if (t >= this.t1 || this.t1 <= this.t0) return this.to;
    if (t <= this.t0) return this.from;
    return this.from * Math.pow(this.to / this.from, (t - this.t0) / (this.t1 - this.t0));
  }

  rampTo(value: number, rampS: number, now: number): void {
    const start = this.valueAt(now);
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(start, now);
    this.param.exponentialRampToValueAtTime(value, now + Math.max(rampS, 0.001));
    this.from = start;
    this.to = value;
    this.t0 = now;
    this.t1 = now + Math.max(rampS, 0.001);
  }
}

function makePanner(ctx: AudioContext, p: Placement, at: Vec3): PannerNode {
  const panner = ctx.createPanner();
  panner.panningModel = "equalpower";
  panner.distanceModel = "inverse";
  panner.refDistance = p.refDistance ?? 1;
  panner.maxDistance = p.maxDistance ?? 60;
  setPannerPosition(panner, at);
  return panner;
}

function setPannerPosition(panner: PannerNode, at: Vec3): void {
  panner.positionX.value = at.x;
  panner.positionY.value = at.y;
  panner.positionZ.value = at.z;
}

export class ThreeAudioBackend implements AudioBackend {
  readonly context: AudioContext;
  private readonly buses = new Map<BusId, { gain: GainNode; level: LinearParam; cutoff: ExpParam }>();
  private readonly voices = new Map<number, Voice>();
  private readonly groups = new Map<number, Group>();
  private nextId = 1;

  constructor(readonly listener: AudioListener) {
    this.context = listener.context;
    const input = listener.getInput();
    for (const bus of BUSES) {
      const gain = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      gain.connect(filter);
      filter.connect(bus === "master" ? input : this.buses.get("master")!.gain);
      this.buses.set(bus, { gain, level: new LinearParam(gain.gain, 1), cutoff: new ExpParam(filter.frequency, OPEN_LOWPASS_HZ) });
    }
  }

  now(): number {
    return this.context.currentTime;
  }

  isRunning(): boolean {
    return this.context.state === "running";
  }

  async resume(): Promise<void> {
    if (this.context.state !== "running") await this.context.resume();
  }

  async decode(bytes: ArrayBuffer): Promise<ClipHandle> {
    // Takes ownership (decodeAudioData detaches the buffer): the cache never reuses fetched bytes.
    const buffer = await this.context.decodeAudioData(bytes);
    const clip: ThreeClip = { buffer, durationS: buffer.duration, decodedBytes: buffer.length * buffer.numberOfChannels * 4 };
    return clip;
  }

  release(): void {
    // AudioBuffers are garbage-collected once no source or cache holds them.
  }

  setBusGain(bus: BusId, gain: number, rampS: number): void {
    this.buses.get(bus)!.level.rampTo(gain, rampS, this.now());
  }

  setBusLowpass(bus: BusId, hz: number | null, rampS: number): void {
    this.buses.get(bus)!.cutoff.rampTo(hz ?? OPEN_LOWPASS_HZ, rampS, this.now());
  }

  createGroup(bus: BusId, placement: Placement = {}): GroupHandle {
    const gain = this.context.createGain();
    const level = new LinearParam(gain.gain, 0);
    let panner: PannerNode | null = null;
    if (placement.position) {
      panner = makePanner(this.context, placement, placement.position);
      gain.connect(panner);
      panner.connect(this.buses.get(bus)!.gain);
    } else {
      gain.connect(this.buses.get(bus)!.gain);
    }
    const id = this.nextId++;
    this.groups.set(id, { gain, level, panner });
    return { id };
  }

  setGroupGain(group: GroupHandle, gain: number, rampS: number): void {
    this.groups.get(group.id)?.level.rampTo(gain, rampS, this.now());
  }

  setGroupPosition(group: GroupHandle, position: Vec3): void {
    const g = this.groups.get(group.id);
    if (g?.panner) setPannerPosition(g.panner, position);
  }

  releaseGroup(group: GroupHandle, at?: number): void {
    const g = this.groups.get(group.id);
    if (!g) return;
    const t = at ?? this.now();
    for (const v of this.voices.values()) if (v.group === group.id) v.source.stop(t);
    this.groups.delete(group.id);
    const disconnect = () => {
      g.gain.disconnect();
      g.panner?.disconnect();
    };
    const delayMs = Math.max(0, (t - this.now()) * 1000) + 50;
    setTimeout(disconnect, delayMs);
  }

  start(spec: VoiceSpec): VoiceHandle {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = (spec.clip as ThreeClip).buffer;
    source.playbackRate.value = spec.rate;
    const gain = ctx.createGain();
    const at = spec.startAt ?? ctx.currentTime;
    const played = (spec.durationS ?? spec.clip.durationS - (spec.offsetS ?? 0)) / (spec.rate || 1);
    // The whole envelope is scheduled now and never touched again (see backend.ts).
    const g = gain.gain;
    if (spec.fadeInS && spec.fadeInS > 0) {
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(spec.gain, at + spec.fadeInS);
    } else {
      g.setValueAtTime(spec.gain, at);
    }
    if (spec.fadeOutS && spec.fadeOutS > 0) {
      g.setValueAtTime(spec.gain, at + played - spec.fadeOutS);
      g.linearRampToValueAtTime(0, at + played);
    }
    source.connect(gain);
    let panner: PannerNode | null = null;
    let group: number | null = null;
    if (spec.group) {
      group = spec.group.id;
      gain.connect(this.groups.get(group)!.gain);
    } else if (spec.position) {
      panner = makePanner(ctx, spec, spec.position);
      gain.connect(panner);
      panner.connect(this.buses.get(spec.bus ?? "master")!.gain);
    } else {
      gain.connect(this.buses.get(spec.bus ?? "master")!.gain);
    }
    source.start(at, spec.offsetS ?? 0, spec.durationS);
    const id = this.nextId++;
    const envelope = { at, gain: spec.gain, fadeInS: spec.fadeInS ?? 0, fadeOutS: spec.fadeOutS ?? 0, end: at + played };
    const voice: Voice = { source, gain, envelope, panner, group, ended: null };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
      this.voices.delete(id);
      voice.ended?.();
    };
    this.voices.set(id, voice);
    return { id };
  }

  setPosition(voice: VoiceHandle, p: Vec3): void {
    const v = this.voices.get(voice.id);
    if (v?.panner) setPannerPosition(v.panner, p);
  }

  stop(voice: VoiceHandle, at?: number, fadeS = 0): void {
    const v = this.voices.get(voice.id);
    if (!v) return;
    const t = at ?? this.now();
    if (fadeS > 0) {
      const g = v.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(envelopeAt(v.envelope, t), t);
      g.linearRampToValueAtTime(0, t + fadeS);
    }
    v.source.stop(t + fadeS);
  }

  onEnded(voice: VoiceHandle, cb: () => void): void {
    const v = this.voices.get(voice.id);
    if (v) v.ended = cb;
  }
}

/**
 * Create the listener on the app's camera and the backend over it. The app
 * owns both: it disposes the listener with its camera.
 */
export function createThreeAudio(camera: Object3D): { listener: AudioListener; backend: ThreeAudioBackend } {
  const listener = new ThreeAudioListener();
  camera.add(listener);
  return { listener, backend: new ThreeAudioBackend(listener) };
}
