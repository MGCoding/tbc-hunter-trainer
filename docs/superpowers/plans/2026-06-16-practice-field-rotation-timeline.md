# Practice Field Rotation Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal right-edge Phaser overlay that shows the selected rotation timeline and plays a short success chime only for correctly timed user inputs.

**Architecture:** Keep the timeline overlay in `PracticeScene`, where the practice HUD already renders every frame. Add pure timeline helpers in `src/sim/timeline.ts` for loop position and perfect input detection, and keep the Web Audio chime isolated in `src/audio/successChime.ts`. `App` remains responsible for input handling and decides whether a timed input should trigger audio.

**Tech Stack:** React 19, Phaser 3, TypeScript, Vite, Vitest, Testing Library, Playwright.

---

## Current Workspace Note

Before implementing, inspect `git status --short`. At planning time these files already had uncommitted changes and must be preserved unless the user explicitly says otherwise:

- `e2e/app.spec.ts`
- `src/App.tsx`
- `src/sim/simulator.ts`
- `src/sim/types.ts`
- `src/tests/app-ui.test.tsx`
- `src/tests/practice-scene-layout.test.ts`
- `src/tests/simulator.test.ts`

Do not revert unrelated edits. When touching one of these files, read the current contents first and layer the new changes on top.

## File Structure

- Modify `src/sim/timeline.ts`: add pure helpers for rotation loop timing, perfect press detection, duplicate success keys, and action-to-ideal ability matching.
- Modify `src/tests/abilities-timeline.test.ts`: cover the new pure timeline helpers.
- Create `src/audio/successChime.ts`: generate a short Web Audio chime and fail soft when audio is unavailable.
- Modify `src/App.tsx`: call perfect press detection from the existing ability input path and trigger the chime after non-invalid simulator handling.
- Modify `src/tests/app-ui.test.tsx`: mock the chime helper and verify correct, wrong, and duplicate input behavior.
- Modify `src/game/PhaserHost.tsx`: pass the expanded ideal timeline into the Phaser scene.
- Modify `src/game/PracticeScene.ts`: export/reuse icon definitions, calculate timeline rail layout, create timeline image objects, and render the rail/bar.
- Modify `src/tests/practice-scene-layout.test.ts`: cover rail layout and timeline icon view helpers.

### Task 1: Timeline Timing Helpers

**Files:**
- Modify: `src/sim/timeline.ts`
- Modify: `src/tests/abilities-timeline.test.ts`

- [ ] **Step 1: Add failing tests for loop timing and perfect press detection**

Append these imports in `src/tests/abilities-timeline.test.ts`:

```ts
import type { AbilityActionId } from "../sim/types";
```

Extend the existing `import { expandRotationPattern, parseRotationTokens } from "../sim/timeline";` to:

```ts
import {
  PERFECT_PRESS_TOLERANCE_MS,
  actionMatchesIdealAbility,
  describePerfectPressKey,
  expandRotationPattern,
  findPerfectPress,
  getLoopedTimelinePosition,
  getRotationPatternDurationMs,
  parseRotationTokens,
} from "../sim/timeline";
```

Add this `describe` block before `describeCooldownFailure`:

