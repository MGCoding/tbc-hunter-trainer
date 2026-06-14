import { createSimulator } from "./simulator";
import type { AbilityId, IdealEvent, RotationPreset, RotationToken, SimEvent } from "./types";

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
  const sim = createSimulator(preset);

  return parseRotationTokens(preset.pattern).map((token, index) => {
    if (token === "a") {
      const event = tickUntilNextAutoFire(sim);
      return {
        index,
        token,
        ability: "autoShot",
        label: TOKEN_TO_LABEL[token],
        idealAtMs: event.atMs,
      };
    }

    const event = pressTokenAction(sim, token);

    return {
      index,
      token,
      ability: event.ability,
      label: TOKEN_TO_LABEL[token],
      idealAtMs: event.atMs,
    };
  });
}

function tickUntilNextAutoFire(sim: ReturnType<typeof createSimulator>): SimEvent & { ability: "autoShot" } {
  const previousAutoCount = sim.getLog().filter((event) => event.type === "auto-fire").length;

  while (true) {
    sim.tick(sim.getState().nextAutoAtMs);
    const autoFires = sim.getLog().filter((event): event is SimEvent & { ability: "autoShot" } => {
      return event.type === "auto-fire" && event.ability === "autoShot";
    });
    if (autoFires.length > previousAutoCount) {
      return autoFires[autoFires.length - 1];
    }
  }
}

function pressTokenAction(sim: ReturnType<typeof createSimulator>, token: Exclude<RotationToken, "a">): SimEvent & { ability: AbilityId } {
  const logLength = sim.getLog().length;
  const state = sim.getState();

  if (token === "w") {
    sim.pressAbility("raptorStrike", Math.max(state.nowMs, Math.min(state.raptorReadyAtMs, state.nextMeleeAtMs)));
  } else {
    sim.pressAbility(TOKEN_TO_ABILITY[token], Math.max(state.nowMs, state.gcdReadyAtMs));
  }

  const event = sim.getLog().slice(logLength).find((entry): entry is SimEvent & { ability: AbilityId } => {
    return entry.type === "cast-start" && entry.ability !== undefined;
  });
  if (!event) {
    throw new Error(`Could not resolve rotation token: ${token}`);
  }
  return event;
}
