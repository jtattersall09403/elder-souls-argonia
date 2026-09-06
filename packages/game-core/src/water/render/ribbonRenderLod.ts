import type { ChannelRibbonPoint, ChannelRibbonRecord } from "../channelRibbons";

/** Presentation-only cross-section LOD. Longitudinal stations, surface planes,
 * outer ownership footprints and authoritative query profiles stay unchanged.
 * Bound vertical error AND the implied horizontal movement of a waterline;
 * a tiny height error on a flat bank must not move a visible shore metres. */
export function ribbonRenderLod(record: ChannelRibbonRecord, errorM: number, exactNativeGround = false): ChannelRibbonRecord {
  if (!(errorM > 0)) return record;
  let changed = false;
  const points = record.points.map((point): ChannelRibbonPoint => {
    const section = point.crossSection;
    if (!section || section.length <= 2) return point;
    const retained = new Set([0, section.length - 1]);
    const centre = section.findIndex(sample => sample.offsetM === 0);
    if (centre >= 0) retained.add(centre);
    const refine = (lo: number, hi: number): void => {
      if (hi - lo <= 1) return;
      const a = section[lo], b = section[hi], width = b.offsetM - a.offsetM;
      let worst = 1, selected = -1;
      for (let i = lo + 1; i < hi; i++) {
        const t = (section[i].offsetM - a.offsetM) / width;
        for (const channel of (exactNativeGround ? ["accessOffsetM"] : ["groundM", "accessOffsetM"]) as readonly ("groundM" | "accessOffsetM")[]) {
          const error = Math.abs(section[i][channel] - (a[channel] + (b[channel] - a[channel]) * t));
          const slope = Math.abs(b[channel] - a[channel]) / width;
          const allowed = Math.max(1e-7, Math.min(errorM, errorM * slope));
          if (error / allowed > worst) { worst = error / allowed; selected = i; }
        }
      }
      if (selected >= 0) { retained.add(selected); refine(lo, selected); refine(selected, hi); }
    };
    if (centre > 0 && centre < section.length - 1) { refine(0, centre); refine(centre, section.length - 1); }
    else refine(0, section.length - 1);
    if (retained.size === section.length) return point;
    changed = true;
    return { ...point, crossSection: [...retained].sort((a, b) => a - b).map(i => section[i]) };
  });
  return changed ? { ...record, points } : record;
}
