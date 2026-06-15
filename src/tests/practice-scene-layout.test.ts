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
  canDrawPracticeField,
  getAbilityIconViews,
  getCastBarDisplay,
  getMeleeBarColor,
  getPracticeGridStep,
  WOWHEAD_ICON_BASE_URL,
} from "../game/PracticeScene";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { getRotationPreset } from "../data/rotations";
import type { SimulatorState } from "../sim/types";

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
});
