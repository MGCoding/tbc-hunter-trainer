# Attack Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add preloaded linked TBC hunter attack sounds that play from resolved simulator events.

**Architecture:** Add a focused `src/audio/attackSounds.ts` module that owns remote OGG URLs, preloading, deterministic variant cycling, and event-to-sound dispatch. Keep the simulator pure; `App` watches only new simulator log entries and forwards them to the audio module after sync points.

**Tech Stack:** TypeScript, React, Vitest, jsdom, `HTMLAudioElement`.

---

## File Structure

- Create `src/audio/attackSounds.ts`: remote sound catalog, audio player factory, singleton preload/play helpers, and pure event mapping.
- Create `src/tests/attack-sounds.test.ts`: unit tests for preload, mapping, deterministic variants, and fail-soft behavior.
- Modify `src/App.tsx`: import attack sound helpers, preload once on app load, track a processed-event cursor, and forward new simulator events after simulator ticks/presses.
- Modify `src/tests/app-ui.test.tsx`: mock attack sound helpers and verify app startup/integration behavior.

## Task 1: Add Attack Sound Module Tests

**Files:**
- Create: `src/tests/attack-sounds.test.ts`
- Depends on missing module: `src/audio/attackSounds.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/tests/attack-sounds.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  ATTACK_SOUND_GROUPS,
  createAttackSoundPlayer,
  getAttackSoundGroupsForEvent,
  type AttackSoundGroupId,
} from "../audio/attackSounds";
import type { SimEvent } from "../sim/types";

interface MockAudio {
  url: string;
  preload: string;
  volume: number;
  currentTime: number;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  cloneNode: ReturnType<typeof vi.fn>;
}

function createMockAudioFactory(options: { rejectPlay?: boolean; throwLoad?: boolean } = {}) {
  const created: MockAudio[] = [];
  const played: MockAudio[] = [];

  const createAudio = (url: string): MockAudio => {
    const audio: MockAudio = {
      url,
      preload: "",
      volume: 0,
      currentTime: 0,
      load: vi.fn(() => {
        if (options.throwLoad) {
          throw new Error("load failed");
        }
      }),
      play: vi.fn(() => {
        played.push(audio);
        return options.rejectPlay ? Promise.reject(new Error("play failed")) : Promise.resolve();
      }),
      cloneNode: vi.fn(() => createAudio(`${url}#clone`)),
    };
    created.push(audio);
    return audio;
  };

  return { createAudio, created, played };
}

describe("attack sound event mapping", () => {
  it("maps Auto Shot windup and fire events to the correct sound groups", () => {
    expect(getAttackSoundGroupsForEvent({ type: "auto-windup", atMs: 1500, ability: "autoShot" })).toEqual([
      "bowWindup",
    ]);
    expect(getAttackSoundGroupsForEvent({ type: "auto-fire", atMs: 2000, ability: "autoShot" })).toEqual([
      "bowRelease",
      "arrowImpact",
    ]);
  });

  it("keeps clipped Auto Shots and invalid inputs silent", () => {
    const clipped: SimEvent = { type: "auto-clipped", atMs: 2000, ability: "autoShot", reason: "casting-at-spark" };
    const invalid: SimEvent = { type: "invalid-input", atMs: 1000, ability: "arcaneShot", reason: "out-of-range" };

    expect(getAttackSoundGroupsForEvent(clipped)).toEqual([]);
    expect(getAttackSoundGroupsForEvent(invalid)).toEqual([]);
  });

  it("maps completed abilities to their attack sound groups", () => {
    const expected: Record<string, AttackSoundGroupId[]> = {
      arcaneShot: ["arcaneShot"],
      steadyShot: ["steadyShot"],
      multiShot: ["multiShot", "bowRelease", "arrowImpact"],
      killCommand: ["killCommand"],
      raptorStrike: ["raptorStrike", "meleeImpact"],
      meleeSwing: ["meleeSwingWhoosh", "meleeImpact"],
      autoShot: [],
    };

    for (const [ability, groups] of Object.entries(expected)) {
      expect(
        getAttackSoundGroupsForEvent({
          type: "cast-complete",
          atMs: 1000,
          ability: ability as SimEvent["ability"],
        }),
      ).toEqual(groups);
    }
  });
});

