import { TIMING } from "../data/constants";
import type { AbilityId, IdealEvent, ScoreMistake, ScoreResult, SimEvent } from "./types";

const TIMING_TOLERANCE_MS = 100;

type ScoreableEvent = SimEvent & { ability: AbilityId };
type InvalidInputEvent = SimEvent & { type: "invalid-input"; ability: AbilityId };

function isScoreableEvent(event: SimEvent): event is ScoreableEvent {
  if (!event.ability) {
    return false;
  }
  if (event.type === "auto-fire") {
    return event.ability === "autoShot";
  }
  return event.type === "cast-start" && event.ability !== "autoShot";
}

function compareScoreableEvents(first: ScoreableEvent, second: ScoreableEvent): number {
  if (first.atMs !== second.atMs) {
    return first.atMs - second.atMs;
  }
  if (first.type === second.type) {
    return 0;
  }
  return first.type === "auto-fire" ? -1 : 1;
}

function addTimingMistake(mistakes: ScoreMistake[], expected: IdealEvent, actual: ScoreableEvent): void {
  const offset = actual.atMs - expected.idealAtMs;
  if (Math.abs(offset) > TIMING_TOLERANCE_MS) {
    mistakes.push({
      atMs: actual.atMs,
      label: `${expected.label} ${Math.abs(Math.round(offset))}ms ${offset > 0 ? "late" : "early"}`,
      penalty: Math.min(12, Math.abs(offset) / 50),
    });
  }
}

function findGcdLockedEvent(expected: IdealEvent, events: SimEvent[]): InvalidInputEvent | undefined {
  return events.find((event): event is InvalidInputEvent => {
    return event.type === "invalid-input" && event.reason === "gcd-locked" && event.ability === expected.ability && event.atMs < expected.idealAtMs;
  });
}

function isExpectedClipReplacement(event: SimEvent, events: SimEvent[], idealAutoFireTimes: Set<number>): boolean {
  const nextAutoFire = events
    .filter((candidate) => candidate.type === "auto-fire" && candidate.ability === "autoShot" && candidate.atMs > event.atMs)
    .sort((first, second) => first.atMs - second.atMs)[0];

  return nextAutoFire !== undefined && nextAutoFire.atMs - event.atMs <= TIMING.noMoveNoCastLeadMs && idealAutoFireTimes.has(nextAutoFire.atMs);
}

export function scoreEvents(ideal: IdealEvent[], events: SimEvent[]): ScoreResult {
  const mistakes: ScoreMistake[] = [];
  const scoreableEvents = events.filter(isScoreableEvent).sort(compareScoreableEvents);
  const idealAutoFireTimes = new Set(
    ideal.filter((event) => event.ability === "autoShot").map((event) => event.idealAtMs),
  );

  let idealIndex = 0;
  let actualIndex = 0;

  while (idealIndex < ideal.length && actualIndex < scoreableEvents.length) {
    const expected = ideal[idealIndex];
    const actual = scoreableEvents[actualIndex];
    if (actual.ability !== expected.ability) {
      mistakes.push({ atMs: actual.atMs, label: `Unexpected ${actual.ability}`, penalty: 10 });
      actualIndex += 1;
      continue;
    }

    addTimingMistake(mistakes, expected, actual);
    idealIndex += 1;
    actualIndex += 1;
  }

  for (const expected of ideal.slice(idealIndex)) {
    const gcdLocked = findGcdLockedEvent(expected, events);
    if (gcdLocked) {
      addTimingMistake(mistakes, expected, gcdLocked);
      continue;
    }
    mistakes.push({ atMs: expected.idealAtMs, label: `${expected.label} missed`, penalty: 8 });
  }

  for (const actual of scoreableEvents.slice(actualIndex)) {
    mistakes.push({ atMs: actual.atMs, label: `Unexpected ${actual.ability}`, penalty: 10 });
  }

  for (const event of events) {
    if (event.type === "auto-clipped") {
      if (isExpectedClipReplacement(event, events, idealAutoFireTimes)) {
        continue;
      }
      mistakes.push({ atMs: event.atMs, label: "Auto clipped", penalty: 15 });
    }
    if (event.type === "invalid-input" && event.ability === "killCommand") {
      mistakes.push({ atMs: event.atMs, label: "Invalid Kill Command", penalty: 6 });
    }
    if (event.type === "invalid-input" && event.reason === "melee-action-not-ready") {
      mistakes.push({ atMs: event.atMs, label: "Melee action not ready", penalty: 6 });
    }
    if (event.type === "invalid-input" && event.reason === "out-of-range") {
      mistakes.push({ atMs: event.atMs, label: `${event.ability ?? "Ability"} out of range`, penalty: 8 });
    }
  }

  const penalty = mistakes.reduce((sum, mistake) => sum + mistake.penalty, 0);
  return {
    efficiency: Math.min(100, Math.max(0, Math.round(100 - penalty))),
    mistakes,
    nextExpected: ideal[idealIndex] ?? null,
  };
}
