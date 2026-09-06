import { Color, HalfFloatType, LinearFilter, NoColorSpace, NoToneMapping, Vector3, WebGLRenderTarget,
  type PerspectiveCamera, type Texture, type WebGLRenderer } from "three";
import { UNDERWATER_BUBBLE_LAYER, type UnderwaterBubbles } from "./UnderwaterBubbles";

export const UNDERWATER_BUBBLE_COMPOSITE_GLSL = /* glsl */ `
if(uBubbleActive>0.5){
  vec4 esBubbles=texture2D(uBubbleColor,vMapUv);
  outgoingLight=outgoingLight*(1.0-esBubbles.a)+esBubbles.rgb;
}
`;
export interface UnderwaterBubblePassDiagnostics {active:boolean;drawActive:boolean;width:number;height:number;bytes:number;}

/** One optional half-resolution, scene-linear premultiplied particle target.
 * It samples ONLY the completed opaque depth texture, never itself. There
 * is no allocation or extra draw while no submerged particles are visible. */
export class UnderwaterBubblePass {
  private target:WebGLRenderTarget|null=null;
  private readonly clearColor=new Color();
  constructor(private readonly low=false){}
  get diagnostics():UnderwaterBubblePassDiagnostics{return {active:!!this.target,drawActive:!!this.target,
    width:this.target?.width??0,height:this.target?.height??0,bytes:this.target?this.target.width*this.target.height*8:0};}
  render(renderer:WebGLRenderer,camera:PerspectiveCamera,bubbles:UnderwaterBubbles|undefined,
    underwater:boolean,opaqueDepth:Texture,width:number,height:number,absorb:Vector3,fog:Vector3):Texture|null{
    if(!underwater||!bubbles?.object3d.geometry.instanceCount){this.dispose();return null;}
    const limit=this.low?512:1024,ratio=Math.min(.5,limit/width,limit/height);
    const w=Math.max(2,Math.round(width*ratio)),h=Math.max(2,Math.round(height*ratio));
    this.target??=new WebGLRenderTarget(w,h,{type:HalfFloatType,minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false});
    if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
    this.target.texture.colorSpace=NoColorSpace;
    bubbles.setFogView(opaqueDepth,w,h,camera.near,camera.far,absorb,fog);
    const target=renderer.getRenderTarget(),tone=renderer.toneMapping,layers=camera.layers.mask,auto=renderer.autoClear;
    renderer.getClearColor(this.clearColor);const alpha=renderer.getClearAlpha();
    try{
      renderer.setRenderTarget(this.target);renderer.toneMapping=NoToneMapping;renderer.autoClear=false;
      renderer.setClearColor(0,0);renderer.clear(true,false,false);camera.layers.set(UNDERWATER_BUBBLE_LAYER);
      renderer.render(bubbles.scene,camera);
    }finally{
      renderer.setClearColor(this.clearColor,alpha);renderer.autoClear=auto;camera.layers.mask=layers;
      renderer.toneMapping=tone;renderer.setRenderTarget(target);
    }
    return this.target.texture;
  }
  dispose():void{this.target?.dispose();this.target=null;}
}
