import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { scoreEvents } from "../sim/scoring";
import { expandRotationPattern } from "../sim/timeline";
import type { SimEvent } from "../sim/types";

describe("scoring", () => {
  it("scores perfect exact timeline inputs at 100", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = ideal.map((event) => ({
      type: "cast-start",
      atMs: event.idealAtMs,
      ability: event.ability,
    }));
    expect(scoreEvents(ideal, events).efficiency).toBe(100);
  });

  it("penalizes late, wrong, clipped, and invalid actions", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = [
      { type: "cast-start", atMs: ideal[0].idealAtMs + 250, ability: ideal[0].ability },
      { type: "cast-start", atMs: ideal[1].idealAtMs, ability: "arcaneShot" },
      { type: "auto-clipped", atMs: 2000, ability: "autoShot" },
      { type: "invalid-input", atMs: 2100, ability: "killCommand", reason: "kill-command-during-steady" },
    ];
    const result = scoreEvents(ideal, events);
    expect(result.efficiency).toBeLessThan(100);
    expect(result.mistakes.map((mistake) => mistake.label)).toContain("Auto clipped");
    expect(result.mistakes.map((mistake) => mistake.label)).toContain("Invalid Kill Command");
  });

  it("scores chronological raw event arrays by relevant event time", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = [
      { type: "cast-start", atMs: ideal[1].idealAtMs, ability: ideal[1].ability },
      { type: "ability-press", atMs: ideal[0].idealAtMs - 50, ability: ideal[0].ability },
      { type: "auto-fire", atMs: ideal[0].idealAtMs, ability: ideal[0].ability },
    ];

    expect(scoreEvents(ideal.slice(0, 2), events).efficiency).toBe(100);
  });
});
