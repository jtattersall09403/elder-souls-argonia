// Vite config for the harness dist (harness.html: fire, settlement and air scenes), used by build-dist.sh <wt> harness.
// Run with cwd = <worktree>/apps/world-studio: it extends that app's vite.config.ts and only swaps the entry page.
// Lives here, inside the worktree, so `vite` resolves from the repo's node_modules (a copy in /tmp cannot import it).
import { resolve } from "node:path";
import { mergeConfig } from "vite";
import base from "../../apps/world-studio/vite.config.ts";

export default (env) =>
  mergeConfig(typeof base === "function" ? base(env) : base, {
    build: { rollupOptions: { input: resolve(process.cwd(), "harness.html") } },
  });
