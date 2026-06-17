# Phaser Render Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Auto-first Phaser render scale setting that keeps the practice canvas at 100% CSS size while rendering a high-DPI backing buffer.

**Architecture:** Add a focused render-scale helper module for parsing, persistence, and effective-scale calculation. React owns the user preference and passes it to `PhaserHost`; `PhaserHost` measures the host frame and applies physical canvas sizing; `PracticeScene` continues laying out in logical CSS pixels while its camera zoom maps logical pixels onto the larger backing store.

**Tech Stack:** TypeScript, React 19, Phaser 3, Vite, Vitest, Testing Library, Playwright.

---

## File Structure

- Create `src/game/renderScale.ts`: render scale preference type, allowed options, storage helpers, clamping, label formatting, and effective-scale calculation.
- Create `src/tests/render-scale.test.ts`: unit coverage for helper parsing, storage behavior, labels, and DPR clamping.
- Modify `src/ui/ControlPanel.tsx`: add a compact `Render Scale` select inside the Session panel.
- Modify `src/App.tsx`: load and save render scale preference, pass it to `ControlPanel` and `PhaserHost`.
- Modify `src/game/PhaserHost.tsx`: measure host CSS size with `ResizeObserver`, resolve effective scale, configure Phaser at physical backing size, and forward logical size/effective scale to the scene.
- Modify `src/game/PracticeScene.ts`: accept logical size/effective scale, render layout from logical dimensions, and apply camera viewport/zoom updates.
- Modify `src/tests/app-ui.test.tsx`: test control defaults, persistence, and the prop passed to the PhaserHost mock.
- Modify `e2e/app.spec.ts`: verify Auto at high DPR produces a larger backing store while preserving CSS display size, and manual `1x` opts out.

## Task 1: Render Scale Helpers

**Files:**
- Create: `src/game/renderScale.ts`
- Create: `src/tests/render-scale.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/tests/render-scale.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RENDER_SCALE_OPTIONS,
  clearStoredRenderScalePreference,
  formatEffectiveRenderScale,
  formatRenderScaleOptionLabel,
  getEffectiveRenderScale,
  loadStoredRenderScalePreference,
  parseRenderScalePreference,
  saveStoredRenderScalePreference,
} from "../game/renderScale";

const storageKey = "melee-weaving-practice.renderScale.v1";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("render scale helpers", () => {
  it("defines Auto and the supported manual scale options", () => {
    expect(RENDER_SCALE_OPTIONS).toEqual(["auto", 1, 1.5, 2, 3, 4]);
  });

  it("parses only supported preferences", () => {
    expect(parseRenderScalePreference("auto")).toBe("auto");
    expect(parseRenderScalePreference(1)).toBe(1);
    expect(parseRenderScalePreference(1.5)).toBe(1.5);
    expect(parseRenderScalePreference(2)).toBe(2);
    expect(parseRenderScalePreference(3)).toBe(3);
    expect(parseRenderScalePreference(4)).toBe(4);
    expect(parseRenderScalePreference(0)).toBeNull();
    expect(parseRenderScalePreference(2.5)).toBeNull();
    expect(parseRenderScalePreference("2")).toBeNull();
  });

  it("resolves Auto from devicePixelRatio and clamps it to one through four", () => {
    expect(getEffectiveRenderScale("auto", 0)).toBe(1);
    expect(getEffectiveRenderScale("auto", Number.NaN)).toBe(1);
    expect(getEffectiveRenderScale("auto", 1.25)).toBe(1.25);
    expect(getEffectiveRenderScale("auto", 5)).toBe(4);
  });

  it("uses manual preferences directly", () => {
    expect(getEffectiveRenderScale(1, 3)).toBe(1);
    expect(getEffectiveRenderScale(1.5, 3)).toBe(1.5);
    expect(getEffectiveRenderScale(4, 1)).toBe(4);
  });

  it("formats option labels and effective scale labels", () => {
    expect(formatRenderScaleOptionLabel("auto", 2)).toBe("Auto (2x)");
    expect(formatRenderScaleOptionLabel(1.5, 2)).toBe("1.5x");
    expect(formatEffectiveRenderScale(1.25)).toBe("1.25x");
    expect(formatEffectiveRenderScale(2)).toBe("2x");
  });

  it("loads Auto when no stored preference exists", () => {
    expect(loadStoredRenderScalePreference()).toBe("auto");
  });

  it("saves and loads a valid manual preference", () => {
    saveStoredRenderScalePreference(3);

    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toBe(3);
    expect(loadStoredRenderScalePreference()).toBe(3);
  });

  it("loads Auto for malformed or unsupported stored preferences", () => {
    localStorage.setItem(storageKey, "{not-json");
    expect(loadStoredRenderScalePreference()).toBe("auto");

    localStorage.setItem(storageKey, JSON.stringify(2.5));
    expect(loadStoredRenderScalePreference()).toBe("auto");
  });

  it("clears stored render scale preference", () => {
    saveStoredRenderScalePreference(2);

    clearStoredRenderScalePreference();

    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("does not throw when storage read or write fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(loadStoredRenderScalePreference()).toBe("auto");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => saveStoredRenderScalePreference(2)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```bash
