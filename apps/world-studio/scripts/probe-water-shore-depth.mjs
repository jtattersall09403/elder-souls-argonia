// Tiny numerical GPU regression for the production fragment-depth block.
// Requires an existing Vite server; no province load or image ingestion.
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../combat-sandbox/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=new URL('../../../',import.meta.url).pathname.replace(/\/$/,'');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();page.setDefaultTimeout(15000);
  await page.route('**/shore-depth-check',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
  await page.goto((process.env.STUDIO_DEV_URL??'http://127.0.0.1:5194')+'/shore-depth-check');
  const report=await page.evaluate(async root=>{
    const T=await import('/node_modules/.vite/deps/three.js');
    const {WATER_NATIVE_FRAGMENT_DEPTH_GLSL:clip}=await import('/@fs'+root+'/packages/game-core/src/water/render/waterMaterial.ts');
    const renderer=new T.WebGLRenderer();renderer.setSize(8,8);renderer.setClearColor(0,0);
    const target=new T.WebGLRenderTarget(8,8),scene=new T.Scene(),camera=new T.Camera();
    const uniforms={uNativeGroundActive:{value:1},uNativeGroundInfo:{value:new T.Vector4(1,8,0,0)},
      uVerticalScale:{value:1},kind:{value:0},missing:{value:0},worldOffset:{value:0}};
    const material=new T.ShaderMaterial({uniforms,vertexShader:`
      uniform float uVerticalScale,kind,worldOffset;
      varying vec4 vEsData;varying vec3 vEsWorldPos;varying float vRibbon;
      void main(){vRibbon=kind;vEsData=vec4(0.,max(position.x,0.),0.,0.);
        vEsWorldPos=vec3(position.x+1.+worldOffset,2.*uVerticalScale,1.);
        gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader:`uniform float uNativeGroundActive,uVerticalScale,missing,worldOffset;
        uniform vec4 uNativeGroundInfo;varying vec4 vEsData;varying vec3 vEsWorldPos;varying float vRibbon;
        float esNativeGroundAt(vec2 p){return missing>.5?1e9:3.-(p.x-worldOffset);}
        void main(){${clip}gl_FragColor=vec4(1.);}`,toneMapped:false});
    const geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));
    const counts=[];
    for(const kind of [-1,0,1,2])for(const scale of [1,8])for(const mode of ['native','missing','legacy','horizon']){
      uniforms.kind.value=kind;uniforms.uVerticalScale.value=scale;
      uniforms.uNativeGroundActive.value=mode==='legacy'?0:1;
      uniforms.missing.value=mode==='missing'||mode==='horizon'?1:0;
      uniforms.worldOffset.value=mode==='horizon'?100:0;
      renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);
      const pixels=new Uint8Array(256);renderer.readRenderTargetPixels(target,0,0,8,8,pixels);
      let wet=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])wet++;
      const expected=mode==='native'?32:(mode!=='legacy'&&kind===1?0:64);
      counts.push({kind,scale,mode,wet,expected});
    }
    const gl=renderer.getContext(),error=gl.getError(),linked=renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS));
    geometry.dispose();material.dispose();target.dispose();renderer.dispose();
    return {cases:counts.length,failures:counts.filter(c=>c.wet!==c.expected),linked,error};
  },root);
  console.log(JSON.stringify(report));
  if(report.failures.length||!report.linked||report.error)process.exitCode=1;
} finally {await browser.close();}
