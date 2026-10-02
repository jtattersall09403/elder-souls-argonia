// Serve built studios the way Pages does, all at once, each at the base it was built for (branch builds
// at /elder-souls-argonia/webgpu/ or their own ES_STUDIO_BASE, dev's at /elder-souls-argonia/studio/):
//   node tooling/gpu-lane/webgpu-serve.mjs <dist> [<dist>...] [--port 8193]
// Studio data at /studio/ comes from the main tree (lib/webgpu-static.mjs dataPublicDir; override with
// $ES_DATA_PUBLIC). On the pod, pod-sync.sh runs it over every dist under /root/site/dists/.
import { createServer } from "node:http";
import { dataPublicDir, staticHandler } from "../../apps/world-studio/scripts/lib/webgpu-static.mjs";
import { siteRoots } from "./serve-lib.mjs";

const argv = process.argv.slice(2);
const i = argv.indexOf("--port");
const port = i >= 0 ? Number(argv[i + 1]) : 8193;
const dists = argv.filter((a, j) => !a.startsWith("--") && !(i >= 0 && j === i + 1));
if (!dists.length) { console.error("usage: webgpu-serve.mjs <dist> [<dist>...] [--port N]"); process.exit(2); }
const roots = siteRoots(dists, dataPublicDir(), new URL("../../packages/character-assets/files", import.meta.url).pathname);
createServer(staticHandler(roots)).listen(port, "127.0.0.1", () => {
  for (const [base, root] of roots) console.log(`webgpu-serve: http://127.0.0.1:${port}${base} <- ${root}`);
});