npm test -- src/tests/render-scale.test.ts
```

Expected: FAIL because `src/game/renderScale.ts` does not exist.

- [ ] **Step 3: Implement render scale helpers**

Create `src/game/renderScale.ts`:

```ts
export const RENDER_SCALE_OPTIONS = ["auto", 1, 1.5, 2, 3, 4] as const;
export type RenderScalePreference = (typeof RENDER_SCALE_OPTIONS)[number];

const RENDER_SCALE_STORAGE_KEY = "melee-weaving-practice.renderScale.v1";
const MIN_RENDER_SCALE = 1;
const MAX_RENDER_SCALE = 4;

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseRenderScalePreference(value: unknown): RenderScalePreference | null {
  return (RENDER_SCALE_OPTIONS as readonly unknown[]).includes(value) ? (value as RenderScalePreference) : null;
}

export function clampRenderScale(value: number): number {
  if (!Number.isFinite(value) || value < MIN_RENDER_SCALE) {
    return MIN_RENDER_SCALE;
  }

  return Math.min(MAX_RENDER_SCALE, value);
}

export function getEffectiveRenderScale(preference: RenderScalePreference, devicePixelRatio: number): number {
  return preference === "auto" ? clampRenderScale(devicePixelRatio) : preference;
}

export function formatEffectiveRenderScale(scale: number): string {
  return `${Number.isInteger(scale) ? scale.toFixed(0) : String(Number(scale.toFixed(2)))}x`;
}

export function formatRenderScaleOptionLabel(preference: RenderScalePreference, effectiveAutoScale: number): string {
  if (preference === "auto") {
    return `Auto (${formatEffectiveRenderScale(effectiveAutoScale)})`;
  }

  return formatEffectiveRenderScale(preference);
}

export function loadStoredRenderScalePreference(): RenderScalePreference {
  const storage = getBrowserStorage();

  if (storage === null) {
    return "auto";
  }

  try {
    const rawValue = storage.getItem(RENDER_SCALE_STORAGE_KEY);
    if (rawValue === null) {
      return "auto";
    }

    return parseRenderScalePreference(JSON.parse(rawValue)) ?? "auto";
  } catch {
    return "auto";
  }
}

export function saveStoredRenderScalePreference(preference: RenderScalePreference): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(RENDER_SCALE_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    return;
  }
}

export function clearStoredRenderScalePreference(): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(RENDER_SCALE_STORAGE_KEY);
  } catch {
    return;
  }
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run:

```bash
npm test -- src/tests/render-scale.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper module**

Run:

```bash
git add src/game/renderScale.ts src/tests/render-scale.test.ts
git commit -m "feat: add render scale helpers"
```

## Task 2: Render Scale UI And App State

**Files:**
- Modify: `src/ui/ControlPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Add failing UI tests for the render scale control**

In `src/tests/app-ui.test.tsx`, add this import:

```ts
import type { RenderScalePreference } from "../game/renderScale";
```

Change the hoisted test hooks to capture the render scale prop:

```ts
const phaserHostTestHooks = vi.hoisted(() => ({
  getPracticeState: null as null | (() => PracticeState),
  renderScalePreference: null as null | RenderScalePreference,
}));
```

Inside the mocked `PhaserHost`, after assigning `getPracticeState`, add:

```ts
phaserHostTestHooks.renderScalePreference = props.renderScalePreference;
```

