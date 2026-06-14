import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDS, TIMING } from "../data/constants";
import { ROTATION_PRESETS, getRotationPreset } from "../data/rotations";

describe("rotation presets", () => {
  it("includes ranged-only and melee-weaving rotations from the design", () => {
    expect(ROTATION_PRESETS.some((preset) => preset.category === "ranged")).toBe(true);
    expect(ROTATION_PRESETS.some((preset) => preset.category === "weaving")).toBe(true);
    expect(getRotationPreset("french-weaving-5511-3w").pattern).toBe("asmawsaswasAaws");
    expect(getRotationPreset("one-one").pattern).toBe("as");
  });

  it("uses approved default keybindings and timing constants", () => {
    expect(TIMING.gcdMs).toBe(1500);
    expect(TIMING.spellQueueWindowMs).toBe(100);
    expect(TIMING.noMoveNoCastLeadMs).toBe(500);
    expect(DEFAULT_KEYBINDS.arcaneShot).toEqual({ kind: "keyboard", code: "Digit1" });
    expect(DEFAULT_KEYBINDS.killCommand).toEqual({ kind: "keyboard", code: "Digit2" });
    expect(DEFAULT_KEYBINDS.raptorStrike).toEqual({ kind: "mouse", button: 3 });
  });

  it("derives haste factor from ranged weapon speed and target effective speed", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    expect(preset.rangedWeaponSpeedMs).toBe(3000);
    expect(preset.targetRangedSwingMs).toBeCloseTo(2173.913, 3);
    expect(preset.hasteFactor).toBeCloseTo(1.38, 3);
    expect(preset.derivedMeleeSwingMs).toBeCloseTo(2536.232, 3);
  });
});
