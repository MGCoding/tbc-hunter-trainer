import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Scene: class {},
    Scale: { Events: { RESIZE: "resize" } },
    Scenes: { Events: { SHUTDOWN: "shutdown" } },
  },
}));

import {
  calculatePracticeLayout,
  calculateTimelineRailLayout,
  canDrawPracticeField,
  getAbilityIconViews,
  getCastBarDisplay,
  getMeleeBarColor,
  getPracticeGridStep,
  getTimelineEventX,
  getTimelineEventY,
  getTimelineIconViews,
  getTimelineMarkerY,
  WOWHEAD_ICON_BASE_URL,
} from "../game/PracticeScene";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { getRotationPreset } from "../data/rotations";
import { expandRotationPattern, getRotationPatternDurationMs } from "../sim/timeline";
import type { IdealEvent, SimulatorState } from "../sim/types";

function expectTargetAndHudVisible(width: number, height: number, margin: number): void {
  const layout = calculatePracticeLayout(width, height);

  expect(layout.targetY - layout.targetRadius).toBeGreaterThanOrEqual(-height / 2 + margin);
  expect(layout.hud.top).toBeGreaterThanOrEqual(0);
  expect(layout.hud.top + layout.hud.totalHeight).toBeLessThanOrEqual(height - margin);
}

function expectMaxRangedRingVisible(width: number, height: number, margin: number): void {
  const layout = calculatePracticeLayout(width, height);

  expect(layout.maxRangedRingRadius).toBeLessThanOrEqual(Math.min(width, height) / 2 - margin);
}

