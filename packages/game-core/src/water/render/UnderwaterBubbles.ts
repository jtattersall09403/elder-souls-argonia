import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import { InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry,
  DynamicDrawUsage, Scene, Sphere, Vector2, Vector3, type DepthTexture, type Frustum, type Texture } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import { waterParticleRadiance } from "./waterParticleLighting";
import { createDepthPlaceholder, eyeDepthNode } from "./WaterfallKitMaterial";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  attribute, cameraProjectionMatrix, clamp, dot, exp, float, fwidth, length, max, min, modelViewMatrix, pow,
  positionGeometry, screenCoordinate, smoothstep, texture, uniform, varying, vec2, vec3, vec4,
} = tsl as unknown as Record<string, TslNode>;

/** Isolated HDR target only; never include this layer in the main scene RT. */
export const UNDERWATER_BUBBLE_LAYER = 6;

/** The bubble sprites' frame state (`uniform()` nodes; write `.value`). */
export interface UnderwaterBubbleUniforms {
  uOpaqueDepth: { value: Texture };
  uTargetSize: { value: Vector2 };
  uNear: { value: number };
  uFar: { value: number };
  uAbsorb: { value: Vector3 };
  uFog: { value: Vector3 };
  uRadiance: { value: Vector3 };
  uCameraTrue: { value: Vector3 };
  depthPlaceholder: DepthTexture;
}

/** Fraction of the scene radiance the water between the eye and a bubble at `distanceM` lets through, per channel. */
export function bubbleTransmittance(absorb: number, distanceM: number): number {
  return Math.exp(-absorb * Math.min(distanceM, 400));
}

/**
 * Premultiplied scene-linear bubble sprites (the target composites over the
 * fogged scene before tone mapping; never fog these particles at the bed's
 * distance). The graph outputs straight colour and `premultipliedAlpha`
 * multiplies it by alpha: the old `(radiance·trans + fog·(1 − trans))·alpha`.
 */
function createBubbleMaterial(u: UnderwaterBubbleUniforms): MeshBasicNodeMaterial {
  const n = u as unknown as Record<string, TslNode>;
  const material = new MeshBasicNodeMaterial();
  material.name = "es-underwater-bubbles";
  material.transparent = true;
  material.premultipliedAlpha = true;
  material.depthWrite = false;
  material.depthTest = false;
  material.toneMapped = false;
  material.fog = false;
  const bubblePosition = attribute("bubblePosition", "vec3");
  const appearance = attribute("bubbleAppearance", "vec2");
  const mv0 = modelViewMatrix.mul(vec4(bubblePosition, 1.0));
  const mv = vec4(mv0.xy.add(positionGeometry.xy.mul(appearance.x)), mv0.zw);
  material.vertexNode = cameraProjectionMatrix.mul(mv);
  const vDisk = varying(positionGeometry.xy, "vEsBubbleDisk");
  const vOpacity = varying(appearance.y, "vEsBubbleOpacity");
  const vDistance = varying(length(bubblePosition.sub(n.uCameraTrue)), "vEsBubbleDistance");
  const vViewDepth = varying(mv.z.negate(), "vEsBubbleViewDepth");

  const r2 = dot(vDisk, vDisk);
  const aa = max(fwidth(r2), 0.002);
  const disk = float(1).sub(smoothstep(float(1).sub(aa), aa.add(1), r2));
  const d = n.uOpaqueDepth.sample(screenCoordinate.xy.div(n.uTargetSize)).x;
  const behind = eyeDepthNode(d, n.uNear, n.uFar).sub(vViewDepth);
  const soft = smoothstep(0.0, 0.08, behind);
  const fresnel = pow(clamp(r2, 0.0, 1.0), 3.0).mul(0.82).add(0.03);
  const hd = vDisk.sub(vec2(-0.30, 0.35));
  const highlight = exp(dot(hd, hd).mul(-45.0));
  const alpha = disk.mul(soft).mul(vOpacity).mul(clamp(fresnel.add(highlight.mul(0.30)), 0.0, 0.95));
  const trans = exp(n.uAbsorb.negate().mul(min(vDistance, 400.0)));
  const radiance = n.uRadiance.mul(highlight.mul(0.60).add(0.40));
  material.colorNode = vec4(radiance.mul(trans).add(n.uFog.mul(vec3(1).sub(trans))), alpha);
  material.maskNode = disk.greaterThanEqual(0.001);
  return material;
}