```ts
describe("looped rotation timeline helpers", () => {
  it("uses the last ideal event as the repeating pattern duration", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));

    expect(getRotationPatternDurationMs(ideal)).toBe(ideal.at(-1)!.idealAtMs);
    expect(getRotationPatternDurationMs([])).toBe(0);
  });

  it("maps elapsed session time into rotation loop position", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const patternDurationMs = getRotationPatternDurationMs(ideal);
    const position = getLoopedTimelinePosition(ideal, patternDurationMs + 250);

    expect(position).toEqual({
      loopIndex: 1,
      loopElapsedMs: 250,
      patternDurationMs,
    });
  });

  it("finds a perfect press within the timing tolerance", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const steady = ideal.find((event) => event.ability === "steadyShot")!;
    const result = findPerfectPress(ideal, "steadyShot", steady.idealAtMs + PERFECT_PRESS_TOLERANCE_MS);

    expect(result).toMatchObject({
      loopIndex: 0,
      eventIndex: steady.index,
      idealEvent: steady,
      offsetMs: PERFECT_PRESS_TOLERANCE_MS,
    });
  });

  it("rejects wrong, early, and late presses", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    expect(findPerfectPress(ideal, "arcaneShot", steady.idealAtMs)).toBeNull();
    expect(findPerfectPress(ideal, "steadyShot", steady.idealAtMs - PERFECT_PRESS_TOLERANCE_MS - 1)).toBeNull();
    expect(findPerfectPress(ideal, "steadyShot", steady.idealAtMs + PERFECT_PRESS_TOLERANCE_MS + 1)).toBeNull();
  });

  it("matches the melee action input to both Raptor Strike and white melee swing events", () => {
    const actions: AbilityActionId[] = ["raptorStrike", "steadyShot"];

    expect(actionMatchesIdealAbility(actions[0], "raptorStrike")).toBe(true);
    expect(actionMatchesIdealAbility(actions[0], "meleeSwing")).toBe(true);
    expect(actionMatchesIdealAbility(actions[1], "meleeSwing")).toBe(false);
  });

  it("describes duplicate suppression keys by loop and event index", () => {
    expect(describePerfectPressKey({ loopIndex: 2, eventIndex: 7 })).toBe("2:7");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/tests/abilities-timeline.test.ts
```

Expected: FAIL with missing exports from `src/sim/timeline.ts`.

- [ ] **Step 3: Implement the pure helpers**

Add these exports near the top of `src/sim/timeline.ts`, after the label constants:

```ts
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
  for (const event of ideal) {
    if (!actionMatchesIdealAbility(action, event.ability)) {
      continue;
    }

    const offsetMs = position.loopElapsedMs - event.idealAtMs;
    if (Math.abs(offsetMs) > toleranceMs) {
      continue;
    }

    if (best === null || Math.abs(offsetMs) < Math.abs(best.offsetMs)) {
      best = {
        loopIndex: position.loopIndex,
        eventIndex: event.index,
        idealEvent: event,
        offsetMs,
      };
    }
  }

  return best;
}

export function describePerfectPressKey(parts: PerfectPressKeyParts): string {
  return `${parts.loopIndex}:${parts.eventIndex}`;
}
```

Update the type import at the top of `src/sim/timeline.ts`:

```ts
import type { AbilityActionId, AbilityId, IdealEvent, RotationPreset, RotationToken, SimEvent } from "./types";
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- src/tests/abilities-timeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/sim/timeline.ts src/tests/abilities-timeline.test.ts
git commit -m "feat: add looped rotation timing helpers"
```

### Task 2: Success Chime And Input Feedback

**Files:**
- Create: `src/audio/successChime.ts`
- Modify: `src/App.tsx`
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Add failing App UI tests for success sound behavior**

Add this mock near the top of `src/tests/app-ui.test.tsx`, after imports:

```ts
vi.mock("../audio/successChime", () => ({
  playSuccessChime: vi.fn(),
}));
```

Add this import:

```ts
import { playSuccessChime } from "../audio/successChime";
import { getRotationPreset } from "../data/rotations";
import { expandRotationPattern } from "../sim/timeline";
```

Add these tests inside the existing `describe("App UI", () => {` block:

```ts
  it("plays a success chime for a correctly timed expected ability input", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(steady.idealAtMs + 75);
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(playSuccessChime).toHaveBeenCalledTimes(1);
  });

  it("does not play a success chime for wrong or late ability input", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(steady.idealAtMs);
    fireEvent.keyDown(document, { code: "Digit1" });
    now.mockReturnValue(steady.idealAtMs + 250);
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(playSuccessChime).not.toHaveBeenCalled();
  });

  it("plays only one success chime for repeated presses inside the same ideal event window", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(steady.idealAtMs);
    fireEvent.keyDown(document, { code: "Digit4" });
    fireEvent.keyUp(document, { code: "Digit4" });
    now.mockReturnValue(steady.idealAtMs + 20);
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(playSuccessChime).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `src/audio/successChime.ts` does not exist and `App` does not call it.

- [ ] **Step 3: Create the Web Audio helper**

Create `src/audio/successChime.ts`:

```ts
export function playSuccessChime(): void {
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  try {
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    oscillator.addEventListener("ended", () => {
      void context.close();
    });
  } catch {
    // Blocked audio should never interrupt practice.
  }
}
```

Add a type declaration at the top of the file so TypeScript accepts `webkitAudioContext`:

```ts
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
```

- [ ] **Step 4: Wire perfect input detection into App**

In `src/App.tsx`, add imports:

```ts
import { playSuccessChime } from "./audio/successChime";
import { describePerfectPressKey, findPerfectPress } from "./sim/timeline";
```

Add a ref near the other refs:

```ts
  const lastPerfectPressKeyRef = useRef<string | null>(null);
