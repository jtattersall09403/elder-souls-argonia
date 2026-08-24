import { cpSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const FILES_ROOT = fileURLToPath(new URL("./files/", import.meta.url));

const CONTENT_TYPES = {
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

/**
 * Vite plugin serving the shared character runtime assets (rig, race bodies,
 * weapon/armour/arrow GLBs and icons) at the app's site root.
 *
 * Dev: a static middleware over `packages/character-assets/files/`.
 * Build: the tree is copied into the app's `dist/`, so every consuming app
 * deploys the same binaries without duplicating 35 MB per app in git.
 * Asset paths in the generated manifests stay app-relative (`races/nord.glb`);
 * `@elder-souls/character`'s `assetUrl()` resolves them against BASE_URL.
 */
export default function characterAssets() {
  let outDir = "dist";
  let root = process.cwd();
  let isBuild = false;
  return {
    name: "elder-souls-character-assets",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
      // Vitest also resolves the config (with a placeholder outDir) and closes
      // a bundle on teardown — only a real `vite build` should copy assets.
      isBuild = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        // Resist path traversal; only plain top-level asset paths exist here.
        const relative = normalize(decodeURIComponent(url)).replace(/^[/\\]+/, "");
        if (relative.includes("..")) return next();
        const file = join(FILES_ROOT, relative);
        if (!file.startsWith(FILES_ROOT) || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
        );
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (isBuild) cpSync(FILES_ROOT, join(root, outDir), { recursive: true });
    },
  };
}
