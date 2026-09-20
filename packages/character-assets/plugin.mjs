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
 * deploys the same binaries without duplicating them in git.
 * Asset paths in the generated manifests stay app-relative (`races/nord.glb`);
 * `@elder-souls/character`'s `assetUrl()` resolves them against BASE_URL.
 *
 * `sharedBase`: when the app is deployed BESIDE another app that already
 * ships the files (the studio under `/elder-souls-argonia/studio/`, the
 * sandbox at `/elder-souls-argonia/`), pass that app's base URL. The build
 * then copies nothing and defines `VITE_CHARACTER_ASSETS_BASE` so
 * `assetUrl()` resolves against the shared copy: one 112 MB set on the
 * Pages site instead of two (owner 2026-09-18). Dev is unchanged — each
 * dev server still serves the files itself.
 */
export default function characterAssets({ sharedBase } = {}) {
  let outDir = "dist";
  let root = process.cwd();
  let isBuild = false;
  return {
    name: "elder-souls-character-assets",
    config(_config, { command }) {
      if (command !== "build" || !sharedBase) return undefined;
      if (!sharedBase.endsWith("/")) throw new Error(`characterAssets sharedBase must end in '/': ${sharedBase}`);
      // A build-time constant, replaced by the bundler wherever the bare
      // identifier appears (`assetUrl()` guards it with `typeof`, so dev
      // servers and Node see `undefined` and fall back to BASE_URL). Vite
      // loads `import.meta.env` before the config hooks run, so neither a
      // `VITE_` variable set here nor a `define` of the dotted expression
      // (which a property read off a local never matches) reaches the code.
      return { define: { __ES_CHARACTER_ASSETS_BASE__: JSON.stringify(sharedBase) } };
    },
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
      // Vitest also resolves the config (with a placeholder outDir) and closes
      // a bundle on teardown — only a real `vite build` should copy assets.
      isBuild = config.command === "build" && !sharedBase;
    },
    configureServer(server) {
      // The dev server's configured base ("/" by default, but a probe or a
      // sub-path preview may run under e.g. "/elder-souls-argonia/studio/").
      // Matching req.url verbatim ignored it, so under any non-root base the
      // rig GLB request missed this middleware, fell through to the SPA
      // fallback and the loader was handed index.html — a throw inside the
      // R3F tree, which unmounted the canvas and read as "Context Lost"
      // (2026-09-20). Strip the base before matching; root base is unchanged.
      const base = server.config?.base ?? "/";
      const prefix = base === "/" ? null : base.endsWith("/") ? base.slice(0, -1) : base;
      server.middlewares.use((req, res, next) => {
        let url = (req.url ?? "").split("?")[0];
        if (prefix && (url === prefix || url.startsWith(`${prefix}/`))) {
          url = url.slice(prefix.length) || "/";
        }
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
