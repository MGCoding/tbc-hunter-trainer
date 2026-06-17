import { describe, expect, it } from "vitest";

import {
  clearSimulatorLogAtSessionNow,
  getSessionElapsedMs,
  readSimulatorStateAtSessionNow,
  tickSimulatorToSessionNow,
} from "../App";
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

  it("ticks the simulator to current session time before reading stopped logs", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("steadyShot", 0);
    const completesAtMs = sim.getState().activeCast?.completesAtMs;
    tickSimulatorToSessionNow(sim, 11_500, 10_000);

    expect(sim.getLog()).toContainEqual({ type: "cast-complete", atMs: completesAtMs, ability: "steadyShot" });
  });

  it("ticks the simulator to current session time before returning running state reads", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("steadyShot", 0);
    const completesAtMs = sim.getState().activeCast?.completesAtMs;
    const firstAutoAtMs = sim.getState().nextAutoAtMs;
    const state = readSimulatorStateAtSessionNow(sim, true, 12_600, 10_000);

    expect(state.nowMs).toBe(2_600);
    expect(state.activeCast).toBeNull();
    expect(sim.getLog()).toContainEqual({ type: "cast-complete", atMs: completesAtMs, ability: "steadyShot" });
    expect(sim.getLog()).toContainEqual(
      expect.objectContaining({ type: "auto-fire", atMs: firstAutoAtMs, ability: "autoShot" }),
    );
  });

  it("discards deferred simulator events when resetting during a running session", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("steadyShot", 0);
    const completesAtMs = sim.getState().activeCast?.completesAtMs;
    clearSimulatorLogAtSessionNow(sim, 11_500, 10_000);
    sim.tick(2_000);

    expect(sim.getLog()).not.toContainEqual({ type: "cast-complete", atMs: completesAtMs, ability: "steadyShot" });
  });

  it("does not synthesize auto shot cast events from manual auto shot input", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("autoShot", 0);

    expect(sim.getLog()).toContainEqual({ type: "ability-press", atMs: 0, ability: "autoShot" });
    expect(sim.getLog()).not.toContainEqual({ type: "cast-start", atMs: 0, ability: "autoShot" });
    expect(sim.getLog()).not.toContainEqual({ type: "cast-complete", atMs: 0, ability: "autoShot" });
  });
});
