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

  it("pauses Auto Shot immediately after one successful Raptor Strike melee swing", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);

    expect(sim.getLog()).toContainEqual({ type: "cast-start", atMs: preset.derivedMeleeSwingMs, ability: "raptorStrike" });
    expect(sim.getLog()).toContainEqual({ type: "auto-paused", atMs: preset.derivedMeleeSwingMs, ability: "autoShot" });
    expect(sim.getState().autoPaused).toBe(true);
  });

  it("keeps the successful Raptor Strike as the visible outcome of the first ready melee press", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);

    expect(sim.getLog().at(-1)).toEqual({
      type: "cast-complete",
      atMs: preset.derivedMeleeSwingMs,
      ability: "raptorStrike",
    });
  });

  it("does not fire Raptor Strike before the melee swing is ready", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const earlyAtMs = preset.derivedMeleeSwingMs - 100;

    sim.pressAbility("raptorStrike", earlyAtMs);

    expect(sim.getLog()).not.toContainEqual({ type: "cast-start", atMs: earlyAtMs, ability: "raptorStrike" });
    expect(sim.getLog()).toContainEqual({
      type: "invalid-input",
      atMs: earlyAtMs,
      ability: "raptorStrike",
      reason: "melee-action-not-ready",
    });
    expect(sim.getState().autoPaused).toBe(false);
  });

  it("lets Raptor Strike fire during the GCD when the melee swing is ready", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.pressAbility("steadyShot", preset.derivedMeleeSwingMs - 100);
    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);

    expect(sim.getState().gcdReadyAtMs).toBeGreaterThan(preset.derivedMeleeSwingMs);
    expect(sim.getLog()).toContainEqual({
      type: "cast-start",
      atMs: preset.derivedMeleeSwingMs,
      ability: "raptorStrike",
    });
  });

  it("keeps ranged timer state advancing but prevents auto-fire while Auto Shot is paused", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
    sim.resetLog();
    sim.tick(preset.targetRangedSwingMs + preset.targetRangedSwingMs);

    expect(sim.getState().nowMs).toBe(preset.targetRangedSwingMs + preset.targetRangedSwingMs);
    expect(sim.getState().nextAutoAtMs).toBe(preset.targetRangedSwingMs + preset.targetRangedSwingMs);
    expect(sim.getLog().some((event) => event.type === "auto-fire")).toBe(false);
  });

  it("keeps ranged timer state advancing but prevents auto-fire while ranged attacks are range-blocked", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.setAutoShotRangeAllowed(false, 1000);
    sim.tick(preset.targetRangedSwingMs + preset.targetRangedSwingMs);

    expect(sim.getState().nowMs).toBe(preset.targetRangedSwingMs + preset.targetRangedSwingMs);
    expect(sim.getState().nextAutoAtMs).toBe(preset.targetRangedSwingMs);
    expect(sim.getState().autoRangeBlocked).toBe(true);
    expect(sim.getLog().some((event) => event.type === "auto-fire")).toBe(false);
  });

  it("starts a fresh Auto Shot windup when ranged attacks are restored past the spark", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const windupMs = 500 / preset.hasteFactor;
    const restoreAtMs = preset.targetRangedSwingMs + 750;

    sim.setAutoShotRangeAllowed(false, 1000);
    sim.tick(restoreAtMs);
    sim.setAutoShotRangeAllowed(true, restoreAtMs);

    expect(sim.getState().autoRangeBlocked).toBe(false);
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(restoreAtMs + windupMs);
    expect(sim.getLog().some((event) => event.type === "auto-fire")).toBe(false);

    sim.tick(restoreAtMs + windupMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-windup",
      atMs: restoreAtMs,
      ability: "autoShot",
    });
    expect(sim.getLog()).toContainEqual({
      type: "auto-fire",
      atMs: restoreAtMs + windupMs,
      ability: "autoShot",
    });
  });

  it("does not resume a manually paused Auto Shot when ranged attacks are restored", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
    const restoreAtMs = sim.getState().nextAutoAtMs + 750;
    sim.resetLog();
    sim.setAutoShotRangeAllowed(false, preset.derivedMeleeSwingMs + 100);
    sim.tick(restoreAtMs);
    sim.setAutoShotRangeAllowed(true, restoreAtMs);

    expect(sim.getState().autoPaused).toBe(true);
    expect(sim.getState().autoRangeBlocked).toBe(false);
    expect(sim.getLog().some((event) => event.type === "auto-fire")).toBe(false);
  });

  it("requires Auto Shot input to resume and starts a fresh windup when resumed past the spark", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const windupMs = 500 / preset.hasteFactor;

    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
    const resumeAtMs = sim.getState().nextAutoAtMs + 750;
    sim.resetLog();
    sim.tick(resumeAtMs);
    sim.pressAbility("autoShot", resumeAtMs);

    expect(sim.getLog()).toContainEqual({ type: "auto-resumed", atMs: resumeAtMs, ability: "autoShot" });
    expect(sim.getState().autoPaused).toBe(false);
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(resumeAtMs + windupMs);
    expect(sim.getLog().some((event) => event.type === "auto-fire")).toBe(false);

    sim.tick(resumeAtMs + windupMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-windup",
      atMs: resumeAtMs,
      ability: "autoShot",
    });
    expect(sim.getLog()).toContainEqual({
      type: "auto-fire",
      atMs: resumeAtMs + windupMs,
      ability: "autoShot",
    });
  });

  it.each(["arcaneShot", "multiShot", "steadyShot"] as const)(
    "starts Auto Shot when %s is pressed after Auto Shot was paused",
    (ability) => {
      const preset = getRotationPreset("one-one");
      const sim = createSimulator(preset);
      const windupMs = 500 / preset.hasteFactor;

      sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
      const resumeAtMs = sim.getState().nextAutoAtMs + 750;
      sim.tick(resumeAtMs);
      sim.pressAbility(ability, resumeAtMs);

      expect(sim.getLog()).toContainEqual({ type: "auto-resumed", atMs: resumeAtMs, ability: "autoShot" });
      expect(sim.getState().autoPaused).toBe(false);
      expect(sim.getState().nextAutoAtMs).toBeCloseTo(resumeAtMs + windupMs);
      expect(sim.getLog()).toContainEqual({ type: "cast-start", atMs: resumeAtMs, ability });
    },
  );

  it("clips Auto Shot when Multi-Shot is still casting at no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("french-weaving-5511-3w"));
    const spark = sim.getState().nextAutoAtMs - 500;
    sim.pressAbility("multiShot", spark - 50);
    sim.tick(sim.getState().nextAutoAtMs);
    expect(sim.getLog().some((event) => event.type === "auto-clipped")).toBe(true);
  });

  it("clips Auto Shot when Steady Shot is still casting at no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - 500;

    sim.pressAbility("steadyShot", spark - 100);
    sim.tick(autoDue);

    expect(sim.getLog()).toContainEqual({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "casting-at-spark",
    });
    expect(sim.getLog()).not.toContainEqual({ type: "auto-fire", atMs: autoDue, ability: "autoShot" });
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

  it("enforces Arcane Shot and Multi-Shot cooldowns", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("arcaneShot", 0);
    sim.pressAbility("arcaneShot", 1500);
    sim.pressAbility("multiShot", 3000);
    sim.pressAbility("multiShot", 4500);

    expect(sim.getLog()).toContainEqual({
      type: "invalid-input",
      atMs: 1500,
      ability: "arcaneShot",
      reason: "cooldown-locked",
    });
    expect(sim.getLog()).toContainEqual({
      type: "invalid-input",
      atMs: 4500,
      ability: "multiShot",
      reason: "cooldown-locked",
    });
  });

  it("enforces Kill Command cooldown while leaving it off the GCD", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("killCommand", 0);
    sim.pressAbility("killCommand", 100);
    sim.pressAbility("arcaneShot", 200);

    expect(sim.getLog()).toContainEqual({
      type: "invalid-input",
      atMs: 100,
      ability: "killCommand",
      reason: "cooldown-locked",
    });
    expect(sim.getLog()).toContainEqual({ type: "cast-start", atMs: 200, ability: "arcaneShot" });
  });

  it("ticks pending simulator events before recording invalid input", () => {
    const sim = createSimulator(getRotationPreset("one-one"));

    sim.pressAbility("steadyShot", 0);
    const completesAtMs = sim.getState().activeCast?.completesAtMs;
    sim.recordInvalidInput("arcaneShot", 2000, "out-of-range");

    expect(sim.getLog()).toContainEqual({ type: "cast-complete", atMs: completesAtMs, ability: "steadyShot" });
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
