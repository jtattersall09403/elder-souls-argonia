import { cpSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const FILES_ROOT = fileURLToPath(new URL("./files/", import.meta.url));
const CONTENT_TYPES = { ".webm": "audio/webm", ".json": "application/json" };
/** Every shipped audio URL sits under this site-relative prefix. */
export const AUDIO_PREFIX = "audio/";

/**
 * Vite plugin serving the shipped audio (Opus/WebM + audio-manifest.json) at
 * `<base>audio/` — the same pattern as @elder-souls/character-assets/plugin.
 *
 * Dev: a static middleware over `packages/audio/files/`. Build: the tree is
 * copied into `<outDir>/audio/`. The AudioManager fetches
 * `<base>audio/<assetId>.webm` on demand; nothing is loaded at startup but the
 * manifest (decision 0094: only what a scene needs streams).
 *
 * `sharedBase`: when the app deploys BESIDE another app that already ships the
 * files (the owner's 2026-09-18 rule for character-assets: one copy on the
 * Pages site), pass that app's base URL; the build then copies nothing and
 * the app hands `${sharedBase}audio/` to the AudioManager as its base URL.
 */
export default function audioFiles({ sharedBase } = {}) {
  let outDir = "dist";
  let root = process.cwd();
  let isBuild = false;
  return {
    name: "elder-souls-audio-files",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
      isBuild = config.command === "build" && !sharedBase;
    },
    configureServer(server) {
      const base = server.config?.base ?? "/";
      const prefix = `${base.endsWith("/") ? base : `${base}/`}${AUDIO_PREFIX}`;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith(prefix)) return next();
        const relative = normalize(decodeURIComponent(url.slice(prefix.length))).replace(/^[/\\]+/, "");
        if (relative.includes("..")) return next();
        const file = join(FILES_ROOT, relative);
        if (!file.startsWith(FILES_ROOT) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (isBuild) cpSync(FILES_ROOT, join(root, outDir, AUDIO_PREFIX), { recursive: true });
    },
  };
}
