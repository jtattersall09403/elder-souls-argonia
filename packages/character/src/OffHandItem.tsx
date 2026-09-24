import { assetUrl } from "./assetBase";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, type MutableRefObject } from "react";
import * as THREE from "three";

import { RIG_SOCKET_ROTATION } from "@elder-souls/game-core/anim/animationManifest";
import { createRiggedBow } from "./riggedBow";
import type { WeaponSocketTransform, WeaponVisualProfile } from "@elder-souls/game-core/core/types";

/**
 * How far an archer has pulled, and when it let go, for a rigged bow.
 *
 * Refs rather than props because they change every frame the string is held:
 * `fraction` is 0 at rest and 1 at full draw; `release` is a counter that goes
 * up once per loose, which is what lets the bow play its snap-forward clip
 * exactly once per shot without the scene tracking the clip's state.
 */
export type BowDrawRefs = {
  fraction: MutableRefObject<number>;
  release: MutableRefObject<number>;
};

/**
 * Skyrim's BSEffectShader falloff on the torch glow (part A diag): opacity 0.6
 * facing the viewer (cosine 1.0), rising to 1.0 at a cosine of 0.4226 and
 * below, so the flame's edges read brighter than its face.
 */
const GLOW_FALLOFF = { startCos: 1, stopCos: 0.4226, startOpacity: 0.6, stopOpacity: 1 } as const;

/**
 * The additive material for a flagged effect mesh: the GLB's own texture times
 * its vertex colours, opacity from the vertex alpha and the view falloff,
 * added onto what is behind it. No new art: everything comes from the mesh.
 */
function createGlowMaterial(map: THREE.Texture | null) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      intensity: { value: 1 },
      falloff: { value: new THREE.Vector4(GLOW_FALLOFF.startCos, GLOW_FALLOFF.stopCos, GLOW_FALLOFF.startOpacity, GLOW_FALLOFF.stopOpacity) },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <color_pars_vertex>
      varying vec2 vGlowUv;
      varying float vFacing;
      void main() {
        #include <color_vertex>
        vGlowUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <color_pars_fragment>
      uniform sampler2D map;
      uniform float intensity;
      uniform vec4 falloff;
      varying vec2 vGlowUv;
      varying float vFacing;
      void main() {
        vec4 texel = texture2D(map, vGlowUv);
        vec4 tint = vec4(1.0);
        #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
          tint = vColor;
        #endif
        float t = clamp((vFacing - falloff.y) / max(1e-4, falloff.x - falloff.y), 0.0, 1.0);
        float viewOpacity = mix(falloff.w, falloff.z, t);
        gl_FragColor = vec4(texel.rgb * tint.rgb, texel.a * tint.a * viewOpacity * intensity);
        #include <colorspace_fragment>
      }
    `,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Whatever is in the off hand: a shield, a bow, a torch or a second weapon.
 *
 * Its own component, and its own Suspense boundary, for the same reason the
 * nocked arrow has one — swapping a shield should not blink the fighter holding
 * it. Mounted exactly as the main-hand weapon is, through the rig's socket
 * convention, so a shield needs no hand-tuned rotation of its own.
 *
 * A bow with a `rig` profile is mounted as the vanilla skinned bow with its
 * own draw/release clips (round 7, decision 0040): the draw clip is scrubbed
 * by the archer's draw fraction, so the limbs bend and the string comes back
 * with the hand, and the release clip plays once on the loose.
 */
export function OffHandItem({
  model: actor,
  profile,
  sheathed,
  objectRef,
  bowDraw,
  glowIntensity,
}: {
  /** The actor's body, whose socket bones this mounts onto. */
  model: THREE.Object3D;
  profile: WeaponVisualProfile;
  /** True while the actor's weapon is stowed. */
  sheathed: boolean;
  /**
   * Published so combat can hang a sensor on the mounted shield — a parry is
   * caught by the shield's own volume, riding the shield's own bone. Mirrors
   * `weaponRef` on the fighter; null while nothing is in the off hand.
   */
  objectRef?: MutableRefObject<THREE.Object3D | null>;
  /** The archer's draw, for a rigged bow. Ignored for anything else. */
  bowDraw?: BowDrawRefs;
  /**
   * 0-1 brightness of the item's additive glow (a torch's flame mesh): the
   * carried light's own intensity, so the flame and the light flicker together
   * and a spent torch goes dark. Absent means 1.
   */
  glowIntensity?: MutableRefObject<number>;
}) {
  const rig = profile.rig;
  const gltf = useGLTF(assetUrl(rig?.asset ?? profile.asset));
  const built = useMemo(() => {
    const group = new THREE.Group();
    if (rig) {
      const rigged = createRiggedBow(gltf, rig);
      group.add(rigged.object);
      return { group, rigged, glows: [] as THREE.ShaderMaterial[] };
    }
    const instance = gltf.scene.clone(true);
    const glows: THREE.ShaderMaterial[] = [];
    instance.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.additive) {
        // An effect mesh the pipeline flagged additive (a torch's GlowAddMesh):
        // it adds light and casts nothing.
        const glow = createGlowMaterial((object.material as THREE.MeshStandardMaterial).map ?? null);
        object.material = glow;
        object.castShadow = false;
        object.receiveShadow = false;
        glows.push(glow);
        return;
      }
      object.castShadow = true;
      object.receiveShadow = true;
      if (profile.alphaTest !== undefined) {
        // Cloned, so the cached scene's shared material is left as exported.
        const material = (object.material as THREE.Material).clone();
        material.alphaTest = profile.alphaTest;
        material.transparent = false;
        object.material = material;
      }
    });
    group.add(instance);
    return { group, rigged: null, glows };
  }, [gltf, rig, profile.alphaTest]);
  const mount = built.group;

  const transform: WeaponSocketTransform = sheathed ? profile.sheathed : profile.held;

  useLayoutEffect(() => {
    const socket = actor.getObjectByName(transform.socket);
    if (!socket) return undefined;
    actor.updateWorldMatrix(true, true);
    const worldScale = socket.getWorldScale(new THREE.Vector3()).x || 1;
    mount.scale.setScalar((rig?.scale ?? 1) * transform.localScale / worldScale);
    mount.position.fromArray(transform.localPosition);
    mount.quaternion
      .fromArray(RIG_SOCKET_ROTATION as unknown as number[])
      .normalize()
      .multiply(new THREE.Quaternion().fromArray(transform.localRotation).normalize())
      .normalize();
    socket.add(mount);
    if (objectRef) objectRef.current = mount;
    return () => {
      socket.remove(mount);
      if (objectRef?.current === mount) objectRef.current = null;
    };
  }, [actor, mount, objectRef, rig, transform]);

  useFrame((_, delta) => {
    // A glow burns as bright as the carried light it belongs to.
    for (const glow of built.glows) glow.uniforms.intensity.value = glowIntensity?.current ?? 1;
    if (!built.rigged) return;
    const fraction = sheathed ? 0 : (bowDraw?.fraction.current ?? 0);
    built.rigged.update(fraction, bowDraw?.release.current ?? 0, delta);
  });

  return null;
}
