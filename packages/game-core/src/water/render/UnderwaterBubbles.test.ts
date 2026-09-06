import { describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { Color,Frustum,Matrix4,PerspectiveCamera,Texture,Vector3,type WebGLRenderer } from "three";
import type { Vec3,WaterInteractionEvent,WorldWaterQuery } from "@elder-souls/contracts";
import { UnderwaterBubbles,UNDERWATER_BUBBLE_FRAGMENT } from "./UnderwaterBubbles";
import { UnderwaterBubblePass,UNDERWATER_BUBBLE_COMPOSITE_GLSL } from "./UnderwaterBubblePass";
import { SAMPLER_GLSL } from "./waterMaterial";

const camera={x:0,y:-.7,z:1};
const event:WaterInteractionEvent={kind:"enter",position:{x:0,y:0,z:0},velocity:{x:0,y:-4,z:0},radius:.3};
const query=(owner:(p:Vec3)=>string|null=()=>"pool",flow={x:0,y:0,z:0},depth=2):WorldWaterQuery=>({
  sample:p=>({waterBodyId:owner(p),surfaceHeight:0,depth,surfaceNormal:{x:0,y:1,z:0},flowVelocity:flow,
    immersion:p.y<0?1:0,turbidity:.2,salinity:0,temperature:20,hazardIds:[]}),emitInteraction(){},
});

describe("underwater entrained air",()=>{
  it("preserves newborns on slow rendered frames and hides off-camera instances without erasing their history",()=>{
    const effects=[new UnderwaterBubbles(),new UnderwaterBubbles(),new UnderwaterBubbles()];
    try{
      effects.forEach((bubbles,i)=>{bubbles.emit(event);bubbles.update([1/60,.4,.8][i],query(),0,camera);});
      const positions=effects.map(b=>Array.from(b.object3d.geometry.getAttribute("bubblePosition").array));
      expect(positions[1]).toEqual(positions[0]);expect(positions[2]).toEqual(positions[0]);
      for(const bubbles of effects)expect(bubbles.diagnostics.visible).toBeGreaterThan(0);
      const cam=new PerspectiveCamera(30,1,.1,20);cam.position.set(0,-.7,1);cam.lookAt(0,-.7,10);cam.updateMatrixWorld();
      effects[0].setView(new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse)));
      effects[0].update(0,query(),0,camera);
      expect(effects[0].diagnostics.visible).toBe(0);expect(effects[0].diagnostics.active).toBeGreaterThan(0);
      effects[0].setSuspended(true);expect(effects[0].diagnostics.active).toBe(0);
    }finally{effects.forEach(b=>b.dispose());}
  });
  it("is event-driven, bounded by tier, and displays births before advancing their age",()=>{
    const high=new UnderwaterBubbles(),low=new UnderwaterBubbles(true);
    try{
      for(const bubbles of[high,low]){
        for(let i=0;i<60;i++)bubbles.update(1/60,query(),0,camera);
        expect(bubbles.diagnostics.active).toBe(0); // No breathing/ambient source.
        bubbles.emit({...event,kind:"wake"});bubbles.emit({...event,kind:"exit"});
        bubbles.update(.05,query(),0,camera);expect(bubbles.diagnostics.active).toBe(0);
        for(let i=0;i<64;i++)bubbles.emit(event);
        expect(bubbles.diagnostics.pending).toBe(32);
        bubbles.update(.05,query(),0,camera);
        expect(bubbles.diagnostics.active).toBe(bubbles.capacity);
        expect(bubbles.object3d.geometry.getAttribute("bubbleAppearance").getY(0)).toBeCloseTo(.85);
        expect(bubbles.diagnostics.visible).toBe(bubbles.capacity);
        bubbles.update(.6,query(),0,camera);expect(bubbles.diagnostics.active).toBe(0);
      }
      expect(high.capacity).toBe(192);expect(low.capacity).toBe(64);
    }finally{high.dispose();low.dispose();}
  });
  it("advects with the current, rises, and terminates at surface, bed, dry land or a foreign owner",()=>{
    const bubbles=new UnderwaterBubbles();
    try{
      bubbles.emit(event);bubbles.update(0,query(),0,camera);
      const attribute=bubbles.object3d.geometry.getAttribute("bubblePosition");
      const x=attribute.getX(0),y=attribute.getY(0);
      for(let i=0;i<15;i++)bubbles.update(.05,query(()=>"pool",{x:1,y:0,z:0}),0,camera);
      expect(attribute.getX(0)).toBeGreaterThan(x+.3);
      // Entrained air initially follows the impact down, then buoyancy wins.
      expect(attribute.getY(0)).toBeGreaterThan(y-.05);
      bubbles.update(.01,query(()=>"other"),0,camera);expect(bubbles.diagnostics.active).toBe(0);
      for(const invalid of[query(()=>null),query(()=>"pool",{x:0,y:0,z:0},.001)]){
        bubbles.emit(event);bubbles.update(0,query(),0,camera);
        bubbles.update(.01,invalid,0,camera);expect(bubbles.diagnostics.active).toBe(0);
      }
      bubbles.emit(event);bubbles.update(0,query(),0,camera);
      for(let i=0;i<100;i++)bubbles.update(.05,query(),0,camera);
      expect(bubbles.diagnostics.active).toBe(0);
      bubbles.emit({...event,sheetContact:{waterBodyId:"fall",normal:{x:1,y:0,z:0}}});
      bubbles.update(0,query(),0,camera);expect(bubbles.diagnostics.active).toBe(0);
    }finally{bubbles.dispose();}
  });
  it("uses a separate bounded HDR target and particle-distance fog before tone mapping",()=>{
    const bubbles=new UnderwaterBubbles(),pass=new UnderwaterBubblePass(),cam=new PerspectiveCamera();
    const opaque=new Texture();let current:unknown=null;
    const draw=vi.fn(()=>expect(current).not.toBe(opaque));
    const renderer={getRenderTarget:()=>current,setRenderTarget:(value:unknown)=>{current=value;},
      toneMapping:7,autoClear:true,getClearColor:(out:Color)=>out.setRGB(.2,.3,.4),getClearAlpha:()=>1,
      setClearColor:vi.fn(),clear:vi.fn(),render:draw} as unknown as WebGLRenderer;
    try{
      expect(pass.render(renderer,cam,bubbles,true,opaque,1920,1080,new Vector3(1,1,1),new Vector3())).toBeNull();
      expect(pass.diagnostics.bytes).toBe(0);expect(draw).not.toHaveBeenCalled();
      bubbles.emit(event);bubbles.update(0,query(),0,camera);
      const texture=pass.render(renderer,cam,bubbles,true,opaque,3840,2160,new Vector3(1,1,1),new Vector3());
      expect(texture).not.toBe(opaque);expect(draw).toHaveBeenCalledOnce();
      expect(pass.diagnostics.bytes).toBeLessThanOrEqual(1024*1024*8);
      expect(current).toBeNull();expect(renderer.toneMapping).toBe(7);expect(renderer.autoClear).toBe(true);
      expect(bubbles.object3d.material.premultipliedAlpha).toBe(true);
      expect(bubbles.object3d.material.depthWrite).toBe(false);
      expect(bubbles.object3d.material.toneMapped).toBe(false);
      expect(UNDERWATER_BUBBLE_FRAGMENT).toContain("exp(-uAbsorb*min(vDistance,400.0))");
      expect(UNDERWATER_BUBBLE_COMPOSITE_GLSL).toContain("outgoingLight*(1.0-esBubbles.a)+esBubbles.rgb");
      const source=readFileSync(new URL("./WaterPipeline.tsx",import.meta.url),"utf8");
      expect(source.indexOf("${UNDERWATER_BUBBLE_COMPOSITE_GLSL}")).toBeLessThan(source.indexOf("#include <opaque_fragment>\ngl_FragDepth"));
      // Conservative declaration count, including currently optimized-out
      // water helpers plus MeshBasic map; no new main-water sampler.
      const samplers=new Set([...`${SAMPLER_GLSL}\n${source}`.matchAll(/uniform sampler2D\s+(\w+)/g)].map(m=>m[1]));
      expect(samplers.size+1).toBeLessThanOrEqual(16);
      pass.render(renderer,cam,bubbles,false,opaque,1920,1080,new Vector3(),new Vector3());
      expect(pass.diagnostics.bytes).toBe(0);expect(draw).toHaveBeenCalledOnce();
    }finally{pass.dispose();bubbles.dispose();opaque.dispose();}
  });
  it("checks the transport path through a dry bank even when both pools share an owner",()=>{
    const bubbles=new UnderwaterBubbles();
    try{
      const separated=query(p=>p.x>=.30&&p.x<=.42?null:"pool",{x:12,y:0,z:0});
      bubbles.emit({...event,radius:.03});bubbles.update(0,separated,0,camera);
      expect(bubbles.diagnostics.active).toBeGreaterThan(0);
      for(let i=0;i<6;i++)bubbles.update(.05,separated,0,camera);
      expect(bubbles.diagnostics.active).toBe(0);
      expect(bubbles.diagnostics.terminated).toBeGreaterThan(0);
      const snapshot=bubbles.diagnostics;
      bubbles.emit({...event,kind:"exit"});
      expect(snapshot.rejectedReasons.nonEntrainingEvent).toBeUndefined();
      expect(bubbles.diagnostics.rejectedReasons.nonEntrainingEvent).toBe(1);
    }finally{bubbles.dispose();}
  });
});
