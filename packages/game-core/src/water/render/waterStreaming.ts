import { Box3, Frustum, Matrix4, Vector3, type Camera, type BufferGeometry } from "three";

export interface WaterGeometryView {
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly frustum?: Frustum;
  readonly pixelsPerRadian: number;
  readonly farM: number;
}

/** Reused per scene; no temporary matrices or frustums each frame. */
export class WaterGeometryCamera {
  private readonly matrix = new Matrix4();
  private readonly frustum = new Frustum();
  readonly view: WaterGeometryView = { position: new Vector3(), frustum: this.frustum, pixelsPerRadian: 600, farM: 30000 };
  update(camera: Camera, drawingHeight: number): WaterGeometryView {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    (this.view.position as Vector3).copy(camera.position);
    Object.assign(this.view, { pixelsPerRadian: Math.abs(camera.projectionMatrix.elements[5]) * drawingHeight * 0.5,
      farM: (camera as Camera & { far?: number }).far ?? 30000 });
    return this.view;
  }
}

export function waterGeometryBytes(geometry: BufferGeometry): number {
  let total = geometry.index?.array.byteLength ?? 0;
  for (const attribute of Object.values(geometry.attributes)) total += attribute.array.byteLength;
  return total;
}

export function waterPatchDistance(bounds: Box3, view: WaterGeometryView): number {
  const p = view.position;
  return Math.hypot(Math.max(bounds.min.x - p.x, 0, p.x - bounds.max.x),
    Math.max(bounds.min.y - p.y, 0, p.y - bounds.max.y), Math.max(bounds.min.z - p.z, 0, p.z - bounds.max.z));
}

/** Half a display pixel is the far geometry budget; nearby topology retains
 * the four-centimetre compiler target. Heights remain true metres. */
export function waterPatchErrorM(bounds: Box3, view: WaterGeometryView | undefined, verticalScale: number): number {
  if (!view) return 0.04;
  return Math.max(0.04, waterPatchDistance(bounds, view) * 0.5 / Math.max(1, view.pixelsPerRadian) / verticalScale);
}

export function waterPatchVisible(bounds: Box3, view?: WaterGeometryView): boolean {
  return !view || ((!view.frustum || view.frustum.intersectsBox(bounds)) && waterPatchDistance(bounds, view) <= view.farM);
}

/** Turning/streaming buffer in the horizontal world plane. Vertical inflation
 * would admit distant low water simply because a tall empty box is visible. */
export function waterPatchBuffer(bounds: Box3, metres: number): Box3 {
  const expanded = bounds.clone();
  expanded.min.x -= metres; expanded.min.z -= metres;
  expanded.max.x += metres; expanded.max.z += metres;
  return expanded;
}
