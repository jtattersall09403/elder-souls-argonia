import { MeshStandardNodeMaterial } from 'three/webgpu';
import { expect, it } from 'vitest';
import { applyCausticReceiver, applySubmergedCaustics } from './causticReceiver';
import { createGroundWetnessUniforms, waterReceiverCaustic } from './groundWetness';
import { wrapLightingFinish } from './receiverLighting';

it('wraps the lighting finish once and keeps the previous model', () => {
  const material = new MeshStandardNodeMaterial(), state = createGroundWetnessUniforms();
  const original = material.setupLightingModel;
  applyCausticReceiver(material, state, { value: 2 });
  const wrapped = material.setupLightingModel;
  expect(wrapped).not.toBe(original);
  applySubmergedCaustics(material, state, 2);
  expect(material.setupLightingModel).toBe(wrapped);
  const model = (material as unknown as { setupLightingModel(b: unknown): unknown }).setupLightingModel(undefined) as unknown as { finish: unknown };
  expect(typeof model.finish).toBe('function');
  material.dispose();
});

it('runs the previous finish before the added term, in call order', () => {
  const material = new MeshStandardNodeMaterial();
  const calls: string[] = [];
  const model = (material as unknown as { setupLightingModel(b: unknown): unknown }).setupLightingModel(undefined) as unknown as { finish(b: unknown): void };
  (material as unknown as { setupLightingModel(): unknown }).setupLightingModel = () => ({
    finish: () => calls.push('base'),
  });
  expect(model).toBeTruthy();
  wrapLightingFinish(material, () => { calls.push('first'); });
  wrapLightingFinish(material, () => { calls.push('second'); });
  const wrapped = (material as unknown as { setupLightingModel(b: unknown): unknown }).setupLightingModel(undefined) as unknown as { finish(b: unknown): void };
  wrapped.finish({ context: {} });
  expect(calls).toEqual(['base', 'first', 'second']);
});

it('builds the receiver caustic graph from explicit inputs', () => {
  const u = createGroundWetnessUniforms();
  expect(waterReceiverCaustic(u, { worldPosition: [0, 0, 0], worldNormal: [0, 1, 0], verticalScale: 1 } as never)).toBeTruthy();
});
