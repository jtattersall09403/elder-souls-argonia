// Serve a built WebGPU studio the way Pages does, for flames.mjs and other
// probes: node tooling/gpu-lane/webgpu-serve.mjs <dist> [--port 8193]
// Data comes from the main tree (lib/webgpu-static.mjs dataPublicDir; override
// with $ES_DATA_PUBLIC, e.g. the composed site/studio).
//   /elder-souls-argonia/webgpu/  -> <dist>
//   /elder-souls-argonia/studio/  -> data
import { createServer } from "node:http";
import { resolve } from "node:path";
import { dataPublicDir, pagesRoots, staticHandler } from "../../apps/world-studio/scripts/lib/webgpu-static.mjs";

const argv = process.argv.slice(2);
const dist = argv[0] && !argv[0].startsWith("--") ? resolve(argv[0]) : null;
if (!dist) { console.error("usage: webgpu-serve.mjs <dist> [--port N]"); process.exit(2); }
const i = argv.indexOf("--port");
const port = i >= 0 ? Number(argv[i + 1]) : 8193;
const data = dataPublicDir();
createServer(staticHandler(pagesRoots(dist, data))).listen(port, "127.0.0.1", () =>
  console.log(`webgpu-serve: http://127.0.0.1:${port}/elder-souls-argonia/webgpu/ (data ${data})`));
