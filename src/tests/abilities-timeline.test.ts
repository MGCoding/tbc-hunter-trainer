import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { getAbilityTiming } from "../sim/abilities";
import { expandRotationPattern } from "../sim/timeline";

describe("abilities and timelines", () => {
  it("applies haste to Steady Shot and Multi-Shot casts", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    expect(getAbilityTiming("steadyShot", preset).castMs).toBeCloseTo(1500 / preset.hasteFactor);
    expect(getAbilityTiming("multiShot", preset).castMs).toBeCloseTo(500 / preset.hasteFactor);
    expect(getAbilityTiming("arcaneShot", preset).castMs).toBe(0);
  });

  it("expands compact Diziet pattern tokens into ability events", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const events = expandRotationPattern(preset);
    expect(events.map((event) => event.ability).slice(0, 5)).toEqual([
      "autoShot",
      "steadyShot",
      "multiShot",
      "autoShot",
      "meleeSwing",
    ]);
    expect(events[0].idealAtMs).toBe(0);
    expect(events[1].idealAtMs).toBeGreaterThan(0);
  });
});
