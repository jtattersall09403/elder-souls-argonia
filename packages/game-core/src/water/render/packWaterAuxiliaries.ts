/** Pack GPU-only auxiliaries into unused decoded alpha bytes, AFTER PNG
 * decoding. No data is authored into PNG alpha (premultiplication is unsafe).
 * RGB stays byte-identical for CPU queries. This keeps the terrain material
 * within WebGL2's minimum16 fragment samplers with3 shadow cascades.
 * Surface.A=tide response; support.A=access high byte; shore.A=access low byte;
 * class.A=wave shelter. No extra atlas allocation or duplicated GPU rasters.
 */
export function packWaterAuxiliaries(surface: Uint8ClampedArray, shore: Uint8ClampedArray,
  support: Uint8ClampedArray, klass: Uint8ClampedArray, character: Uint8ClampedArray,
  access?: Uint8ClampedArray): void {
  if (surface.length % 4 || surface.length !== shore.length || surface.length !== support.length
    || (access && access.length !== surface.length) || klass.length % 4 || klass.length !== character.length) {
    throw new Error("Water auxiliary packing requires matching RGBA grids");
  }
  if (access) for (let i = 0; i < surface.length; i += 4) {
    surface[i + 3] = access[i + 2];
    support[i + 3] = access[i];
    shore[i + 3] = access[i + 1];
  }
  for (let i = 0; i < klass.length; i += 4) klass[i + 3] = character[i + 2];
}
