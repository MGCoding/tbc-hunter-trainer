import { describe, expect, it } from "vitest";
import { TIMING } from "../data/constants";
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

  it("logs Auto Shot windup when windup starts before the shot fires", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const windupAtMs = preset.targetRangedSwingMs - TIMING.autoWindupMs / preset.hasteFactor;

    sim.tick(windupAtMs - 1);
    expect(sim.getLog().filter((event) => event.type === "auto-windup")).toHaveLength(0);

    sim.tick(windupAtMs);
    expect(sim.getLog()).toContainEqual({ type: "auto-windup", atMs: windupAtMs, ability: "autoShot" });
    expect(
      sim
        .getLog()
        .some(
          (event) =>
            event.type === "auto-fire" && event.atMs === preset.targetRangedSwingMs && event.ability === "autoShot",
        ),
    ).toBe(false);

    sim.tick(windupAtMs + 10);
    expect(sim.getLog().filter((event) => event.type === "auto-windup")).toHaveLength(1);
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
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: restoreAtMs + windupMs,
      ability: "autoShot",
    }));
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
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: resumeAtMs + windupMs,
      ability: "autoShot",
    }));
  });

  it.each(["arcaneShot", "multiShot", "steadyShot"] as const)(
    "starts Auto Shot when %s is pressed after Auto Shot was paused",
    (ability) => {
      const preset = getRotationPreset("one-one");
      const sim = createSimulator(preset);
      const windupMs = 500 / preset.hasteFactor;
      const castMs = ability === "arcaneShot" ? 0 : ability === "multiShot" ? TIMING.multiBaseCastMs / preset.hasteFactor : TIMING.steadyBaseCastMs / preset.hasteFactor;
      const restartLeadMs = castMs > 0 ? TIMING.noMoveNoCastLeadMs : windupMs;

      sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
      const resumeAtMs = sim.getState().nextAutoAtMs + 750;
      sim.tick(resumeAtMs);
      sim.pressAbility(ability, resumeAtMs);

      expect(sim.getLog()).toContainEqual({ type: "auto-resumed", atMs: resumeAtMs, ability: "autoShot" });
      expect(sim.getState().autoPaused).toBe(false);
      expect(sim.getState().nextAutoAtMs).toBeCloseTo(resumeAtMs + castMs + restartLeadMs);
      expect(sim.getLog()).toContainEqual({ type: "cast-start", atMs: resumeAtMs, ability });
    },
  );

  it("does not fire a restarted Auto Shot while Steady Shot is still casting", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const windupMs = 500 / preset.hasteFactor;

    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
    const steadyAtMs = sim.getState().nextAutoAtMs + 750;
    const steadyCompletesAtMs = steadyAtMs + TIMING.steadyBaseCastMs / preset.hasteFactor;
    sim.tick(steadyAtMs);
    sim.pressAbility("steadyShot", steadyAtMs);

    sim.tick(steadyAtMs + windupMs);

    expect(
      sim
        .getLog()
        .some((event) => event.type === "auto-fire" && event.atMs >= steadyAtMs && event.atMs < steadyCompletesAtMs),
    ).toBe(false);
    expect(
      sim
        .getLog()
        .some((event) => event.type === "auto-windup" && event.atMs >= steadyAtMs && event.atMs < steadyCompletesAtMs),
    ).toBe(false);

    sim.tick(steadyCompletesAtMs);
    sim.tick(steadyCompletesAtMs + TIMING.noMoveNoCastLeadMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-windup",
      atMs: steadyCompletesAtMs + TIMING.noMoveNoCastLeadMs - windupMs,
      ability: "autoShot",
    });
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: steadyCompletesAtMs + TIMING.noMoveNoCastLeadMs,
      ability: "autoShot",
    }));
  });

  it("starts Auto Shot when queued Steady Shot begins after Auto Shot was paused", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);

    sim.pressAbility("steadyShot", preset.derivedMeleeSwingMs - 100);
    sim.pressAbility("raptorStrike", preset.derivedMeleeSwingMs);
    const queuedAtMs = sim.getState().gcdReadyAtMs - 50;
    const startsAtMs = sim.getState().gcdReadyAtMs;
    const completesAtMs = startsAtMs + TIMING.steadyBaseCastMs / preset.hasteFactor;
    const windupMs = 500 / preset.hasteFactor;

    sim.pressAbility("steadyShot", queuedAtMs);
    sim.tick(startsAtMs);

    expect(sim.getLog()).toContainEqual({ type: "queued", atMs: queuedAtMs, ability: "steadyShot" });
    expect(sim.getLog()).toContainEqual({ type: "auto-resumed", atMs: startsAtMs, ability: "autoShot" });
    expect(sim.getState().autoPaused).toBe(false);
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(completesAtMs + TIMING.noMoveNoCastLeadMs);
    expect(sim.getLog()).toContainEqual({ type: "cast-start", atMs: startsAtMs, ability: "steadyShot" });

    sim.tick(startsAtMs + windupMs);

    expect(
      sim.getLog().some((event) => event.type === "auto-fire" && event.atMs >= startsAtMs && event.atMs < completesAtMs),
    ).toBe(false);
  });

  it("clips Auto Shot when Multi-Shot is still casting at no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("french-weaving-5511-3w"));
    const spark = sim.getState().nextAutoAtMs - 500;
    sim.pressAbility("multiShot", spark - 50);
    sim.tick(sim.getState().nextAutoAtMs);
    expect(sim.getLog().some((event) => event.type === "auto-clipped")).toBe(true);
  });

  it("clips Auto Shot when Steady Shot is still casting at no-move/no-cast spark", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const windupAtMs = autoDue - TIMING.autoWindupMs / preset.hasteFactor;
    const spark = autoDue - 500;

    sim.pressAbility("steadyShot", spark - 100);
    sim.tick(autoDue);

    expect(sim.getLog()).toContainEqual({ type: "auto-windup", atMs: windupAtMs, ability: "autoShot" });
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "casting-at-spark",
    }));
    expect(
      sim
        .getLog()
        .some((event) => event.type === "auto-fire" && event.atMs === autoDue && event.ability === "autoShot"),
    ).toBe(false);
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

  it("records delay metadata when a cast clips Auto Shot", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const castStartedAtMs = spark - 100;
    const expectedRescheduledAtMs = autoDue + TIMING.steadyBaseCastMs / preset.hasteFactor - 100;

    sim.pressAbility("steadyShot", castStartedAtMs);
    sim.tick(autoDue);

    const clipped = sim.getLog().find((event) => event.type === "auto-clipped" && event.reason === "casting-at-spark");

    expect(clipped).toMatchObject({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "casting-at-spark",
      originalAtMs: autoDue,
    });
    expect(clipped?.rescheduledAtMs).toBeUndefined();
    expect(clipped?.delayMs).toBeUndefined();

    sim.tick(expectedRescheduledAtMs);

    const delayedFire = sim.getLog().find((event) => event.type === "auto-fire" && event.originalAtMs === autoDue);
    expect(delayedFire).toMatchObject({
      type: "auto-fire",
      ability: "autoShot",
      originalAtMs: autoDue,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    });
    expect(delayedFire?.atMs).toBeCloseTo(expectedRescheduledAtMs);
  });

  it("preserves fractional positive cast delays below half a millisecond", () => {
    const preset = {
      ...getRotationPreset("one-one"),
      targetRangedSwingMs: 3000,
      hasteFactor: 1,
      derivedMeleeSwingMs: 3500,
    };
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const rawDelayMs = 0.4;
    const castStartedAtMs = spark + rawDelayMs - TIMING.steadyBaseCastMs / preset.hasteFactor;
    const expectedRescheduledAtMs = autoDue + rawDelayMs;

    sim.pressAbility("steadyShot", castStartedAtMs);
    sim.tick(autoDue);

    const clipped = sim.getLog().find((event) => event.type === "auto-clipped" && event.reason === "casting-at-spark");

    expect(sim.getState().nextAutoAtMs).toBeCloseTo(expectedRescheduledAtMs);
    expect(sim.getState().nextAutoAtMs).not.toBe(autoDue + preset.targetRangedSwingMs);
    expect(clipped).toMatchObject({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "casting-at-spark",
      originalAtMs: autoDue,
    });
    expect(clipped?.delayMs).toBeUndefined();
    expect(clipped?.rescheduledAtMs).toBeUndefined();

    sim.tick(expectedRescheduledAtMs);

    const delayedFire = sim.getLog().find((event) => event.type === "auto-fire" && event.originalAtMs === autoDue);
    expect(delayedFire).toMatchObject({
      type: "auto-fire",
      ability: "autoShot",
      originalAtMs: autoDue,
      delayMs: Math.round(rawDelayMs),
    });
    expect(delayedFire?.atMs).toBeCloseTo(expectedRescheduledAtMs);
  });

  it("records zero delay metadata for clean Auto Shot fires", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;

    sim.tick(autoDue);

    expect(sim.getLog()).toContainEqual({
      type: "auto-fire",
      atMs: autoDue,
      ability: "autoShot",
      originalAtMs: autoDue,
      rescheduledAtMs: autoDue,
      delayMs: 0,
    });
  });

  it("records moving Auto Shot delay when movement blocks the spark", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const stoppedAtMs = autoDue + 250;
    const expectedRescheduledAtMs = stoppedAtMs + TIMING.autoWindupMs / preset.hasteFactor;

    sim.setAutoShotMovementAllowed(false, spark);
    sim.tick(stoppedAtMs);
    sim.setAutoShotMovementAllowed(true, stoppedAtMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "moving",
      detail: "moving",
      originalAtMs: autoDue,
    });
    expect(sim.getLog().find((event) => event.type === "auto-clipped" && event.reason === "moving")?.delayMs).toBeUndefined();
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(expectedRescheduledAtMs);

    sim.tick(expectedRescheduledAtMs);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: expectedRescheduledAtMs,
      ability: "autoShot",
      originalAtMs: autoDue,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    }));
  });

  it("does not record moving Auto Shot delay or move Auto earlier when movement restores at the spark", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;

    sim.setAutoShotMovementAllowed(false, spark);
    sim.setAutoShotMovementAllowed(true, spark);

    expect(sim.getLog().some((event) => event.type === "auto-clipped" && event.reason === "moving")).toBe(false);
    expect(sim.getState().nextAutoAtMs).toBe(autoDue);
  });

  it("fires a due Auto Shot before starting movement block after the shot is due", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;

    sim.setAutoShotMovementAllowed(false, autoDue + 1);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({ type: "auto-fire", atMs: autoDue, ability: "autoShot" }));
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(autoDue + preset.targetRangedSwingMs);
    expect(sim.getState().autoMovementBlocked).toBe(true);
  });

  it("waits for movement to restore before rescheduling Auto Shot when range restores first", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const rangeRestoredAtMs = autoDue + 100;
    const movementRestoredAtMs = autoDue + 250;
    const expectedRescheduledAtMs = movementRestoredAtMs + TIMING.autoWindupMs / preset.hasteFactor;

    sim.setAutoShotRangeAllowed(false, spark);
    sim.setAutoShotMovementAllowed(false, spark);
    sim.setAutoShotRangeAllowed(true, rangeRestoredAtMs);

    expect(sim.getLog().filter((event) => event.type === "auto-clipped")).toHaveLength(0);
    expect(sim.getState().nextAutoAtMs).toBe(autoDue);

    sim.setAutoShotMovementAllowed(true, movementRestoredAtMs);

    const clipped = sim.getLog().filter((event) => event.type === "auto-clipped");
    expect(clipped).toHaveLength(1);
    expect(clipped[0]).toMatchObject({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "moving",
      originalAtMs: autoDue,
    });
    expect(clipped[0]?.delayMs).toBeUndefined();
    expect(clipped[0]?.rescheduledAtMs).toBeUndefined();
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(expectedRescheduledAtMs);

    sim.tick(expectedRescheduledAtMs);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: expectedRescheduledAtMs,
      ability: "autoShot",
      originalAtMs: autoDue,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    }));
  });

  it("records range-blocked Auto Shot delay only when range pushes the shot back", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const restoredAtMs = autoDue + 300;
    const expectedRescheduledAtMs = restoredAtMs + TIMING.autoWindupMs / preset.hasteFactor;

    sim.setAutoShotRangeAllowed(false, spark - 200);
    sim.setAutoShotRangeAllowed(true, spark - 100);
    expect(sim.getLog().some((event) => event.type === "auto-clipped" && event.reason === "range-blocked")).toBe(false);

    sim.setAutoShotRangeAllowed(false, spark);
    sim.tick(restoredAtMs);
    sim.setAutoShotRangeAllowed(true, restoredAtMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "range-blocked",
      detail: "range-blocked",
      originalAtMs: autoDue,
    });

    sim.tick(expectedRescheduledAtMs);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: expectedRescheduledAtMs,
      ability: "autoShot",
      originalAtMs: autoDue,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    }));
  });

  it("does not record range-blocked Auto Shot delay or move Auto earlier when range restores at the spark", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;

    sim.setAutoShotRangeAllowed(false, spark);
    sim.setAutoShotRangeAllowed(true, spark);

    expect(sim.getLog().some((event) => event.type === "auto-clipped" && event.reason === "range-blocked")).toBe(false);
    expect(sim.getState().nextAutoAtMs).toBe(autoDue);
  });

  it("fires a due Auto Shot before starting range block after the shot is due", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;

    sim.setAutoShotRangeAllowed(false, autoDue + 1);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({ type: "auto-fire", atMs: autoDue, ability: "autoShot" }));
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(autoDue + preset.targetRangedSwingMs);
    expect(sim.getState().autoRangeBlocked).toBe(true);
  });

  it("waits for range to restore before rescheduling Auto Shot when movement restores first", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const movementRestoredAtMs = autoDue + 100;
    const rangeRestoredAtMs = autoDue + 250;
    const expectedRescheduledAtMs = rangeRestoredAtMs + TIMING.autoWindupMs / preset.hasteFactor;

    sim.setAutoShotRangeAllowed(false, spark);
    sim.setAutoShotMovementAllowed(false, spark);
    sim.setAutoShotMovementAllowed(true, movementRestoredAtMs);

    expect(sim.getLog().filter((event) => event.type === "auto-clipped")).toHaveLength(0);
    expect(sim.getState().nextAutoAtMs).toBe(autoDue);

    sim.setAutoShotRangeAllowed(true, rangeRestoredAtMs);

    const clipped = sim.getLog().filter((event) => event.type === "auto-clipped");
    expect(clipped).toHaveLength(1);
    expect(clipped[0]).toMatchObject({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "range-blocked",
      originalAtMs: autoDue,
    });
    expect(clipped[0]?.delayMs).toBeUndefined();
    expect(clipped[0]?.rescheduledAtMs).toBeUndefined();
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(expectedRescheduledAtMs);

    sim.tick(expectedRescheduledAtMs);

    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "auto-fire",
      atMs: expectedRescheduledAtMs,
      ability: "autoShot",
      originalAtMs: autoDue,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    }));
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
