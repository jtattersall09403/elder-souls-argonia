import { windWaveSpeed } from './waves';

/** Caller-owned dual clock. Epoch tide/season time remains a separate input.
 * Wind and preview rate accelerate wave phase, never physical m/s transport. */
export class WaterClock {
  phaseS = 0;
  transportS = 0;
  deltaS = 0;
  private hidden = false;
  private resumePending = false;

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.resumePending = true;
    this.deltaS = 0;
  }

  advance(deltaS: number, worldRate: number, windScale: number): void {
    this.deltaS = 0;
    if (this.hidden) return;
    if (this.resumePending) { this.resumePending = false; return; }
    if (!Number.isFinite(deltaS) || deltaS <= 0) return;
    const previewRate = Math.max(1, Math.min(Number.isFinite(worldRate) ? worldRate : 1, 8));
    const wind = Number.isFinite(windScale) ? windScale : 1;
    this.deltaS = deltaS;
    this.transportS += deltaS;
    this.phaseS += deltaS * previewRate * windWaveSpeed(wind);
  }
}
