import { TIMING } from "../data/constants";
import type { AbilityId, AbilityTiming, RotationPreset } from "./types";

export function getAbilityTiming(ability: AbilityId, preset: RotationPreset): AbilityTiming {
  const hastedSteady = TIMING.steadyBaseCastMs / preset.hasteFactor;
  const hastedMulti = TIMING.multiBaseCastMs / preset.hasteFactor;

  const table: Record<AbilityId, AbilityTiming> = {
    autoShot: {
      ability: "autoShot",
      castMs: TIMING.autoWindupMs / preset.hasteFactor,
      cooldownMs: preset.targetRangedSwingMs,
      usesGcd: false,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: true,
    },
    steadyShot: {
      ability: "steadyShot",
      castMs: hastedSteady,
      cooldownMs: 0,
      usesGcd: true,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: false,
    },
    multiShot: {
      ability: "multiShot",
      castMs: hastedMulti,
      cooldownMs: TIMING.multiCooldownMs,
      usesGcd: true,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: false,
    },
    arcaneShot: {
      ability: "arcaneShot",
      castMs: 0,
      cooldownMs: TIMING.arcaneCooldownMs,
      usesGcd: true,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: false,
    },
    killCommand: {
      ability: "killCommand",
      castMs: 0,
      cooldownMs: TIMING.killCommandCooldownMs,
      usesGcd: false,
      requiresMelee: false,
      requiresRanged: false,
      offGcd: true,
    },
    raptorStrike: {
      ability: "raptorStrike",
      castMs: 0,
      cooldownMs: TIMING.raptorCooldownMs,
      usesGcd: false,
      requiresMelee: true,
      requiresRanged: false,
      offGcd: true,
    },
    meleeSwing: {
      ability: "meleeSwing",
      castMs: 0,
      cooldownMs: preset.derivedMeleeSwingMs,
      usesGcd: false,
      requiresMelee: true,
      requiresRanged: false,
      offGcd: true,
    },
  };

  return table[ability];
}
