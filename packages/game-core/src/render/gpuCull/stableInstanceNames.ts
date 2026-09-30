/**
 * Stable WGSL names for three's STORAGE instance buffers (matrix and colour) (lane L19), so
 * meshes of one template drawn from a `GpuCullSystem` page share one shader
 * module and one pipeline on the WebGPU backend.
 *
 * three 0.184's `InstanceNode` reads a `StorageInstancedBufferAttribute`
 * instance matrix (the GPU-cull path: `GpuCullSystem.addDraw`) through a fresh
 * `storage(instanceMatrix, "mat4", count)` node per mesh, and
 * `WGSLNodeBuilder.getUniformFromNode` names an unnamed buffer binding
 * `NodeBuffer_<node id>`. The id differs per mesh, so the vertex module text
 * differed per mesh (veg harness: 65 pipelines for 12 templates). Naming the
 * node (`setName`) makes the text depend only on the material and geometry
 * layout; the buffer itself is still bound per mesh through its bind group,
 * and a storage binding is runtime-sized (no count in the WGSL), so the
 * count never enters the text either.
 *
 * One named node per (attribute, current|previous) is kept ON the attribute
 * and reused by every mesh drawing from it: a build can set up two
 * InstanceNodes for one mesh (the shadow pass did), and two nodes with one
 * name in one module are renamed to `<name>.value_1`, which is not valid
 * WGSL. One shared node is one binding per module. The current and previous
 * (motion-vector) matrices get different names: both can sit in one module.
 * Installed once per process on the class prototype (idempotent); outside
 * the storage path three's own code runs unchanged.
 */
import { InstanceNode } from "three/webgpu";
import * as tsl from "three/tsl";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { storage, instanceIndex } = tsl as unknown as Record<string, any>;

const MARK = "__esStableInstanceNames";
const NODES = "__esStorageMatrixNodes";

export function installStableInstanceNames(): void {
  const proto = (InstanceNode as any).prototype;
  if (proto[MARK]) return;
  const createMatrix = proto._createInstanceMatrixNode;
  proto._createInstanceMatrixNode = function (this: any, assignBuffer: boolean, builder: unknown) {
    if (!this.isStorageMatrix) return createMatrix.call(this, assignBuffer, builder);
    const attr = this.instanceMatrix;
    const nodes = attr[NODES] ?? (attr[NODES] = {});
    const key = assignBuffer ? "current" : "previous";
    nodes[key] ??= storage(attr, "mat4", Math.max(attr.count, 1))
      .setName(assignBuffer ? "esInstanceMatrix" : "esInstanceMatrixPrevious");
    return nodes[key].element(instanceIndex);
  };
  // A storage instanceColor (a GPU-cull payload page, Groundcover.tsx) is read
  // the same way in InstanceNode.setup; preset the node it would make.
  const setup = proto.setup;
  proto.setup = function (this: any, builder: unknown) {
    if (this.isStorageColor && this.instanceColorNode === null) {
      const attr = this.instanceColor;
      const nodes = attr[NODES] ?? (attr[NODES] = {});
      nodes.color ??= storage(attr, "vec3", Math.max(attr.count, 1)).setName("esInstanceColor");
      this.instanceColorNode = nodes.color.element(instanceIndex);
    }
    return setup.call(this, builder);
  };
  proto[MARK] = true;
}
