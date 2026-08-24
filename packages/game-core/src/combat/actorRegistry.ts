import type { CombatActorRef } from "@elder-souls/contracts";

/**
 * Shared registry of live combat actors (master plan §53: "combat actor and
 * target registration"). Scenes register actors on spawn and unregister on
 * despawn; targeting, encounter and AI systems enumerate through this instead
 * of holding scene-private actor arrays.
 *
 * The combat sandbox registers its player and enemies; the world studio
 * registers its explorer player. Lock-on target *selection* still lives in the
 * sandbox scene — it migrates here when a second combat consumer exists.
 */
class ActorRegistry {
  private readonly byId = new Map<string, CombatActorRef>();

  register(actor: CombatActorRef): () => void {
    if (this.byId.has(actor.id)) {
      throw new Error(`Combat actor id already registered: ${actor.id}`);
    }
    this.byId.set(actor.id, actor);
    return () => {
      if (this.byId.get(actor.id) === actor) this.byId.delete(actor.id);
    };
  }

  actors(): readonly CombatActorRef[] {
    return [...this.byId.values()];
  }

  get(id: string): CombatActorRef | undefined {
    return this.byId.get(id);
  }

  /** Nearest living targetable actor to (x, z), excluding `excludeId`. */
  nearestTargetable(x: number, z: number, excludeId?: string): CombatActorRef | null {
    let best: CombatActorRef | null = null;
    let bestDistSq = Infinity;
    const p = { x: 0, y: 0, z: 0 };
    for (const actor of this.byId.values()) {
      if (actor.id === excludeId || !actor.alive() || !actor.targetable()) continue;
      actor.position(p);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = actor;
      }
    }
    return best;
  }

  clear(): void {
    this.byId.clear();
  }
}

export const actorRegistry = new ActorRegistry();
