import { describe, expect, it } from "vitest";
import { carryCharacterParams } from "./characterUrl";

describe("character URL sync", () => {
  it("keeps ?yaw (and race/profile) through the character-branch rebuild", () => {
    const q = new URLSearchParams();
    carryCharacterParams(new URLSearchParams("view=character&yaw=129&race=argonian&interior=x"), q);
    expect(q.get("yaw")).toBe("129");
    expect(q.get("race")).toBe("argonian");
    expect(q.has("interior")).toBe(false);
  });
  it("adds nothing absent", () => {
    const q = new URLSearchParams();
    carryCharacterParams(new URLSearchParams("view=character"), q);
    expect(q.toString()).toBe("");
  });
});
