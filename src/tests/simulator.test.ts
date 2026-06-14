import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { createSimulator } from "../sim/simulator";

describe("simulator", () => {
  it("queues a GCD ability inside the 100ms spell queue window", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("arcaneShot", 1450);
    sim.tick(1500);
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "cast-start",
      atMs: 1500,
      ability: "arcaneShot",
    }));
  });

  it("starts a queued GCD ability when the GCD becomes ready even if tick advances later", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("arcaneShot", 1450);
    sim.tick(2000);
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "cast-start",
      atMs: 1500,
      ability: "arcaneShot",
    }));
  });

  it("allows Steady Shot after Auto Shot wind-up begins", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    sim.tick(autoDue - 10);
    sim.pressAbility("steadyShot", autoDue - 10);
    expect(sim.getLog().some((event) => event.type === "cast-start" && event.ability === "steadyShot")).toBe(true);
  });

  it("clips Auto Shot when Multi-Shot is still casting at no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("french-weaving-5511-3w"));
    const spark = sim.getState().nextAutoAtMs - 500;
    sim.pressAbility("multiShot", spark - 50);
    sim.tick(sim.getState().nextAutoAtMs);
    expect(sim.getLog().some((event) => event.type === "auto-clipped")).toBe(true);
  });

  it("blocks Kill Command during Steady Shot", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("killCommand", 10);
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "invalid-input",
      ability: "killCommand",
      reason: "kill-command-during-steady",
    }));
  });
});
