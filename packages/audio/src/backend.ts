import type { BusId } from "./buses";

/**
 * The engine boundary. The AudioManager speaks only this interface, so the
 * engine can change (three.js today, see `threeBackend.ts`; a fake in tests,
 * see `fakeBackend.ts`). Times are the backend's clock in seconds.
 *
 * Automation rule (the reason for groups): a voice's gain envelope is fixed
 * when it starts (fade in, hold, fade out before its stop) and is never
 * changed afterwards. Anything that changes over a voice's life — a bed's
 * level, its fade-out when it leaves, an emitter's position — is applied to
 * the GROUP the voice plays into, which carries one automation stream at a
 * time, always ramped from its value now.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A decoded clip. `decodedBytes` is what it costs in memory (for the cache budget). */
export interface ClipHandle {
  readonly durationS: number;
  readonly decodedBytes: number;
}

export interface VoiceHandle {
  readonly id: number;
}

export interface GroupHandle {
  readonly id: number;
}

export interface Placement {
  /** World position; null or absent plays non-positional (2D). */
  position?: Vec3 | null;
  /** Distance model (m): full level inside `refDistance`, inverse falloff to `maxDistance`. */
  refDistance?: number;
  maxDistance?: number;
}

export interface VoiceSpec extends Placement {
  clip: ClipHandle;
  /** Where the voice plays: a bus (a one-shot, placed by `position`) or a group (a bed's cycle). */
  bus?: BusId;
  group?: GroupHandle;
  /** Linear gain at full level. */
  gain: number;
  /** Playback rate (pitch variance). */
  rate: number;
  /** Start this far into the clip (s). */
  offsetS?: number;
  /** Stop after playing this long (s); default: to the clip's end. */
  durationS?: number;
  /** When to start, on the backend clock; default: now. */
  startAt?: number;
  /** Linear fade in from silence over the first `fadeInS` (s). */
  fadeInS?: number;
  /** Linear fade to silence over the last `fadeOutS` before the stop (s). */
  fadeOutS?: number;
}

export interface AudioBackend {
  now(): number;
  /** False while the context is suspended (before the first user gesture): its clock stands still. */
  isRunning(): boolean;
  /** Resume a suspended context; call from the first user gesture. */
  resume(): Promise<void>;
  /** Decode fetched bytes; the backend takes ownership (the buffer may be detached). */
  decode(bytes: ArrayBuffer): Promise<ClipHandle>;
  release(clip: ClipHandle): void;
  /** Bus level, ramped linearly from its value now. */
  setBusGain(bus: BusId, gain: number, rampS: number): void;
  /** Lowpass on a bus (acoustic states); `null` opens it. */
  setBusLowpass(bus: BusId, hz: number | null, rampS: number): void;
  /** A gain stage (optionally positioned) feeding `bus`, starting silent. */
  createGroup(bus: BusId, placement?: Placement): GroupHandle;
  /** Group level, ramped linearly from its value now. */
  setGroupGain(group: GroupHandle, gain: number, rampS: number): void;
  setGroupPosition(group: GroupHandle, position: Vec3): void;
  /** Stop every voice in the group at `at` (default now) and free it. */
  releaseGroup(group: GroupHandle, at?: number): void;
  start(spec: VoiceSpec): VoiceHandle;
  setPosition(voice: VoiceHandle, position: Vec3): void;
  /**
   * Stop a voice at `at` (default now). With `fadeS` it first ramps from its
   * current envelope level to silence — the one change a voice's envelope
   * ever takes (a stolen voice must not click).
   */
  stop(voice: VoiceHandle, at?: number, fadeS?: number): void;
  /** Called once when the voice has finished (ended, stopped or released with its group). */
  onEnded(voice: VoiceHandle, cb: () => void): void;
}
