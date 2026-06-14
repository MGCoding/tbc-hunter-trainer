import { describe, expect, it } from "vitest";

import { getRotationPreset } from "../data/rotations";
import { createSimulator } from "../sim/simulator";

describe("session flow", () => {
  it("records ability events and can reset log", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    expect(sim.getLog().length).toBeGreaterThan(0);
    sim.resetLog();
    expect(sim.getLog()).toEqual([]);
  });
});
