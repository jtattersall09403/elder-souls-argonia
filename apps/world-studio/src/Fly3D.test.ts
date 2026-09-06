import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

it("loads terrain independently of either vegetation asset and retains a ground fallback", () => {
  const source = ts.createSourceFile("Fly3D.tsx",
    readFileSync(new URL("./Fly3D.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const boundaries = new Map<string, ts.JsxElement>();
  let asyncFallback:ts.JsxAttributeLike|undefined;
  function visit(node: ts.Node, boundary?: ts.JsxElement) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Suspense") {
      boundary = node;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(source);
      if(name==="ChunkTerrain")asyncFallback=node.attributes.properties.find(
        attribute=>ts.isJsxAttribute(attribute)&&attribute.name.getText(source)==="loadingFallback");
      if (["ChunkTerrain", "Vegetation", "Groundcover"].includes(name) && boundary) {
        boundaries.set(name, boundary);
      }
    }
    ts.forEachChild(node, child => visit(child, boundary));
  }
  visit(source);
  expect(boundaries.size).toBe(3);
  expect(new Set(boundaries.values()).size).toBe(3);
  const terrain = boundaries.get("ChunkTerrain")!;
  const fallback = terrain.openingElement.attributes.properties.find(
    attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "fallback");
  expect(fallback?.getText(source)).toContain("<Terrain ");
  expect(asyncFallback?.getText(source)).toContain("<Terrain ");
});

it("binds the validated gradient before the first detailed terrain frame and disposes async ownership",()=>{
  const source=readFileSync(new URL("./character/ChunkTerrain.tsx",import.meta.url),"utf8");
  expect(source).toContain("useLayoutEffect(()=>{groundUniforms.uGrad.value=gradient??gradTex;}");
  expect(source).toContain("gradientState?.owner===adaptive&&gradientState.base===base");
  expect(source).toContain("controller.abort();owned?.dispose()");
  expect(source).toContain("if(controller.signal.aborted){texture.dispose();return;}");
  expect(source).toContain("if(!gradient)return <>{loadingFallback??null}</>");
  expect(source).not.toContain('useLoader(THREE.TextureLoader, `${base}province/chunks/normal-grad.png`)');
});

it('retains macro terrain until an actual detail element exists, then excludes macro from the detail group', () => {
  const source = readFileSync(new URL('./character/ChunkTerrain.tsx', import.meta.url), 'utf8');
  const built = source.indexOf('const detailMeshes = viewEntries.map');
  const gate = source.indexOf('if (!detailMeshes.some(mesh => mesh !== null)) return <>{loadingFallback??null}</>;');
  const detailed = source.indexOf('return <group>{detailMeshes}</group>;');
  expect(built).toBeGreaterThan(0); expect(gate).toBeGreaterThan(built); expect(detailed).toBeGreaterThan(gate);
  // The checked array is the actual render output (including retained old
  // detail), not a count of requested/decoded assets or gradient readiness.
  const selection = source.slice(built, gate);
  expect(selection).toContain('if (!grid) return null');
  expect(selection).toContain('return <AdaptiveChunkMesh');
  expect(selection).toContain('<ChunkMesh');
});
