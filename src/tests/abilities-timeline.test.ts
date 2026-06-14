import { describe, expect, it } from "vitest";
import { TIMING } from "../data/constants";
import { getRotationPreset, ROTATION_PRESETS } from "../data/rotations";
import { getAbilityTiming } from "../sim/abilities";
import { expandRotationPattern, parseRotationTokens } from "../sim/timeline";
import type { AbilityId, IdealEvent, RotationPreset } from "../sim/types";

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

  it("parses every supported compact rotation token", () => {
    expect(parseRotationTokens("asmAw")).toEqual(["a", "s", "m", "A", "w"]);
  });

  it("alternates French weaving tokens between Raptor Strike and melee swings", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const weaveEvents = expandRotationPattern(preset).filter((event) => event.token === "w");

    expect(weaveEvents.map((event) => event.ability)).toContain("raptorStrike");
    expect(weaveEvents.map((event) => event.ability)).toContain("meleeSwing");
    expect(weaveEvents.every((event) => event.label === "Weave")).toBe(true);
  });

  it("keeps repeated Raptor Strike weave events at least one cooldown apart", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const raptorEvents = expandRotationPattern(preset).filter((event) => event.ability === "raptorStrike");

    for (let index = 1; index < raptorEvents.length; index += 1) {
      expect(raptorEvents[index].idealAtMs - raptorEvents[index - 1].idealAtMs).toBeGreaterThanOrEqual(TIMING.raptorCooldownMs);
    }
  });

  it("keeps repeated weave-related abilities outside their cooldowns for every preset", () => {
    for (const preset of ROTATION_PRESETS) {
      const seenByAbility = new Map<AbilityId, IdealEvent>();

      for (const event of expandRotationPattern(preset)) {
        if (event.ability !== "raptorStrike" && event.ability !== "meleeSwing") {
          continue;
        }

        const cooldownMs = getAbilityTiming(event.ability, preset).cooldownMs;
        const previous = seenByAbility.get(event.ability);

        if (previous && cooldownMs > 0) {
          expect(event.idealAtMs - previous.idealAtMs, describeCooldownFailure(preset, event, previous)).toBeGreaterThanOrEqual(cooldownMs);
        }

        seenByAbility.set(event.ability, event);
      }
    }
  });

  it("throws when parsing unsupported rotation tokens", () => {
    expect(() => parseRotationTokens("asx")).toThrow("Unsupported rotation token: x");
  });
});

function describeCooldownFailure(preset: RotationPreset, event: IdealEvent, previous: IdealEvent): string {
  return `${preset.id} repeats ${event.ability} at indexes ${previous.index} and ${event.index}`;
}
