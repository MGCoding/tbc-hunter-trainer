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
    const preset = getRotationPreset("french-5511");
    expect(preset.rangedWeaponSpeedMs).toBe(3000);
    expect(preset.targetRangedSwingMs).toBeCloseTo(2173.913043478261, 3);
    expect(preset.hasteFactor).toBeCloseTo(1.38, 3);
    expect(preset.meleeHasteFactor).toBeCloseTo(preset.hasteFactor, 3);
    expect(preset.derivedMeleeSwingMs).toBeCloseTo(2536.232, 3);
  });

  it("uses the Diziet source haste profiles for basic turret rotations", () => {
    const sourceProfiles = [
      {
        id: "one-one",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.15,
      },
      {
        id: "one-two",
        rangedHasteFactor: 1.3 * 1.3 * 1.2 * 1.15 * 1.15 * 1.3,
      },
      {
        id: "one-three",
        rangedHasteFactor: 1.3 * 2 * 1.2 * 1.15 * 1.15 * 1.3,
      },
    ];

    for (const sourceProfile of sourceProfiles) {
      const preset = getRotationPreset(sourceProfile.id);
      expect(preset.rangedWeaponSpeedMs).toBe(3000);
      expect(preset.hasteFactor).toBeCloseTo(sourceProfile.rangedHasteFactor, 3);
      expect(preset.targetRangedSwingMs).toBeCloseTo(3000 / sourceProfile.rangedHasteFactor, 3);
    }
  });

  it("uses the Diziet source haste profiles for complex and combined ranged rotations", () => {
    const sourceProfiles = [
      {
        id: "short-french-5411",
        rangedHasteFactor: 1.15,
      },
      {
        id: "french-5511",
        rangedHasteFactor: 1.2 * 1.15,
      },
      {
        id: "long-french-5611",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.15,
      },
      {
        id: "skipping-5911",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.5 * 1.15,
      },
      {
        id: "two-three",
        rangedHasteFactor: 3.25,
      },
      {
        id: "two-five",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.5 * 1.3 * 1.15 * 1.5,
      },
    ];

    for (const sourceProfile of sourceProfiles) {
      const preset = getRotationPreset(sourceProfile.id);
      expect(preset.rangedWeaponSpeedMs).toBe(3000);
      expect(preset.hasteFactor).toBeCloseTo(sourceProfile.rangedHasteFactor, 3);
      expect(preset.targetRangedSwingMs).toBeCloseTo(3000 / sourceProfile.rangedHasteFactor, 3);
    }
  });

  it("uses the Diziet melee-weaving source weapon speeds and separate melee haste factors", () => {
    expect(getRotationPreset("french-5511").rangedWeaponSpeedMs).toBe(3000);

    const sourceProfiles = [
      {
        id: "french-weaving-5511-3w",
        rangedHasteFactor: 1.05 * 1.2 * 1.15,
        meleeHasteFactor: 1.05,
      },
      {
        id: "half-weave-22-1w",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.15,
        meleeHasteFactor: 1.05,
      },
      {
        id: "weaving-6911-3w",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.5,
        meleeHasteFactor: 1.05,
      },
      {
        id: "weaving-61111-3w",
        rangedHasteFactor: 1.05 * 1.2 * 1.15 * 1.15 * 1.5,
        meleeHasteFactor: 1.05,
      },
      {
        id: "weaving-37-2w",
        rangedHasteFactor: 1.3 * 1.55 * 1.2 * 1.15 * 1.15 * 1.3,
        meleeHasteFactor: 1.3 * 1.55,
      },
    ];

    for (const sourceProfile of sourceProfiles) {
      const preset = getRotationPreset(sourceProfile.id);
      expect(preset.rangedWeaponSpeedMs).toBe(2900);
      expect(preset.meleeBaseSwingMs).toBe(3700);
      expect(preset.hasteFactor).toBeCloseTo(sourceProfile.rangedHasteFactor, 3);
      expect(preset.meleeHasteFactor).toBeCloseTo(sourceProfile.meleeHasteFactor, 3);
      expect(preset.targetRangedSwingMs).toBeCloseTo(2900 / sourceProfile.rangedHasteFactor, 3);
      expect(preset.derivedMeleeSwingMs).toBeCloseTo(3700 / sourceProfile.meleeHasteFactor, 3);
    }
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
