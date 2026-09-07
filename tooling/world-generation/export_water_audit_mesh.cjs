/** Export the real channel triangle builder in bounded record batches.
 * Run: node export_water_audit_mesh.cjs ribbons.json output-directory metres-per-pixel
 * Tool-process-only TS loading; runtime packages and their imports stay intact.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const [input, output, spacing] = process.argv.slice(2);
const metresPerPixel = Number(spacing);
if (!input || !output || !Number.isFinite(metresPerPixel) || metresPerPixel <= 0)
  throw new Error('Expected ribbons.json, output directory and positive native spacing');
if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('Little-endian host required');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const modules = {};
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  modules[path.relative(path.resolve(__dirname, '../..'), filename)] = hash(source);
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, filename);
};
const { buildChannelRibbonMeshData } = require('../../packages/game-core/src/water/channelRibbons.ts');
const bytes = fs.readFileSync(input), data = JSON.parse(bytes);
const bounds = data.stageRange;
const keys = ['tidalAmplitudeM', 'seasonalAmplitudeM', 'lowTideAmplitudeM', 'drySeasonAmplitudeM'];
if (!bounds || keys.some(key => !Number.isFinite(bounds[key]) || bounds[key] < 0))
  throw new Error('Input must declare its compiled stage bounds');
if (new Set(data.ribbons.map(record => record.id)).size !== data.ribbons.length)
  throw new Error('Duplicate channel record identity');
if (data.geometryScope === 'all-accepted-channel-records'
  && data.ribbons.filter(record => record.geometryRole !== 'landing').length !== data.acceptedSourceCount)
  throw new Error('Declared complete channel export has a mismatching source count');
fs.mkdirSync(output, { recursive: true });
const manifest = { schemaVersion: 1, status: 'exported-channel-triangles-not-final-native-refinement',
  inputSha256: hash(bytes), builderSourceHashes: modules, metresPerPixel, stageRange: bounds,
  declaredGeometryScope: data.geometryScope ?? 'selected-records',
  recordIds: data.ribbons.map(record => record.id), batches: [] };
for (let first = 0; first < data.ribbons.length; first += 64) {
  const records = data.ribbons.slice(first, first + 64);
  const mesh = buildChannelRibbonMeshData(records, undefined, undefined,
    bounds.tidalAmplitudeM + bounds.seasonalAmplitudeM);
  if (!mesh.indices.every((value, index) => value === index))
    throw new Error('Audit export requires sequential triangle vertices');
  const responses = new Float32Array(mesh.levelResponses.length / 3 * 2);
  for (let i = 0; i < responses.length / 2; i++) {
    if (mesh.levelResponses[i * 3 + 2] !== 1) throw new Error('Legacy response fallback cannot certify coverage');
    responses[i * 2] = mesh.levelResponses[i * 3];
    responses[i * 2 + 1] = mesh.levelResponses[i * 3 + 1];
  }
  const entry = { triangles: mesh.indices.length / 3, files: {} };
  for (const [name, values] of Object.entries({ positions: mesh.positions,
    access: mesh.floodAccessOffsets, responses })) {
    const filename = `${first}-${name}.f32`;
    const content = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
    fs.writeFileSync(path.join(output, filename), content);
    entry.files[name] = { path: filename, sha256: hash(content) };
  }
  manifest.batches.push(entry);
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ records: data.ribbons.length, batches: manifest.batches.length,
  triangles: manifest.batches.reduce((sum, batch) => sum + batch.triangles, 0) }));