```

Reset it in `handlePresetChange` and `handleStart`:

```ts
    lastPerfectPressKeyRef.current = null;
```

Inside `handleAbilityPress`, after range validation and before `simulator.pressAbility(action, atMs);`, compute the possible match:

```ts
      const perfectPress = findPerfectPress(ideal, action, atMs);
      const perfectPressKey = perfectPress ? describePerfectPressKey(perfectPress) : null;
      const logLengthBeforePress = simulator.getLog().length;
```

Replace the existing press/log update block:

```ts
      simulator.pressAbility(action, atMs);
      setEvents(simulator.getLog());
```

with:

```ts
      simulator.pressAbility(action, atMs);
      const newLogEntries = simulator.getLog().slice(logLengthBeforePress);
      const inputWasInvalid = newLogEntries.some((event) => event.type === "invalid-input" && event.atMs === atMs);
      if (perfectPressKey !== null && !inputWasInvalid && lastPerfectPressKeyRef.current !== perfectPressKey) {
        lastPerfectPressKeyRef.current = perfectPressKey;
        playSuccessChime();
      }
      setEvents(simulator.getLog());
```

Ensure `ideal` is included in the `useCallback` dependency array for `handleAbilityPress`.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/audio/successChime.ts src/App.tsx src/tests/app-ui.test.tsx
git commit -m "feat: chime on perfect rotation inputs"
```

### Task 3: Pass Timeline Data Into Phaser

**Files:**
- Modify: `src/game/PhaserHost.tsx`
- Modify: `src/App.tsx`
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Add a failing UI test that PhaserHost receives the selected timeline**

Because `PhaserHost` renders as a plain `div` in jsdom, add a test-only data attribute that exposes the ideal event count.

Add this assertion to the existing `"updates the selected rotation"` test in `src/tests/app-ui.test.tsx` after the select changes:

```ts
    expect(screen.getByTestId("phaser-host")).toHaveAttribute(
      "data-ideal-count",
      String(expandRotationPattern(getRotationPreset("half-weave-22-1w")).length),
    );
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `PhaserHost` does not accept or render `ideal`.

- [ ] **Step 3: Update PhaserHost props and scene startup data**

In `src/game/PhaserHost.tsx`, import `IdealEvent`:

```ts
import type { AbilityActionId, IdealEvent, MovementKeys } from "../sim/types";
```

Add the prop:

```ts
  ideal: IdealEvent[];
```

Destructure it:

```ts
  ideal,
```

Pass it to scene startup:

```ts
      game.scene.add("PracticeScene", PracticeScene, true, { preset, ideal, getPracticeState, getKeybindings });
```

Include `ideal` in the Phaser creation effect dependency array.

Expose the test attribute:

```tsx
  return <div ref={parentRef} className="phaser-host" data-testid="phaser-host" data-ideal-count={ideal.length} tabIndex={0} />;
```

In `src/App.tsx`, pass the existing `ideal` memo:

```tsx
          ideal={ideal}
```

- [ ] **Step 4: Update PracticeScene data type**

In `src/game/PracticeScene.ts`, import `IdealEvent` in the type import and update `PracticeSceneData`:

```ts
  IdealEvent,
```

```ts
  ideal: IdealEvent[];
```

Add a scene field:

```ts
  private ideal!: IdealEvent[];
```

Set it in `init`:

```ts
    this.ideal = data.ideal;
```

- [ ] **Step 5: Run focused tests and verify they pass**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx src/tests/practice-scene-layout.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/App.tsx src/game/PhaserHost.tsx src/game/PracticeScene.ts src/tests/app-ui.test.tsx
git commit -m "feat: pass ideal timeline to practice scene"
```

