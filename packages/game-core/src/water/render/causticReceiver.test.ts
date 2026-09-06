import { MeshStandardMaterial, ShaderLib, type WebGLRenderer } from 'three';
import { expect, it } from 'vitest';
import { applySubmergedCaustics } from './causticReceiver';
import { createGroundWetnessUniforms, waterReceiverLight } from './groundWetness';

it('shares injected water state on transformed props and preserves existing lighting hooks', () => {
  const material = new MeshStandardMaterial(), state = createGroundWetnessUniforms();
  const scale = { value: 2 };
  let existing = false;
  material.onBeforeCompile = () => { existing = true; };
  applySubmergedCaustics(material, state, scale);
  const shader = { vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],
    { capabilities: { maxTextures: 16 } } as WebGLRenderer);
  expect(existing).toBe(true);
  expect(shader.uniforms).toMatchObject({ uWaterReceiverScale: scale, uLocalWaterField: state.uLocalWaterField });
  expect(shader.vertexShader).toContain('instanceMatrix * waterReceiverPos');
  expect(shader.vertexShader).toContain('batchingMatrix * waterReceiverPos');
  expect(shader.fragmentShader).toContain('inverseTransformDirection(normal, viewMatrix)');
  expect(shader.fragmentShader).toContain('reflectedLight.directDiffuse * localFocus * localVisibility');
  expect(shader.fragmentShader).not.toContain('dfgLUT');
  expect(material.customProgramCacheKey()).toContain('water-caustic-receiver-v1');
  material.dispose();
});

it('gates chemistry, connected stage and owner after evaluating differential optics', () => {
  const chunk = waterReceiverLight('position', 'normal', 'scale');
  expect(chunk).toContain('stage.x > offset + 0.001');
  expect(chunk).toContain('esCausticVisibility(level - receiver.y, klass.g, shore.b');
  expect(chunk).toContain('abs(localBody - uLocalWaterBody)');
  // No varying branch may wrap derivative-bearing focus calls.
  expect(chunk).not.toMatch(/if\s*\([^\n]*\)\s*\{/);
});
