import {describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {LinearFilter,LinearMipmapLinearFilter,NoColorSpace} from "three";
import {applyTerrainGradientPatch,loadTerrainGradient,validateTerrainGradientPatch,type TerrainGradientPatchMeta} from "./terrainGradient";

const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function fixture(records=[[0,201,202]]){
  const original=new TextEncoder().encode("original gradient PNG"),bytes=new Uint8Array(24+records.length*6),v=new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("ESGRAD01"));[1,2,2,records.length].forEach((n,i)=>v.setUint32(8+i*4,n,true));
  records.forEach(([index,r,g],i)=>{v.setUint32(24+i*6,index,true);v.setUint8(28+i*6,r);v.setUint8(29+i*6,g);});
  const sha=digest(original),sources={nativeManifest:{sha256:sha},bedOverlay:{sha256:sha},topology:{sha256:sha}};
  const meta:TerrainGradientPatchMeta={schemaVersion:1,format:"es-gradient-rg8-v1",file:"normal-gradient-patch.bin",bytes:bytes.length,
    sha256:digest(bytes),size:[2,2],count:records.length,baseGradient:{file:"chunks/normal-grad.png",sha256:sha},
    nativeManifestSha256:sha,bedOverlaySha256:sha,topologySha256:sha};
  const pixels=new Uint8ClampedArray([10,11,12,255,20,21,22,254,30,31,32,253,40,41,42,252]);
  return {original,bytes,meta,sources,pixels};
}
describe("owned matched terrain gradient",()=>{
  it("preserves untouched RGBA and correct UV orientation/filtering with one prepatched texture",async()=>{
    const f=fixture(),decode=vi.fn(async()=>({width:2,height:2,pixels:f.pixels.slice()}));
    const fetcher=vi.fn(async(url:RequestInfo|URL)=>new Response(String(url).endsWith('.bin')?f.bytes:f.original));
    validateTerrainGradientPatch(f.meta,2,f.sources);
    const texture=await loadTerrainGradient('/province/',f.meta,{fetch:fetcher as typeof fetch,decode});
    expect(decode).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledTimes(2);
    // Image row0 is north. After explicit reversal, UV(0,1) still reads
    // patched north-west; neither Z slope nor the field is mirrored.
    expect(Array.from(texture.image.data!)).toEqual([30,31,32,253,40,41,42,252,201,202,12,255,20,21,22,254]);
    expect(texture.flipY).toBe(false);expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(true);expect(texture.unpackAlignment).toBe(4);
    expect(texture.version).toBe(1);texture.dispose();
    const legacy=await loadTerrainGradient('/province/',null,{fetch:fetcher as typeof fetch,decode});
    expect(Array.from(legacy.image.data!)).toEqual([30,31,32,253,40,41,42,252,10,11,12,255,20,21,22,254]);legacy.dispose();
  });
  it("rejects hashes/dependency mismatches and invalid records before mutating or uploading",async()=>{
    const f=fixture([[0,201,202],[0,50,51]]),before=f.pixels.slice();
    expect(()=>applyTerrainGradientPatch(f.pixels,2,2,f.bytes.buffer,f.meta)).toThrow(/sorted/);expect(f.pixels).toEqual(before);
    expect(()=>validateTerrainGradientPatch({...f.meta,bedOverlaySha256:'0'.repeat(64)},2,f.sources)).toThrow(/descriptor/);
    expect(()=>validateTerrainGradientPatch({...f.meta,file:'../escape.bin'},2,f.sources)).toThrow(/descriptor/);
    expect(()=>validateTerrainGradientPatch({...f.meta,count:1000001},2,f.sources)).toThrow(/descriptor/);
    const decode=vi.fn();
    await expect(loadTerrainGradient('/province/',f.meta,{fetch:(async()=>new Response('wrong original')) as typeof fetch,decode})).rejects.toThrow(/hash/);
    expect(decode).not.toHaveBeenCalled();
    const valid=fixture();
    await expect(loadTerrainGradient('/province/',valid.meta,{fetch:(async url=>new Response(String(url).endsWith('.bin')?new Uint8Array(valid.bytes.length):valid.original)) as typeof fetch,decode})).rejects.toThrow(/hash/);
    expect(decode).not.toHaveBeenCalled();
  });
});