In `afterEach`, add:

```ts
phaserHostTestHooks.renderScalePreference = null;
```

Add these tests inside `describe("App UI", () => { ... })`:

```ts
it("renders Auto render scale by default and passes it to PhaserHost", () => {
  render(<App />);

  const renderScaleSelect = screen.getByLabelText("Render Scale");

  expect(renderScaleSelect).toHaveValue("auto");
  expect(within(renderScaleSelect).getByRole("option", { name: "Auto (1x)" })).toBeInTheDocument();
  expect(within(renderScaleSelect).getByRole("option", { name: "1x" })).toBeInTheDocument();
  expect(within(renderScaleSelect).getByRole("option", { name: "1.5x" })).toBeInTheDocument();
  expect(within(renderScaleSelect).getByRole("option", { name: "2x" })).toBeInTheDocument();
  expect(within(renderScaleSelect).getByRole("option", { name: "3x" })).toBeInTheDocument();
  expect(within(renderScaleSelect).getByRole("option", { name: "4x" })).toBeInTheDocument();
  expect(phaserHostTestHooks.renderScalePreference).toBe("auto");
});

it("updates and persists the selected render scale", () => {
  const { unmount } = render(<App />);

  fireEvent.change(screen.getByLabelText("Render Scale"), { target: { value: "2" } });

  expect(screen.getByLabelText("Render Scale")).toHaveValue("2");
  expect(phaserHostTestHooks.renderScalePreference).toBe(2);

  unmount();
  render(<App />);

  expect(screen.getByLabelText("Render Scale")).toHaveValue("2");
  expect(phaserHostTestHooks.renderScalePreference).toBe(2);
});

it("falls back to Auto for an invalid stored render scale", () => {
  localStorage.setItem("melee-weaving-practice.renderScale.v1", JSON.stringify(2.5));

  render(<App />);

  expect(screen.getByLabelText("Render Scale")).toHaveValue("auto");
  expect(phaserHostTestHooks.renderScalePreference).toBe("auto");
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `ControlPanel` has no `Render Scale` select and `PhaserHost` has no `renderScalePreference` prop.

- [ ] **Step 3: Add render scale props to ControlPanel**

In `src/ui/ControlPanel.tsx`, import render scale helpers:

```ts
import {
  RENDER_SCALE_OPTIONS,
  formatRenderScaleOptionLabel,
  getEffectiveRenderScale,
  parseRenderScalePreference,
  type RenderScalePreference,
} from "../game/renderScale";
```

Extend `ControlPanelProps`:

```ts
interface ControlPanelProps {
  selectedPresetId: string;
  score: ScoreResult;
  timingMetrics: TimingMetrics;
  running: boolean;
  renderScalePreference: RenderScalePreference;
  devicePixelRatio: number;
  onPresetChange: (id: string) => void;
  onRenderScalePreferenceChange: (preference: RenderScalePreference) => void;
  onStart: () => void;
  onStop: () => void;
}
```

Destructure the new props:

```ts
  renderScalePreference,
  devicePixelRatio,
  onRenderScalePreferenceChange,
```

Inside the component, before `return`, add:

```ts
  const effectiveAutoScale = getEffectiveRenderScale("auto", devicePixelRatio);
```

After the Rotation label, add this field:

```tsx
      <label className="field">
        <span>Render Scale</span>
        <select
          aria-label="Render Scale"
          value={String(renderScalePreference)}
          onChange={(event) => {
            const nextPreference = parseRenderScalePreference(
              event.target.value === "auto" ? "auto" : Number(event.target.value),
            );
            if (nextPreference !== null) {
              onRenderScalePreferenceChange(nextPreference);
            }
          }}
        >
          {RENDER_SCALE_OPTIONS.map((option) => (
            <option key={String(option)} value={String(option)}>
              {formatRenderScaleOptionLabel(option, effectiveAutoScale)}
            </option>
          ))}
        </select>
      </label>
```

- [ ] **Step 4: Wire App state and PhaserHost prop**

In `src/App.tsx`, add render scale imports:

```ts
import {
  getEffectiveRenderScale,
  loadStoredRenderScalePreference,
  saveStoredRenderScalePreference,
  type RenderScalePreference,
} from "./game/renderScale";
```

Add state after `keybindings` state:

```ts
  const [renderScalePreference, setRenderScalePreference] = useState<RenderScalePreference>(() =>
    loadStoredRenderScalePreference(),
  );
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : getEffectiveRenderScale("auto", window.devicePixelRatio),
  );
