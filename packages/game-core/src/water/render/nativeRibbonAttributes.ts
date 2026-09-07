import { BufferAttribute, type BufferGeometry } from 'three';

/** Native ribbons reuse position.y as their head and a material constant as
 * their ribbon mode. Retain full-precision flow/response/normal values and
 * the per-vertex response-valid bit, including legacy records without levels. */
export function compactNativeRibbonAttributes(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position'), override = geometry.getAttribute('waterOverride');
  const flowY = geometry.getAttribute('waterFlowY'), response = geometry.getAttribute('waterLevelResponse');
  const count = position.count;
  const flow = new Float32Array(count * 3), levels = new Float32Array(count * 2), valid = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (override.getW(i) !== 1 || override.getX(i) !== position.getY(i)
      || (response.getZ(i) !== 0 && response.getZ(i) !== 1)) {
      throw new Error('Native ribbon compact layout requires exact head/mode and a binary response flag');
    }
    flow.set([override.getY(i), flowY.getX(i), override.getZ(i)], i * 3);
    levels.set([response.getX(i), response.getY(i)], i * 2);
    valid[i] = response.getZ(i);
  }
  geometry.deleteAttribute('waterOverride');
  geometry.deleteAttribute('waterFlowY');
  geometry.deleteAttribute('waterLevelResponse');
  geometry.setAttribute('waterRibbonFlow', new BufferAttribute(flow, 3));
  geometry.setAttribute('waterRibbonResponse', new BufferAttribute(levels, 2));
  geometry.setAttribute('waterRibbonResponseValid', new BufferAttribute(valid, 1));
}
