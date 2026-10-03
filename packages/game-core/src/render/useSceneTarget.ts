import { useEffect, useRef } from "react";
import type * as THREE from "three";

/** The render target the frame's scene pass draws into (the layer-0 camera's; `null` is the canvas, `undefined` before the first frame). */
export function useSceneTarget(scene: THREE.Scene): { readonly current: THREE.RenderTarget | null | undefined } {
  const target = useRef<THREE.RenderTarget | null | undefined>(undefined);
  useEffect(() => {
    const previous = scene.onBeforeRender;
    const hook: THREE.Scene["onBeforeRender"] = function (this: THREE.Scene, ...args) {
      const [, , cam, t] = args as unknown as [unknown, unknown, THREE.Camera, THREE.RenderTarget | null];
      if (cam.layers.isEnabled(0)) target.current = t;
      previous.apply(this, args);
    };
    scene.onBeforeRender = hook;
    return () => { if (scene.onBeforeRender === hook) scene.onBeforeRender = previous; };
  }, [scene]);
  return target;
}
