import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Serve the Basis Universal transcoder that three.js's `KTX2Loader` needs
 * (`basis_transcoder.js` + `basis_transcoder.wasm`) at `<base>/basis/`.
 *
 * Every kit ships KTX2/UASTC textures (pipeline/kit_compress.py); the loader
 * fetches the transcoder from a DIRECTORY it is given
 * (`setTranscoderPath`), so the two files cannot go through Vite's hashed
 * asset imports. This plugin takes them from the installed three.js (always
 * the version the loader was written for), serves them in dev and copies
 * them into `dist/basis/` on build, the same way `@elder-souls/character-assets`
 * ships the character files. The runtime resolves the directory against the
 * app's `BASE_URL` (packages/game-core/src/assets/kitLoader.ts), so the Pages
 * sub-path (`/elder-souls-argonia/studio/basis/`) is right by construction.
 */
const require = createRequire(import.meta.url);
const SOURCE_DIR = dirname(require.resolve("three/examples/jsm/libs/basis/basis_transcoder.js"));
export const TRANSCODER_FILES = ["basis_transcoder.js", "basis_transcoder.wasm"];
const CONTENT_TYPES = { ".js": "text/javascript", ".wasm": "application/wasm" };

export default function basisTranscoder() {
  let outDir = "dist";
  let root = process.cwd();
  let isBuild = false;
  return {
    name: "elder-souls-basis-transcoder",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
      isBuild = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const match = /^\/basis\/([A-Za-z0-9_.-]+)$/.exec(url);
        if (!match || !TRANSCODER_FILES.includes(match[1])) return next();
        const file = join(SOURCE_DIR, match[1]);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", CONTENT_TYPES[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!isBuild) return;
      for (const name of TRANSCODER_FILES) {
        cpSync(join(SOURCE_DIR, name), join(root, outDir, "basis", name));
      }
    },
  };
}
