// Q4 (perf-diag23): why is int-jungle (MugsumpHollowInt01) near black? Read: await window.__DIAG__.jungle() (after capture-lib.js).
// Returns renderer.toneMappingExposure, the interior's lights (type, intensity, colour: the ambient is a light or scene.environment),
// camera position and direction, scene.fog, and the mean frame luma as is and with the fog disabled for one frame (restored).
(() => {
  const D = (window.__DIAG__ ??= {});
  D.jungle = async () => {
    const { R, scene, camera } = D.grab ?? {};
    if (!R || !scene) return { error: "no renderer/scene captured" };
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const dir = camera.getWorldDirection(camera.position.clone());
    const lights = [];
    scene.traverse((o) => { if (o.isLight) lights.push({ type: o.type, name: o.name || null, visible: o.visible, intensity: r3(o.intensity), color: o.color?.getHexString?.(), distance: o.distance, ground: o.groundColor?.getHexString?.() }); });
    const fog = scene.fog;
    const out = {
      exposure: r3(R.toneMappingExposure), toneMapping: R.toneMapping,
      camera: { pos: camera.position.toArray().map(r3), dir: dir.toArray().map(r3) },
      fog: fog ? { type: fog.constructor.name, color: fog.color?.getHexString?.(), near: fog.near, far: fog.far, density: fog.density } : null,
      environment: scene.environment ? { intensity: scene.environmentIntensity ?? null } : null, background: !!scene.background,
      lights: lights.length, lightList: lights.slice(0, 16),
    };
    await D.nextFrame(); out.luma = D.frameLuma(null);
    scene.fog = null; await D.nextFrame(); out.lumaFogOff = D.frameLuma(null); scene.fog = fog;
    return out;
  };
})();
