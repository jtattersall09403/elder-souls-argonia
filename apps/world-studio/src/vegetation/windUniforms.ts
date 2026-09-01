/**
 * The ONE wind uniform block every plant material in the studio shares.
 *
 * Vegetation.tsx and Groundcover.tsx used to each create their own block over
 * the SAME kit materials — whichever patched a material first won, and the
 * other advanced a clock nothing was bound to. A single shared instance (plus
 * `updateWindSway` taking absolute elapsed time, so double per-frame calls
 * are harmless) removes the race entirely.
 */
import { createWindUniforms } from "@elder-souls/game-core/fx/windSway";

export const sharedWindUniforms = createWindUniforms();
