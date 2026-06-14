import { describe, expect, it } from "vitest";
import { getRotationPreset, ROTATION_PRESETS } from "../data/rotations";
import { scoreEvents } from "../sim/scoring";
import { createSimulator } from "../sim/simulator";
import { expandRotationPattern, parseRotationTokens } from "../sim/timeline";
import type { AbilityId, IdealEvent, RotationPreset, RotationToken, SimEvent } from "../sim/types";

function toPerfectEvents(ideal: IdealEvent[]): SimEvent[] {
  return ideal.map((event) => ({
    type: event.ability === "autoShot" ? "auto-fire" : "cast-start",
    atMs: event.idealAtMs,
    ability: event.ability,
  }));
}

const TOKEN_TO_ACTION: Record<Exclude<RotationToken, "a" | "w">, AbilityId> = {
  s: "steadyShot",
  m: "multiShot",
  A: "arcaneShot",
};

function drivePresetThroughSimulator(preset: RotationPreset): SimEvent[] {
  const sim = createSimulator(preset);

  for (const token of parseRotationTokens(preset.pattern)) {
    if (token === "a") {
      const autoCount = sim.getLog().filter((event) => event.type === "auto-fire").length;
      while (sim.getLog().filter((event) => event.type === "auto-fire").length === autoCount) {
        sim.tick(sim.getState().nextAutoAtMs);
      }
      continue;
    }

    const state = sim.getState();
    if (token === "w") {
      const atMs = Math.max(state.nowMs, Math.min(state.raptorReadyAtMs, state.nextMeleeAtMs));
      sim.pressAbility("raptorStrike", atMs);
      continue;
    }

    sim.pressAbility(TOKEN_TO_ACTION[token], Math.max(state.nowMs, state.gcdReadyAtMs));
  }

  return sim.getLog();
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

  it("penalizes melee actions pressed before Raptor or white swing is ready", () => {
    const result = scoreEvents([], [
      { type: "invalid-input", atMs: 1000, ability: "raptorStrike", reason: "melee-action-not-ready" },
    ]);

    expect(result.efficiency).toBeLessThan(100);
    expect(result.mistakes.map((mistake) => mistake.label)).toContain("Melee action not ready");
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

  it("matches the first ideal Auto Shot against simulator auto-fire output", () => {
    const preset = getRotationPreset("one-one");
    const ideal = expandRotationPattern(preset);
    const sim = createSimulator(preset);

    sim.tick(preset.targetRangedSwingMs);
    const result = scoreEvents(ideal.slice(0, 1), sim.getLog());

    expect(sim.getLog()).toContainEqual({ type: "auto-fire", atMs: ideal[0].idealAtMs, ability: "autoShot" });
    expect(result.mistakes).toEqual([]);
    expect(result.efficiency).toBe(100);
  });

  it("scores weaving timelines with Raptor Strike and melee swings", () => {
    const ideal = expandRotationPattern(getRotationPreset("french-weaving-5511-3w"));
    const abilities = ideal.map((event) => event.ability);

    expect(abilities).toContain("raptorStrike");
    expect(abilities).toContain("meleeSwing");
    expect(scoreEvents(ideal, toPerfectEvents(ideal)).efficiency).toBe(100);
  });

  it("scores simulator melee-action logs against ideal weave events", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const idealRaptor = ideal.find((event) => event.ability === "raptorStrike")!;
    const idealMelee = ideal.find((event) => event.ability === "meleeSwing")!;
    const sim = createSimulator(preset);

    sim.pressAbility("raptorStrike", idealRaptor.idealAtMs);
    sim.pressAbility("raptorStrike", idealMelee.idealAtMs);

    const result = scoreEvents(
      [idealRaptor, idealMelee],
      sim.getLog().filter((event) => event.type === "cast-start"),
    );

    expect(result.mistakes).toEqual([]);
    expect(result.efficiency).toBe(100);
  });

  it("scores simulator-driven playback for every preset without timeline mistakes", () => {
    for (const preset of ROTATION_PRESETS) {
      const ideal = expandRotationPattern(preset);
      const result = scoreEvents(ideal, drivePresetThroughSimulator(preset));

      expect(result.mistakes, preset.id).toEqual([]);
      expect(result.efficiency, preset.id).toBe(100);
    }
  });

  it("matches delayed Auto Shots after Multi-Shot clipping", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const log = drivePresetThroughSimulator(preset);
    const clippedAuto = log.find((event) => event.type === "auto-clipped" && event.ability === "autoShot");
    const delayedAuto = log.find(
      (event) => event.type === "auto-fire" && clippedAuto !== undefined && event.atMs > clippedAuto.atMs,
    );

    expect(clippedAuto).toBeDefined();
    expect(delayedAuto).toBeDefined();
    expect(ideal.some((event) => event.ability === "autoShot" && event.idealAtMs === delayedAuto!.atMs)).toBe(true);
    expect(scoreEvents(ideal, log).mistakes).toEqual([]);
  });
});
