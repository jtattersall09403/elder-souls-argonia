import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import { InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial,
  DynamicDrawUsage, Scene, Sphere, Vector2, Vector3, type Frustum, type Texture } from "three";
import { waterParticleRadiance } from "./waterParticleLighting";

/** Isolated HDR target only; never include this layer in the main scene RT. */
export const UNDERWATER_BUBBLE_LAYER = 6;
export const UNDERWATER_BUBBLE_FRAGMENT = /* glsl */ `
uniform sampler2D uOpaqueDepth;
uniform vec2 uTargetSize;
uniform float uNear;
uniform float uFar;
uniform vec3 uAbsorb;
uniform vec3 uFog;
uniform vec3 uRadiance;
varying vec2 vDisk;
varying float vOpacity;
varying float vDistance;
varying float vViewDepth;
float bubbleDepth(float d){ return uNear*uFar/(uFar-d*(uFar-uNear)); }
void main(){
  float r2=dot(vDisk,vDisk);
  float aa=max(fwidth(r2),0.002);
  float disk=1.0-smoothstep(1.0-aa,1.0+aa,r2);
  if(disk<0.001) discard;
  float behind=bubbleDepth(texture2D(uOpaqueDepth,gl_FragCoord.xy/uTargetSize).r)-vViewDepth;
  float soft=smoothstep(0.0,0.08,behind);
  float fresnel=0.03+0.82*pow(clamp(r2,0.0,1.0),3.0);
  float highlight=exp(-dot(vDisk-vec2(-0.30,0.35),vDisk-vec2(-0.30,0.35))*45.0);
  float alpha=disk*soft*vOpacity*clamp(fresnel+highlight*0.30,0.0,0.95);
  vec3 trans=exp(-uAbsorb*min(vDistance,400.0));
  vec3 radiance=uRadiance*(0.40+0.60*highlight);
  // Premultiplied scene-linear radiance. Composite over the fogged scene
  // before tone mapping; never fog these particles at the bed's distance.
  gl_FragColor=vec4((radiance*trans+uFog*(1.0-trans))*alpha,alpha);
}`;

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
  readonly object3d: Mesh<InstancedBufferGeometry, ShaderMaterial>;
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
    const material = new ShaderMaterial({
      uniforms: { uOpaqueDepth:{value:null}, uTargetSize:{value:new Vector2(1,1)}, uNear:{value:.1}, uFar:{value:1000},
        uAbsorb:{value:new Vector3()}, uFog:{value:new Vector3()}, uRadiance:{value:new Vector3()}, uCameraTrue:{value:new Vector3()} },
      vertexShader: /* glsl */ `
attribute vec3 bubblePosition;
attribute vec2 bubbleAppearance;
uniform vec3 uCameraTrue;
varying vec2 vDisk;
varying float vOpacity;
varying float vDistance;
varying float vViewDepth;
void main(){
 vec4 mv=modelViewMatrix*vec4(bubblePosition,1.0);
 mv.xy+=position.xy*bubbleAppearance.x;
 vDisk=position.xy; vOpacity=bubbleAppearance.y;
 vDistance=length(bubblePosition-uCameraTrue); vViewDepth=-mv.z;
 gl_Position=projectionMatrix*mv;
}`, fragmentShader:UNDERWATER_BUBBLE_FRAGMENT,
      transparent:true, premultipliedAlpha:true, depthWrite:false, depthTest:false, toneMapped:false,
    });
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
    waterParticleRadiance(ambient,direct,sunY,this.object3d.material.uniforms.uRadiance.value);
  }
  /** Called only when writing a DIFFERENT particle target from opaqueDepth. */
  setFogView(opaqueDepth:Texture,width:number,height:number,near:number,far:number,absorb:Vec3,fog:Vec3):void{
    const u=this.object3d.material.uniforms;
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
    this.object3d.material.uniforms.uCameraTrue.value.copy(camera);
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
  dispose():void{this.particles.length=0;this.queue.length=0;this.scene.clear();this.object3d.geometry.dispose();this.object3d.material.dispose();}
}
