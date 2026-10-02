// The browser import map of the look page. Every bare `three/...` specifier that
// packages/game-core/src imports must resolve through a key here (importMap.test.mjs).
export const LOOK_IMPORT_MAP = {
  imports: {
    three: "/three/build/three.webgpu.js",
    "three/webgpu": "/three/build/three.webgpu.js",
    "three/tsl": "/three/build/three.tsl.js",
    "three/addons/": "/three/examples/jsm/",
    "three/examples/jsm/": "/three/examples/jsm/",
  },
};
