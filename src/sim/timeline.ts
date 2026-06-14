import { TIMING } from "../data/constants";
import { getAbilityTiming } from "./abilities";
import type { AbilityId, IdealEvent, RotationPreset, RotationToken } from "./types";

const TOKEN_TO_ABILITY: Record<RotationToken, AbilityId> = {
  a: "autoShot",
  s: "steadyShot",
  m: "multiShot",
  A: "arcaneShot",
  w: "raptorStrike",
};

const TOKEN_TO_LABEL: Record<RotationToken, string> = {
  a: "Auto",
  s: "Steady",
  m: "Multi",
  A: "Arcane",
  w: "Weave",
};

export function parseRotationTokens(pattern: string): RotationToken[] {
  return pattern.split("").map((token) => {
    if (!["a", "s", "m", "A", "w"].includes(token)) {
      throw new Error(`Unsupported rotation token: ${token}`);
    }
    return token as RotationToken;
  });
}

export function expandRotationPattern(preset: RotationPreset): IdealEvent[] {
  let currentMs = 0;
  let gcdReadyAt = 0;
  let nextAutoAt = 0;
  let raptorReadyAt = 0;
  let meleeReadyAt = 0;

  return parseRotationTokens(preset.pattern).map((token, index) => {
    let ability = TOKEN_TO_ABILITY[token];
    if (token === "w") {
      ability = currentMs >= raptorReadyAt ? "raptorStrike" : "meleeSwing";
    }

    const timing = getAbilityTiming(ability, preset);
    let start = Math.max(currentMs, timing.usesGcd ? gcdReadyAt : currentMs);
    if (token === "a") {
      start = Math.max(currentMs, nextAutoAt);
    } else if (ability === "meleeSwing") {
      start = Math.max(currentMs, meleeReadyAt);
    }

    const event: IdealEvent = {
      index,
      token,
      ability,
      label: TOKEN_TO_LABEL[token],
      idealAtMs: start,
    };

    if (token === "a") {
      nextAutoAt = start + preset.targetRangedSwingMs;
    }
    if (timing.usesGcd) {
      gcdReadyAt = start + TIMING.gcdMs;
    }
    if (ability === "raptorStrike") {
      raptorReadyAt = start + TIMING.raptorCooldownMs;
    }
    if (ability === "meleeSwing") {
      meleeReadyAt = start + preset.derivedMeleeSwingMs;
    }
    currentMs = start + timing.castMs;

    return event;
  });
}