### Task 4: Timeline Rail Layout And Icon Views

**Files:**
- Modify: `src/game/PracticeScene.ts`
- Modify: `src/tests/practice-scene-layout.test.ts`

- [ ] **Step 1: Add failing layout and icon-view tests**

Extend the import in `src/tests/practice-scene-layout.test.ts`:

```ts
  calculateTimelineRailLayout,
  getTimelineIconViews,
```

Add `IdealEvent` to the type import:

```ts
import type { IdealEvent, SimulatorState } from "../sim/types";
```

Add these tests inside the existing `describe("PracticeScene layout", () => {` block:

```ts
  it("pins the timeline rail to the right side and above the bottom HUD when space allows", () => {
    const layout = calculatePracticeLayout(900, 800);
    const rail = calculateTimelineRailLayout(900, 800, 12);

    expect(rail.visible).toBe(true);
    expect(rail.left + rail.width).toBeLessThanOrEqual(900 - 12);
    expect(rail.top).toBeGreaterThanOrEqual(12);
    expect(rail.top + rail.height).toBeLessThanOrEqual(layout.hud.top - 8);
    expect(rail.visibleEvents).toBe(12);
  });

  it("shrinks the timeline rail to show as many events as possible on short fields", () => {
    const rail = calculateTimelineRailLayout(390, 273, 24);

    expect(rail.visible).toBe(true);
    expect(rail.iconSize).toBeGreaterThanOrEqual(18);
    expect(rail.visibleEvents).toBeGreaterThan(0);
    expect(rail.visibleEvents).toBeLessThanOrEqual(24);
  });

  it("hides the timeline rail when there are no ideal events", () => {
    expect(calculateTimelineRailLayout(900, 800, 0).visible).toBe(false);
  });

  it("builds timeline icon views for Auto, spell, Raptor, and white melee events", () => {
    const ideal: IdealEvent[] = [
      { index: 0, token: "a", ability: "autoShot", idealAtMs: 1000, label: "Auto" },
      { index: 1, token: "s", ability: "steadyShot", idealAtMs: 1500, label: "Steady" },
      { index: 2, token: "w", ability: "raptorStrike", idealAtMs: 3000, label: "Weave" },
      { index: 3, token: "w", ability: "meleeSwing", idealAtMs: 6500, label: "Weave" },
    ];

    const views = getTimelineIconViews(ideal);

    expect(views.map((view) => view.ability)).toEqual(["autoShot", "steadyShot", "raptorStrike", "meleeSwing"]);
    expect(views[3]).toMatchObject({
      ability: "meleeSwing",
      usesNeutralMeleeTint: true,
    });
    expect(views[0].iconKey).toBe("ability-icon-autoShot");
  });
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts
```

Expected: FAIL with missing `calculateTimelineRailLayout` and `getTimelineIconViews`.

- [ ] **Step 3: Export icon definitions and add timeline layout helpers**

In `src/game/PracticeScene.ts`, change `const ABILITY_ICON_DEFS = [` to:

```ts
export const ABILITY_ICON_DEFS = [
```

Add these interfaces near `AbilityIconView`:

```ts
export interface TimelineIconView {
  event: IdealEvent;
  ability: AbilityId;
  iconKey: string;
  iconUrl: string;
  usesNeutralMeleeTint: boolean;
}

export interface TimelineRailLayout {
  visible: boolean;
  top: number;
  left: number;
  width: number;
  height: number;
  iconSize: number;
  iconGap: number;
  markerWidth: number;
  visibleEvents: number;
}
```

Add constants near the other layout constants:

```ts
const TIMELINE_RAIL_MARGIN = 12;
const TIMELINE_RAIL_WIDTH = 58;
const TIMELINE_ICON_MAX_SIZE = 34;
const TIMELINE_ICON_MIN_SIZE = 18;
const TIMELINE_ICON_MIN_GAP = 4;
```

Add helper functions after `calculatePracticeLayout`:

