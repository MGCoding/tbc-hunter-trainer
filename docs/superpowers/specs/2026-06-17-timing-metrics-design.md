# Timing Metrics Design

## Summary

Replace the current primary Efficiency percentage with two raw rolling timing metrics:

- Auto Shot delay average: the average delay of the last 10 delayed Auto Shot samples.
- Weave time average: the average total weave window duration of the last 10 completed weave samples.

The UI should also make the most recent Auto Shot delay visible on the ranged swing timer, slightly increase the cast bar and ranged swing timer height, and present the rolling averages near the player HUD.

## Goals

- Make the primary feedback actionable in milliseconds rather than an abstract percentage.
- Show whether Auto Shots are being delayed by movement, melee/range positioning, or active casts.
- Show how much total time each melee weave consumes from the previous successful ranged/cast event to the next ranged/cast start.
- Keep timing logic centralized in the simulator and session log rather than duplicating simulator behavior in the UI.
- Keep the HUD readable while practicing.

## Non-Goals

- Do not remove the existing mistake model if it is still useful for Latest mistake feedback.
- Do not add hidden thresholds for detecting weave samples.
- Do not introduce a new percentage grade.
- Do not redesign the whole HUD or side panel.

## Current Context

The existing primary score is produced by `scoreEvents` in `src/sim/scoring.ts` and displayed as `score.efficiency` in `src/ui/ControlPanel.tsx`.

The simulator in `src/sim/simulator.ts` already emits events for Auto Shot windup, Auto Shot fire, Auto Shot clipping, cast starts, cast completes, Auto Shot pause/resume, invalid inputs, and range changes. Auto Shot cast clipping is currently represented by `auto-clipped`, but the event does not store the amount of delay.

The practice HUD is drawn in `src/game/PracticeScene.ts`. The existing HUD stack is cast bar, melee swing bar, ranged swing timer, and ability icons.

## Metric Semantics

### Auto Shot Delay Samples

An Auto Shot delay sample is recorded when an Auto Shot is pushed later than its scheduled fire time because the hunter cannot satisfy Auto Shot timing requirements.

Delay reasons:

- `casting-at-spark`: a spell cast such as Steady Shot or Multi-Shot overlaps the no-move/no-cast spark.
- `moving`: movement is active at or after the no-move/no-cast spark and prevents Auto Shot from completing on time.
- `range-blocked`: ranged attacks are unavailable when the shot would otherwise be able to proceed, including being in melee range or otherwise outside valid ranged range.

Each delay sample records:

- the original scheduled Auto Shot time
- the rescheduled Auto Shot time
- `delayMs`, computed as rescheduled time minus original scheduled time
- the reason

The Auto Shot rolling average uses the last 10 delay samples. The last Auto delay is exposed separately for the ranged timer overlay.

### Weave Time Samples

A weave sample is a completed event window with this structure:

1. Start at the most recent successful `cast-complete` or `auto-fire`.
2. Include a successful melee attack in between. Successful melee attacks are `cast-start` events for `raptorStrike` or `meleeSwing`.
3. Close at the next `cast-start` for a non-melee ability or the next `auto-windup`, whichever occurs first after the melee attack.

The sample duration is `closeAtMs - startAtMs`.

Partial windows do not count. A melee press that is invalid, out of range, or not ready does not count as the required melee attack. No hidden maximum duration is applied.

The weave rolling average uses the last 10 completed weave samples.

## Simulator Behavior

The simulator remains the authority for timing, legality, and event ordering.

### Cast-Based Auto Delay

The current Auto Shot clipping behavior stays intact. When an active cast overlaps the no-move/no-cast spark, the simulator records an Auto delay sample with reason `casting-at-spark`, then reschedules the Auto Shot using the existing delay behavior.

### Movement-Based Auto Delay

`App` already tracks movement keys. It should pass an `isMoving` state into the simulator before ticking or otherwise synchronizing live state.

If movement is active at or after the Auto Shot no-move/no-cast spark, the simulator delays the shot. When movement stops, the simulator schedules a fresh Auto Shot windup and records the total delay from the original scheduled fire time to the rescheduled fire time. The delay reason is `moving`.

