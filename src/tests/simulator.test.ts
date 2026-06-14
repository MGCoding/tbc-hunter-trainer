import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { createSimulator } from "../sim/simulator";
import { expandRotationPattern } from "../sim/timeline";

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

  it("processes every Auto Shot due within a large tick", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const firstAuto = sim.getState().nextAutoAtMs;
    sim.tick(firstAuto * 3 + 1);
    const autoFireEvents = sim.getLog().filter((event) => event.type === "auto-fire");
    const autoFireTimes = autoFireEvents.map((event) => event.atMs);
    expect(autoFireEvents.length).toBeGreaterThanOrEqual(3);
    expect(autoFireTimes).toEqual([...autoFireTimes].sort((a, b) => a - b));
    expect(sim.getState().nextAutoAtMs).toBeGreaterThan(sim.getState().nowMs);
  });

  it("clips Auto Shot when Multi-Shot is still casting at no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("french-weaving-5511-3w"));
    const spark = sim.getState().nextAutoAtMs - 500;
    sim.pressAbility("multiShot", spark - 50);
    sim.tick(sim.getState().nextAutoAtMs);
    expect(sim.getLog().some((event) => event.type === "auto-clipped")).toBe(true);
  });

  it("clips Auto Shot when queued Multi-Shot is active at the no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("multiShot", 1450);
    sim.tick(autoDue);
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "cast-start",
      atMs: 1500,
      ability: "multiShot",
    }));
    expect(sim.getLog().some((event) => event.type === "auto-clipped")).toBe(true);
    expect(sim.getLog().some((event) => event.type === "auto-fire" && event.atMs === autoDue)).toBe(false);
  });

  it("keeps log events in non-decreasing timestamp order for queued Multi-Shot clipping", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("multiShot", 1450);
    sim.tick(autoDue);
    const timestamps = sim.getLog().map((event) => event.atMs);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("returns log snapshots that cannot mutate internal log events", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    const snapshot = sim.getLog();
    snapshot[0].atMs = 999999;
    snapshot[0].type = "score";
    expect(sim.getLog()[0]).toMatchObject({
      type: "ability-press",
      atMs: 0,
      ability: "steadyShot",
    });
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

  it("resolves melee action presses to Raptor Strike and white melee swings", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const idealRaptor = ideal.find((event) => event.ability === "raptorStrike")!;
    const idealMelee = ideal.find((event) => event.ability === "meleeSwing")!;
    const sim = createSimulator(preset);

    sim.pressAbility("raptorStrike", idealRaptor.idealAtMs);
    sim.pressAbility("raptorStrike", idealMelee.idealAtMs);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "cast-start",
      atMs: idealRaptor.idealAtMs,
      ability: "raptorStrike",
    }));
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "cast-start",
      atMs: idealMelee.idealAtMs,
      ability: "meleeSwing",
    }));
  });
});
