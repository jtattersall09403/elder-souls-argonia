/**
 * Overlap bookkeeping for sensor colliders.
 *
 * A body can be represented by several colliders at once — a skeleton-fitted
 * hurtbox is a dozen capsules that all report the same actor name. A plain Set
 * would drop the actor the moment any one capsule separated, even while others
 * were still inside the blade, so contacts are counted rather than flagged.
 */
export class OverlapCounter {
  private readonly counts = new Map<string, number>();

  add(name: string) {
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
  }

  delete(name: string) {
    const remaining = (this.counts.get(name) ?? 0) - 1;
    if (remaining > 0) this.counts.set(name, remaining);
    else this.counts.delete(name);
  }

  clear() {
    this.counts.clear();
  }

  has(name: string) {
    return (this.counts.get(name) ?? 0) > 0;
  }

  get size() {
    return this.counts.size;
  }
}
