import { rolldown } from "rolldown";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const temporary = await mkdtemp(join(tmpdir(), "weapon-reach-"));
try {
  const bundle = await rolldown({ input: new URL("./weaponReachBake.ts", import.meta.url).pathname, platform: "node" });
  const file = join(temporary, "bake.mjs");
  await bundle.write({ file, format: "esm" });
  await bundle.close();
  await import(pathToFileURL(file).href);
} finally { await rm(temporary, { recursive: true, force: true }); }