### Range-Based Auto Delay

Existing range blocking already prevents Auto Shot while ranged attacks are unavailable. When ranged attacks become available again and that block pushed the Auto Shot later, the simulator records a delay sample with reason `range-blocked`.

The delay should only be recorded when Auto Shot is actually pushed later. Entering and leaving range before the relevant Auto window should not create a delay sample.

## Data Shape

The implementation should extend the event model rather than making UI state infer timing behavior.

Recommended additions:

- Add optional timing metadata to `SimEvent`, such as `delayMs`, `originalAtMs`, and `rescheduledAtMs`.
- Use the existing `auto-clipped` event type for cast clipping if that remains clear, or introduce a more general Auto delay event if implementation shows that cleaner.
- Add a metric helper that derives `TimingMetrics` from the session log.

Recommended `TimingMetrics` shape:

```ts
export interface AutoDelaySample {
  atMs: number;
  delayMs: number;
  reason: "casting-at-spark" | "moving" | "range-blocked";
}

export interface WeaveTimeSample {
  startAtMs: number;
  meleeAtMs: number;
  closeAtMs: number;
  durationMs: number;
}

export interface TimingMetrics {
  autoDelayAverageMs: number | null;
  lastAutoDelayMs: number | null;
  weaveAverageMs: number | null;
  autoDelaySamples: AutoDelaySample[];
  weaveSamples: WeaveTimeSample[];
}
```

The helper should return `null` averages before any samples exist so the UI can render a quiet placeholder.

## UI Design

Use the approved HUD Summary layout from the visual companion.

### Phaser HUD

Increase the normal cast bar from 18px to 22px. Increase the normal melee/ranged bars from 14px to 16px. Increase compact cast bars from 12px to 14px and compact melee/ranged bars from 8px to 10px while keeping the HUD stack inside short viewports.

The ranged swing timer displays the most recent Auto Shot delay as an overlay label such as `Auto +142ms`.

Delay label behavior:

- Hidden until the session has at least one Auto delay sample.
- Show milliseconds as a rounded integer.
- Use a neutral/gold accent for delays under 200ms.
- Use a warning red accent for delays at or above 200ms.

Below the ranged swing timer, display two compact metric cells:

- `Auto avg 86ms`
- `Weave avg 312ms`

Before samples exist, show a quiet placeholder such as `--ms`.

### Session Panel

Replace the primary `Efficiency` metric with raw timing metrics. The same two rolling averages should be available in the Session panel so the values remain visible outside the combat HUD.

Keep `Queue window` and `Latest mistake` unless implementation constraints show they need minor layout adjustment.

## Testing Strategy

### Simulator Tests

- Cast-based Auto delay records the correct `delayMs` and reason.
- Moving during the Auto Shot no-move/no-cast window delays the shot and records reason `moving`.
- Ranged range blocking records a delay only when it pushes Auto Shot later.
- Existing windup, fire, pause, resume, cast clipping, and range-blocking behavior still passes.

### Metric Tests

- Auto delay average uses only the last 10 samples.
- Last Auto delay is exposed separately from the average.
- Weave average starts from the previous `cast-complete` or `auto-fire`.
- Weave samples require a successful `raptorStrike` or `meleeSwing` between start and close.
- Weave samples close on the next non-melee `cast-start` or `auto-windup`.
- Partial or open weave windows do not count.

### UI and Layout Tests

- The Session panel no longer displays the old primary Efficiency percentage.
- The Session panel displays Auto delay average and Weave average as raw millisecond values or placeholders.
- Practice layout keeps the taller bars and metric row inside small and desktop viewports.
- Ranged timer label formatting shows the last delay.

## Open Decisions Resolved

- Rolling averages are sample-based, using the last 10 samples.
- Metrics are raw milliseconds, not percentage grades.
- Auto delay target is under 200ms for most shots.
- Weave time target is under 400ms.
- Weave timing starts from the most recent successful `cast-complete` or `auto-fire`, requires melee in between, and closes on the next ranged/cast start point.
- Movement during the Auto Shot window should delay Auto Shot and be tracked.
- The preferred UI layout is HUD Summary: immediate delay and rolling averages near the player HUD.
