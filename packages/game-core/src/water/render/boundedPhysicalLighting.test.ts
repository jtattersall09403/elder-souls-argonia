import { ShaderChunk } from 'three';
import { expect, it } from 'vitest';
import { boundedPhysicalLighting } from './boundedPhysicalLighting';

it('removes every DFG sampler use on minimum WebGL2 hardware without changing direct GGX', () => {
  const output = boundedPhysicalLighting('#include <lights_physical_pars_fragment>', 16);
  expect(output).toContain('vec2 esEnvironmentFit');
  expect(output).not.toContain('dfgLUT');
  expect(output.match(/esEnvironmentFit\(vec2/g)?.length).toBeGreaterThanOrEqual(3);
  const direct = (source: string) => {
    const start = source.indexOf('vec3 BRDF_GGX(');
    let end = source.indexOf('{', start), depth = 1;
    while (depth && ++end < source.length) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
    }
    return source.slice(start, end + 1);
  };
  expect(direct(output)).toBe(direct(ShaderChunk.lights_physical_pars_fragment));
});

it('keeps the current lookup-table shader on hardware with room for it', () => {
  const source = '#include <lights_physical_pars_fragment>';
  expect(boundedPhysicalLighting(source, 32)).toBe(source);
  expect(boundedPhysicalLighting('unlit shader', 16)).toBe('unlit shader');
});