interface Bubble { p: Vec3; v: Vec3; body: string; radius: number; age: number; life: number }
export interface UnderwaterBubbleDiagnostics {
  capacity:number;active:number;pending:number;visible:number;received:number;spawned:number;rejected:number;terminated:number;
  rejectedReasons:Readonly<Record<string,number>>;
}
const finite = (v: Vec3) => [v.x, v.y, v.z].every(Number.isFinite);
const distance2 = (a: Vec3, b: Vec3) => (a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;

/** Impact-entrained air, not breathing or periodic ambience. No texture art,
 * persistent sources, render-target ownership, or gameplay side effects. */
export class UnderwaterBubbles {
  readonly scene = new Scene();
  readonly object3d: Mesh<InstancedBufferGeometry, MeshBasicNodeMaterial>;
  readonly uniforms: UnderwaterBubbleUniforms;
  private readonly particles: Bubble[] = [];
  private readonly queue: WaterInteractionEvent[] = [];
  private readonly positions: InstancedBufferAttribute;
  private readonly appearance: InstancedBufferAttribute;
  private seed = 0x67be;
  private received = 0;
  private spawned = 0;
  private rejected = 0;
  private terminated = 0;
  private readonly rejectedReasons:Record<string,number>={};
  private suspended = false;
  private viewBody: string | null = null;
  private frustum?:Frustum;
  private verticalScale=1;
  private readonly bounds=new Sphere();
  readonly capacity: number;

  constructor(low = false) {
    this.capacity = low ? 64 : 192;
    const plane = new PlaneGeometry(2,2), geometry = new InstancedBufferGeometry();
    geometry.setIndex(plane.index!.clone());
    geometry.setAttribute("position",plane.getAttribute("position").clone()); plane.dispose();
    this.positions = new InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(DynamicDrawUsage);
    this.appearance = new InstancedBufferAttribute(new Float32Array(this.capacity*2),2).setUsage(DynamicDrawUsage);
    geometry.setAttribute("bubblePosition",this.positions); geometry.setAttribute("bubbleAppearance",this.appearance);
    geometry.instanceCount=0;
    const depthPlaceholder=createDepthPlaceholder();
    this.uniforms={uOpaqueDepth:texture(depthPlaceholder),uTargetSize:uniform(new Vector2(1,1)),uNear:uniform(.1),uFar:uniform(1000),
      uAbsorb:uniform(new Vector3()),uFog:uniform(new Vector3()),uRadiance:uniform(new Vector3()),uCameraTrue:uniform(new Vector3()),
      depthPlaceholder};
    const material=createBubbleMaterial(this.uniforms);
    this.object3d=new Mesh(geometry,material); this.object3d.layers.set(UNDERWATER_BUBBLE_LAYER);
    this.object3d.frustumCulled=false; this.object3d.visible=false;
    this.scene.add(this.object3d);
  }
  get diagnostics():UnderwaterBubbleDiagnostics{return {capacity:this.capacity,active:this.particles.length,pending:this.queue.length,
    visible:this.object3d.geometry.instanceCount,received:this.received,spawned:this.spawned,rejected:this.rejected,terminated:this.terminated,
    rejectedReasons:{...this.rejectedReasons}};}
  private reject(reason:string):void{this.rejected++;this.rejectedReasons[reason]=(this.rejectedReasons[reason]??0)+1;}
  private random(){let x=this.seed;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x>>>0;return this.seed/4294967296;}

  emit(event:WaterInteractionEvent):void {
    this.received++;
    if(this.suspended){this.reject("suspended");return;}
    if(event.sheetContact){this.reject("fallingSheetIsNotVolume");return;}
    if(!finite(event.position)){this.reject("invalidPosition");return;}
    if(!['enter','splash','submerge'].includes(event.kind)){this.reject("nonEntrainingEvent");return;}
    if(this.queue.length>=32){this.reject("queueCapacity");return;}
    this.queue.push({...event,position:{...event.position},velocity:event.velocity?{...event.velocity}:undefined});
  }
  setSuspended(value:boolean):void{this.suspended=value;if(value){this.particles.length=0;this.queue.length=0;this.publish();}}
  setView(frustum:Frustum|undefined,verticalScale=1):void{this.frustum=frustum;this.verticalScale=verticalScale;}
  setIllumination(ambient:Vec3,direct:Vec3,sunY:number):void{
    waterParticleRadiance(ambient,direct,sunY,this.uniforms.uRadiance.value);
  }
  /** Called only when writing a DIFFERENT particle target from opaqueDepth. */
  setFogView(opaqueDepth:Texture,width:number,height:number,near:number,far:number,absorb:Vec3,fog:Vec3):void{
    const u=this.uniforms;
    u.uOpaqueDepth.value=opaqueDepth;u.uTargetSize.value.set(width,height);u.uNear.value=near;u.uFar.value=far;
    u.uAbsorb.value.copy(absorb);u.uFog.value.copy(fog);
  }
  update(delta:number,query:WorldWaterQuery,epoch:number,camera:Vec3):void{
    if(this.suspended)return;
    if(!Number.isFinite(delta)||delta<0){this.particles.length=0;this.queue.length=0;this.publish();return;}
    // Slow rendering is not suspension. Old air may expire after a stall,
    // but queued impacts still deserve their first visible age-zero frame.
    if(delta>.5)this.particles.length=0;
    const dt=Math.min(delta,.05);
    // Advance existing air before births: an impact must get a full first
    // rendered frame even when this frame's delta exceeds its initial age.
    for(let i=this.particles.length-1;i>=0;i--){
      const b=this.particles[i];b.age+=dt;let valid=b.age<b.life&&distance2(b.p,camera)<24*24;
      const water=query.sample(b.p,epoch);
      if(!water.waterBodyId||water.waterBodyId!==b.body)valid=false;
      if(valid){
        const relaxation=1-Math.exp(-dt*7),rise=.12+b.radius*7;
        b.v.x+=(water.flowVelocity.x-b.v.x)*relaxation;b.v.z+=(water.flowVelocity.z-b.v.z)*relaxation;
        b.v.y+=(water.flowVelocity.y+rise-b.v.y)*relaxation;
        const span=Math.hypot(b.v.x,b.v.y,b.v.z)*dt;
        const steps=Math.max(1,Math.ceil(span/.10));
        // Unsupported extreme transport is terminated, never teleported
        // through unsampled dry banks. Work remains <=16 samples/particle.
        if(steps>16)valid=false;
        else for(let step=0;step<steps&&valid;step++){
          b.p.x+=b.v.x*dt/steps;b.p.y+=b.v.y*dt/steps;b.p.z+=b.v.z*dt/steps;
          const at=query.sample(b.p,epoch);
          valid=at.waterBodyId===b.body&&at.depth>.02&&b.p.y<at.surfaceHeight-.008
            &&b.p.y>at.surfaceHeight-at.depth+.008;
        }
      }
      if(!valid){this.particles.splice(i,1);this.terminated++;}
    }
    for(const event of this.queue){
      const water=query.sample(event.position,epoch),velocity=event.velocity;
      const eventRadius=Number.isFinite(event.radius)?event.radius!:.3;
      if(!water.waterBodyId||water.depth<.08){this.reject("dryOrShallow");continue;}
      if(distance2(event.position,camera)>20*20){this.reject("distance");continue;}
      if(Math.abs(event.position.y-water.surfaceHeight)>Math.max(.5,eventRadius)){this.reject("notSurfaceImpact");continue;}
      if(velocity&&!finite(velocity)){this.reject("invalidVelocity");continue;}
      const speed=velocity?Math.hypot(velocity.x-water.flowVelocity.x,velocity.y-water.flowVelocity.y,velocity.z-water.flowVelocity.z):0;
      if(speed<.4){this.reject("insufficientRelativeSpeed");continue;}
      const radius=Math.max(.03,Math.min(1,eventRadius)),count=Math.min(32,Math.ceil(speed*4*Math.sqrt(radius/.3)));
      if(this.particles.length>=this.capacity){this.reject("particleCapacity");continue;}
      for(let k=0;k<count&&this.particles.length<this.capacity;k++){
        const angle=this.random()*Math.PI*2,r=Math.sqrt(this.random())*radius*.7;
        const p={x:event.position.x+Math.cos(angle)*r,y:water.surfaceHeight-Math.min(water.depth*.5,.06+this.random()*.12*speed),z:event.position.z+Math.sin(angle)*r};
        const at=query.sample(p,epoch);
        if(at.waterBodyId!==water.waterBodyId||p.y<=at.surfaceHeight-at.depth+.01||p.y>=at.surfaceHeight-.01)continue;
        this.particles.push({p,v:{x:(velocity?.x??0)*.15,y:Math.min(0,velocity?.y??0)*.12,z:(velocity?.z??0)*.15},
          body:water.waterBodyId,radius:.006+this.random()*.017,age:0,life:1.5+this.random()*3});this.spawned++;
      }
    }
    this.queue.length=0;
    const cameraWater=query.sample(camera,epoch);
    this.viewBody=camera.y<cameraWater.surfaceHeight-.06&&camera.y>cameraWater.surfaceHeight-cameraWater.depth
      ?cameraWater.waterBodyId:null;
    this.uniforms.uCameraTrue.value.copy(camera);
    this.publish();
  }
  private publish():void{
    let count=0;
    for(const b of this.particles){
      if(b.body!==this.viewBody)continue;
      this.bounds.center.set(b.p.x,b.p.y*this.verticalScale,b.p.z);this.bounds.radius=b.radius;
      if(this.frustum&&!this.frustum.intersectsSphere(this.bounds))continue;
      this.positions.setXYZ(count,b.p.x,b.p.y,b.p.z);
      this.appearance.setXY(count++,b.radius,Math.min(1,(b.life-b.age)/.3)*.85);
    }
    this.positions.needsUpdate=true;this.appearance.needsUpdate=true;
    this.object3d.geometry.instanceCount=count;this.object3d.visible=count>0;
  }
  dispose():void{this.particles.length=0;this.queue.length=0;this.scene.clear();this.object3d.geometry.dispose();this.object3d.material.dispose();this.uniforms.depthPlaceholder.dispose();}
}