describe("PracticeScene layout", () => {
  const hiddenTimelineRailLayout = {
    visible: false,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    iconSize: 0,
    iconGap: 0,
    markerWidth: 0,
    visibleEvents: 0,
  };

  it("keeps the target and HUD stack visible on mobile portrait surfaces", () => {
    expectTargetAndHudVisible(390, 439, 8);
    expectMaxRangedRingVisible(390, 439, 8);
  });

  it("keeps compact HUD bars inside short landscape surfaces at CSS-derived height", () => {
    const height = Math.round(390 * 0.7);
    const layout = calculatePracticeLayout(844, height);

    expect(layout.hud.width).toBeLessThan(260);
    expectTargetAndHudVisible(844, height, 8);
    expectMaxRangedRingVisible(844, height, 8);
  });

  it("keeps the target circle visible on tiny canvases", () => {
    expectTargetAndHudVisible(844, Math.round(203 * 0.52), 4);
    expectMaxRangedRingVisible(844, Math.round(203 * 0.52), 4);
  });

  it("keeps the maximum ranged ring visible on desktop-sized practice fields", () => {
    expectMaxRangedRingVisible(900, 800, 16);
  });

  it("marks zero-size fields unsafe for grid drawing", () => {
    const layout = calculatePracticeLayout(0, 0);

    expect(getPracticeGridStep(layout)).toBe(0);
    expect(canDrawPracticeField(0, 0, layout)).toBe(false);
  });

  it("places ability icons below the timing bars inside the HUD stack", () => {
    const layout = calculatePracticeLayout(900, 800);
    const rangedBottom = layout.hud.top + layout.hud.castHeight + layout.hud.gap + layout.hud.barHeight + layout.hud.gap + layout.hud.barHeight;

    expect(layout.hud.iconTop).toBeGreaterThan(rangedBottom);
    expect(layout.hud.iconTop + layout.hud.iconSize).toBeLessThanOrEqual(layout.hud.top + layout.hud.totalHeight);
  });

  it("pins the timeline rail to the right side and above the bottom HUD when space allows", () => {
    const layout = calculatePracticeLayout(900, 800);
    const rail = calculateTimelineRailLayout(900, 800, 12);

    expect(rail.visible).toBe(true);
    expect(rail.left + rail.width).toBeLessThanOrEqual(900 - 12);
    expect(rail.top).toBeGreaterThanOrEqual(12);
    expect(rail.top + rail.height).toBeLessThanOrEqual(layout.hud.top - 8);
    expect(rail.visibleEvents).toBe(12);
  });

  it("shrinks the timeline rail to show as many events as possible on short fields", () => {
    const rail = calculateTimelineRailLayout(390, 273, 24);

    expect(rail.visible).toBe(true);
    expect(rail.iconSize).toBeGreaterThanOrEqual(18);
    expect(rail.visibleEvents).toBeGreaterThan(0);
    expect(rail.visibleEvents).toBeLessThanOrEqual(24);
  });

  it("hides the timeline rail when there are no ideal events", () => {
    expect(calculateTimelineRailLayout(900, 800, 0).visible).toBe(false);
  });

  it("hides the timeline rail with a zeroed layout for non-finite dimensions", () => {
    expect(calculateTimelineRailLayout(Number.NaN, 800, 12)).toEqual(hiddenTimelineRailLayout);
  });

  it("hides the timeline rail with a zeroed layout when the viewport is too narrow", () => {
    expect(calculateTimelineRailLayout(50, 800, 12)).toEqual(hiddenTimelineRailLayout);
  });

  it("hides the timeline rail with a zeroed layout when the viewport is too short", () => {
    expect(calculateTimelineRailLayout(900, 10, 12)).toEqual(hiddenTimelineRailLayout);
  });

  it("builds timeline icon views for Auto, spell, Raptor, and white melee events", () => {
    const ideal: IdealEvent[] = [
      { index: 0, token: "a", ability: "autoShot", idealAtMs: 1000, label: "Auto" },
      { index: 1, token: "s", ability: "steadyShot", idealAtMs: 1500, label: "Steady" },
      { index: 2, token: "w", ability: "raptorStrike", idealAtMs: 3000, label: "Weave" },
      { index: 3, token: "w", ability: "meleeSwing", idealAtMs: 6500, label: "Weave" },
    ];

    const views = getTimelineIconViews(ideal);

    expect(views.map((view) => view.ability)).toEqual(["autoShot", "steadyShot", "raptorStrike", "meleeSwing"]);
    expect(views[3]).toMatchObject({
      ability: "meleeSwing",
      usesNeutralMeleeTint: true,
    });
    expect(views[0].iconKey).toBe("ability-icon-autoShot");
  });

  it("maps live session time to a looping timeline marker y position", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const rail = calculateTimelineRailLayout(900, 800, ideal.length);
    const firstEvent = ideal[0];
    const firstEventY = rail.top + rail.iconSize / 2;

    expect(getTimelineMarkerY(rail, ideal, firstEvent.idealAtMs)).toBeCloseTo(firstEventY);
    expect(getTimelineMarkerY(rail, ideal, getRotationPatternDurationMs(ideal) + firstEvent.idealAtMs)).toBeCloseTo(firstEventY);
  });

  it("positions timeline icons by ideal event time rather than equal index spacing", () => {
    const ideal: IdealEvent[] = [
      { index: 0, token: "a", ability: "autoShot", idealAtMs: 1000, label: "Auto" },
      { index: 1, token: "s", ability: "steadyShot", idealAtMs: 1200, label: "Steady" },
      { index: 2, token: "m", ability: "multiShot", idealAtMs: 5000, label: "Multi" },
    ];
    const rail = calculateTimelineRailLayout(900, 800, ideal.length);
    const firstGap = getTimelineEventY(rail, ideal, ideal[1]) - getTimelineEventY(rail, ideal, ideal[0]);
    const secondGap = getTimelineEventY(rail, ideal, ideal[2]) - getTimelineEventY(rail, ideal, ideal[1]);

    expect(firstGap).toBeLessThan(secondGap);
  });

  it("spreads timeline icons with identical ideal times horizontally", () => {
    const ideal: IdealEvent[] = [
      { index: 0, token: "a", ability: "autoShot", idealAtMs: 1000, label: "Auto" },
      { index: 1, token: "s", ability: "steadyShot", idealAtMs: 1000, label: "Steady" },
    ];
    const rail = calculateTimelineRailLayout(900, 800, ideal.length);

    expect(getTimelineEventY(rail, ideal, ideal[0])).toBe(getTimelineEventY(rail, ideal, ideal[1]));
    expect(getTimelineEventX(rail, ideal, ideal[0])).not.toBe(getTimelineEventX(rail, ideal, ideal[1]));
  });

  it("turns the melee bar green only while in melee range", () => {
    expect(getMeleeBarColor({ distanceYards: 2, canMelee: true, canUseRanged: false })).toBe(0x7fd1a8);
    expect(getMeleeBarColor({ distanceYards: 2.01, canMelee: false, canUseRanged: true })).toBe(0xd9664f);
  });

  it("shows auto-shot windup in the cast bar when no spell cast is active", () => {
    const preset = getRotationPreset("one-one");
    const autoWindupMs = 500 / preset.hasteFactor;
    const state: SimulatorState = {
      nowMs: preset.targetRangedSwingMs - autoWindupMs / 2,
      gcdReadyAtMs: 0,
      nextAutoAtMs: preset.targetRangedSwingMs,
      nextMeleeAtMs: preset.derivedMeleeSwingMs,
      raptorReadyAtMs: 0,
      activeCast: null,
      queuedAbility: null,
    };

    expect(getCastBarDisplay(state, preset)).toEqual({
      ability: "autoShot",
      startedAtMs: preset.targetRangedSwingMs - autoWindupMs,
      completesAtMs: preset.targetRangedSwingMs,
    });
  });

  it("lets active spell casts overwrite auto-shot windup in the cast bar", () => {
    const preset = getRotationPreset("one-one");
    const state: SimulatorState = {
      nowMs: preset.targetRangedSwingMs - 100,
      gcdReadyAtMs: 0,
      nextAutoAtMs: preset.targetRangedSwingMs,
      nextMeleeAtMs: preset.derivedMeleeSwingMs,
      raptorReadyAtMs: 0,
      activeCast: { ability: "steadyShot", startedAtMs: 900, completesAtMs: 1900 },
      queuedAbility: null,
    };

    expect(getCastBarDisplay(state, preset)).toEqual(state.activeCast);
  });

  it("builds ability icon views with Wowhead icons, cooldown labels, and hotkeys", () => {
    const preset = getRotationPreset("one-one");
    const state: SimulatorState = {
      nowMs: 1000,
      gcdReadyAtMs: 0,
      nextAutoAtMs: 3000,
      nextMeleeAtMs: 500,
      raptorReadyAtMs: 0,
      activeCast: null,
      queuedAbility: null,
      autoPaused: false,
      abilityReadyAtMs: {
        arcaneShot: 5200,
        multiShot: 10_000,
        killCommand: 1000,
      },
    };

    const views = getAbilityIconViews(state, preset, DEFAULT_KEYBINDS);

    expect(views).toHaveLength(6);
    expect(views[0]).toMatchObject({
      action: "arcaneShot",
      hotkey: "1",
      cooldownLabel: "4.2",
      isReady: false,
      iconUrl: `${WOWHEAD_ICON_BASE_URL}ability_impalingbolt.jpg`,
    });
    expect(views.find((view) => view.action === "steadyShot")).toMatchObject({
      hotkey: "4",
      cooldownLabel: "",
      isReady: true,
      iconUrl: `${WOWHEAD_ICON_BASE_URL}ability_hunter_steadyshot.jpg`,
    });
    expect(views.find((view) => view.action === "autoShot")).toMatchObject({
      hotkey: "V",
      cooldownLabel: "2.0",
      isReady: false,
      iconUrl: `${WOWHEAD_ICON_BASE_URL}ability_whirlwind.jpg`,
    });
  });

  it("marks Auto Shot unavailable while paused until the hotkey restarts it", () => {
    const preset = getRotationPreset("one-one");
    const state: SimulatorState = {
      nowMs: 3000,
      gcdReadyAtMs: 0,
      nextAutoAtMs: 2000,
      nextMeleeAtMs: preset.derivedMeleeSwingMs,
      raptorReadyAtMs: 0,
      activeCast: null,
      queuedAbility: null,
      autoPaused: true,
    };

    expect(getAbilityIconViews(state, preset, DEFAULT_KEYBINDS).find((view) => view.action === "autoShot")).toMatchObject({
      cooldownLabel: "Paused",
      isReady: false,
    });
  });

  it("shows Raptor Strike waiting for the melee swing even when Raptor cooldown is ready", () => {
    const preset = getRotationPreset("one-one");
    const state: SimulatorState = {
      nowMs: 1000,
      gcdReadyAtMs: 0,
      nextAutoAtMs: 3000,
      nextMeleeAtMs: 1500,
      raptorReadyAtMs: 0,
      activeCast: null,
      queuedAbility: null,
      autoPaused: false,
    };

    expect(getAbilityIconViews(state, preset, DEFAULT_KEYBINDS).find((view) => view.action === "raptorStrike")).toMatchObject({
      cooldownLabel: "0.5",
      isReady: false,
    });
  });
});
