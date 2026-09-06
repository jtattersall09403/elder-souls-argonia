import type { Vec3 } from "@elder-souls/contracts";

/** Explicit boundary between authored SI properties and a world's physics mass
 * units. Length/time/gravity stay metres/seconds/m·s⁻². Use the SAME instance
 * for collider mass/density and every force/impulse; never scale volume. */
export class PhysicsMassUnits {
  constructor(readonly massUnitsPerKg = 1) {
    if (!Number.isFinite(massUnitsPerKg) || massUnitsPerKg <= 0) {
      throw new RangeError("Physics mass units per kilogram must be positive and finite");
    }
  }
  mass(kg: number): number { return kg * this.massUnitsPerKg; }
  density(kgPerM3: number): number { return kgPerM3 * this.massUnitsPerKg; }
  kilograms(massUnits: number): number { return massUnits / this.massUnitsPerKg; }
  force(newtons: Vec3): Vec3 {
    const scale = this.massUnitsPerKg;
    return { x: newtons.x * scale, y: newtons.y * scale, z: newtons.z * scale };
  }
  impulse(newtonSeconds: Vec3): Vec3 { return this.force(newtonSeconds); }
}
