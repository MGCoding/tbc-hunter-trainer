# Timing Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primary Efficiency percentage with raw rolling Auto Shot delay and weave timing metrics, including live HUD feedback for the last Auto Shot delay.

**Architecture:** Keep the simulator and session log as the timing source of truth. Enrich Auto Shot delay events with delay metadata, derive rolling metrics from `SimEvent[]` in a focused helper, then render those metrics in React and Phaser without duplicating simulator rules in the UI.

**Tech Stack:** TypeScript, React 19, Phaser 3, Vitest, Testing Library, Vite.

---

## File Structure

- Modify `src/sim/types.ts`: add Auto delay metadata types, timing metric interfaces, and `PracticeState.metrics`.
- Create `src/sim/timingMetrics.ts`: derive Auto delay samples, weave samples, and last-10 averages from session events.
- Add `src/tests/timingMetrics.test.ts`: focused tests for rolling averages and weave window semantics.
- Modify `src/sim/simulator.ts`: record `delayMs`, `originalAtMs`, and `rescheduledAtMs` for cast, movement, and range Auto delays.
- Modify `src/tests/simulator.test.ts`: cover delay metadata for cast, movement, and range.
- Modify `src/App.tsx`: compute timing metrics from the simulator log, pass live metrics to `PracticeState`, and sync movement blocking to the simulator.
- Modify `src/ui/ControlPanel.tsx`: replace primary Efficiency display with Auto delay and Weave time metrics.
- Modify `src/tests/app-ui.test.tsx`: assert the new panel labels/placeholders replace the old Efficiency metric.
- Modify `src/game/PracticeScene.ts`: increase HUD bar heights, reserve a metric row, render `Auto +Nms` on the ranged timer, and render the HUD metric cells.
- Modify `src/tests/practice-scene-layout.test.ts`: assert layout dimensions, metric formatting helpers, and HUD stack bounds.

## Implementation Tasks

### Task 1: Add Timing Metric Types and Helper

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/sim/timingMetrics.ts`
- Create: `src/tests/timingMetrics.test.ts`

- [ ] **Step 1: Write failing metric tests**

Create `src/tests/timingMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getTimingMetrics } from "../sim/timingMetrics";
import type { SimEvent } from "../sim/types";