```ts
function getIconDefinitionForAbility(ability: AbilityId): (typeof ABILITY_ICON_DEFS)[number] {
  if (ability === "meleeSwing") {
    return ABILITY_ICON_DEFS.find((definition) => definition.ability === "raptorStrike")!;
  }

  const definition = ABILITY_ICON_DEFS.find((entry) => entry.ability === ability);
  if (!definition) {
    return ABILITY_ICON_DEFS.find((entry) => entry.ability === "raptorStrike")!;
  }

  return definition;
}

export function getTimelineIconViews(ideal: IdealEvent[]): TimelineIconView[] {
  return ideal.map((event) => {
    const definition = getIconDefinitionForAbility(event.ability);

    return {
      event,
      ability: event.ability,
      iconKey: `ability-icon-${definition.action}`,
      iconUrl: `${WOWHEAD_ICON_BASE_URL}${definition.icon}`,
      usesNeutralMeleeTint: event.ability === "meleeSwing",
    };
  });
}

export function calculateTimelineRailLayout(width: number, height: number, eventCount: number): TimelineRailLayout {
  if (width <= 0 || height <= 0 || eventCount <= 0) {
    return {
      visible: false,
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      iconSize: 0,
      iconGap: 0,
      markerWidth: 0,
      visibleEvents: 0,
    };
  }

  const practiceLayout = calculatePracticeLayout(width, height);
  const top = TIMELINE_RAIL_MARGIN;
  const preferredBottom = practiceLayout.hud.top - 8;
  const fallbackBottom = height - TIMELINE_RAIL_MARGIN;
  const bottom = preferredBottom - top >= 96 ? preferredBottom : fallbackBottom;
  const availableHeight = Math.max(0, bottom - top);
  const idealGapTotal = Math.max(0, eventCount - 1) * TIMELINE_ICON_MIN_GAP;
  const fittedIconSize = Math.floor((availableHeight - idealGapTotal) / eventCount);
  const iconSize = clamp(fittedIconSize, TIMELINE_ICON_MIN_SIZE, TIMELINE_ICON_MAX_SIZE);
  const visibleEvents = Math.max(
    1,
    Math.min(eventCount, Math.floor((availableHeight + TIMELINE_ICON_MIN_GAP) / (iconSize + TIMELINE_ICON_MIN_GAP))),
  );
  const iconGap =
    visibleEvents > 1
      ? Math.max(TIMELINE_ICON_MIN_GAP, Math.floor((availableHeight - visibleEvents * iconSize) / (visibleEvents - 1)))
      : 0;
  const railHeight = visibleEvents * iconSize + Math.max(0, visibleEvents - 1) * iconGap;

  return {
    visible: availableHeight >= TIMELINE_ICON_MIN_SIZE,
    top,
    left: width - TIMELINE_RAIL_MARGIN - TIMELINE_RAIL_WIDTH,
    width: TIMELINE_RAIL_WIDTH,
    height: railHeight,
    iconSize,
    iconGap,
    markerWidth: TIMELINE_RAIL_WIDTH + 10,
    visibleEvents,
  };
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/game/PracticeScene.ts src/tests/practice-scene-layout.test.ts
git commit -m "feat: calculate practice timeline rail"
```

### Task 5: Render The Phaser Timeline Overlay

**Files:**
- Modify: `src/game/PracticeScene.ts`
- Modify: `src/tests/practice-scene-layout.test.ts`

- [ ] **Step 1: Add a failing pure test for marker position**

Extend the import in `src/tests/practice-scene-layout.test.ts`:

```ts
  getTimelineEventY,
  getTimelineMarkerY,
```

Add this test:

```ts
  it("maps live session time to a looping timeline marker y position", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const rail = calculateTimelineRailLayout(900, 800, ideal.length);
    const firstEvent = ideal[0];
    const firstEventY = rail.top + rail.iconSize / 2;

    expect(getTimelineMarkerY(rail, ideal, firstEvent.idealAtMs)).toBeCloseTo(firstEventY);
    expect(getTimelineMarkerY(rail, ideal, getRotationPatternDurationMs(ideal) + firstEvent.idealAtMs)).toBeCloseTo(firstEventY);
  });

  it("positions timeline icons by ideal event time rather than equal index spacing", () => {
    const ideal: IdealEvent[] = [
      { index: 0, token: "a", ability: "autoShot", idealAtMs: 1000, label: "Auto" },
      { index: 1, token: "s", ability: "steadyShot", idealAtMs: 1200, label: "Steady" },
      { index: 2, token: "m", ability: "multiShot", idealAtMs: 5000, label: "Multi" },
    ];
    const rail = calculateTimelineRailLayout(900, 800, ideal.length);
    const firstGap = getTimelineEventY(rail, ideal, ideal[1]) - getTimelineEventY(rail, ideal, ideal[0]);
    const secondGap = getTimelineEventY(rail, ideal, ideal[2]) - getTimelineEventY(rail, ideal, ideal[1]);

    expect(firstGap).toBeLessThan(secondGap);
  });
```

