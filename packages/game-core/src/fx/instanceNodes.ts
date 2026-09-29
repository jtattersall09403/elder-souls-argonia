/**
 * Per-object node helpers the vegetation features share (wind sway, LOD fade,
 * batch data, billboards; decision 0111).
 *
 * Why these exist. A feature's `positionNode` sees the PRE-instance,
 * object-space position: the generated vertex shader assigns `positionNode`
 * first and multiplies by the instance matrix after (measured on three
 * 0.184's WebGL backend output: `positionLocal = position; positionLocal =
 * <positionNode>; positionLocal = (instanceMatrix * positionLocal)`), exactly
 * the old `begin_vertex` seam. The old GLSL patches read `instanceMatrix`
 * directly (origin, basis, scale); three does not expose the matrix node it
 * builds, so `instanceMatrixNode()` builds the
 * same one for whatever InstancedMesh is being compiled (one per build,
 * shared by every feature in that build through the builder context).
 * A render object of an InstancedMesh is keyed by the mesh's uuid
 * (RenderObject.getCacheKey), so a per-object node is never shared across
 * meshes.
 *
 * `optionalAttribute` replaces WebGL's "an unbound attribute reads (0,0,0,0)":
 * it reads the attribute where the geometry carries it and a constant where it
 * does not, without the missing-attribute warning.
 */
import { InstanceNode, Node } from "three/webgpu";
import * as tsl from "three/tsl";
// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const { attribute, mat4, vec4 } = tsl as unknown as Record<string, TslNode>;
import type { TslNode } from "../render/nodes/materialNodes";

/* eslint-disable @typescript-eslint/no-explicit-any */
const NodeBase = Node as any;
const InstanceNodeBase = InstanceNode as any;

type Builder = {
  object: any;
  geometry: { hasAttribute(name: string): boolean } | null;
  context: Record<string, unknown>;
};

/**
 * Builds the instance matrix node for one InstancedMesh with three's own
 * `InstanceNode` code path (uniform buffer or interleaved instanced
 * attribute; its `update()` keeps the buffer version in step with
 * `instanceMatrix.needsUpdate`), without assigning `positionLocal`.
 */
class EsInstanceMatrixNode extends InstanceNodeBase {
  constructor(mesh: any) {
    super(mesh.count, mesh.instanceMatrix);
  }
  getNodeType(): string {
    return "mat4";
  }
  setup(builder: Builder): TslNode {
    if (this.instanceMatrixNode === null) {
      this.instanceMatrixNode = this._createInstanceMatrixNode(true, builder);
    }
    return this.instanceMatrixNode;
  }
}

const IDENTITY = (): TslNode =>
  (mat4 as any)(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/** Whether the object being compiled is an InstancedMesh with a real instance buffer. */
export function isInstancedObject(object: any): boolean {
  return object?.isInstancedMesh === true
    && object.instanceMatrix?.isInstancedBufferAttribute === true;
}

class EsInstanceMatrixSwitch extends NodeBase {
  constructor() {
    super("mat4");
  }
  setup(builder: Builder): TslNode {
    if (!isInstancedObject(builder.object)) return IDENTITY();
    const ctx = builder.context;
    if (!ctx.esInstanceMatrix) ctx.esInstanceMatrix = new EsInstanceMatrixNode(builder.object);
    return ctx.esInstanceMatrix;
  }
}

/** The compiled InstancedMesh's instance matrix (identity for any other object). */
export function instanceMatrixNode(): TslNode {
  return new EsInstanceMatrixSwitch();
}

class EsInstancedSwitch extends NodeBase {
  constructor(
    private readonly instanced: () => TslNode,
    private readonly plain: () => TslNode,
    type: string,
  ) {
    super(type);
  }
  setup(builder: Builder): TslNode {
    return isInstancedObject(builder.object) ? this.instanced() : this.plain();
  }
}

/**
 * Pick a graph at build time by whether the object is instanced (the old
 * `#ifdef USE_INSTANCING`). The factories run once per build.
 */
export function whenInstanced(
  instanced: () => TslNode,
  plain: () => TslNode,
  type: string,
): TslNode {
  return new EsInstancedSwitch(instanced, plain, type);
}

class EsOptionalAttribute extends NodeBase {
  constructor(
    private readonly attributeName: string,
    type: string,
    private readonly fallback: () => TslNode,
  ) {
    super(type);
  }
  setup(builder: Builder): TslNode {
    return builder.geometry?.hasAttribute(this.attributeName)
      ? attribute(this.attributeName, this.nodeType)
      : this.fallback();
  }
}

/** `attribute(name)` where the geometry has it, else `fallback()`. */
export function optionalAttribute(name: string, type: string, fallback: () => TslNode): TslNode {
  return new EsOptionalAttribute(name, type, fallback);
}

/**
 * Column `i` (0..3) of a mat4 node, as m·eᵢ. Written as a product, not
 * `m.element(i)`: on a buffer-backed instance matrix (`buffer(...).element(
 * instanceIndex)`) a second `.element()` indexes the BUFFER, not the matrix.
 */
export function matrixColumn(m: TslNode, i: 0 | 1 | 2 | 3): TslNode {
  const e = [0, 0, 0, 0];
  e[i] = 1;
  return m.mul(vec4(e[0], e[1], e[2], e[3])).xyz;
}
