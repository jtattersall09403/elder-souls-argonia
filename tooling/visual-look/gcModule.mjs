// Serve game-core TypeScript to the look pages as browser ES modules.
// fx/fire modules are served at /fire/<name>.js (from fireDir, which --fire-dir
// may point at another copy); every other game-core module at /gc/<path>.js.
// Relative imports are rewritten to those URLs so fire code that reaches into
// render/ or settlement/ (TSL helpers, lighting) loads unchanged.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../packages/game-core/src");

function transpile(file, relDir) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from "(\.{1,2}\/[^"]+)"/g, (_, spec) => {
    const rel = posix.normalize(posix.join(relDir, spec));
    return rel.startsWith("fx/fire/") ? `from "/fire/${rel.slice(8)}.js"` : `from "/gc/${rel}.js"`;
  });
}

/** Body for /fire/<name>.js, /gc/<path>.js or /gc/<file>.json.js, or null when not a module path. */
export function gcModule(path, fireDir = join(srcRoot, "fx/fire")) {
  // a JSON import (BloomPass's bloom.config.json) is served as an ES module
  let m = path.match(/^\/gc\/([\w/.-]+\.json)\.js$/);
  if (m) return `export default ${readFileSync(join(srcRoot, m[1]), "utf8")};`;
  m = path.match(/^\/fire\/(\w+)\.js$/);
  if (m) return transpile(join(fireDir, `${m[1]}.ts`), "fx/fire");
  m = path.match(/^\/gc\/([\w/]+)\.js$/);
  if (!m) return null;
  const base = join(srcRoot, m[1]);
  const file = [".ts", ".tsx", "/index.ts"].map((e) => base + e).find(existsSync);
  return file ? transpile(file, file.endsWith("/index.ts") ? m[1] : posix.dirname(m[1])) : null;
}
