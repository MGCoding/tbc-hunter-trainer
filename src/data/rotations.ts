import type { RotationPreset } from "../sim/types";

const SOURCE_URL = "https://diziet559.github.io/rotationtools/#melee-weaving";
const DEFAULT_MELEE_BASE_SWING_MS = 3500;
const WEAVING_RANGED_WEAPON_SPEED_MS = 2900;
const WEAVING_MELEE_BASE_SWING_MS = 3700;

type RotationPresetInput = Omit<
  RotationPreset,
  "hasteFactor" | "meleeHasteFactor" | "derivedMeleeSwingMs" | "sourceUrl" | "meleeBaseSwingMs"
> & {
  meleeBaseSwingMs?: number;
  meleeHasteFactor?: number;
};

function preset(input: RotationPresetInput): RotationPreset {
  const hasteFactor = input.rangedWeaponSpeedMs / input.targetRangedSwingMs;
  const meleeBaseSwingMs = input.meleeBaseSwingMs ?? DEFAULT_MELEE_BASE_SWING_MS;
  const meleeHasteFactor = input.meleeHasteFactor ?? hasteFactor;
  return {
    ...input,
    sourceUrl: SOURCE_URL,
    meleeBaseSwingMs,
    hasteFactor,
    meleeHasteFactor,
    derivedMeleeSwingMs: meleeBaseSwingMs / meleeHasteFactor,
  };
}

export const ROTATION_PRESETS: RotationPreset[] = [
  preset({
    id: "one-one",
    name: "1:1",
    category: "ranged",
    pattern: "as",
    usage: "Simple Auto Shot then Steady Shot rhythm.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.15),
  }),
  preset({
    id: "one-two",
    name: "1:2",
    category: "ranged",
    pattern: "asa",
    usage: "One Steady Shot across two Auto Shots.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.3 * 1.3 * 1.2 * 1.15 * 1.15 * 1.3),
  }),
  preset({
    id: "one-three",
    name: "1:3",
    category: "ranged",
    pattern: "asaa",
    usage: "One Steady Shot across three Auto Shots.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.3 * 2 * 1.2 * 1.15 * 1.15 * 1.3),
  }),
  preset({
    id: "short-french-5411",
    name: "5:4:1:1",
    category: "ranged",
    pattern: "asmasasAass",
    usage: "Short French rotation for survival haste ranges.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 1.15,
  }),
  preset({
    id: "french-5511",
    name: "5:5:1:1",
    category: "ranged",
    pattern: "asmasasAasas",
    usage: "Standard French rotation.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 1.38,
  }),
  preset({
    id: "long-french-5611",
    name: "5:6:1:1",
    category: "ranged",
    pattern: "asAamasasasas",
    usage: "Long French rotation for Aspect of the Hawk haste ranges.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.15),
  }),
  preset({
    id: "skipping-5911",
    name: "5:9:1:1",
    category: "ranged",
    pattern: "asasasamaasasaAa",
    usage: "Skipping rotation for high ranged haste.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.5 * 1.15),
  }),
  preset({
    id: "two-three",
    name: "2:3",
    category: "ranged",
    pattern: "saasa",
    usage: "Combined 1:1 and 1:2 rhythm.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 3.25,
  }),
  preset({
    id: "two-five",
    name: "2:5",
    category: "ranged",
    pattern: "saaasaa",
    usage: "High haste combined rhythm.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.5 * 1.3 * 1.15 * 1.5),
  }),
  preset({
    id: "french-weaving-5511-3w",
    name: "5:5:1:1 3w - French weaving",
    category: "weaving",
    pattern: "asmawsaswasAaws",
    usage: "Use with no haste effect other than Drums of Battle. Weaves alternate Raptor Strike and melee white hits.",
    rangedWeaponSpeedMs: WEAVING_RANGED_WEAPON_SPEED_MS,
    targetRangedSwingMs: WEAVING_RANGED_WEAPON_SPEED_MS / (1.05 * 1.2 * 1.15),
    meleeBaseSwingMs: WEAVING_MELEE_BASE_SWING_MS,
    meleeHasteFactor: 1.05,
  }),
  preset({
    id: "half-weave-22-1w",
    name: "2:2 1w - 1:1 half-weave",
    category: "weaving",
    pattern: "asasw",
    usage: "Use with improved Aspect, DST, or Bloodlust haste ranges.",
    rangedWeaponSpeedMs: WEAVING_RANGED_WEAPON_SPEED_MS,
    targetRangedSwingMs: WEAVING_RANGED_WEAPON_SPEED_MS / (1.05 * 1.2 * 1.15 * 1.15),
    meleeBaseSwingMs: WEAVING_MELEE_BASE_SWING_MS,
    meleeHasteFactor: 1.05,
  }),
  preset({
    id: "weaving-6911-3w",
    name: "6:9:1:1 3w",
    category: "weaving",
    pattern: "asamwasasawsasasawAa",
    usage: "Use with Rapid Fire or similar high ranged haste.",
    rangedWeaponSpeedMs: WEAVING_RANGED_WEAPON_SPEED_MS,
    targetRangedSwingMs: WEAVING_RANGED_WEAPON_SPEED_MS / (1.05 * 1.2 * 1.15 * 1.5),
    meleeBaseSwingMs: WEAVING_MELEE_BASE_SWING_MS,
    meleeHasteFactor: 1.05,
  }),
  preset({
    id: "weaving-61111-3w",
    name: "6:11:1:1 3w",
    category: "weaving",
    pattern: "asawsasamawasasaAawasa",
    usage: "Use with Rapid Fire plus improved Aspect or Bloodlust haste ranges.",
    rangedWeaponSpeedMs: WEAVING_RANGED_WEAPON_SPEED_MS,
    targetRangedSwingMs: WEAVING_RANGED_WEAPON_SPEED_MS / (1.05 * 1.2 * 1.15 * 1.15 * 1.5),
    meleeBaseSwingMs: WEAVING_MELEE_BASE_SWING_MS,
    meleeHasteFactor: 1.05,
  }),
  preset({
    id: "weaving-37-2w",
    name: "3:7 2w",
    category: "weaving",
    pattern: "awasaawasaas",
    usage: "Maximum haste weaving rotation; example drawn for very low effective weapon speed.",
    rangedWeaponSpeedMs: WEAVING_RANGED_WEAPON_SPEED_MS,
    targetRangedSwingMs: WEAVING_RANGED_WEAPON_SPEED_MS / (1.3 * 1.55 * 1.2 * 1.15 * 1.15 * 1.3),
    meleeBaseSwingMs: WEAVING_MELEE_BASE_SWING_MS,
    meleeHasteFactor: 1.3 * 1.55,
  }),
];

export function getRotationPreset(id: string): RotationPreset {
  const preset = ROTATION_PRESETS.find((rotation) => rotation.id === id);
  if (!preset) {
    throw new Error(`Unknown rotation preset: ${id}`);
  }
  return preset;
}
