import type { AbilityId, IdealEvent, RotationPreset, RotationToken } from "./types";

const TOKEN_TO_ABILITY: Record<RotationToken, AbilityId> = {
  a: "autoShot",
  s: "steadyShot",
  m: "multiShot",
  A: "arcaneShot",
  w: "meleeSwing",
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
  return parseRotationTokens(preset.pattern).map((token, index) => {
    const event: IdealEvent = {
      index,
      token,
      ability: TOKEN_TO_ABILITY[token],
      label: TOKEN_TO_LABEL[token],
      idealAtMs: currentMs,
    };
    currentMs += token === "a" ? preset.targetRangedSwingMs : 1500 / preset.hasteFactor;
    return event;
  });
}