describe("attack sound player", () => {
  it("preloads every configured sound once and does not reload on repeated preload calls", () => {
    const { createAudio, created } = createMockAudioFactory();
    const player = createAttackSoundPlayer({ createAudio });
    const configuredFileCount = Object.values(ATTACK_SOUND_GROUPS).reduce((sum, files) => sum + files.length, 0);

    player.preloadAttackSounds();
    player.preloadAttackSounds();

    expect(created).toHaveLength(configuredFileCount);
    expect(created.every((audio) => audio.preload === "auto")).toBe(true);
    expect(created.every((audio) => audio.load)).toBeTruthy();
    expect(created.reduce((sum, audio) => sum + audio.load.mock.calls.length, 0)).toBe(configuredFileCount);
  });

  it("cycles variants deterministically per sound group", () => {
    const { createAudio, played } = createMockAudioFactory();
    const player = createAttackSoundPlayer({ createAudio, volume: 0.25 });

    player.preloadAttackSounds();
    player.playAttackSoundsForEvents([
      { type: "auto-windup", atMs: 1000, ability: "autoShot" },
      { type: "auto-windup", atMs: 2000, ability: "autoShot" },
      { type: "auto-windup", atMs: 3000, ability: "autoShot" },
      { type: "auto-windup", atMs: 4000, ability: "autoShot" },
    ]);

    expect(played.map((audio) => audio.url)).toEqual([
      `${ATTACK_SOUND_GROUPS.bowWindup[0].url}#clone`,
      `${ATTACK_SOUND_GROUPS.bowWindup[1].url}#clone`,
      `${ATTACK_SOUND_GROUPS.bowWindup[2].url}#clone`,
      `${ATTACK_SOUND_GROUPS.bowWindup[0].url}#clone`,
    ]);
    expect(played.every((audio) => audio.volume === 0.25)).toBe(true);
  });

  it("plays every group mapped from a simulator event batch", () => {
    const { createAudio, played } = createMockAudioFactory();
    const player = createAttackSoundPlayer({ createAudio });

    player.preloadAttackSounds();
    player.playAttackSoundsForEvents([
      { type: "auto-fire", atMs: 2000, ability: "autoShot" },
      { type: "cast-complete", atMs: 2500, ability: "arcaneShot" },
      { type: "invalid-input", atMs: 2600, ability: "steadyShot", reason: "gcd-locked" },
    ]);

    expect(played.map((audio) => audio.url)).toEqual([
      `${ATTACK_SOUND_GROUPS.bowRelease[0].url}#clone`,
      `${ATTACK_SOUND_GROUPS.arrowImpact[0].url}#clone`,
      `${ATTACK_SOUND_GROUPS.arcaneShot[0].url}#clone`,
    ]);
  });

  it("swallows load and playback failures", () => {
    const loading = createMockAudioFactory({ throwLoad: true });
    const loadingPlayer = createAttackSoundPlayer({ createAudio: loading.createAudio });

    expect(() => loadingPlayer.preloadAttackSounds()).not.toThrow();

    const playback = createMockAudioFactory({ rejectPlay: true });
    const playbackPlayer = createAttackSoundPlayer({ createAudio: playback.createAudio });

    playbackPlayer.preloadAttackSounds();
    expect(() =>
      playbackPlayer.playAttackSoundsForEvents([{ type: "auto-windup", atMs: 1000, ability: "autoShot" }]),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- src/tests/attack-sounds.test.ts
```

Expected: FAIL because `src/audio/attackSounds.ts` does not exist.

## Task 2: Implement Attack Sound Module

**Files:**
- Create: `src/audio/attackSounds.ts`
- Test: `src/tests/attack-sounds.test.ts`

- [ ] **Step 1: Create the audio module**

Create `src/audio/attackSounds.ts`:

```ts
import type { SimEvent } from "../sim/types";

export type AttackSoundGroupId =
  | "bowWindup"
  | "bowRelease"
  | "arrowImpact"
  | "arcaneShot"
  | "steadyShot"
  | "multiShot"
  | "killCommand"
  | "raptorStrike"
  | "meleeSwingWhoosh"
  | "meleeImpact";

interface AttackSoundFile {
  title: string;
  url: string;
}

interface AudioElementLike {
  preload: string;
  volume: number;
  currentTime: number;
  load: () => void;
  play: () => Promise<void> | void;
  cloneNode: (deep?: boolean) => unknown;
}

interface AttackSoundPlayerOptions {
  createAudio?: (url: string) => AudioElementLike;
  volume?: number;
}

export const ATTACK_SOUND_GROUPS: Record<AttackSoundGroupId, AttackSoundFile[]> = {
  bowWindup: [
    {
      title: "BowPullback02",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/123/567675/BowPullback02.ogg",
    },
    {
      title: "BowPullback03",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/124/567676/BowPullback03.ogg",
    },
    {
      title: "BowPullback",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/125/567677/BowPullback.ogg",
    },
  ],
  bowRelease: [
    {
      title: "BowRelease02",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/121/567673/BowRelease02.ogg",
    },
    {
      title: "BowRelease",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/122/567674/BowRelease.ogg",
    },
    {
      title: "BowRelease03",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/130/567682/BowRelease03.ogg",
    },
  ],
  arrowImpact: [
    {
      title: "ArrowHitC",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/119/567671/ArrowHitC.ogg",
    },
    {
      title: "ArrowHitA",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/120/567672/ArrowHitA.ogg",
    },
    {
      title: "ArrowHitB",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/129/567681/ArrowHitB.ogg",
    },
  ],
  arcaneShot: [
    {
      title: "ArcaneMissileImpact1C",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/210/569554/ArcaneMissileImpact1C.ogg",
    },
    {
      title: "ArcaneMissileImpact1B",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/221/569565/ArcaneMissileImpact1B.ogg",
    },
    {
      title: "ArcaneMissileImpact1A",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/31/569631/ArcaneMissileImpact1A.ogg",
    },
  ],
  steadyShot: [
    {
      title: "DecisiveStrike",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/10/569098/DecisiveStrike.ogg",
    },
  ],
  multiShot: [
    {
      title: "RecklessnessTarget",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/147/569491/RecklessnessTarget.ogg",
    },
  ],
  killCommand: [
    {
      title: "KillCommand",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/11/568075/KillCommand.ogg",
    },
  ],
  raptorStrike: [
    {
      title: "SwingWeaponSpecialWarriorC",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/227/569827/SwingWeaponSpecialWarriorC.ogg",
    },
    {
      title: "SwingWeaponSpecialWarriorA",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/228/569828/SwingWeaponSpecialWarriorA.ogg",
    },
    {
      title: "SwingWeaponSpecialWarriorD",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/229/569829/SwingWeaponSpecialWarriorD.ogg",
    },
    {
      title: "SwingWeaponSpecialWarriorB",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/230/569830/SwingWeaponSpecialWarriorB.ogg",
    },
    {
      title: "SwingWeaponSpecialWarriorE",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/231/569831/SwingWeaponSpecialWarriorE.ogg",
    },
  ],
  meleeSwingWhoosh: [
    {
      title: "mWooshMedium2",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/127/567935/mWooshMedium2.ogg",
    },
    {
      title: "mWooshMedium1",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/130/567938/mWooshMedium1.ogg",
    },
    {
      title: "mWooshMedium3",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/131/567939/mWooshMedium3.ogg",
    },
  ],
  meleeImpact: [
    {
      title: "m2hSwordHitFlesh1A",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/91/567899/m2hSwordHitFlesh1A.ogg",
    },
    {
      title: "m2hSwordHitFlesh1B",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/101/567909/m2hSwordHitFlesh1B.ogg",
    },
    {
      title: "m2hSwordHitFlesh1C",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/107/567915/m2hSwordHitFlesh1C.ogg",
    },
  ],
};

export function getAttackSoundGroupsForEvent(event: SimEvent): AttackSoundGroupId[] {
  if (event.type === "auto-windup") {
    return ["bowWindup"];
  }

  if (event.type === "auto-fire") {
    return ["bowRelease", "arrowImpact"];
  }

  if (event.type !== "cast-complete" || !event.ability) {
    return [];
  }

  switch (event.ability) {
    case "arcaneShot":
      return ["arcaneShot"];
    case "steadyShot":
      return ["steadyShot"];
    case "multiShot":
      return ["multiShot", "bowRelease", "arrowImpact"];
    case "killCommand":
      return ["killCommand"];
    case "raptorStrike":
      return ["raptorStrike", "meleeImpact"];
    case "meleeSwing":
      return ["meleeSwingWhoosh", "meleeImpact"];
    case "autoShot":
      return [];
  }
}

function createDefaultAudio(url: string): AudioElementLike {
  const audio = new Audio(url);
  return audio;
}

export function createAttackSoundPlayer(options: AttackSoundPlayerOptions = {}) {
  const createAudio = options.createAudio ?? createDefaultAudio;
  const volume = options.volume ?? 0.36;
  const loadedGroups = new Map<AttackSoundGroupId, AudioElementLike[]>();
  const nextVariantIndexes: Partial<Record<AttackSoundGroupId, number>> = {};
  let hasPreloaded = false;

  function preloadAttackSounds(): void {
    if (hasPreloaded) {
      return;
    }

    hasPreloaded = true;
    for (const [groupId, files] of Object.entries(ATTACK_SOUND_GROUPS) as [AttackSoundGroupId, AttackSoundFile[]][]) {
      const audioElements = files.map((file) => {
        const audio = createAudio(file.url);
        audio.preload = "auto";
        audio.volume = volume;
        try {
          audio.load();
        } catch {
          // Remote audio availability should never interrupt practice.
        }
        return audio;
      });

      loadedGroups.set(groupId, audioElements);
    }
  }

  function playSoundGroup(groupId: AttackSoundGroupId): void {
    if (!hasPreloaded) {
      preloadAttackSounds();
    }

    const variants = loadedGroups.get(groupId) ?? [];
    if (variants.length === 0) {
      return;
    }

    const nextIndex = nextVariantIndexes[groupId] ?? 0;
    const baseAudio = variants[nextIndex];
    nextVariantIndexes[groupId] = (nextIndex + 1) % variants.length;

    try {
      const audio = baseAudio.cloneNode(true) as AudioElementLike;
      audio.volume = volume;
      audio.currentTime = 0;
      const result = audio.play();
      if (result instanceof Promise) {
        result.catch(() => undefined);
      }
    } catch {
      // Blocked audio should never interrupt practice.
    }
  }

  function playAttackSoundsForEvents(events: SimEvent[]): void {
    for (const event of events) {
      for (const groupId of getAttackSoundGroupsForEvent(event)) {
        playSoundGroup(groupId);
      }
    }
  }

  return {
    preloadAttackSounds,
    playAttackSoundsForEvents,
  };
}

const defaultAttackSoundPlayer = createAttackSoundPlayer();

export function preloadAttackSounds(): void {
  defaultAttackSoundPlayer.preloadAttackSounds();
}

export function playAttackSoundsForEvents(events: SimEvent[]): void {
  defaultAttackSoundPlayer.playAttackSoundsForEvents(events);
}
```

- [ ] **Step 2: Run the unit tests to verify they pass**

Run:

```bash
npm test -- src/tests/attack-sounds.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit the audio module**

Run:

```bash
git add src/audio/attackSounds.ts src/tests/attack-sounds.test.ts
git commit -m "feat: add attack sound event mapping"
```

Expected: commit succeeds.

## Task 3: Add App Integration Tests

**Files:**
- Modify: `src/tests/app-ui.test.tsx`
- Modify later: `src/App.tsx`

- [ ] **Step 1: Mock the attack sound module**

Modify the import and mock section at the top of `src/tests/app-ui.test.tsx` so it includes the attack sound helpers:

```ts
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { playAttackSoundsForEvents, preloadAttackSounds } from "../audio/attackSounds";
import { playSuccessChime } from "../audio/successChime";
import { getRotationPreset } from "../data/rotations";
import { expandRotationPattern } from "../sim/timeline";
import type { SimEvent } from "../sim/types";
import { EventLogPanel } from "../ui/EventLogPanel";

vi.mock("../audio/attackSounds", () => ({
  preloadAttackSounds: vi.fn(),
  playAttackSoundsForEvents: vi.fn(),
}));

vi.mock("../audio/successChime", () => ({
  playSuccessChime: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: Add failing App integration tests**

Add these tests inside `describe("App UI", () => { ... })` after the neutral score test:

```ts
  it("preloads attack sounds once on app load", () => {
    render(<App />);

    expect(preloadAttackSounds).toHaveBeenCalledTimes(1);
  });

  it("forwards new simulator attack events when stopping a running session", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    vi.mocked(playAttackSoundsForEvents).mockClear();

    now.mockReturnValue(2_600);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    const forwardedEvents = vi.mocked(playAttackSoundsForEvents).mock.calls.flatMap(([events]) => events);
    expect(forwardedEvents).toContainEqual({ type: "auto-windup", atMs: 1500, ability: "autoShot" });
    expect(forwardedEvents).toContainEqual({ type: "auto-fire", atMs: 2000, ability: "autoShot" });
  });

  it("does not replay already processed attack events across later state updates", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    vi.mocked(playAttackSoundsForEvents).mockClear();

    now.mockReturnValue(2_600);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    const callsAfterStop = vi.mocked(playAttackSoundsForEvents).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));

    expect(vi.mocked(playAttackSoundsForEvents).mock.calls.length).toBe(callsAfterStop);
  });
```

- [ ] **Step 3: Run the App tests to verify they fail**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `App` does not call `preloadAttackSounds` or `playAttackSoundsForEvents`.

## Task 4: Wire Attack Sounds Into App

**Files:**
- Modify: `src/App.tsx`
- Test: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Import the attack sound helpers**

Modify the imports near the top of `src/App.tsx`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_KEYBINDS } from "./data/constants";
import { playAttackSoundsForEvents, preloadAttackSounds } from "./audio/attackSounds";
import { playSuccessChime } from "./audio/successChime";
```

- [ ] **Step 2: Track the processed audio event cursor**

Add this ref near the existing refs in `App`:

```ts
  const attackSoundEventCursorRef = useRef(0);
```

- [ ] **Step 3: Add preload and forwarding helpers**

Add this effect after `getSimulator()` and before `ideal` is computed:

```ts
  useEffect(() => {
    preloadAttackSounds();
  }, []);
```

Add this function after `syncAutoShotRangeToElapsed`:

```ts
  function playNewAttackSoundEvents(): void {
    const log = getSimulator().getLog();
    const newEvents = log.slice(attackSoundEventCursorRef.current);
    attackSoundEventCursorRef.current = log.length;

    if (newEvents.length > 0) {
      playAttackSoundsForEvents(newEvents);
    }
  }
```

- [ ] **Step 4: Reset the cursor when the simulator/log resets**

Modify `handlePresetChange`:

```ts
  function handlePresetChange(id: string): void {
    simulatorRef.current = createSimulator(getRotationPreset(id));
    attackSoundEventCursorRef.current = 0;
    positionRef.current = createInitialPosition();
    movementKeysRef.current = { ...EMPTY_MOVEMENT_KEYS };
    movementUpdatedAtMsRef.current = 0;
    lastPerfectPressKeyRef.current = null;
    setRunning(false);
    setSelectedPresetId(id);
    setEvents([]);
  }
```

Modify `handleStart`:

```ts
  function handleStart(): void {
    simulatorRef.current = createSimulator(preset);
    attackSoundEventCursorRef.current = 0;
    positionRef.current = createInitialPosition();
    movementKeysRef.current = { ...EMPTY_MOVEMENT_KEYS };
    movementUpdatedAtMsRef.current = 0;
    lastPerfectPressKeyRef.current = null;
    sessionStartedAtRef.current = performance.now();
    setEvents([]);
    setRunning(true);
  }
```

Modify `handleResetLog`:

```ts
  function handleResetLog(): void {
    if (running) {
      const nowMs = performance.now();
      syncLiveStateToNow(nowMs);
      playNewAttackSoundEvents();
      clearSimulatorLogAtSessionNow(getSimulator(), nowMs, sessionStartedAtRef.current);
    } else {
      getSimulator().resetLog();
    }

    attackSoundEventCursorRef.current = 0;
    setEvents([]);
  }
```

- [ ] **Step 5: Forward new events after live state reads, ability presses, and stop**

Modify `getPracticeState` so it forwards events after the simulator read:

```ts
  const getPracticeState = useCallback((): PracticeState => {
    const nowMs = performance.now();
    const { range } = syncLiveStateToNow(nowMs);
    const simulator = getSimulator();
    const simulatorState = readSimulatorStateAtSessionNow(
      simulator,
      runningRef.current,
      nowMs,
      sessionStartedAtRef.current,
    );
    playNewAttackSoundEvents();

    return {
      simulator: simulatorState,
      position: {
        player: { ...positionRef.current.player },
        target: { ...positionRef.current.target },
      },
      range,
    };
  }, []);
```

Modify `handleStop`:

```ts
  function handleStop(): void {
    if (running) {
      const nowMs = performance.now();
      syncLiveStateToNow(nowMs);
      tickSimulatorToSessionNow(getSimulator(), nowMs, sessionStartedAtRef.current);
      playNewAttackSoundEvents();
    }

    setRunning(false);
    setEvents(getSimulator().getLog());
  }
```

Modify the end of the running branch in `handleAbilityPress` so events are forwarded before the UI event state is updated:

```ts
      if (perfectPressKey !== null && !inputWasInvalid && lastPerfectPressKeyRef.current !== perfectPressKey) {
        lastPerfectPressKeyRef.current = perfectPressKey;
        playSuccessChime();
      }
      playNewAttackSoundEvents();
      setEvents(simulator.getLog());
```

- [ ] **Step 6: Run the App tests to verify they pass**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit App integration**

Run:

```bash
git add src/App.tsx src/tests/app-ui.test.tsx
git commit -m "feat: play attack sounds from simulator events"
```

Expected: commit succeeds.

## Task 5: Full Verification

**Files:**
- Verify: `src/audio/attackSounds.ts`
- Verify: `src/App.tsx`
- Verify: `src/tests/attack-sounds.test.ts`
- Verify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Run all unit tests**

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

Expected: PASS.

- [ ] **Step 3: Start the dev server for manual audio verification**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 4: Manual browser checks**

Open the local Vite URL and verify:

- the app loads without console errors
- attack sound OGG requests are initiated on app load as allowed by the browser
- Auto Shot windup sound plays when the windup event starts
- clipped Auto Shots play windup but do not play release or impact
- successful Auto Shots play release and arrow impact
- Arcane Shot, Steady Shot, Multi-Shot, Kill Command, Raptor Strike, and white melee swing events each produce audible feedback when they resolve
- invalid out-of-range inputs stay silent

- [ ] **Step 5: Stop the dev server**

Stop the Vite process with `Ctrl-C`.

- [ ] **Step 6: Commit verification fixes only if changes were needed**

If verification required code changes, commit them:

```bash
git add src/audio/attackSounds.ts src/App.tsx src/tests/attack-sounds.test.ts src/tests/app-ui.test.tsx
git commit -m "fix: polish attack sound playback"
```

Expected: commit succeeds only when verification produced edits. If no edits were needed, skip this commit step.