describe("timing metrics", () => {
  it("averages only the last 10 Auto Shot delay samples and exposes the latest delay", () => {
    const events: SimEvent[] = Array.from({ length: 12 }, (_, index) => ({
      type: "auto-clipped",
      atMs: 3000 + index * 3000,
      ability: "autoShot",
      reason: "casting-at-spark",
      originalAtMs: 3000 + index * 3000,
      rescheduledAtMs: 3000 + index * 3000 + (index + 1) * 10,
      delayMs: (index + 1) * 10,
    }));

    const metrics = getTimingMetrics(events);

    expect(metrics.autoDelaySamples.map((sample) => sample.delayMs)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
    expect(metrics.autoDelayAverageMs).toBe(75);
    expect(metrics.lastAutoDelayMs).toBe(120);
  });

  it("returns null averages before samples exist", () => {
    expect(getTimingMetrics([])).toMatchObject({
      autoDelayAverageMs: null,
      lastAutoDelayMs: null,
      weaveAverageMs: null,
      autoDelaySamples: [],
      weaveSamples: [],
    });
  });

  it("builds a weave sample from the previous success through melee to the next cast start", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      { type: "ability-press", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-start", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-complete", atMs: 3200, ability: "raptorStrike" },
      { type: "cast-start", atMs: 3360, ability: "steadyShot" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([
      { startAtMs: 3000, meleeAtMs: 3200, closeAtMs: 3360, durationMs: 360 },
    ]);
    expect(metrics.weaveAverageMs).toBe(360);
  });

  it("closes a weave sample on Auto Shot windup", () => {
    const events: SimEvent[] = [
      { type: "cast-complete", atMs: 1500, ability: "steadyShot" },
      { type: "cast-start", atMs: 1700, ability: "meleeSwing" },
      { type: "cast-complete", atMs: 1700, ability: "meleeSwing" },
      { type: "auto-windup", atMs: 1875, ability: "autoShot" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([
      { startAtMs: 1500, meleeAtMs: 1700, closeAtMs: 1875, durationMs: 375 },
    ]);
    expect(metrics.weaveAverageMs).toBe(375);
  });

  it("ignores open weave windows and invalid melee attempts", () => {
    const events: SimEvent[] = [
      { type: "auto-fire", atMs: 3000, ability: "autoShot" },
      { type: "invalid-input", atMs: 3250, ability: "raptorStrike", reason: "melee-action-not-ready" },
      { type: "ability-press", atMs: 3500, ability: "raptorStrike" },
    ];

    const metrics = getTimingMetrics(events);

    expect(metrics.weaveSamples).toEqual([]);
    expect(metrics.weaveAverageMs).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/timingMetrics.test.ts
```

Expected: FAIL because `src/sim/timingMetrics.ts` does not exist and `SimEvent` does not accept delay metadata.

- [ ] **Step 3: Add shared types**

In `src/sim/types.ts`, replace the `SimEvent` interface and add the timing metric interfaces immediately before `PracticeState`:

```ts
export type AutoDelayReason = "casting-at-spark" | "moving" | "range-blocked";

export interface SimEvent {
  type: SimEventType;
  atMs: number;
  ability?: AbilityId;
  reason?: string;
  detail?: string;
  delayMs?: number;
  originalAtMs?: number;
  rescheduledAtMs?: number;
}

export interface AutoDelaySample {
  atMs: number;
  delayMs: number;
  reason: AutoDelayReason;
  originalAtMs: number;
  rescheduledAtMs: number;
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

Then update `PracticeState` in the same file:

```ts
export interface PracticeState {
  simulator: SimulatorState;
  position: PracticePosition;
  range: RangeState;
  metrics: TimingMetrics;
}
```

- [ ] **Step 4: Implement the metric helper**

Create `src/sim/timingMetrics.ts`:

```ts
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
  if (event.type === "cast-complete" || event.type === "auto-fire") {
    return 0;
  }
  if (event.type === "cast-start" && event.ability !== undefined && MELEE_ABILITIES.has(event.ability)) {
    return 1;
  }
  if (event.type === "cast-start" || event.type === "auto-windup") {
    return 2;
  }
  return 3;
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

function getAutoDelaySamples(events: SimEvent[]): AutoDelaySample[] {
  return events.flatMap((event) => {
    if (
      event.type !== "auto-clipped" ||
      event.ability !== "autoShot" ||
      typeof event.delayMs !== "number" ||
      typeof event.originalAtMs !== "number" ||
      typeof event.rescheduledAtMs !== "number" ||
      !isAutoDelayReason(event.reason)
    ) {
      return [];
    }

    return [
      {
        atMs: event.atMs,
        delayMs: Math.round(event.delayMs),
        reason: event.reason,
        originalAtMs: event.originalAtMs,
        rescheduledAtMs: event.rescheduledAtMs,
      },
    ];
  });
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

    if (latestStartAtMs !== null && isSuccessfulMeleeStart(event)) {
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
```

- [ ] **Step 5: Run metric tests to verify they pass**

Run:

```bash
npm test -- src/tests/timingMetrics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/sim/types.ts src/sim/timingMetrics.ts src/tests/timingMetrics.test.ts
git commit -m "feat: derive timing metrics"
```

Expected: commit succeeds.

### Task 2: Record Auto Shot Delay Metadata in the Simulator

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/simulator.ts`
- Modify: `src/tests/simulator.test.ts`

- [ ] **Step 1: Write failing simulator tests**

In `src/tests/simulator.test.ts`, add these tests inside `describe("simulator", () => { ... })` after the existing cast clipping tests:

```ts
  it("records delay metadata when a cast clips Auto Shot", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const castStartedAtMs = spark - 100;
    const expectedRescheduledAtMs = autoDue + TIMING.steadyBaseCastMs / preset.hasteFactor - 100;

    sim.pressAbility("steadyShot", castStartedAtMs);
    sim.tick(autoDue);

    const clipped = sim.getLog().find((event) => event.type === "auto-clipped" && event.reason === "casting-at-spark");

    expect(clipped).toMatchObject({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "casting-at-spark",
      originalAtMs: autoDue,
    });
    expect(clipped?.rescheduledAtMs).toBeCloseTo(expectedRescheduledAtMs);
    expect(clipped?.delayMs).toBe(Math.round(expectedRescheduledAtMs - autoDue));
  });

  it("records moving Auto Shot delay when movement blocks the spark", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const stoppedAtMs = autoDue + 250;
    const expectedRescheduledAtMs = stoppedAtMs + TIMING.autoWindupMs / preset.hasteFactor;

    sim.setAutoShotMovementAllowed(false, spark);
    sim.tick(stoppedAtMs);
    sim.setAutoShotMovementAllowed(true, stoppedAtMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "moving",
      originalAtMs: autoDue,
      rescheduledAtMs: expectedRescheduledAtMs,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    });
    expect(sim.getState().nextAutoAtMs).toBeCloseTo(expectedRescheduledAtMs);
  });

  it("records range-blocked Auto Shot delay only when range pushes the shot back", () => {
    const preset = getRotationPreset("one-one");
    const sim = createSimulator(preset);
    const autoDue = sim.getState().nextAutoAtMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const restoredAtMs = autoDue + 300;
    const expectedRescheduledAtMs = restoredAtMs + TIMING.autoWindupMs / preset.hasteFactor;

    sim.setAutoShotRangeAllowed(false, spark - 200);
    sim.setAutoShotRangeAllowed(true, spark - 100);
    expect(sim.getLog().some((event) => event.type === "auto-clipped" && event.reason === "range-blocked")).toBe(false);

    sim.setAutoShotRangeAllowed(false, spark);
    sim.tick(restoredAtMs);
    sim.setAutoShotRangeAllowed(true, restoredAtMs);

    expect(sim.getLog()).toContainEqual({
      type: "auto-clipped",
      atMs: autoDue,
      ability: "autoShot",
      reason: "range-blocked",
      originalAtMs: autoDue,
      rescheduledAtMs: expectedRescheduledAtMs,
      delayMs: Math.round(expectedRescheduledAtMs - autoDue),
    });
  });
```

- [ ] **Step 2: Run simulator tests to verify they fail**

Run:

```bash
npm test -- src/tests/simulator.test.ts
```

Expected: FAIL because `setAutoShotMovementAllowed` does not exist and Auto delay metadata is not recorded.

- [ ] **Step 3: Add movement-blocked simulator state**

In `src/sim/types.ts`, add this optional field to `SimulatorState` after `autoRangeBlocked?: boolean;`:

```ts
  autoMovementBlocked?: boolean;
```

- [ ] **Step 4: Implement delay recording and movement blocking**

In `src/sim/simulator.ts`, update the import:

```ts
import type { AbilityId, AutoDelayReason, RotationPreset, SimEvent, SimulatorState } from "./types";
```

In the constructor state, add:

```ts
      autoMovementBlocked: false,
```

Add this public method after `setAutoShotRangeAllowed`:

```ts
  setAutoShotMovementAllowed(isAllowed: boolean, atMs: number): void {
    if (!isAllowed) {
      this.state.autoMovementBlocked = true;
      this.tick(atMs);
      return;
    }

    if (this.state.autoMovementBlocked) {
      const sparkAtMs = this.state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs;
      if (!this.state.autoPaused && atMs >= sparkAtMs) {
        this.rescheduleDelayedAuto(atMs + TIMING.autoWindupMs / this.preset.hasteFactor, "moving");
      }
    }

    this.state.autoMovementBlocked = false;
    this.tick(atMs);
  }
```

Replace `setAutoShotRangeAllowed` with:

```ts
  setAutoShotRangeAllowed(isAllowed: boolean, atMs: number): void {
    if (!isAllowed) {
      this.state.autoRangeBlocked = true;
      this.tick(atMs);
      return;
    }

    if (this.state.autoRangeBlocked) {
      const sparkAtMs = this.state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs;
      if (!this.state.autoPaused && atMs >= sparkAtMs) {
        this.rescheduleDelayedAuto(atMs + TIMING.autoWindupMs / this.preset.hasteFactor, "range-blocked");
      }
    }

    this.state.autoRangeBlocked = false;
    this.tick(atMs);
  }
```

Replace the guard at the top of `processAutoWindow` with:

```ts
    if (this.state.autoPaused || this.state.autoRangeBlocked || this.state.autoMovementBlocked) {
      return;
    }
```

Replace the cast clipping branch in `processAutoWindow` with:

```ts
      if (activeCastBlocksAuto) {
        this.rescheduleDelayedAuto(this.state.nextAutoAtMs + active.completesAtMs - sparkAt, "casting-at-spark");
      } else {
        this.log.add({ type: "auto-fire", atMs: currentAutoAtMs, ability: "autoShot" });
        this.rescheduleNextAuto(this.state.nextAutoAtMs + this.preset.targetRangedSwingMs);
      }
```

Add this helper before `rescheduleNextAuto`:

```ts
  private rescheduleDelayedAuto(rescheduledAtMs: number, reason: AutoDelayReason): void {
    const originalAtMs = this.state.nextAutoAtMs;
    const roundedDelayMs = Math.round(rescheduledAtMs - originalAtMs);
    if (roundedDelayMs <= 0) {
      this.rescheduleNextAuto(rescheduledAtMs);
      return;
    }

    this.log.add({
      type: "auto-clipped",
      atMs: originalAtMs,
      ability: "autoShot",
      reason,
      originalAtMs,
      rescheduledAtMs,
      delayMs: roundedDelayMs,
    });
    this.rescheduleNextAuto(rescheduledAtMs);
  }
```

- [ ] **Step 5: Include movement state in preload defaults**

In `src/game/PracticeScene.ts`, add `autoMovementBlocked: false` to the simulator state object inside `preload()`:

```ts
          autoPaused: false,
          autoMovementBlocked: false,
```

- [ ] **Step 6: Run simulator tests to verify they pass**

Run:

```bash
npm test -- src/tests/simulator.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run metric tests again**

Run:

```bash
npm test -- src/tests/timingMetrics.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/sim/types.ts src/sim/simulator.ts src/game/PracticeScene.ts src/tests/simulator.test.ts
git commit -m "feat: record auto shot delay metadata"
```

Expected: commit succeeds.

### Task 3: Wire Movement Blocking and Live Metrics Through App State

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Write a failing App movement integration test**

Add this test after the attack sound forwarding tests:

```ts
  it("syncs movement blocking into the simulator and records a moving Auto delay", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("one-one");
    const autoDue = preset.targetRangedSwingMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const stopMovingAtMs = autoDue + 250;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(spark);
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(stopMovingAtMs);
    fireEvent.keyUp(document, { code: "KeyW" });

    expect(screen.getByText("auto-clipped")).toBeInTheDocument();
    expect(screen.getByText("moving")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run App UI tests to verify they fail**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because movement blocking is not wired from `App` to the simulator.

- [ ] **Step 3: Compute timing metrics in App**

In `src/App.tsx`, add this import:

```ts
import { getTimingMetrics } from "./sim/timingMetrics";
```

In `getPracticeState`, before returning, compute live metrics from the simulator log:

```ts
    const metrics = getTimingMetrics(simulator.getLog());
```

Then add `metrics` to the returned practice state object:

```ts
      metrics,
```

- [ ] **Step 4: Add movement active helper and simulator sync**

In `src/App.tsx`, add this helper near `EMPTY_MOVEMENT_KEYS`:

```ts
function hasActiveMovement(keys: MovementKeys): boolean {
  return keys.forward || keys.backward || keys.left || keys.right;
}
```

Add this function after `syncAutoShotRangeToElapsed`:

```ts
  function syncAutoShotMovementToElapsed(elapsedMs: number, keys = movementKeysRef.current): void {
    if (runningRef.current) {
      getSimulator().setAutoShotMovementAllowed(!hasActiveMovement(keys), elapsedMs);
    }
  }
```

Update `syncLiveStateToNow`:

```ts
  function syncLiveStateToNow(nowMs: number): { elapsedMs: number; range: RangeState } {
    const elapsedMs = syncMovementToNow(nowMs);
    syncAutoShotMovementToElapsed(elapsedMs);
    const range = syncAutoShotRangeToElapsed(elapsedMs);
    return { elapsedMs, range };
  }
```

Replace `handleMovementChange` with:

```ts
  const handleMovementChange = useCallback((keys: MovementKeys): void => {
    const nowMs = performance.now();
    const elapsedMs = syncMovementToNow(nowMs);
    movementKeysRef.current = keys;
    syncAutoShotMovementToElapsed(elapsedMs, keys);
    syncAutoShotRangeToElapsed(elapsedMs);
    playNewAttackSoundEvents();
    setEvents(getSimulator().getLog());
  }, []);
```

- [ ] **Step 5: Run App UI tests**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit App state plumbing**

Run:

```bash
git add src/App.tsx src/tests/app-ui.test.tsx
git commit -m "feat: wire timing metrics through app state"
```

Expected: commit succeeds.

### Task 4: Replace Session Panel Efficiency With Raw Timing Metrics

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/ControlPanel.tsx`
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Write failing Session panel tests**

In `src/tests/app-ui.test.tsx`, update the first render test assertions:

```ts
    expect(screen.queryByText("Efficiency")).not.toBeInTheDocument();
    expect(screen.getByText("Auto delay")).toBeInTheDocument();
    expect(screen.getByText("Weave time")).toBeInTheDocument();
```

Replace the neutral score test with:

```ts
  it("starts with quiet timing metric placeholders before any session events", () => {
    render(<App />);

    expect(screen.getAllByText("--ms").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("No mistakes recorded")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run App UI tests to verify they fail**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `ControlPanel` still renders Efficiency.

- [ ] **Step 3: Compute panel timing metrics in App**

In `src/App.tsx`, after the existing `score` `useMemo`, add:

```ts
  const timingMetrics = useMemo(() => getTimingMetrics(events), [events]);
```

Update the `ControlPanel` usage:

```tsx
        <ControlPanel
          selectedPresetId={selectedPresetId}
          score={score}
          timingMetrics={timingMetrics}
          running={running}
          onPresetChange={handlePresetChange}
          onStart={handleStart}
          onStop={handleStop}
        />
```

- [ ] **Step 4: Add ControlPanel metric formatting**

In `src/ui/ControlPanel.tsx`, update imports:

```ts
import type { ScoreResult, TimingMetrics } from "../sim/types";
```

Add this helper above `ControlPanel`:

```ts
function formatMetricMs(value: number | null): string {
  return value === null ? "--ms" : `${Math.round(value)}ms`;
}
```

- [ ] **Step 5: Update ControlPanel props**

Replace `ControlPanelProps` with:

```ts
interface ControlPanelProps {
  selectedPresetId: string;
  score: ScoreResult;
  timingMetrics: TimingMetrics;
  running: boolean;
  onPresetChange: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
}
```

Update the function signature:

```ts
export function ControlPanel({
  selectedPresetId,
  score,
  timingMetrics,
  running,
  onPresetChange,
  onStart,
  onStop,
}: ControlPanelProps) {
```

- [ ] **Step 6: Replace the metric grid JSX**

Replace the current metric grid JSX with:

```tsx
      <div className="metric-grid">
        <div className="metric">
          <span>Auto delay</span>
          <strong>{formatMetricMs(timingMetrics.autoDelayAverageMs)}</strong>
        </div>
        <div className="metric">
          <span>Weave time</span>
          <strong>{formatMetricMs(timingMetrics.weaveAverageMs)}</strong>
        </div>
        <div className="metric">
          <span>Queue window</span>
          <strong>{TIMING.spellQueueWindowMs}ms</strong>
        </div>
      </div>
```

- [ ] **Step 7: Make the metric grid tolerate three cards**

In `src/styles.css`, replace `.metric-grid` with:

```css
.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}
```

Add this media query after `.metric-grid`:

```css
@media (min-width: 1180px) {
  .metric-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

- [ ] **Step 8: Run App UI tests**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit panel rendering**

Run:

```bash
git add src/App.tsx src/ui/ControlPanel.tsx src/styles.css src/tests/app-ui.test.tsx
git commit -m "feat: show timing metrics in session panel"
```

Expected: commit succeeds.

### Task 5: Render HUD Timing Summary and Taller Bars

**Files:**
- Modify: `src/game/PracticeScene.ts`
- Modify: `src/tests/practice-scene-layout.test.ts`

- [ ] **Step 1: Write failing layout and formatting tests**

In `src/tests/practice-scene-layout.test.ts`, update the import list from `../game/PracticeScene` to include:

```ts
  formatHudMetricMs,
  formatLastAutoDelayLabel,
  getLastAutoDelayColor,
```

Add these tests inside `describe("PracticeScene layout", () => { ... })` after the HUD stack test:

```ts
  it("uses taller timing bars and reserves space for HUD timing metrics", () => {
    const layout = calculatePracticeLayout(900, 800);
    const compact = calculatePracticeLayout(320, 260);

    expect(layout.hud.castHeight).toBe(22);
    expect(layout.hud.barHeight).toBe(16);
    expect(layout.hud.metricHeight).toBe(28);
    expect(compact.hud.castHeight).toBe(14);
    expect(compact.hud.barHeight).toBe(10);
    expect(compact.hud.metricHeight).toBe(24);
    expect(layout.hud.iconTop).toBeGreaterThan(
      layout.hud.top + layout.hud.castHeight + layout.hud.gap + layout.hud.barHeight + layout.hud.gap + layout.hud.barHeight + layout.hud.gap + layout.hud.metricHeight,
    );
  });

  it("formats HUD timing metric values and Auto delay labels", () => {
    expect(formatHudMetricMs(null)).toBe("--ms");
    expect(formatHudMetricMs(86.4)).toBe("86ms");
    expect(formatLastAutoDelayLabel(null)).toBe("");
    expect(formatLastAutoDelayLabel(142.2)).toBe("Auto +142ms");
    expect(getLastAutoDelayColor(null)).toBe(0xf5df9f);
    expect(getLastAutoDelayColor(199)).toBe(0xf5df9f);
    expect(getLastAutoDelayColor(200)).toBe(0xd9664f);
  });
```

- [ ] **Step 2: Run layout tests to verify they fail**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts
```

Expected: FAIL because the helper exports and metric layout fields do not exist.

- [ ] **Step 3: Add HUD metric layout fields and format helpers**

In `src/game/PracticeScene.ts`, update `HudLayout`:

```ts
interface HudLayout {
  top: number;
  left: number;
  width: number;
  castHeight: number;
  barHeight: number;
  metricHeight: number;
  iconTop: number;
  iconSize: number;
  iconGap: number;
  gap: number;
  totalHeight: number;
}
```

Add these exported helpers after `formatCooldown`:

```ts
export function formatHudMetricMs(value: number | null): string {
  return value === null ? "--ms" : `${Math.round(value)}ms`;
}

export function formatLastAutoDelayLabel(value: number | null): string {
  return value === null ? "" : `Auto +${Math.round(value)}ms`;
}

export function getLastAutoDelayColor(value: number | null): number {
  return value !== null && value >= 200 ? 0xd9664f : 0xf5df9f;
}
```

- [ ] **Step 4: Increase layout heights**

In `calculatePracticeLayout`, replace the HUD sizing block with:

```ts
  const castHeight = compactHud ? 14 : 22;
  const barHeight = compactHud ? 10 : 16;
  const metricHeight = compactHud ? 24 : 28;
  const iconSize = compactHud ? 28 : 36;
  const iconGap = compactHud ? 5 : 7;
  const gap = compactHud ? 4 : 8;
  const totalHeight = castHeight + gap + barHeight + gap + barHeight + gap + metricHeight + gap + iconSize;
```

Update the returned `hud` object:

```ts
      metricHeight,
      iconTop: rangedTop + barHeight + gap + metricHeight + gap,
```

- [ ] **Step 5: Add HUD metric text objects**

In the `PracticeScene` class fields, add:

```ts
  private autoDelayMetricLabel!: Phaser.GameObjects.Text;
  private weaveMetricLabel!: Phaser.GameObjects.Text;
  private lastAutoDelayLabel!: Phaser.GameObjects.Text;
```

In `create()`, after `castLabel`, create the labels:

```ts
    this.lastAutoDelayLabel = this.add
      .text(0, 0, "", {
        color: "#f5df9f",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "10px",
        fontStyle: "900",
        stroke: "#080b0e",
        strokeThickness: 3,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0);
    this.autoDelayMetricLabel = this.add
      .text(0, 0, "", {
        color: "#f4f2ed",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "10px",
        fontStyle: "800",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    this.weaveMetricLabel = this.add
      .text(0, 0, "", {
        color: "#f4f2ed",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "10px",
        fontStyle: "800",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
```

- [ ] **Step 6: Render ranged delay and metric row**

In `drawHud`, after `this.drawRangedSparks(...)`, add:

```ts
    this.drawLastAutoDelayLabel(hud, rangedTop, practiceState.metrics.lastAutoDelayMs);
    this.drawHudMetrics(hud, rangedTop + hud.barHeight + hud.gap, practiceState.metrics);
```

Add these private methods before `drawAbilityIcons`:

```ts
  private drawLastAutoDelayLabel(hud: HudLayout, rangedTop: number, lastAutoDelayMs: number | null): void {
    const label = formatLastAutoDelayLabel(lastAutoDelayMs);
    this.lastAutoDelayLabel.setText(label);
    this.lastAutoDelayLabel.setColor(`#${getLastAutoDelayColor(lastAutoDelayMs).toString(16).padStart(6, "0")}`);
    this.lastAutoDelayLabel.setPosition(hud.left + hud.width - 6, rangedTop + hud.barHeight / 2);
    this.lastAutoDelayLabel.setVisible(label.length > 0);
  }

  private drawHudMetrics(hud: HudLayout, metricTop: number, metrics: PracticeState["metrics"]): void {
    const cellGap = 6;
    const cellWidth = (hud.width - cellGap) / 2;
    const labels = [
      { text: `Auto avg ${formatHudMetricMs(metrics.autoDelayAverageMs)}`, object: this.autoDelayMetricLabel },
      { text: `Weave avg ${formatHudMetricMs(metrics.weaveAverageMs)}`, object: this.weaveMetricLabel },
    ];

    for (let index = 0; index < labels.length; index += 1) {
      const x = hud.left + index * (cellWidth + cellGap);
      this.hud.fillStyle(0x080b0e, 0.68);
      this.hud.fillRoundedRect(x, metricTop, cellWidth, hud.metricHeight, 4);
      this.hud.lineStyle(1, 0xf4f2ed, 0.16);
      this.hud.strokeRoundedRect(x, metricTop, cellWidth, hud.metricHeight, 4);
      labels[index].object.setText(labels[index].text);
      labels[index].object.setPosition(x + cellWidth / 2, metricTop + hud.metricHeight / 2);
      labels[index].object.setFontSize(hud.metricHeight < 28 ? 9 : 10);
    }
  }
```

- [ ] **Step 7: Run layout tests**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit HUD rendering**

Run:

```bash
git add src/game/PracticeScene.ts src/tests/practice-scene-layout.test.ts
git commit -m "feat: show timing metrics in practice hud"
```

Expected: commit succeeds.

### Task 6: Full Verification and Browser Smoke Test

**Files:**
- Modify only if verification exposes defects in files touched by Tasks 1-5.

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS with Vite build output and no TypeScript errors.

- [ ] **Step 3: Start the dev server for a smoke test**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`. Leave this command running during the browser smoke test.

- [ ] **Step 4: Smoke test the UI in the browser**

Open the dev server URL and verify:

- The Session panel shows `Auto delay`, `Weave time`, and `Queue window`.
- The Session panel does not show `Efficiency`.
- The Phaser HUD has taller bars than before and shows two metric cells beneath the ranged swing timer.
- Before any delay samples, the metric cells show `Auto avg --ms` and `Weave avg --ms`.
- During a session, holding movement through an Auto Shot spark then releasing movement updates the Auto delay metric.

- [ ] **Step 5: Stop the dev server**

Press `Ctrl-C` in the terminal running Vite.

Expected: the dev server exits.

- [ ] **Step 6: Check final git status**

Run:

```bash
git status --short
```

Expected: no unstaged or untracked files except intentionally ignored local artifacts.

- [ ] **Step 7: Commit verification fixes if any were needed**

If Step 1, 2, or 4 required code changes, run:

```bash
git add src/sim/types.ts src/sim/timingMetrics.ts src/sim/simulator.ts src/App.tsx src/ui/ControlPanel.tsx src/game/PracticeScene.ts src/styles.css src/tests/timingMetrics.test.ts src/tests/simulator.test.ts src/tests/app-ui.test.tsx src/tests/practice-scene-layout.test.ts
git commit -m "fix: polish timing metrics integration"
```

Expected: commit succeeds only when verification fixes were made. If no fixes were needed, skip this commit.

## Self-Review Notes

- Spec coverage: Auto delay semantics, movement/range/cast reasons, last-10 rolling averages, weave window semantics, HUD summary layout, Session panel replacement, and verification are covered.
- Type consistency: the same `TimingMetrics`, `AutoDelaySample`, `WeaveTimeSample`, and `AutoDelayReason` names are used across tasks.
- Scope: the plan keeps existing mistake scoring for Latest mistake and does not redesign unrelated panels.
