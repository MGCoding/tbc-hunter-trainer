import { describe, expect, it } from "vitest";

import { getSessionElapsedMs } from "../App";
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

  it("computes ability press time relative to session start", () => {
    expect(getSessionElapsedMs(12_345, 10_000)).toBe(2_345);
  });

  it("does not synthesize auto shot cast events from manual auto shot input", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("autoShot", 0);

    expect(sim.getLog()).toContainEqual({ type: "ability-press", atMs: 0, ability: "autoShot" });
    expect(sim.getLog()).not.toContainEqual({ type: "cast-start", atMs: 0, ability: "autoShot" });
    expect(sim.getLog()).not.toContainEqual({ type: "cast-complete", atMs: 0, ability: "autoShot" });
  });
});
