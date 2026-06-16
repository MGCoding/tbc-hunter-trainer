import { createSimulator } from "./simulator";
import type { AbilityActionId, AbilityId, IdealEvent, RotationPreset, RotationToken, SimEvent } from "./types";

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

export const PERFECT_PRESS_TOLERANCE_MS = 100;

export interface LoopedTimelinePosition {
  loopIndex: number;
  loopElapsedMs: number;
  patternDurationMs: number;
}

export interface PerfectPressMatch {
  loopIndex: number;
  eventIndex: number;
  idealEvent: IdealEvent;
  offsetMs: number;
}

export interface PerfectPressKeyParts {
  loopIndex: number;
  eventIndex: number;
}

export function getRotationPatternDurationMs(ideal: IdealEvent[]): number {
  return Math.max(0, ideal.at(-1)?.idealAtMs ?? 0);
}

export function getLoopedTimelinePosition(ideal: IdealEvent[], elapsedMs: number): LoopedTimelinePosition {
  const patternDurationMs = getRotationPatternDurationMs(ideal);
  if (patternDurationMs <= 0) {
    return { loopIndex: 0, loopElapsedMs: 0, patternDurationMs: 0 };
  }

  const safeElapsedMs = Math.max(0, elapsedMs);
  const loopIndex = Math.floor(safeElapsedMs / patternDurationMs);

  return {
    loopIndex,
    loopElapsedMs: safeElapsedMs - loopIndex * patternDurationMs,
    patternDurationMs,
  };
}

export function actionMatchesIdealAbility(action: AbilityActionId, ability: AbilityId): boolean {
  if (action === "raptorStrike") {
    return ability === "raptorStrike" || ability === "meleeSwing";
  }

  return action === ability;
}

export function findPerfectPress(
  ideal: IdealEvent[],
  action: AbilityActionId,
  elapsedMs: number,
  toleranceMs = PERFECT_PRESS_TOLERANCE_MS,
): PerfectPressMatch | null {
  const position = getLoopedTimelinePosition(ideal, elapsedMs);
  if (position.patternDurationMs <= 0) {
    return null;
  }

  let best: PerfectPressMatch | null = null;
  const candidateLoopIndexes = [position.loopIndex, position.loopIndex - 1, position.loopIndex + 1].filter(
    (loopIndex) => loopIndex >= 0,
  );
  for (const event of ideal) {
    if (!actionMatchesIdealAbility(action, event.ability)) {
      continue;
    }

    for (const loopIndex of candidateLoopIndexes) {
      const eventAtMs = loopIndex * position.patternDurationMs + event.idealAtMs;
      const offsetMs = elapsedMs - eventAtMs;
      if (Math.abs(offsetMs) > toleranceMs) {
        continue;
      }

      if (best === null || Math.abs(offsetMs) < Math.abs(best.offsetMs)) {
        best = {
          loopIndex,
          eventIndex: event.index,
          idealEvent: event,
          offsetMs,
        };
      }
    }
  }

  return best;
}

export function describePerfectPressKey(parts: PerfectPressKeyParts): string {
  return `${parts.loopIndex}:${parts.eventIndex}`;
}

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
      const { event, expectedClipAtMs } = tickUntilNextAutoFire(sim);
      return {
        index,
        token,
        ability: "autoShot",
        label: TOKEN_TO_LABEL[token],
        idealAtMs: event.atMs,
        ...(expectedClipAtMs.length > 0 ? { expectedClipAtMs } : {}),
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

function tickUntilNextAutoFire(sim: ReturnType<typeof createSimulator>): {
  event: SimEvent & { ability: "autoShot" };
  expectedClipAtMs: number[];
} {
  const previousAutoCount = sim.getLog().filter((event) => event.type === "auto-fire").length;
  const startLogLength = sim.getLog().length;

  while (true) {
    if (sim.getState().autoPaused) {
      sim.pressAbility("autoShot", sim.getState().nowMs);
    }

    sim.tick(sim.getState().nextAutoAtMs);
    const autoFires = sim.getLog().filter((event): event is SimEvent & { ability: "autoShot" } => {
      return event.type === "auto-fire" && event.ability === "autoShot";
    });
    if (autoFires.length > previousAutoCount) {
      const event = autoFires[autoFires.length - 1];
      const expectedClipAtMs = sim.getLog().slice(startLogLength).flatMap((entry) => {
        return entry.type === "auto-clipped" && entry.ability === "autoShot" && entry.atMs < event.atMs ? [entry.atMs] : [];
      });

      return { event, expectedClipAtMs };
    }
  }
}

function pressTokenAction(sim: ReturnType<typeof createSimulator>, token: Exclude<RotationToken, "a">): SimEvent & { ability: AbilityId } {
  const logLength = sim.getLog().length;
  const state = sim.getState();

  if (token === "w") {
    sim.pressAbility("raptorStrike", Math.max(state.nowMs, state.nextMeleeAtMs));
  } else {
    const ability = TOKEN_TO_ABILITY[token];
    sim.pressAbility(ability, Math.max(state.nowMs, state.gcdReadyAtMs, sim.getAbilityReadyAtMs(ability)));
  }

  const event = sim.getLog().slice(logLength).find((entry): entry is SimEvent & { ability: AbilityId } => {
    return entry.type === "cast-start" && entry.ability !== undefined;
  });
  if (!event) {
    throw new Error(`Could not resolve rotation token: ${token}`);
  }
  return event;
}