```

Add this effect after the refs are updated:

```ts
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function syncDevicePixelRatio(): void {
      setDevicePixelRatio(getEffectiveRenderScale("auto", window.devicePixelRatio));
    }

    syncDevicePixelRatio();
    window.addEventListener("resize", syncDevicePixelRatio);

    return () => {
      window.removeEventListener("resize", syncDevicePixelRatio);
    };
  }, []);
```

Add a handler near the other handlers:

```ts
  function handleRenderScalePreferenceChange(preference: RenderScalePreference): void {
    setRenderScalePreference(preference);
    saveStoredRenderScalePreference(preference);
  }
```

Pass the preference to `PhaserHost`:

```tsx
          renderScalePreference={renderScalePreference}
```

Pass new props to `ControlPanel`:

```tsx
          renderScalePreference={renderScalePreference}
          devicePixelRatio={devicePixelRatio}
          onRenderScalePreferenceChange={handleRenderScalePreferenceChange}
```

- [ ] **Step 5: Run UI tests to verify they pass**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit UI state**

Run:

```bash
git add src/App.tsx src/ui/ControlPanel.tsx src/tests/app-ui.test.tsx
git commit -m "feat: add render scale setting"
```

## Task 3: PhaserHost High-DPI Canvas Sizing

**Files:**
- Modify: `src/game/PhaserHost.tsx`
- Modify: `src/game/PracticeScene.ts`

- [ ] **Step 1: Add render scale types and scene update contract**

Extend `PracticeSceneData`:

```ts
export interface PracticeSceneData {
  preset: RotationPreset;
  ideal: IdealEvent[];
  getPracticeState: () => PracticeState;
  getKeybindings: () => KeybindingMap;
  logicalWidth: number;
  logicalHeight: number;
  effectiveRenderScale: number;
}
```

Add private fields inside `PracticeScene`:

```ts
  private logicalWidth = 0;
  private logicalHeight = 0;
  private effectiveRenderScale = 1;
```

In `init`, store the new data:

```ts
    this.logicalWidth = data.logicalWidth;
    this.logicalHeight = data.logicalHeight;
    this.effectiveRenderScale = data.effectiveRenderScale;
```

Add this public method before `preload()`:

```ts
  updateRenderSurface(logicalWidth: number, logicalHeight: number, effectiveRenderScale: number): void {
    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;
    this.effectiveRenderScale = effectiveRenderScale;
    this.applyRenderSurface();
    this.drawField(this.getPracticeState());
  }
```

Add this private method before `handleResize`:

```ts
  private applyRenderSurface(): void {
    const physicalWidth = Math.round(this.logicalWidth * this.effectiveRenderScale);
    const physicalHeight = Math.round(this.logicalHeight * this.effectiveRenderScale);

    this.cameras.main.setViewport(0, 0, physicalWidth, physicalHeight);
    this.cameras.main.setZoom(this.effectiveRenderScale);
    this.cameras.main.centerOn(0, 0);
  }
```

In `create`, replace:

```ts
    this.cameras.main.centerOn(0, 0);
```

with:

```ts
    this.applyRenderSurface();
```

In `update`, replace:

```ts
    this.cameras.main.centerOn(0, 0);
```

with:

```ts
    this.applyRenderSurface();
```

Change `handleResize` to:

```ts
  private handleResize(): void {
    this.applyRenderSurface();
    this.drawField(this.getPracticeState());
  }
```

In `drawField`, replace:

```ts
    const width = camera.width;
    const height = camera.height;
```

with:

```ts
    const width = this.logicalWidth;
    const height = this.logicalHeight;
```

In `drawHud`, replace:

```ts
    const camera = this.cameras.main;
    const state = practiceState.simulator;
    const { hud } = calculatePracticeLayout(camera.width, camera.height);
```

with:

```ts
    const state = practiceState.simulator;
    const { hud } = calculatePracticeLayout(this.logicalWidth, this.logicalHeight);
