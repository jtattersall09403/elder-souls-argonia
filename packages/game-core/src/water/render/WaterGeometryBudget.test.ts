import { expect, it } from 'vitest';
import { WaterGeometryBudget, createWaterGeometryBudget } from './WaterGeometryBudget';
it('shares spare capacity and preserves both allocations when replacement cannot fit', () => {
  const ledger = new WaterGeometryBudget(10,100), inland = {}, river = {};
  expect(ledger.replace(inland, { triangles: 8, bytes: 80 })).toBe(true);
  expect(ledger.replace(river, { triangles: 2, bytes: 20 })).toBe(true);
  expect(ledger.replace(inland, { triangles: 9, bytes: 80 })).toBe(false);
  expect(ledger.replace(river, { triangles: 2, bytes: 21 })).toBe(false);
  expect(ledger.usage).toEqual({triangles:10,bytes:100});
  expect(ledger.replace(inland, {triangles:3,bytes:30})).toBe(true);
  expect(ledger.replace(river, {triangles:7,bytes:70})).toBe(true);
  ledger.release(inland); ledger.release(inland); ledger.release(river);
  expect(ledger.usage).toEqual({triangles:0,bytes:0});
});
it('retains existing combined tier limits and rejects invalid accounting', () => {
  for (const low of [false,true]) {
    const ledger = createWaterGeometryBudget(low);
    expect(ledger.maxTriangles).toBe(1000000+1048576);
    expect(ledger.maxBytes).toBe((64+(low?64:96))*1024*1024);
    expect(() => ledger.replace({}, {triangles:-1,bytes:0})).toThrow();
    expect(() => ledger.replace({}, {triangles:1,bytes:NaN})).toThrow();
  }
});