Add these imports:

```ts
import { expandRotationPattern, getRotationPatternDurationMs } from "../sim/timeline";
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts
```

Expected: FAIL with missing `getTimelineEventY` and `getTimelineMarkerY`.

- [ ] **Step 3: Add marker helper and scene objects**

In `src/game/PracticeScene.ts`, import:

```ts
import { getLoopedTimelinePosition, getRotationPatternDurationMs } from "../sim/timeline";
```

Add:

```ts
export function getTimelineEventY(layout: TimelineRailLayout, ideal: IdealEvent[], event: IdealEvent): number {
  const visibleIdeal = ideal.slice(0, layout.visibleEvents);
  const firstVisibleAtMs = visibleIdeal[0]?.idealAtMs ?? 0;
  const lastVisibleAtMs = visibleIdeal.at(-1)?.idealAtMs ?? firstVisibleAtMs;
  const visibleDurationMs = Math.max(1, lastVisibleAtMs - firstVisibleAtMs);
  const progress = clamp01((event.idealAtMs - firstVisibleAtMs) / visibleDurationMs);
  const travelHeight = Math.max(0, layout.height - layout.iconSize);

  return layout.top + layout.iconSize / 2 + progress * travelHeight;
}

export function getTimelineMarkerY(layout: TimelineRailLayout, ideal: IdealEvent[], elapsedMs: number): number {
  const visibleIdeal = ideal.slice(0, layout.visibleEvents);
  const firstVisibleAtMs = visibleIdeal[0]?.idealAtMs ?? 0;
  const lastVisibleAtMs = visibleIdeal.at(-1)?.idealAtMs ?? firstVisibleAtMs;
  const visibleDurationMs = Math.max(1, lastVisibleAtMs - firstVisibleAtMs);
  const position = getLoopedTimelinePosition(ideal, elapsedMs);
  const visibleElapsedMs = clamp(position.loopElapsedMs, firstVisibleAtMs, lastVisibleAtMs);
  const progress = clamp01((visibleElapsedMs - firstVisibleAtMs) / visibleDurationMs);
  const travelHeight = Math.max(0, layout.height - layout.iconSize);

  return layout.top + layout.iconSize / 2 + progress * travelHeight;
}
```

Add this object interface:

```ts
interface TimelineIconObject {
  image: Phaser.GameObjects.Image;
}
```

Add scene fields:

```ts
  private timelineIcons: TimelineIconObject[] = [];
```

In `create()`, after creating ability icons:

```ts
    this.timelineIcons = this.ideal.map(() => ({
      image: this.add.image(0, 0, "").setScrollFactor(0),
    }));
```

In `preload()`, load timeline icon views too:

```ts
    const iconViews = [
      ...getAbilityIconViews(
        {
          nowMs: 0,
          gcdReadyAtMs: 0,
          nextAutoAtMs: this.preset.targetRangedSwingMs,
          nextMeleeAtMs: this.preset.derivedMeleeSwingMs,
          raptorReadyAtMs: 0,
          activeCast: null,
          queuedAbility: null,
          autoPaused: false,
        },
        this.preset,
        this.getKeybindings(),
      ),
      ...getTimelineIconViews(this.ideal),
    ];
    const queuedIconKeys = new Set<string>();
    for (const view of iconViews) {
      if (queuedIconKeys.has(view.iconKey) || this.textures.exists(view.iconKey)) {
        continue;
      }

      queuedIconKeys.add(view.iconKey);
      this.load.image(view.iconKey, view.iconUrl);
    }
```

This replaces the current ability-icon-only preload loop rather than being added as a second independent loop.