```

Then replace all remaining `camera.width` and `camera.height` uses in `drawHud` and `drawTimelineRail` with `this.logicalWidth` and `this.logicalHeight`. Specifically:

```ts
    this.castLabel.setPosition(this.logicalWidth / 2, hud.top + hud.castHeight / 2 - 1);
```

and:

```ts
    const layout = calculateTimelineRailLayout(this.logicalWidth, this.logicalHeight, views.length);
```

- [ ] **Step 2: Update PhaserHost to pass render surface data**

In `src/game/PhaserHost.tsx`, import render scale helpers:

```ts
import { getEffectiveRenderScale, type RenderScalePreference } from "./renderScale";
```

Extend `PhaserHostProps`:

```ts
  renderScalePreference: RenderScalePreference;
```

Add helper types and functions above `export function PhaserHost`:

```ts
interface HostSize {
  width: number;
  height: number;
}

function getHostSize(host: HTMLElement): HostSize {
  const rect = host.getBoundingClientRect();
  return {
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
}

function getPhysicalSize(size: HostSize, effectiveRenderScale: number): HostSize {
  return {
    width: Math.max(1, Math.round(size.width * effectiveRenderScale)),
    height: Math.max(1, Math.round(size.height * effectiveRenderScale)),
  };
}
```

Destructure `renderScalePreference` in `PhaserHost`.

Inside the creation effect, before `async function createGame`, add:

```ts
    let resizeObserver: ResizeObserver | null = null;

    function getEffectiveScale(): number {
      return getEffectiveRenderScale(
        renderScalePreference,
        typeof window === "undefined" ? 1 : window.devicePixelRatio,
      );
    }

    function applyRenderSurface(): void {
      const game = gameRef.current;
      const host = parentRef.current;
      if (!game || !host) {
        return;
      }

      const logicalSize = getHostSize(host);
      if (logicalSize.width <= 0 || logicalSize.height <= 0) {
        return;
      }

      const effectiveRenderScale = getEffectiveScale();
      const physicalSize = getPhysicalSize(logicalSize, effectiveRenderScale);
      game.scale.resize(physicalSize.width, physicalSize.height);
      game.canvas.style.width = `${logicalSize.width}px`;
      game.canvas.style.height = `${logicalSize.height}px`;

      const scene = game.scene.getScene("PracticeScene") as
        | (Phaser.Scene & {
            updateRenderSurface?: (logicalWidth: number, logicalHeight: number, effectiveRenderScale: number) => void;
          })
        | null;
      scene?.updateRenderSurface?.(logicalSize.width, logicalSize.height, effectiveRenderScale);
    }
```

Inside `createGame`, compute sizes before the config:

```ts
      const logicalSize = getHostSize(host);
      const effectiveRenderScale = getEffectiveScale();
      const physicalSize = getPhysicalSize(logicalSize, effectiveRenderScale);
```

Change the scale config to physical dimensions:

```ts
        scale: {
          mode: Phaser.Scale.NONE,
          parent: host,
          width: physicalSize.width,
          height: physicalSize.height,
        },
```

After `const game = new Phaser.Game(config);`, add:

```ts
      game.canvas.style.width = `${logicalSize.width}px`;
      game.canvas.style.height = `${logicalSize.height}px`;
```

Change the scene start data to include logical/effective render data:

```ts
      game.scene.add("PracticeScene", PracticeScene, true, {
        preset,
        ideal,
        getPracticeState,
        getKeybindings,
        logicalWidth: logicalSize.width,
        logicalHeight: logicalSize.height,
        effectiveRenderScale,
      });
```

After scene creation, start observing resizes:

```ts
      resizeObserver = new ResizeObserver(() => applyRenderSurface());
      resizeObserver.observe(host);
```

In the cleanup function, add:

```ts
      resizeObserver?.disconnect();
      resizeObserver = null;
```

Add `renderScalePreference` to the creation effect dependency array:

```ts
  }, [preset, ideal, getPracticeState, renderScalePreference]);
