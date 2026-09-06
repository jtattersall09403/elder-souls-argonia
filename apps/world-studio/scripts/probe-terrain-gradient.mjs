// Bounded numerical browser parity. Requires an existing studio Vite dev
// server; no scene/province load, screenshot, source asset write or GUI.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../combat-sandbox/package.json',import.meta.url));
const {chromium}=require('playwright');
const origin=process.env.STUDIO_DEV_URL??'http://127.0.0.1:5194';
const root=new URL('../../../',import.meta.url).pathname.replace(/\/$/,'');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/gradient-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto(origin+'/gradient-check');
  const report=await page.evaluate(async({root})=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {loadTerrainGradient}=await import('/@fs'+root+'/packages/game-core/src/terrain/terrainGradient.ts');
    const canvas=new OffscreenCanvas(8,8),context=canvas.getContext('2d');
    const pixels=new Uint8ClampedArray(8*8*4);
    for(let z=0;z<8;z++)for(let x=0;x<8;x++)pixels.set([17+x*27,11+z*29,19+x*5+z*7,255],(z*8+x)*4);
    context.putImageData(new ImageData(pixels,8,8),0,0);
    const blob=await canvas.convertToBlob({type:'image/png'}),originalBytes=new Uint8Array(await blob.arrayBuffer());
    const url=URL.createObjectURL(blob),original=await new T.TextureLoader().loadAsync(url);
    original.colorSpace=T.NoColorSpace;original.wrapS=original.wrapT=T.ClampToEdgeWrapping;
    const renderer=new T.WebGLRenderer(),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    renderer.setSize(8,8);renderer.toneMapping=T.NoToneMapping;
    const target=new T.WebGLRenderTarget(8,8,{type:T.UnsignedByteType});target.texture.colorSpace=T.NoColorSpace;
    const material=new T.ShaderMaterial({uniforms:{uGrad:{value:original}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:'uniform sampler2D uGrad;varying vec2 vUv;void main(){gl_FragColor=texture2D(uGrad,vUv);}',toneMapped:false});
    const geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));
    const render=(texture,size)=>{
      target.setSize(size,size);material.uniforms.uGrad.value=texture;renderer.setRenderTarget(target);renderer.render(scene,camera);
      const values=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(target,0,0,size,size,values);return values;
    };
    const originalFull=render(original,8),originalMip=render(original,2);
    const originalResident=renderer.info.memory.textures;original.dispose();
    const fetchOriginal=async()=>new Response(originalBytes);
    const owned=await loadTerrainGradient('/gradient-fixture/',null,{fetch:fetchOriginal});
    const ownedFull=render(owned,8),ownedMip=render(owned,2);
    const mismatch=(a,b)=>a.reduce((count,value,i)=>count+(value!==b[i]?1:0),0);
    const legacyMismatch=mismatch(originalFull,ownedFull),mipMismatch=mismatch(originalMip,ownedMip);
    const ownedResident=renderer.info.memory.textures;owned.dispose();
    const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const patch=new Uint8Array(36),v=new DataView(patch.buffer);patch.set(new TextEncoder().encode('ESGRAD01'));
    [1,8,8,2].forEach((n,i)=>v.setUint32(8+i*4,n,true));
    v.setUint32(24,0,true);patch.set([201,202],28);v.setUint32(30,63,true);patch.set([71,72],34);
    const sourceHash=await hash(originalBytes),descriptor={schemaVersion:1,format:'es-gradient-rg8-v1',file:'patch.bin',bytes:36,sha256:await hash(patch),size:[8,8],count:2,
      baseGradient:{file:'chunks/normal-grad.png',sha256:sourceHash},nativeManifestSha256:sourceHash,bedOverlaySha256:sourceHash,topologySha256:sourceHash};
    const matched=await loadTerrainGradient('/gradient-fixture/',descriptor,{fetch:async url=>new Response(url.endsWith('.bin')?patch:originalBytes)});
    const expected=originalFull.slice();expected.set([201,202],7*8*4);expected.set([71,72],7*4);
    const matchedMismatch=mismatch(expected,render(matched,8));matched.dispose();
    const originalBitmap=globalThis.createImageBitmap;let closed=0,abortName='';const controller=new AbortController();
    globalThis.createImageBitmap=async(...args)=>{
      const bitmap=await originalBitmap(...args),close=bitmap.close.bind(bitmap);
      bitmap.close=()=>{closed++;close();};controller.abort();return bitmap;
    };
    try{await loadTerrainGradient('/gradient-fixture/',null,{fetch:fetchOriginal,signal:controller.signal});}
    catch(error){abortName=error.name;}finally{globalThis.createImageBitmap=originalBitmap;}
    const residentAfterDispose=renderer.info.memory.textures,gl=renderer.getContext(),error=gl.getError();
    const linked=renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS));
    target.dispose();material.dispose();geometry.dispose();const finalTextures=renderer.info.memory.textures;renderer.dispose();URL.revokeObjectURL(url);
    return {legacyMismatch,mipMismatch,matchedMismatch,originalResident,ownedResident,residentAfterDispose,finalTextures,
      abortName,closed,linked,error,asymmetricCorners:[...originalFull.slice(0,4),...originalFull.slice(-4)]};
  },{root});
  if(errors.length||report.legacyMismatch||report.mipMismatch||report.matchedMismatch||report.abortName!=='AbortError'||report.closed!==1
    ||report.originalResident!==report.ownedResident||report.residentAfterDispose!==1||report.finalTextures!==0||!report.linked||report.error)
    throw new Error(JSON.stringify({report,errors}));
  console.log(JSON.stringify(report));
}finally{await browser.close();}
