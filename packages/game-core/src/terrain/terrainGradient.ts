import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, UnsignedByteType } from "three";

export interface TerrainGradientPatchMeta {
  schemaVersion:1;format:"es-gradient-rg8-v1";file:string;bytes:number;sha256:string;size:[number,number];count:number;
  baseGradient:{file:string;sha256:string};
  nativeManifestSha256:string;bedOverlaySha256:string;topologySha256:string;
}
interface Dependencies {nativeManifest:{sha256:string};bedOverlay:{sha256:string};topology:{sha256:string}}
const hash=(s:unknown)=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const file=(s:unknown)=>typeof s==="string"&&/^[a-zA-Z0-9_/-]+(?:\.[a-zA-Z0-9]+)$/.test(s)&&!s.startsWith("/")&&!s.split("/").some(p=>p===".."||p===".");
export function validateTerrainGradientPatch(value:unknown,gridSize:number,sources:Dependencies):TerrainGradientPatchMeta {
  const m=value as TerrainGradientPatchMeta;
  if(!m||m.schemaVersion!==1||m.format!=="es-gradient-rg8-v1"||!file(m.file)||!hash(m.sha256)
    ||!Array.isArray(m.size)||m.size.length!==2||!m.size.every(n=>Number.isInteger(n)&&n===gridSize&&n>=2&&n<=4096)
    ||!Number.isInteger(m.count)||m.count<0||m.count>Math.min(gridSize*gridSize,1000000)||m.bytes!==24+m.count*6
    ||!m.baseGradient||!file(m.baseGradient.file)||!hash(m.baseGradient.sha256)
    ||![m.nativeManifestSha256,m.bedOverlaySha256,m.topologySha256].every(hash)
    ||m.nativeManifestSha256!==sources.nativeManifest.sha256||m.bedOverlaySha256!==sources.bedOverlay.sha256
    ||m.topologySha256!==sources.topology.sha256)throw new Error("Invalid matched terrain gradient descriptor");
  return m;
}

/** Validate every record before mutating owned original pixels. */
export function applyTerrainGradientPatch(pixels:Uint8ClampedArray,width:number,height:number,bytes:ArrayBuffer,meta:TerrainGradientPatchMeta):void {
  if(width!==meta.size[0]||height!==meta.size[1]||pixels.length!==width*height*4||bytes.byteLength!==meta.bytes)
    throw new Error("Terrain gradient dimensions/bytes mismatch");
  const v=new DataView(bytes);
  if(new TextDecoder().decode(new Uint8Array(bytes,0,8))!=="ESGRAD01"||v.getUint32(8,true)!==1
    ||v.getUint32(12,true)!==width||v.getUint32(16,true)!==height||v.getUint32(20,true)!==meta.count)
    throw new Error("Invalid terrain gradient patch header");
  let previous=-1;
  for(let i=0;i<meta.count;i++){
    const index=v.getUint32(24+i*6,true);
    if(index<=previous||index>=width*height)throw new Error("Terrain gradient indices must be sorted unique and in bounds");
    previous=index;
  }
  for(let i=0;i<meta.count;i++){
    const offset=24+i*6,index=v.getUint32(offset,true)*4;
    pixels[index]=v.getUint8(offset+4);pixels[index+1]=v.getUint8(offset+5);
  }
}
export interface TerrainGradientPixels {width:number;height:number;pixels:Uint8ClampedArray}
export interface TerrainGradientLoadOptions {signal?:AbortSignal;fetch?:typeof fetch;
  decode?:(bytes:Uint8Array)=>Promise<TerrainGradientPixels>}
async function digest(bytes:Uint8Array):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes as Uint8Array<ArrayBuffer>))].map(v=>v.toString(16).padStart(2,"0")).join("");}
async function download(url:string,maximum:number,options:TerrainGradientLoadOptions):Promise<Uint8Array>{
  const response=await(options.fetch??fetch)(url,{signal:options.signal});
  if(!response.ok||!response.body)throw new Error(`Terrain gradient HTTP ${response.status}`);
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;
    if(length>maximum)throw new Error("Terrain gradient download exceeds byte budget");chunks.push(value);}
  }finally{await reader.cancel();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function decode(bytes:Uint8Array):Promise<TerrainGradientPixels>{
  const bitmap=await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:"image/png"}),{colorSpaceConversion:"none",premultiplyAlpha:"none"});
  const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
  try{
    if(bitmap.width>4096||bitmap.height>4096)throw new Error("Terrain gradient exceeds decoded pixel budget");
    const context=canvas.getContext("2d");if(!context)throw new Error("Terrain gradient canvas unavailable");
    context.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,pixels:context.getImageData(0,0,bitmap.width,bitmap.height).data};
  }finally{bitmap.close();canvas.width=canvas.height=1;}
}

/** One owned texture, patched before its first upload. Callers dispose it;
 * no global cache retains original and corrected 4k GPU images together. */
export async function loadTerrainGradient(provinceUrl:string,meta:TerrainGradientPatchMeta|null,options:TerrainGradientLoadOptions={}):Promise<DataTexture>{
  const original=await download(`${provinceUrl}${meta?.baseGradient.file??"chunks/normal-grad.png"}`,64*1024*1024,options);
  if(meta&&await digest(original)!==meta.baseGradient.sha256)throw new Error("Original terrain gradient hash mismatch");
  const patch=meta?await download(`${provinceUrl}water/v2/terrain/${meta.file}`,meta.bytes,options):null;
  if(meta&&patch&&(patch.length!==meta.bytes||await digest(patch)!==meta.sha256))throw new Error("Terrain gradient patch hash mismatch");
  const image=await(options.decode??decode)(original);
  if(image.width>4096||image.height>4096||image.pixels.length!==image.width*image.height*4)throw new Error("Invalid decoded terrain gradient");
  if(meta&&patch)applyTerrainGradientPatch(image.pixels,image.width,image.height,patch.buffer as ArrayBuffer,meta);
  options.signal?.throwIfAborted();
  // Typed-array uploads do not rely on browser ImageBitmap flip semantics.
  // Preserve the original TextureLoader's UV convention explicitly.
  const stride=image.width*4,row=new Uint8ClampedArray(stride);
  for(let z=0;z<Math.floor(image.height/2);z++){
    const a=z*stride,b=(image.height-z-1)*stride;row.set(image.pixels.subarray(a,a+stride));
    image.pixels.copyWithin(a,b,b+stride);image.pixels.set(row,b);
  }
  const texture=new DataTexture(image.pixels,image.width,image.height,RGBAFormat,UnsignedByteType);
  texture.flipY=false;texture.colorSpace=NoColorSpace;texture.wrapS=texture.wrapT=ClampToEdgeWrapping;
  texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=true;texture.unpackAlignment=4;texture.needsUpdate=true;
  return texture;
}
