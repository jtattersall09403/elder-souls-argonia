import { CHARACTER_BODY_CENTER_HEIGHT } from "./characterPhysics";

/**
 * The support plane the visual grounding solve stands the model on
 * (`SkyrimFighter.visualSupportY`): the world Y of what the character is
 * ACTUALLY standing on, in priority order.
 *
 * Why the controller's own answer comes first: a `floor-contact` clip
 * (every landing) follows this plane exactly, downward included
 * (`anim/grounding.ts` `nextSupportCorrection`). Feeding the TERRAIN height
 * while the character stands on a boulder drew the model into the stone by
 * the boulder's whole height for the length of the landing clip, then popped
 * it back out when the next clip released the correction (owner, 16f round
 * 4: "if I JUMP onto a rock I clip INTO it, then get snapped out"). Walking
 * onto the same rock never showed it, because locomotion clips only ever
 * correct upward.
 *
 * @param controllerSupportY the controller's grounded stand point, or null
 *   when it reports no ground under it (airborne, or its ground query missed).
 * @param terrainY the streamed terrain height under the body, or null off
 *   the built ground.
 * @param bodyCentreY the physics body centre, last resort: a plane at the
 *   character's own feet.
 */
export function visualSupportY(
  controllerSupportY: number | null,
  terrainY: number | null,
  bodyCentreY: number,
): number {
  return controllerSupportY ?? terrainY ?? bodyCentreY - CHARACTER_BODY_CENTER_HEIGHT;
}
