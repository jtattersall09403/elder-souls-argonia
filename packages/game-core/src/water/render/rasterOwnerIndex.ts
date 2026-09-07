import type { RasterDomainBounds } from './rasterWaterDomain';

interface Node extends RasterDomainBounds { cells?: RasterDomainBounds[]; left?: Node; right?: Node }
const distanceSquared = (cell: RasterDomainBounds, x: number, z: number) => {
  const dx = Math.max(cell.minX - x, 0, x - cell.maxX), dz = Math.max(cell.minZ - z, 0, z - cell.maxZ);
  return dx * dx + dz * dz;
};

/** Build once per owner, then find one-sided sampling cells in logarithmic
 * neighbourhood searches. Scanning every pool cell for each clipped vertex
 * made coarse geometry slower than its much larger source mesh. */
export class RasterOwnerIndex {
  private readonly root: Node;
  constructor(cells: readonly RasterDomainBounds[]) {
    if (!cells.length) throw new Error('Raster owner index needs a supported cell');
    const build = (items: RasterDomainBounds[]): Node => {
      const node: Node = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
      for (const cell of items) {
        node.minX = Math.min(node.minX, cell.minX); node.minZ = Math.min(node.minZ, cell.minZ);
        node.maxX = Math.max(node.maxX, cell.maxX); node.maxZ = Math.max(node.maxZ, cell.maxZ);
      }
      if (items.length <= 8) node.cells = items;
      else {
        const xAxis = node.maxX - node.minX >= node.maxZ - node.minZ;
        items.sort((a, b) => xAxis ? a.minX + a.maxX - b.minX - b.maxX : a.minZ + a.maxZ - b.minZ - b.maxZ);
        const middle = Math.floor(items.length / 2);
        node.left = build(items.slice(0, middle)); node.right = build(items.slice(middle));
      }
      return node;
    };
    this.root = build([...cells]);
  }
  nearest(x: number, z: number): RasterDomainBounds {
    let best = Infinity, closest: RasterDomainBounds | undefined;
    const visit = (node: Node) => {
      if (distanceSquared(node, x, z) > best) return;
      if (node.cells) {
        for (const cell of node.cells) {
          const distance = distanceSquared(cell, x, z);
          if (distance < best || (distance === best && closest
            && (cell.minZ < closest.minZ || cell.minZ === closest.minZ && cell.minX < closest.minX))) {
            closest = cell; best = distance;
          }
        }
      } else {
        const left = node.left!, right = node.right!;
        if (distanceSquared(left, x, z) <= distanceSquared(right, x, z)) { visit(left); visit(right); }
        else { visit(right); visit(left); }
      }
    };
    visit(this.root); return closest!;
  }
}
