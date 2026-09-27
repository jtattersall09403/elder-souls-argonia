/**
 * The interaction arbiter (0103 decision 4): one `activate` press, one
 * answer. Every provider of usable things (doors, travel operators, later
 * NPCs, containers, items) offers its candidates each frame; the arbiter
 * picks the ONE nearest candidate within its own reach, and only that one
 * answers the press and shows its prompt. Without it, a door and a travel
 * operator standing within reach of each other both fired on one E.
 *
 * Owned by whoever constructs it (the studio's CharacterMode today, the
 * game's scene later) and handed to the providers: no module state.
 *
 * Timing: providers `offer` during the frame; the host calls `resolve` once
 * per frame, after the input update, with the player's position and the
 * `activate` edge. The resolution holds until the next `resolve`, so a
 * provider whose frame callback runs before the host's reads the previous
 * resolution and one that runs after reads this one; either way each
 * provider sees every resolution exactly once and a prompt lags at most one
 * frame.
 */

export interface InteractionCandidate {
  /** Unique across providers (a door id, a travel service id, ...). */
  id: string;
  /** The provider's kind, for the host's and a probe's benefit: "door", "travel", ... */
  kind: string;
  /** Planar world position [x, z] in metres. */
  positionM: readonly [number, number];
  /** How close the player must be, planar metres. */
  reachM: number;
  /** The text-catalogue id of the prompt this candidate shows. */
  promptTextId: string;
}

/**
 * The one candidate that answers: nearest by planar distance among those
 * within their own reach; ties go to the smaller id, so the pick never
 * depends on the order providers offered in.
 */
export function pickCandidate(
  candidates: readonly InteractionCandidate[], x: number, z: number,
): InteractionCandidate | null {
  let best: InteractionCandidate | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.positionM[0] - x, c.positionM[1] - z);
    if (d > c.reachM) continue;
    if (d < bestD || (d === bestD && best !== null && c.id < best.id)) { best = c; bestD = d; }
  }
  return best;
}

export class InteractionArbiter {
  /** Keyed by id: a frame whose host skips `resolve` re-offers, never piles up. */
  private offered = new Map<string, InteractionCandidate>();
  private focus: InteractionCandidate | null = null;
  private activatedId: string | null = null;

  /** Put a candidate up for the next `resolve`. */
  offer(candidate: InteractionCandidate): void { this.offered.set(candidate.id, candidate); }

  /**
   * Decide this frame: the focus is the pick among everything offered since
   * the last call, and `activatePressed` goes to it alone. Clears the offers.
   */
  resolve(player: { x: number; z: number }, activatePressed: boolean): void {
    this.focus = pickCandidate([...this.offered.values()], player.x, player.z);
    this.activatedId = activatePressed && this.focus ? this.focus.id : null;
    this.offered.clear();
  }

  /** The candidate whose prompt shows, or null. */
  get focused(): InteractionCandidate | null { return this.focus; }

  /** The candidate the last press went to, until it is answered; null otherwise. */
  get activated(): InteractionCandidate | null { return this.activatedId ? this.focus : null; }

  /** Whether `id` is the focus (show its prompt). */
  isFocused(id: string): boolean { return this.focus?.id === id; }

  /**
   * Whether the last `activate` press went to `id`. A press is answered
   * once: the first true return consumes it, so a frame in which the host
   * skipped `resolve` never replays it.
   */
  answers(id: string): boolean {
    if (this.activatedId !== id) return false;
    this.activatedId = null;
    return true;
  }
}
