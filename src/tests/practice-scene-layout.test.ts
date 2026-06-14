import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Scene: class {},
    Scale: { Events: { RESIZE: "resize" } },
    Scenes: { Events: { SHUTDOWN: "shutdown" } },
  },
}));

import { calculatePracticeLayout } from "../game/PracticeScene";

describe("PracticeScene layout", () => {
  it("keeps the target and HUD stack visible on mobile portrait surfaces", () => {
    const layout = calculatePracticeLayout(390, 439);

    expect(layout.targetY).toBeGreaterThanOrEqual(-439 / 2 + layout.targetRadius + 16);
    expect(layout.hud.top).toBeGreaterThanOrEqual(0);
    expect(layout.hud.top + layout.hud.totalHeight).toBeLessThanOrEqual(439 - 8);
  });

  it("keeps compact HUD bars inside short landscape surfaces", () => {
    const layout = calculatePracticeLayout(844, 203);

    expect(layout.hud.width).toBeLessThan(260);
    expect(layout.hud.top).toBeGreaterThanOrEqual(0);
    expect(layout.hud.top + layout.hud.totalHeight).toBeLessThanOrEqual(203 - 8);
  });

  it("caps yard scale on desktop-sized practice fields", () => {
    const layout = calculatePracticeLayout(900, 800);

    expect(layout.yardPx).toBe(34);
  });
});
