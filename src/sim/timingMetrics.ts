import type { AutoDelayReason, AutoDelaySample, SimEvent, TimingMetrics, WeaveTimeSample } from "./types";

const ROLLING_SAMPLE_COUNT = 10;
const AUTO_DELAY_REASONS = new Set<AutoDelayReason>(["casting-at-spark", "moving", "range-blocked"]);
const MELEE_ABILITIES = new Set(["raptorStrike", "meleeSwing"]);

function compareEvents(first: SimEvent, second: SimEvent): number {
  if (first.atMs !== second.atMs) {
    return first.atMs - second.atMs;
  }

  return getEventPriority(first) - getEventPriority(second);
}

function getEventPriority(event: SimEvent): number {
  if (event.type === "auto-fire") {
    return 0;
  }
  if (event.type === "cast-start" && (event.ability === undefined || !MELEE_ABILITIES.has(event.ability))) {
    return 1;
  }
  if (event.type === "auto-windup") {
    return 1;
  }
  if (event.type === "cast-complete" && (event.ability === undefined || !MELEE_ABILITIES.has(event.ability))) {
    return 2;
  }
  if (event.type === "cast-start" && event.ability !== undefined && MELEE_ABILITIES.has(event.ability)) {
    return 3;
  }
  if (event.type === "cast-complete") {
    return 4;
  }
  return 5;
}

function averageLast(values: number[]): number | null {
  const samples = values.slice(-ROLLING_SAMPLE_COUNT);
  if (samples.length === 0) {
    return null;
  }

  return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
}

function isAutoDelayReason(reason: string | undefined): reason is AutoDelayReason {
  return reason !== undefined && AUTO_DELAY_REASONS.has(reason as AutoDelayReason);
}

function isFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function getAutoDelaySamples(events: SimEvent[]): AutoDelaySample[] {
  const samples: AutoDelaySample[] = [];
  let pendingClip: { originalAtMs: number; reason: AutoDelayReason } | null = null;

  for (const event of [...events].sort(compareEvents)) {
    if (
      event.type === "auto-clipped" &&
      event.ability === "autoShot" &&
      isFiniteNumber(event.originalAtMs) &&
      isAutoDelayReason(event.reason)
    ) {
      pendingClip = {
        originalAtMs: event.originalAtMs,
        reason: event.reason,
      };
      continue;
    }

    if (event.type !== "auto-fire" || event.ability !== "autoShot" || !Number.isFinite(event.atMs)) {
      continue;
    }

    if (pendingClip !== null) {
      if (event.delayMs !== undefined && !isFiniteNumber(event.delayMs)) {
        pendingClip = null;
        continue;
      }

      samples.push({
        atMs: event.atMs,
        delayMs: Math.round(event.delayMs ?? event.atMs - pendingClip.originalAtMs),
        reason: pendingClip.reason,
        originalAtMs: pendingClip.originalAtMs,
        rescheduledAtMs: event.atMs,
      });
      pendingClip = null;
      continue;
    }

    samples.push({
      atMs: event.atMs,
      delayMs: 0,
      reason: "not-delayed",
      originalAtMs: event.atMs,
      rescheduledAtMs: event.atMs,
    });
  }

  return samples.sort((first, second) => first.atMs - second.atMs);
}

function isSuccessfulSource(event: SimEvent): boolean {
  if (event.type === "auto-fire") {
    return true;
  }

  return event.type === "cast-complete" && (event.ability === undefined || !MELEE_ABILITIES.has(event.ability));
}

function isSuccessfulMeleeStart(event: SimEvent): boolean {
  return event.type === "cast-start" && event.ability !== undefined && MELEE_ABILITIES.has(event.ability);
}

function isWeaveCloser(event: SimEvent): boolean {
  if (event.type === "auto-windup") {
    return true;
  }

  return event.type === "cast-start" && (event.ability === undefined || !MELEE_ABILITIES.has(event.ability));
}

function getWeaveSamples(events: SimEvent[]): WeaveTimeSample[] {
  const sortedEvents = [...events].sort(compareEvents);
  const samples: WeaveTimeSample[] = [];
  let latestStartAtMs: number | null = null;
  let pending: { startAtMs: number; meleeAtMs: number } | null = null;

  for (const event of sortedEvents) {
    if (pending !== null && isWeaveCloser(event) && event.atMs >= pending.meleeAtMs) {
      samples.push({
        startAtMs: pending.startAtMs,
        meleeAtMs: pending.meleeAtMs,
        closeAtMs: event.atMs,
        durationMs: Math.round(event.atMs - pending.startAtMs),
      });
      pending = null;
    }

    if (isSuccessfulSource(event)) {
      latestStartAtMs = event.atMs;
      pending = null;
      continue;
    }

    if (latestStartAtMs !== null && pending === null && isSuccessfulMeleeStart(event)) {
      pending = {
        startAtMs: latestStartAtMs,
        meleeAtMs: event.atMs,
      };
    }
  }

  return samples;
}

export function getTimingMetrics(events: SimEvent[]): TimingMetrics {
  const autoDelaySamples = getAutoDelaySamples(events);
  const weaveSamples = getWeaveSamples(events);

  return {
    autoDelayAverageMs: averageLast(autoDelaySamples.map((sample) => sample.delayMs)),
    lastAutoDelayMs: autoDelaySamples.at(-1)?.delayMs ?? null,
    weaveAverageMs: averageLast(weaveSamples.map((sample) => sample.durationMs)),
    autoDelaySamples,
    weaveSamples,
  };
}
