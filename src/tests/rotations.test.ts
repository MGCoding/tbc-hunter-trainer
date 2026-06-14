import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDS, TIMING } from "../data/constants";
import { ROTATION_PRESETS, getRotationPreset } from "../data/rotations";
import type { KeyBinding, RotationCategory, RotationToken } from "../sim/types";

const SUPPORTED_TOKENS = new Set<RotationToken>(["a", "s", "m", "A", "w"]);
const SUPPORTED_CATEGORIES = new Set<RotationCategory>(["ranged", "weaving"]);
const SOURCE_URL = "https://diziet559.github.io/rotationtools/#melee-weaving";

const keyboardBinding: KeyBinding = { kind: "keyboard", code: "Digit1" };
const mouseBinding: KeyBinding = { kind: "mouse", button: 3 };

// @ts-expect-error keyboard bindings require a code.
const missingKeyboardCode: KeyBinding = { kind: "keyboard" };

// @ts-expect-error keyboard bindings cannot include a mouse button.
const mixedKeyboardBinding: KeyBinding = { kind: "keyboard", code: "Digit1", button: 3 };

// @ts-expect-error mouse bindings require a button.
const missingMouseButton: KeyBinding = { kind: "mouse" };

// @ts-expect-error mouse bindings cannot include a keyboard code.
const mixedMouseBinding: KeyBinding = { kind: "mouse", button: 3, code: "Digit1" };

void [
  keyboardBinding,
  mouseBinding,
  missingKeyboardCode,
  mixedKeyboardBinding,
  missingMouseButton,
  mixedMouseBinding,
];

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
    expect(preset.targetRangedSwingMs).toBeCloseTo(2070.393374741201, 3);
    expect(preset.hasteFactor).toBeCloseTo(1.449, 3);
    expect(preset.derivedMeleeSwingMs).toBeCloseTo(2415.459, 3);
  });

  it("uses only supported rotation pattern tokens", () => {
    for (const preset of ROTATION_PRESETS) {
      for (const token of preset.pattern) {
        expect(SUPPORTED_TOKENS.has(token as RotationToken)).toBe(true);
      }
    }
  });

  it("has unique preset ids", () => {
    const ids = ROTATION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has valid categories, source urls, and positive timing values", () => {
    for (const preset of ROTATION_PRESETS) {
      expect(SUPPORTED_CATEGORIES.has(preset.category)).toBe(true);
      expect(preset.sourceUrl).toBe(SOURCE_URL);
      expect(preset.rangedWeaponSpeedMs).toBeGreaterThan(0);
      expect(preset.targetRangedSwingMs).toBeGreaterThan(0);
      expect(preset.hasteFactor).toBeGreaterThan(0);
      expect(preset.meleeBaseSwingMs).toBeGreaterThan(0);
      expect(preset.derivedMeleeSwingMs).toBeGreaterThan(0);
    }
  });
});
