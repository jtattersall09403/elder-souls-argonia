import { describe, expect, it } from 'vitest';
import type { WaterInteractionEvent, WorldWaterQuery } from '@elder-souls/contracts';
import { WaterContactEmitter } from '../contactEmitter';
import { WaterEffects } from './WaterEffects';

function run(renderDelta: number, fallSpeed: number, horizontalSpeed: number) {
  const events: WaterInteractionEvent[] = [], fx = new WaterEffects({ seed: 19237 });
  const query: WorldWaterQuery = {
    sample: p => ({ waterBodyId: 'water.test.pool', surfaceHeight: 0, depth: 2, surfaceNormal: { x: 0, y: 1, z: 0 },
      flowVelocity: { x: 0, y: 0, z: 0 }, immersion: p.y < 0 ? 0.5 : 0, salinity: 0, turbidity: 0, temperature: 20, hazardIds: [] }),
    emitInteraction: event => { events.push(event); fx.emit(event); },
  };
  const emitter = new WaterContactEmitter('actor.player', 0.3, 1.44);
  const step = 1 / 60;
  let x = 0, y = 0.15;
  emitter.update(query, 0, { x, y, z: 0 }, -fallSpeed, step);
  // Exactly the studio's fixed-step policy: at most3 physics steps per
  // rendered frame. Contacts are observed after EACH actual substep.
  const physicsSteps = Math.min(3, Math.round(renderDelta / step));
  for (let frame = 0; frame < 60 / physicsSteps; frame++) {
    for (let i = 0; i < physicsSteps; i++) {
      x += horizontalSpeed * step; y = Math.max(-0.25, y - fallSpeed * step);
      emitter.update(query, 0, { x, y, z: 0 }, -fallSpeed, step);
    }
    fx.setIllumination({ x: 10000, y: 11000, z: 12000 }, { x: 100000, y: 90000, z: 70000 }, 0.8, 0.000025);
    fx.update(renderDelta, frame * renderDelta, query, 0, { x, y: 2, z: 4 });
  }
  const diagnostics = fx.diagnostics;
  emitter.dispose(); fx.dispose();
  return { events, diagnostics };
}

describe('character physics-to-water effects timing', () => {
  it('keeps jump entry energy and wading speed when slow frames discard wall time', () => {
    const normal = run(1 / 60, 10, 2), slow = run(0.8, 10, 2);
    const entry = (events: WaterInteractionEvent[]) => events.find(event => event.kind === 'enter')!;
    expect(entry(normal.events).magnitude).toBe(158);
    expect(entry(slow.events).magnitude).toBe(158);
    expect(entry(slow.events).velocity?.x).toBeCloseTo(2);
    expect(entry(slow.events).velocity?.y).toBe(-10);
    expect(slow.events.filter(event => event.kind === 'enter')).toHaveLength(1);
    expect(slow.events.filter(event => event.kind === 'wake').length).toBe(normal.events.filter(event => event.kind === 'wake').length);
    for (const result of [normal, slow]) {
      expect(result.diagnostics.spawned.spray).toBeGreaterThan(0);
      expect(result.diagnostics.spawned.mist).toBeGreaterThan(0);
      expect(result.diagnostics.spawned.crown).toBe(1);
      expect(result.diagnostics.illumination.exposedLinear.x).toBeGreaterThan(0.1);
      expect(result.diagnostics.suppressed.pausedFrame).toBeUndefined();
    }
  });

  it('retains explicit suspension/teleport reset without inventing a resume impact', () => {
    const events: WaterInteractionEvent[] = [];
    const query: WorldWaterQuery = { sample: () => ({ waterBodyId: 'pool', surfaceHeight: 0, depth: 2,
      surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: { x: 0, y: 0, z: 0 }, immersion: 0,
      salinity: 0, turbidity: 0, temperature: 20, hazardIds: [] }),
      emitInteraction: (event: WaterInteractionEvent) => { events.push(event); } };
    const emitter = new WaterContactEmitter('actor.player');
    emitter.update(query, 0, { x: 0, y: 1, z: 0 }, -10, 1 / 60);
    emitter.reset(); // visibility/teleport lifecycle, not a frame-duration guess
    emitter.update(query, 0, { x: 0, y: -0.2, z: 0 }, -10, 1 / 60);
    expect(events).toHaveLength(0);
    emitter.dispose();
  });
});
