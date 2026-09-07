/** Export the runtime's exact native ownership footprints, once per raster
 * tile. Used by prepare_water_cutouts.py; never rebuilds cross-section meshes.
 * Run: node export_water_footprint_tiles.cjs water-meta.json output.jsonl */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), ts = require('typescript');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Expected water-meta.json and output.jsonl');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), modules = {};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  modules[path.relative(path.resolve(__dirname, '../..'), filename)] = hash(source);
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { ChannelRibbonSampler } = require('../../packages/game-core/src/water/channelRibbons.ts');
const { PackedCrossSections } = require('../../packages/game-core/src/water/packedCrossSections.ts');
const meta = JSON.parse(fs.readFileSync(input, 'utf8'));
const sourceRibbonsSha256 = hash(JSON.stringify(meta.ribbons ?? []));
if (meta.crossSections) {
  const bytes = fs.readFileSync(path.join(path.dirname(input), meta.crossSections.file));
  if (hash(bytes) !== meta.crossSections.sha256) throw new Error('Packed water sections do not match metadata');
  new PackedCrossSections(meta.crossSections, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), meta.ribbons);
}
const sampler = new ChannelRibbonSampler(meta.ribbons ?? []), mpp = meta.surface.metresPerPixel, tileM = 64 * mpp;
const fd = fs.openSync(output, 'w'), count = Math.ceil(meta.surface.size / 64);
let triangles = 0;
try {
  fs.writeSync(fd, JSON.stringify({ schemaVersion: 1, sourceRibbonsSha256, crossSectionsSha256: meta.crossSections?.sha256,
    builderSourceHashes: modules, surfaceGrid: { size: meta.surface.size, metresPerPixel: mpp, gridOriginM: meta.surface.gridOriginM },
    classGrid: { size: meta.klass.size, metresPerPixel: meta.klass.metresPerPixel, gridOriginM: meta.klass.gridOriginM }, gridSize: meta.surface.size, metresPerPixel: mpp, tileCells: 64 }) + '\n');
  for (let tz = 0; tz < count; tz++) for (let tx = 0; tx < count; tx++) {
    const footprints = sampler.ownershipFootprintsInBounds(tx * tileM, tz * tileM, (tx + 1) * tileM, (tz + 1) * tileM);
    if (!footprints.length) continue;
    const positions = footprints.map(t => [t.a.x, t.a.z, t.b.x, t.b.z, t.c.x, t.c.z]);
    fs.writeSync(fd, JSON.stringify({ tx, tz, positions }) + '\n'); triangles += positions.length;
  }
} finally { fs.closeSync(fd); }
console.log(JSON.stringify({ triangles, output }));
