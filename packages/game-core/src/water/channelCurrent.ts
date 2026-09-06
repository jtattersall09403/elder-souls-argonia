/** SI open-channel current model. Manning resistance is appropriate to a
 * bed-supported reach, not a free jet. Integrating specific kinetic energy
 * over reach length retains upstream momentum and bounds acceleration by
 * gravity instead of assigning every steep stream the same speed.
 *
 * Hydraulic radius R = wetted area / perimeter; Manning resistance:
 * https://cm.water.usgs.gov/proj/feq/feqdoc/chap4html/chap4_4.html
 * Free-jet limit v² = upstream² + 2g·drop:
 * https://www.usbr.gov/tsc/techreferences/hydraulics_lab/pubs/PAP/PAP-1119.pdf
 * Roughness .045 is an explicit game approximation, not a measured province
 * coefficient. The 12 m/s safety ceiling prevents unbounded physics impulses.
 */
export const CHANNEL_CURRENT_MAX_MPS = 12;
export const CHANNEL_MIN_THROUGHFLOW_MPS = 0.35;
export interface ChannelCurrentInput {
  hydraulicRadiusM: number;
  dropM: number;
  horizontalLengthM: number;
  upstreamSpeedMps: number;
  roughnessN?: number;
}
export function channelCurrentSpeed(input: ChannelCurrentInput): number {
  const radius = Math.max(0.001, input.hydraulicRadiusM);
  const drop = Math.max(0, input.dropM), run = Math.max(0.0001, input.horizontalLengthM);
  const length = Math.hypot(run, drop), slope = drop / run;
  const incoming = Math.max(CHANNEL_MIN_THROUGHFLOW_MPS, Math.min(CHANNEL_CURRENT_MAX_MPS, input.upstreamSpeedMps));
  const roughness = Math.max(0.001, input.roughnessN ?? 0.045);
  // Gradual transition from chutes to falling jets; no Manning extrapolation
  // over a near-vertical waterfall. This transition is a game-scale model.
  const t = Math.max(0, Math.min(1, (slope - 0.75) / 1.25));
  const bedContact = 1 - t * t * (3 - 2 * t);
  const resistance = 9.81 * roughness ** 2 / radius ** (4 / 3) * bedContact;
  let squared: number;
  if (resistance < 1e-8) squared = incoming ** 2 + 2 * 9.81 * drop;
  else {
    const decay = Math.exp(-2 * resistance * length);
    const equilibriumSquared = 9.81 * (drop / length) / resistance;
    squared = incoming ** 2 * decay + equilibriumSquared * (1 - decay);
  }
  return Math.min(CHANNEL_CURRENT_MAX_MPS, Math.max(CHANNEL_MIN_THROUGHFLOW_MPS, Math.sqrt(Math.max(0, squared))));
}
