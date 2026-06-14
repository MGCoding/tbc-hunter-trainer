import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Scene: class {},
    Scale: { Events: { RESIZE: "resize" } },
    Scenes: { Events: { SHUTDOWN: "shutdown" } },
  },
}));

import { calculatePracticeLayout } from "../game/PracticeScene";

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
});
