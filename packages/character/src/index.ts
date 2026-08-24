/**
 * @elder-souls/character — the rendered, physical player/NPC character.
 *
 * R3F/Rapier/ecctrl layer over `@elder-souls/game-core`: the animated Skyrim
 * actor, its equipment attachments, the skeletal combat hurtbox, and the one
 * canonical ecctrl player body behind the `PlayerMovementController` boundary.
 * Consumers must sit inside an `@react-three/rapier` `<Physics>` world.
 */
export { SkyrimFighter } from "./SkyrimFighter";
export {
  SkeletalHurtbox,
  HAS_SKELETAL_HURTBOX,
  type HurtboxBone,
  type HurtboxRigRef,
} from "./SkeletalHurtbox";
export { ArmourAttachments } from "./ArmourAttachments";
export { OffHandItem } from "./OffHandItem";
export { NockedArrow } from "./NockedArrow";
export { PlayerBody } from "./PlayerBody";
export { EcctrlAdapter } from "./EcctrlAdapter";
export { assetUrl } from "./assetBase";
