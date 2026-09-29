import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshStandardNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { applyGroundWetness, createGroundWetnessUniforms } from './groundWetness';
import { applyCausticReceiver } from './causticReceiver';

// Builds the real node graphs to WGSL and GLSL with each backend's own node
// builder (no GPU: the renderer is never initialised, feature queries are
// stubbed false). Catches TSL graph errors and warnings in the unit run; the
// driver compile of the output is the harness's job. Set ES_DUMP_SHADERS=dir
// to write the generated shaders for an offline compile check.
afterEach(() => vi.restoreAllMocks());

function build(kind: 'ground' | 'receiver', forceWebGL: boolean): { fragment: string; vertex: string } {
  const canvas = { style: {}, addEventListener() {}, removeEventListener() {} };
  const renderer = new WebGPURenderer({ forceWebGL, canvas: canvas as unknown as HTMLCanvasElement }) as unknown as {
    hasFeature(): boolean; backend: { hasFeature(): boolean; createNodeBuilder(o: unknown, r: unknown): Record<string, unknown> & { build(): void } };
    lighting: { getNode(s: unknown, c: unknown): { setLights(l: unknown[]): void } };
  };
  renderer.hasFeature = () => false;
  renderer.backend.hasFeature = () => false;
  const material = new MeshStandardNodeMaterial();
  const uniforms = createGroundWetnessUniforms();
  if (kind === 'ground') applyGroundWetness(material, uniforms);
  else applyCausticReceiver(material, uniforms, { value: 2 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const scene = new THREE.Scene();
  const light = new THREE.DirectionalLight();
  scene.add(mesh, light);
  const camera = new THREE.PerspectiveCamera();
  const builder = renderer.backend.createNodeBuilder(mesh, renderer);
  Object.assign(builder, { scene, camera, material });
  const lights = renderer.lighting.getNode(scene, camera);
  lights.setLights([light]);
  builder.lightsNode = lights;
  builder.build();
  return { fragment: String(builder.fragmentShader), vertex: String(builder.vertexShader) };
}

for (const kind of ['ground', 'receiver'] as const) for (const forceWebGL of [false, true]) {
  it(`builds the ${kind} graph for the ${forceWebGL ? 'WebGL 2' : 'WebGPU'} backend without warnings`, async () => {
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const { fragment, vertex } = build(kind, forceWebGL);
    expect(fragment.length).toBeGreaterThan(1000);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const dir = process.env.ES_DUMP_SHADERS;
    if (dir) {
      const fs = await import('node:fs');
      fs.writeFileSync(`${dir}/${kind}-${forceWebGL ? 'glsl' : 'wgsl'}.txt`, `${fragment}\n//VERTEX\n${vertex}`);
    }
  });
}
