import { describe, expect, it } from "vitest";
import { renderGroup } from "three/tsl";
import { createWindUniforms } from "../../fx/windSway";
import { createSettlementMaterialUniforms } from "../../settlement/materials";
import { sharedUniform } from "./sharedUniform";

describe("sharedUniform", () => {
  it("puts the uniform in renderGroup, keeping value and type", () => {
    const u = sharedUniform(3);
    expect((u as unknown as { groupNode: unknown }).groupNode).toBe(renderGroup);
    expect(u.value).toBe(3);
  });
  it("frame-wide vegetation and settlement uniforms are shared", () => {
    const groups = [...Object.values(createWindUniforms()), ...Object.values(createSettlementMaterialUniforms())]
      .map((u) => (u as { groupNode?: unknown }).groupNode);
    expect(groups.every((g) => g === renderGroup)).toBe(true);
  });
});
