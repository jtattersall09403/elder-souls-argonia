import type { GroundTreatment } from "./types";

/** Sides of the polygon an apron disc is cleared as. */
const APRON_SIDES = 16;

/** A disc as the polygon that circumscribes it (it contains the whole disc). */
export function apronPolygon(x: number, z: number, radiusM: number): [number, number][] {
  const r = radiusM / Math.cos(Math.PI / APRON_SIDES);
  const out: [number, number][] = [];
  for (let i = 0; i < APRON_SIDES; i++) {
    const a = (i / APRON_SIDES) * Math.PI * 2;
    out.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
  }
  return out;
}

/**
 * The polygons a ground treatment keeps groundcover out of (16h check-in 3
 * §5): a `floor` clears its footprint, a `deck` only its leg and stair
 * contacts; both clear their door aprons. The groundcover ring rejects a
 * plant inside any of them or within its species radius of an edge.
 */
export function treatmentClearancePolygons(t: GroundTreatment): [number, number][][] {
  const out: [number, number][][] = t.kind === "deck"
    ? (t.contactsM ?? []).filter((poly) => poly.length >= 3)
    : t.footprintM.length >= 3 ? [t.footprintM] : [];
  for (const [x, z, r] of t.apronsM ?? []) out.push(apronPolygon(x, z, r));
  return out;
}
