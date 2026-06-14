import type { IdealEvent, ScoreMistake, ScoreResult, SimEvent } from "./types";

const TIMING_TOLERANCE_MS = 100;

function isScoringEvent(event: SimEvent): boolean {
  return event.type === "cast-start" || event.type === "auto-fire";
}

export function scoreEvents(ideal: IdealEvent[], events: SimEvent[]): ScoreResult {
  const mistakes: ScoreMistake[] = [];
  const castEvents = events.filter(isScoringEvent).sort((a, b) => a.atMs - b.atMs);

  ideal.forEach((expected, index) => {
    const actual = castEvents[index];
    if (!actual) {
      mistakes.push({ atMs: expected.idealAtMs, label: `${expected.label} missed`, penalty: 8 });
      return;
    }
    if (actual.ability !== expected.ability) {
      mistakes.push({ atMs: actual.atMs, label: `Expected ${expected.label}`, penalty: 10 });
      return;
    }
    const offset = actual.atMs - expected.idealAtMs;
    if (Math.abs(offset) > TIMING_TOLERANCE_MS) {
      mistakes.push({
        atMs: actual.atMs,
        label: `${expected.label} ${Math.abs(Math.round(offset))}ms ${offset > 0 ? "late" : "early"}`,
        penalty: Math.min(12, Math.abs(offset) / 50),
      });
    }
  });

  for (const event of events) {
    if (event.type === "auto-clipped") {
      mistakes.push({ atMs: event.atMs, label: "Auto clipped", penalty: 15 });
    }
    if (event.type === "invalid-input" && event.ability === "killCommand") {
      mistakes.push({ atMs: event.atMs, label: "Invalid Kill Command", penalty: 6 });
    }
    if (event.type === "invalid-input" && event.reason === "out-of-range") {
      mistakes.push({ atMs: event.atMs, label: `${event.ability ?? "Ability"} out of range`, penalty: 8 });
    }
  }

  const penalty = mistakes.reduce((sum, mistake) => sum + mistake.penalty, 0);
  const matchedCount = Math.min(castEvents.length, ideal.length);
  return {
    efficiency: Math.max(0, Math.round(100 - penalty)),
    mistakes,
    nextExpected: ideal[matchedCount] ?? null,
  };
}
