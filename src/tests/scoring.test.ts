import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { scoreEvents } from "../sim/scoring";
import { expandRotationPattern } from "../sim/timeline";
import type { IdealEvent, SimEvent } from "../sim/types";

function toPerfectEvents(ideal: IdealEvent[]): SimEvent[] {
  return ideal.map((event) => ({
    type: event.ability === "autoShot" ? "auto-fire" : "cast-start",
    atMs: event.idealAtMs,
    ability: event.ability,
  }));
}

describe("scoring", () => {
  it("scores perfect exact timeline inputs at 100", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events = toPerfectEvents(ideal);
    expect(scoreEvents(ideal, events).efficiency).toBe(100);
  });

  it("penalizes late, wrong, clipped, and invalid actions", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: ideal[0].idealAtMs + 250, ability: ideal[0].ability },
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

  it("penalizes extra scoring events after the ideal sequence", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = [
      ...toPerfectEvents(ideal),
      { type: "cast-start", atMs: ideal.at(-1)!.idealAtMs + 500, ability: "arcaneShot" },
    ];

    const result = scoreEvents(ideal, events);

    expect(result.efficiency).toBeLessThan(100);
    expect(result.mistakes.map((mistake) => mistake.label)).toContain("Unexpected arcaneShot");
  });

  it("does not advance nextExpected for wrong scoring events", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const result = scoreEvents(ideal, [{ type: "cast-start", atMs: ideal[0].idealAtMs, ability: "arcaneShot" }]);

    expect(result.efficiency).toBeLessThan(100);
    expect(result.nextExpected).toBe(ideal[0]);
  });

  it("uses auto-fire instead of cast-start for Auto Shot matching", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = [
      { type: "cast-start", atMs: ideal[0].idealAtMs - 250, ability: "autoShot" },
      { type: "auto-fire", atMs: ideal[0].idealAtMs, ability: "autoShot" },
      { type: "cast-start", atMs: ideal[1].idealAtMs, ability: ideal[1].ability },
    ];

    expect(scoreEvents(ideal, events).efficiency).toBe(100);
  });

  it("scores weaving timelines with Raptor Strike and melee swings", () => {
    const ideal = expandRotationPattern(getRotationPreset("french-weaving-5511-3w"));
    const abilities = ideal.map((event) => event.ability);

    expect(abilities).toContain("raptorStrike");
    expect(abilities).toContain("meleeSwing");
    expect(scoreEvents(ideal, toPerfectEvents(ideal)).efficiency).toBe(100);
  });
});