```

- [ ] **Step 3: Run TypeScript and layout tests**

Run:

```bash
npm test -- src/tests/practice-scene-layout.test.ts src/tests/app-ui.test.tsx
npm run build
```

Expected: PASS. If TypeScript reports that camera/local variables are unused, remove those unused declarations.

- [ ] **Step 4: Commit Phaser render sizing**

Run:

```bash
git add src/game/PhaserHost.tsx src/game/PracticeScene.ts
git commit -m "feat: scale phaser backing buffer"
```

## Task 4: Browser Verification For Auto And Manual Scale

**Files:**
- Modify: `e2e/app.spec.ts`

- [ ] **Step 1: Add failing e2e tests for canvas backing store size**

In `e2e/app.spec.ts`, add this test after the first test:

```ts
test("renders the Phaser canvas at high-DPI backing size in Auto mode", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1848, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto("/");
  const canvas = page.getByTestId("phaser-host").locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect(page.getByLabel("Render Scale")).toHaveValue("auto");

  await expect
    .poll(async () =>
      canvas.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          backingWidth: node.width,
          backingHeight: node.height,
          cssWidth: rect.width,
          cssHeight: rect.height,
        };
      }),
    )
    .toMatchObject({
      backingWidth: 2936,
      backingHeight: 2000,
      cssWidth: 1468,
      cssHeight: 1000,
    });

  await context.close();
});

test("lets manual 1x render scale opt out of high-DPI backing size", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1848, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  await page.goto("/");
  await page.getByLabel("Render Scale").selectOption("1");
  const canvas = page.getByTestId("phaser-host").locator("canvas");

  await expect
    .poll(async () =>
      canvas.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          backingWidth: node.width,
          backingHeight: node.height,
          cssWidth: rect.width,
          cssHeight: rect.height,
        };
      }),
    )
    .toMatchObject({
      backingWidth: 1468,
      backingHeight: 1000,
      cssWidth: 1468,
      cssHeight: 1000,
    });

  await expect(canvas).toBeVisible();
  await context.close();
});
```

- [ ] **Step 2: Run e2e tests to verify the new tests fail before Task 3 is present**

Skip this step if Task 3 has already been implemented in the same branch. Otherwise run:

```bash
npm run e2e -- e2e/app.spec.ts
```

Expected before Task 3: FAIL because Auto still uses a 1x backing store. Expected after Task 3: PASS.

- [ ] **Step 3: Adjust exact dimensions if the side panel width changes**

If the test reports a CSS width other than `1468`, compute the expected backing size from CSS dimensions instead of hard-coding:

```ts
const sizes = await canvas.evaluate((node) => {
  const rect = node.getBoundingClientRect();
  return {
    backingWidth: node.width,
    backingHeight: node.height,
    cssWidth: rect.width,
    cssHeight: rect.height,
  };
});
expect(sizes.backingWidth).toBe(Math.round(sizes.cssWidth * 2));
expect(sizes.backingHeight).toBe(Math.round(sizes.cssHeight * 2));
```

- [ ] **Step 4: Run e2e tests to verify they pass**

Run:

```bash
npm run e2e -- e2e/app.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit e2e coverage**

Run:

```bash
git add e2e/app.spec.ts
git commit -m "test: verify phaser render scale"
```

## Task 5: Full Verification

**Files:**
- No code changes expected.

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

Expected: PASS.

- [ ] **Step 3: Run the full e2e suite**

Run:

```bash
npm run e2e
```

Expected: PASS.

- [ ] **Step 4: Manually inspect the local app**

Run:

```bash
npm run dev -- --port 4175
```

Open `http://127.0.0.1:4175/tbc-hunter-trainer/`.

Expected:

- The `Render Scale` select defaults to `Auto`.
- On a high-DPI display, the option label shows the effective scale, for example `Auto (2x)`.
- The Phaser field fills the same left-side frame as before.
- The Phaser field, grid, HUD labels, and icons look sharper than the previous 1x backing store.
- Selecting `1x` makes the backing store match CSS dimensions.
- Selecting `2x`, `3x`, or `4x` does not visually resize the practice field.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes.

## Self-Review Notes

- Spec coverage: The plan covers Auto default, manual `1x` through `4x`, effective Auto label, localStorage persistence, host measurement, backing-store scaling, logical CSS-pixel scene layout, error handling, unit tests, component tests, and browser tests.
- Scan result: No banned terms or open-ended implementation slots remain.
- Type consistency: The plan uses `RenderScalePreference`, `renderScalePreference`, `getEffectiveRenderScale`, and `updateRenderSurface` consistently across helper, React, host, and scene tasks.
