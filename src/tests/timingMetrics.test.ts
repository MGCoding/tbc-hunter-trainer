import { describe, expect, it } from "vitest";

import { getTimingMetrics } from "../sim/timingMetrics";
import type { SimEvent } from "../sim/types";

describe("timing metrics", () => {
  it("averages only the last 10 Auto Shot delay samples and exposes the latest delay", () => {
    const events: SimEvent[] = Array.from({ length: 12 }, (_, index) => {
      const originalAtMs = 3000 + index * 3000;
      const firedAtMs = originalAtMs + (index + 1) * 10;

      return [
        {
          type: "auto-clipped",
          atMs: originalAtMs,
          ability: "autoShot",
          reason: "casting-at-spark",
          originalAtMs,
        },
        {
          type: "auto-fire",
          atMs: firedAtMs,
          ability: "autoShot",
          originalAtMs,
          delayMs: (index + 1) * 10,
        },
      ] satisfies SimEvent[];
    }).flat();

    const metrics = getTimingMetrics(events);

    expect(metrics.autoDelaySamples.map((sample) => sample.delayMs)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
    expect(metrics.autoDelayAverageMs).toBe(75);
    expect(metrics.lastAutoDelayMs).toBe(120);
  });

  it("sorts Auto delay samples before computing latest and rolling average", () => {
    const events: SimEvent[] = [
      {
        type: "auto-clipped",
        atMs: 9000,
        ability: "autoShot",
        reason: "moving",
        originalAtMs: 9000,
      },
      {
        type: "auto-fire",
        atMs: 9180,
        ability: "autoShot",
        originalAtMs: 9000,
        delayMs: 180,
      },
      {
        type: "auto-clipped",
        atMs: 3000,
        ability: "autoShot",
        reason: "casting-at-spark",
        originalAtMs: 3000,
      },
      {
        type: "auto-fire",
        atMs: 3060,
        ability: "autoShot",
        originalAtMs: 3000,
        delayMs: 60,
      },
      {
        type: "auto-clipped",
        atMs: 6000,
        ability: "autoShot",
        reason: "range-blocked",
        originalAtMs: 6000,
      },
      {
        type: "auto-fire",
        atMs: 6120,
        ability: "autoShot",
        originalAtMs: 6000,
        delayMs: 120,
      },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.autoDelaySamples.map((sample) => sample.delayMs)).toEqual([60, 120, 180]);
    expect(metrics.autoDelayAverageMs).toBe(120);
    expect(metrics.lastAutoDelayMs).toBe(180);
  });

  it("returns null averages before samples exist", () => {
    expect(getTimingMetrics([])).toMatchObject({
      autoDelayAverageMs: null,
      lastAutoDelayMs: null,
      weaveAverageMs: null,
      autoDelaySamples: [],
      weaveSamples: [],
    });
  });

  it("ignores non-finite Auto Shot delay metadata", () => {
    const events: SimEvent[] = [
      {
        type: "auto-clipped",
        atMs: 3000,
        ability: "autoShot",
        reason: "casting-at-spark",
        originalAtMs: 3000,
      },
      {
        type: "auto-fire",
        atMs: 3100,
        ability: "autoShot",
        originalAtMs: 3000,
        delayMs: Number.NaN,
      },
      {
        type: "auto-clipped",
        atMs: 6000,
        ability: "autoShot",
        reason: "moving",
        originalAtMs: 6000,
      },
      {
        type: "auto-fire",
        atMs: Infinity,
        ability: "autoShot",
        originalAtMs: 6000,
        delayMs: 100,
      },
      {
        type: "auto-clipped",
        atMs: 9000,
        ability: "autoShot",
        reason: "range-blocked",
        originalAtMs: 9000,
      },
      {
        type: "auto-fire",
        atMs: 9120,
        ability: "autoShot",
        originalAtMs: 9000,
        delayMs: 120,
      },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.autoDelaySamples).toEqual([
      {
        atMs: 9120,
        delayMs: 120,
        reason: "range-blocked",
        originalAtMs: 9000,
        rescheduledAtMs: 9120,
      },
    ]);
    expect(metrics.autoDelayAverageMs).toBe(120);
    expect(metrics.lastAutoDelayMs).toBe(120);
  });

  it("does not create an Auto delay sample until the clipped Auto Shot fires", () => {
    const events: SimEvent[] = [
      {
        type: "auto-clipped",
        atMs: 3000,
        ability: "autoShot",
        reason: "casting-at-spark",
        originalAtMs: 3000,
      },
    ];

    expect(getTimingMetrics(events).autoDelaySamples).toEqual([]);
  });

  it("creates a zero millisecond Auto delay sample for clean Auto Shot fires", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      {
        type: "auto-clipped",
        atMs: 6000,
        ability: "autoShot",
        reason: "moving",
        originalAtMs: 6000,
      },
      { type: "auto-fire", atMs: 6225, ability: "autoShot", originalAtMs: 6000, delayMs: 225 },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.autoDelaySamples.map((sample) => sample.delayMs)).toEqual([0, 225]);
    expect(metrics.autoDelayAverageMs).toBe(113);
    expect(metrics.lastAutoDelayMs).toBe(225);
  });

  it("builds a weave sample from the previous success through melee to the next cast start", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      { type: "ability-press", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-start", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-complete", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-start", atMs: 3360, ability: "steadyShot" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([
      { startAtMs: 3000, meleeAtMs: 3200, closeAtMs: 3360, durationMs: 360 },
    ]);
    expect(metrics.weaveAverageMs).toBe(360);
  });

  it("closes a weave sample on Auto Shot windup", () => {
    const events: SimEvent[] = [
      { type: "cast-complete", atMs: 1500, ability: "steadyShot" },
      { type: "cast-start", atMs: 1700, ability: "meleeSwing" },
      { type: "cast-complete", atMs: 1700, ability: "meleeSwing" },
      { type: "auto-windup", atMs: 1875, ability: "autoShot" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([
      { startAtMs: 1500, meleeAtMs: 1700, closeAtMs: 1875, durationMs: 375 },
    ]);
    expect(metrics.weaveAverageMs).toBe(375);
  });

  it("starts a weave when a cast completes at the same time melee starts", () => {
    const events: SimEvent[] = [
      { type: "cast-complete", atMs: 3000, ability: "steadyShot" },
      { type: "cast-start", atMs: 3000, ability: "raptorStrike" },
      { type: "cast-complete", atMs: 3000, ability: "raptorStrike" },
      { type: "auto-windup", atMs: 3375, ability: "autoShot" },
    ];

    expect(getTimingMetrics(events).weaveSamples).toEqual([
      { startAtMs: 3000, meleeAtMs: 3000, closeAtMs: 3375, durationMs: 375 },
    ]);
  });

  it("closes a pending weave on instant non-melee cast start before same-time completion starts a new window", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      { type: "cast-start", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-complete", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-start", atMs: 3360, ability: "arcaneShot" },
      { type: "cast-complete", atMs: 3360, ability: "arcaneShot" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([
      { startAtMs: 3000, meleeAtMs: 3200, closeAtMs: 3360, durationMs: 360 },
    ]);
    expect(metrics.weaveAverageMs).toBe(360);
  });

  it("keeps the first successful melee start before the next ranged opener", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      { type: "cast-start", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-start", atMs: 3300, ability: "meleeSwing" },
      { type: "cast-start", atMs: 3400, ability: "steadyShot" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([
      { startAtMs: 3000, meleeAtMs: 3200, closeAtMs: 3400, durationMs: 400 },
    ]);
    expect(metrics.weaveAverageMs).toBe(400);
  });

  it("ignores open weave windows and invalid melee attempts", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      { type: "invalid-input", atMs: 3250, ability: "raptorStrike", reason: "melee-action-not-ready" },
      { type: "ability-press", atMs: 3500, ability: "raptorStrike" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([]);
    expect(metrics.weaveAverageMs).toBeNull();
  });
});
