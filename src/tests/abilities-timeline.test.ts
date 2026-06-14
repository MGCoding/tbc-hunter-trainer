import { describe, expect, it } from "vitest";
import { TIMING } from "../data/constants";
import { getRotationPreset } from "../data/rotations";
import { getAbilityTiming } from "../sim/abilities";
import { expandRotationPattern, parseRotationTokens } from "../sim/timeline";
import type { AbilityId } from "../sim/types";

describe("abilities and timelines", () => {
  const abilityIds: AbilityId[] = [
    "autoShot",
    "steadyShot",
    "multiShot",
    "arcaneShot",
    "killCommand",
    "raptorStrike",
    "meleeSwing",
  ];

  it("returns self-describing timing metadata for every ability", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");

    for (const abilityId of abilityIds) {
      expect(getAbilityTiming(abilityId, preset).ability).toBe(abilityId);
    }
  });

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
      "raptorStrike",
    ]);
    expect(events[0].idealAtMs).toBe(0);
    expect(events[1].idealAtMs).toBeGreaterThan(0);
  });

  it("keeps GCD abilities at least one global cooldown apart", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const events = expandRotationPattern(preset);
    const steady = events.find((event) => event.ability === "steadyShot");
    const multi = events.find((event) => event.ability === "multiShot");

    expect(steady).toBeDefined();
    expect(multi).toBeDefined();
    expect(multi!.idealAtMs - steady!.idealAtMs).toBeGreaterThanOrEqual(TIMING.gcdMs);
  });

  it("expands every compact token to the expected ability", () => {
    const preset = {
      ...getRotationPreset("french-weaving-5511-3w"),
      pattern: "asmAw",
    };

    expect(expandRotationPattern(preset).map((event) => event.ability)).toEqual([
      "autoShot",
      "steadyShot",
      "multiShot",
      "arcaneShot",
      "raptorStrike",
    ]);
  });

  it("throws when parsing unsupported rotation tokens", () => {
    expect(() => parseRotationTokens("asx")).toThrow("Unsupported rotation token: x");
  });
});
