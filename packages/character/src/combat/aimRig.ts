import { CHARACTER_BODY_CENTER_HEIGHT } from "@elder-souls/game-core/physics/characterPhysics";
import * as THREE from "three";

/**
 * Where the archer's eye is, relative to the physics body's centre.
 *
 * The actor is built to 1.85 m and the capsule centre sits `CHARACTER_BODY_
 * CENTER_HEIGHT` off the floor, so this is the difference between that and eye
 * level on a standing figure.
 */
export const PLAYER_EYE_OFFSET_Y = 1.68 - CHARACTER_BODY_CENTER_HEIGHT;
/**
 * How far along the shot, from the nock of the drawn shaft, the projectile's
 * centre appears.
 *
 * Far enough that the *tail* of a 0.75 m shaft is clear of the archer's own
 * navigation capsule: an arrow that starts half inside its owner is deflected
 * by them on its first physics step. At launch speed the gap is one frame.
 */
export const ARROW_SPAWN_AHEAD_METERS = 0.375;
/**
 * How fast an archer can reposition with the bow up, m/s.
 *
 * Slower than a free walk. A raised bow is a commitment, and a player who can
 * circle-strafe at full pace while drawing has no reason to ever lower it.
 */
export const AIM_MOVE_SPEED = 2.1;
/**
 * Ceiling on the drawn stride's own speed, m/s.
 *
 * The aim moves at the speed the *clip* moves at (its measured ground track),
 * so the feet stay the anchor — but a drawn stride is still a commitment, so
 * the clip's speed is capped rather than trusted blindly.
 */
export const AIM_MOVE_SPEED_CEILING = AIM_MOVE_SPEED;

/** Distance out along the aim axis the first-person camera looks. */
export const AIM_LOOK_DISTANCE_METERS = 40;
/**
 * How far *ahead* of the eye the aim camera sits, along the shot axis, in metres.
 *
 * This number has been wrong in both directions and the reason is worth keeping.
 * A camera exactly on the eye of a third-person rig used to end up inside the
 * skull. The pass before this one answered that by pulling the camera 0.55 m
 * *back* along the axis — which put the archer's own shoulders and back squarely
 * between the camera and the target: a first-person view of your own spine.
 *
 * The head is now hidden outright while aiming rather than shrunk (see
 * `headMeshes`), so "inside the head" is no longer a state that can exist and
 * this offset no longer has to defend against it. It is kept small and forward
 * only to stay clear of the collar and shoulders, which are still there — and
 * that is now the *only* job it has, which is why it can be this small.
 *
 * Deliberately on the axis and not over a shoulder: a lateral offset would put
 * the crosshair ray and the arrow's line a fixed distance apart at every range,
 * which reads as the bow shooting slightly wide of the aim the further out you
 * shoot.
 */
export const AIM_EYE_AHEAD_METERS = 0.28;

/**
 * Near clip while the aim is up, against the app camera's 0.1 default.
 *
 * The aimed eye sits inside the actor's own geometry — the aim lean bows the
 * head and shoulders into the eye point, and hair/crest meshes are partly
 * neck-weighted so the strict head-mesh hide cannot claim them. Clipping
 * everything nearer than this is the standard hybrid-first-person answer: the
 * skull's neighbourhood vanishes while the bow arm, half a metre out, stays.
 * A Skyrim-style separate first-person rig was considered and rejected — it
 * would mean sourcing a second animation set for every weapon action.
 */
export const AIM_NEAR_CLIP_METERS = 0.34;

/** Sideways offset of the aimed eye, toward the string-hand side. */
export const AIM_EYE_RIGHT_METERS = 0.14;
/** The camera's near clip with the aim down, restored when the bow lowers. */
export const BASE_NEAR_CLIP_METERS = 0.1;
/**
 * Field of view while aiming, at each end of the zoom.
 *
 * The wide end is the default: wide enough to hold both arms and the bow limbs
 * at the camera's set-back distance, which is also how an archer actually looks
 * at a target with both eyes open. The narrow end is roughly a 2.7x
 * magnification, which is about what picking a target out at fifty metres asks
 * for without turning the view into a scope the rest of the game does not have.
 */
export const AIM_FIELD_OF_VIEW = 75;
export const AIM_FIELD_OF_VIEW_ZOOMED = 28;
/** Full sweep of the zoom, in seconds, on a held button. */
export const AIM_ZOOM_SECONDS = 0.9;
/** How much of the zoom one wheel notch covers. */
export const AIM_ZOOM_PER_WHEEL_NOTCH = 0.12;
/** How far above and below level the bow can be aimed, radians. */
export const AIM_PITCH_LIMIT = 1.15;

/**
 * The direction the archer is looking, from camera yaw and aim pitch.
 *
 * Matches `cameraRelativeDirection`'s convention — the camera sits at
 * `(+sin yaw, +cos yaw)` behind the player and looks the other way. This
 * produces the direct crosshair ray; `bowSight` applies the configured sight
 * elevation to both the visible and physical launch axis.
 */
export function aimDirectionInto(target: THREE.Vector3, yaw: number, pitch: number) {
  const horizontal = Math.cos(pitch);
  return target.set(
    -Math.sin(yaw) * horizontal,
    Math.sin(pitch),
    -Math.cos(yaw) * horizontal,
  ).normalize();
}

/** Field of view at a zoom fraction. Linear in FOV, which reads as even. */
export function aimFieldOfView(zoom: number) {
  return THREE.MathUtils.lerp(AIM_FIELD_OF_VIEW, AIM_FIELD_OF_VIEW_ZOOMED, zoom);
}