- [ ] **Step 4: Draw the rail during HUD rendering**

At the end of `drawHud`, after the existing `this.drawAbilityIcons(hud, getAbilityIconViews(state, this.preset, this.getKeybindings()));` call, add:

```ts
    this.drawTimelineRail(state);
```

Add this method:

```ts
  private drawTimelineRail(state: SimulatorState): void {
    const camera = this.cameras.main;
    const views = getTimelineIconViews(this.ideal);
    const layout = calculateTimelineRailLayout(camera.width, camera.height, views.length);

    for (let index = 0; index < this.timelineIcons.length; index += 1) {
      this.timelineIcons[index].image.setVisible(false);
    }

    if (!layout.visible || views.length === 0 || getRotationPatternDurationMs(this.ideal) <= 0) {
      return;
    }

    this.hud.fillStyle(0x080b0e, 0.62);
    this.hud.fillRoundedRect(layout.left, layout.top - 6, layout.width, layout.height + 12, 8);
    this.hud.lineStyle(1, 0xf4f2ed, 0.18);
    this.hud.strokeRoundedRect(layout.left, layout.top - 6, layout.width, layout.height + 12, 8);

    const iconLeft = layout.left + layout.width / 2 - layout.iconSize / 2;
    for (let index = 0; index < Math.min(layout.visibleEvents, views.length); index += 1) {
      const view = views[index];
      const object = this.timelineIcons[index];
      const y = getTimelineEventY(layout, this.ideal, view.event) - layout.iconSize / 2;
      const centerX = iconLeft + layout.iconSize / 2;
      const centerY = y + layout.iconSize / 2;

      this.hud.fillStyle(0x080b0e, 0.78);
      this.hud.fillRoundedRect(iconLeft, y, layout.iconSize, layout.iconSize, 5);
      this.hud.lineStyle(1, view.usesNeutralMeleeTint ? 0xc9d3d8 : 0xf5df9f, view.usesNeutralMeleeTint ? 0.46 : 0.32);
      this.hud.strokeRoundedRect(iconLeft, y, layout.iconSize, layout.iconSize, 5);

      object.image.setVisible(true);
      object.image.setTexture(view.iconKey);
      object.image.setPosition(centerX, centerY);
      object.image.setDisplaySize(layout.iconSize - 4, layout.iconSize - 4);
      object.image.setAlpha(view.usesNeutralMeleeTint ? 0.72 : 0.96);
      object.image.setTint(view.usesNeutralMeleeTint ? 0xd8dde2 : 0xffffff);
    }

    const markerY = getTimelineMarkerY(layout, this.ideal, state.nowMs);
    this.hud.lineStyle(3, 0xd7a84a, 0.96);
    this.hud.lineBetween(layout.left - 5, markerY, layout.left + layout.markerWidth - 5, markerY);
    this.hud.lineStyle(1, 0xf5df9f, 0.55);
    this.hud.lineBetween(layout.left - 5, markerY - 3, layout.left + layout.markerWidth - 5, markerY - 3);
    this.hud.lineBetween(layout.left - 5, markerY + 3, layout.left + layout.markerWidth - 5, markerY + 3);
  }
```

- [ ] **Step 5: Run focused tests and a full test pass**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts
npm test
```

Expected: PASS for both commands.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/game/PracticeScene.ts src/tests/practice-scene-layout.test.ts
git commit -m "feat: render practice timeline overlay"
```

### Task 6: Browser Verification And Build

- [ ] **Step 1: Run build and automated tests**

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 3: Manually verify the practice overlay**

Open the local URL and verify:

- the minimal rail appears over the right side of the practice field
- the rail is not in the React side panel
- the selected rotation shows as many icons as the viewport can fit
- the gold timing bar moves downward during a running session
- the bar loops back to the top after the pattern completes
- correctly timed matching input plays a short chime
- wrong, early, late, and duplicate same-window inputs stay silent
- desktop and mobile-sized viewports remain readable

- [ ] **Step 4: Stop the dev server**

Stop the dev server with `Ctrl-C`.

## Final Verification

Run:

```bash
npm test
npm run build
```

Expected: both commands exit 0.

Then report:

- the commits created
- whether browser manual verification passed
- any existing dirty files that were preserved
