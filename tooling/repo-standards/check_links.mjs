#!/usr/bin/env node
/**
 * Relative-link checker for repo markdown (docs/, world/, .claude/, root).
 * Resolves every relative `[text](path)` link to a file or directory on disk;
 * anchors, external URLs and mailto: links are ignored. Exit 1 on any miss.
 * Usage: node tooling/repo-standards/check_links.mjs
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(process.argv[2] ?? process.cwd());
const roots = ['docs', 'world', '.claude'];
const skip = new Set(['node_modules', '.git', 'dist', 'build', 'output']);
const files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) files.push(p);
  }
}
for (const r of roots) if (existsSync(join(root, r))) walk(join(root, r));
for (const f of readdirSync(root)) if (f.endsWith('.md')) files.push(join(root, f));

const linkRe = /\]\(([^)\s]+?)(?:#[^)]*)?\)/g;
let broken = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(linkRe)) {
    const link = decodeURI(m[1]);
    if (/^(https?:|mailto:|#|\/)/.test(link)) continue;
    const target = resolve(dirname(file), link);
    if (!existsSync(target)) {
      broken++;
      console.log(`${relative(root, file)}: ${link}`);
    }
  }
}
console.log(broken === 0 ? `OK: ${files.length} files, no broken relative links` : `${broken} broken links in ${files.length} files`);
process.exit(broken === 0 ? 0 : 1);
