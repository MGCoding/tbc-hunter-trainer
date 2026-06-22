# First-Run Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-time anchored walkthrough that explains the rotation dropdown, the central HUD bars, and persisted keybindings.

**Architecture:** React owns the walkthrough UI as a small overlay component mounted from `App`. A tiny storage helper owns the versioned `localStorage` dismissed flag, while stable `data-tour-target` attributes let the tour measure and position cards near existing UI elements. Phaser stays unchanged; the HUD step anchors to the practice stage and uses explicit top-to-bottom copy.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, Testing Library, jsdom, CSS.

---

## File Structure

- Create `src/ui/walkthroughStorage.ts`: storage key plus non-throwing load/save helpers for the dismissed flag.
- Create `src/ui/WalkthroughTour.tsx`: step definitions, target measurement, overlay/highlight rendering, card positioning, and navigation controls.
- Modify `src/ui/ControlPanel.tsx`: add the rotation target attribute.
- Modify `src/App.tsx`: add practice/keybindings target attributes and mount `WalkthroughTour`.
- Modify `src/styles.css`: add overlay, highlight, card, and responsive tour styles.
- Create `src/tests/walkthrough-storage.test.ts`: focused storage behavior tests.
- Create `src/tests/walkthrough-tour.test.tsx`: focused component behavior and fallback tests.
- Modify `src/tests/app-ui.test.tsx`: assert integration targets and first-run behavior without disrupting existing tests.

## Task 1: Add Walkthrough Storage Helpers

**Files:**
- Create: `src/ui/walkthroughStorage.ts`
- Create: `src/tests/walkthrough-storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `src/tests/walkthrough-storage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WALKTHROUGH_STORAGE_KEY,
  loadWalkthroughDismissed,
  saveWalkthroughDismissed,
} from "../ui/walkthroughStorage";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("walkthrough storage", () => {
  it("loads false when the dismissed flag is missing", () => {
    expect(loadWalkthroughDismissed()).toBe(false);
  });

  it("saves and loads the dismissed flag", () => {
    saveWalkthroughDismissed();

    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
    expect(loadWalkthroughDismissed()).toBe(true);
  });

  it("loads false for malformed JSON", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "{not-json");

    expect(loadWalkthroughDismissed()).toBe(false);
  });

  it("loads false for stored values other than true", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(false));

    expect(loadWalkthroughDismissed()).toBe(false);

    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify("true"));

    expect(loadWalkthroughDismissed()).toBe(false);
  });

  it("does not throw when browser storage is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(loadWalkthroughDismissed()).toBe(false);
    expect(() => saveWalkthroughDismissed()).not.toThrow();
  });

  it("does not throw when storage read or write fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage read blocked");
    });

    expect(loadWalkthroughDismissed()).toBe(false);

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    expect(() => saveWalkthroughDismissed()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the storage tests to verify they fail**

Run:

```bash
npm test -- src/tests/walkthrough-storage.test.ts
```

Expected: FAIL because `src/ui/walkthroughStorage.ts` does not exist.

- [ ] **Step 3: Implement storage helpers**

Create `src/ui/walkthroughStorage.ts`:

```ts
export const WALKTHROUGH_STORAGE_KEY = "melee-weaving-practice.walkthrough.v1";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadWalkthroughDismissed(): boolean {
  const storage = getStorage();
  if (storage === null) {
    return false;
  }

  try {
    const stored = storage.getItem(WALKTHROUGH_STORAGE_KEY);
    if (stored === null) {
      return false;
    }

    return JSON.parse(stored) === true;
  } catch {
    return false;
  }
}

export function saveWalkthroughDismissed(): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(true));
  } catch {
    // Storage failures should never interrupt practice.
  }
}
```

- [ ] **Step 4: Run the storage tests to verify they pass**

Run:

```bash
npm test -- src/tests/walkthrough-storage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit storage helpers**

```bash
git add src/ui/walkthroughStorage.ts src/tests/walkthrough-storage.test.ts
git commit -m "feat: add walkthrough storage"
```

## Task 2: Build The Walkthrough Tour Component

**Files:**
- Create: `src/ui/WalkthroughTour.tsx`
- Create: `src/tests/walkthrough-tour.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/tests/walkthrough-tour.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalkthroughTour } from "../ui/WalkthroughTour";
import { WALKTHROUGH_STORAGE_KEY } from "../ui/walkthroughStorage";

function renderTourTargets() {
  return render(
    <>
      <main>
        <label data-tour-target="rotation-select">
          <span>Rotation</span>
          <select aria-label="Rotation">
            <option>French Weaving</option>
          </select>
        </label>
        <section data-tour-target="practice-hud" aria-label="Practice field" />
        <section data-tour-target="keybindings" aria-label="Keybindings" />
      </main>
      <WalkthroughTour />
    </>,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WalkthroughTour", () => {
  it("renders the first step when the tour has not been dismissed", () => {
    renderTourTargets();

    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Choose the rotation you want to practice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip walkthrough" })).toBeEnabled();
  });

  it("does not render when the tour has already been dismissed", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(true));

    renderTourTargets();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves forward and backward through the steps", () => {
    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("dialog", { name: "Practice HUD" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/read from top to bottom: cast bar first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("dismisses and persists when skipped", () => {
    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
  });

  it("dismisses and persists when completed", () => {
    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("dialog", { name: "Keybindings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
  });

  it("dismisses when Escape is pressed", () => {
    renderTourTargets();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
  });

  it("does not crash when the active target is missing", () => {
    render(<WalkthroughTour />);

    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    expect(screen.getByTestId("walkthrough-card").style.left).not.toBe("");
    expect(screen.getByTestId("walkthrough-card").style.top).not.toBe("");
  });

  it("continues to dismiss when storage write fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run:

```bash
npm test -- src/tests/walkthrough-tour.test.tsx
```

Expected: FAIL because `src/ui/WalkthroughTour.tsx` does not exist.

- [ ] **Step 3: Implement the walkthrough component**

Create `src/ui/WalkthroughTour.tsx`:

```tsx
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { loadWalkthroughDismissed, saveWalkthroughDismissed } from "./walkthroughStorage";

interface WalkthroughStep {
  target: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardPosition {
  top: number;
  left: number;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    target: "rotation-select",
    title: "Rotation preset",
    body:
      "Choose the rotation you want to practice. The selected preset controls the timing pattern, swing speeds, and reference sequence used during the session.",
  },
  {
    target: "practice-hud",
    title: "Practice HUD",
    body:
      "The center HUD is read from top to bottom: cast bar first, melee swing bar second, ranged swing bar third, then your timing metrics and ability icons underneath.",
  },
  {
    target: "keybindings",
    title: "Keybindings",
    body:
      "Change your movement and ability bindings here. Saved keybindings are stored in this browser and persist when you come back later.",
  },
];

const VIEWPORT_MARGIN = 24;
const TARGET_PADDING = 8;
const CARD_GAP = 14;
const DEFAULT_CARD_WIDTH = 320;
const DEFAULT_CARD_HEIGHT = 210;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }

  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

function toHighlightRect(targetRect: DOMRect): Rect {
  return {
    top: Math.max(VIEWPORT_MARGIN / 2, targetRect.top - TARGET_PADDING),
    left: Math.max(VIEWPORT_MARGIN / 2, targetRect.left - TARGET_PADDING),
    width: targetRect.width + TARGET_PADDING * 2,
    height: targetRect.height + TARGET_PADDING * 2,
  };
}

function getFallbackRect(): Rect {
  const viewport = getViewportSize();

  return {
    top: viewport.height / 2 - 110,
    left: viewport.width / 2 - 160,
    width: 320,
    height: 220,
  };
}

function getCardPosition(target: Rect, cardWidth: number, cardHeight: number): CardPosition {
  const viewport = getViewportSize();
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - cardWidth - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - cardHeight - VIEWPORT_MARGIN);
  const centeredTop = target.top + target.height / 2 - cardHeight / 2;
  const centeredLeft = target.left + target.width / 2 - cardWidth / 2;
  const candidates: CardPosition[] = [
    { top: centeredTop, left: target.left + target.width + CARD_GAP },
    { top: centeredTop, left: target.left - cardWidth - CARD_GAP },
    { top: target.top + target.height + CARD_GAP, left: centeredLeft },
    { top: target.top - cardHeight - CARD_GAP, left: centeredLeft },
  ];

  const fittingCandidate = candidates.find((candidate) => {
    return (
      candidate.left >= VIEWPORT_MARGIN &&
      candidate.top >= VIEWPORT_MARGIN &&
      candidate.left + cardWidth <= viewport.width - VIEWPORT_MARGIN &&
      candidate.top + cardHeight <= viewport.height - VIEWPORT_MARGIN
    );
  });

  const bestCandidate = fittingCandidate ?? candidates[0];

  return {
    top: clamp(bestCandidate.top, VIEWPORT_MARGIN, maxTop),
    left: clamp(bestCandidate.left, VIEWPORT_MARGIN, maxLeft),
  };
}

function getMeasuredCardSize(card: HTMLDivElement | null): { width: number; height: number } {
  if (card === null) {
    return { width: DEFAULT_CARD_WIDTH, height: DEFAULT_CARD_HEIGHT };
  }

  const rect = card.getBoundingClientRect();

  return {
    width: rect.width || DEFAULT_CARD_WIDTH,
    height: rect.height || DEFAULT_CARD_HEIGHT,
  };
}

export function WalkthroughTour() {
  const [dismissed, setDismissed] = useState(() => loadWalkthroughDismissed());
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<Rect>(() => getFallbackRect());
  const [cardPosition, setCardPosition] = useState<CardPosition>({ top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const activeStep = WALKTHROUGH_STEPS[stepIndex];

  const measure = useCallback(() => {
    if (dismissed) {
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-tour-target="${activeStep.target}"]`);
    const nextHighlight = target ? toHighlightRect(target.getBoundingClientRect()) : getFallbackRect();
    const cardSize = getMeasuredCardSize(cardRef.current);

    setHighlightRect(nextHighlight);
    setCardPosition(getCardPosition(nextHighlight, cardSize.width, cardSize.height));
  }, [activeStep.target, dismissed]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (dismissed) {
      return undefined;
    }

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [dismissed, measure]);

  const dismiss = useCallback(() => {
    saveWalkthroughDismissed();
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (dismissed) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        dismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, dismissed]);

  useEffect(() => {
    if (!dismissed) {
      cardRef.current?.focus();
    }
  }, [dismissed, stepIndex]);

  if (dismissed) {
    return null;
  }

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === WALKTHROUGH_STEPS.length - 1;

  return (
    <div className="walkthrough-layer" aria-live="polite">
      <div className="walkthrough-scrim" />
      <div
        className="walkthrough-highlight"
        style={{
          top: `${highlightRect.top}px`,
          left: `${highlightRect.left}px`,
          width: `${highlightRect.width}px`,
          height: `${highlightRect.height}px`,
        }}
      />
      <div
        ref={cardRef}
        className="walkthrough-card"
        data-testid="walkthrough-card"
        role="dialog"
        aria-labelledby="walkthrough-title"
        tabIndex={-1}
        style={{
          top: `${cardPosition.top}px`,
          left: `${cardPosition.left}px`,
        }}
      >
        <div className="walkthrough-progress">{stepIndex + 1} of {WALKTHROUGH_STEPS.length}</div>
        <h2 id="walkthrough-title">{activeStep.title}</h2>
        <p>{activeStep.body}</p>
        <div className="walkthrough-actions">
          <button type="button" className="secondary-button" onClick={dismiss} aria-label="Skip walkthrough">
            Skip
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={isFirstStep}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLastStep) {
                dismiss();
                return;
              }

              setStepIndex((current) => Math.min(WALKTHROUGH_STEPS.length - 1, current + 1));
            }}
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run:

```bash
npm test -- src/tests/walkthrough-tour.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the component**

```bash
git add src/ui/WalkthroughTour.tsx src/tests/walkthrough-tour.test.tsx
git commit -m "feat: add walkthrough tour component"
```

## Task 3: Integrate The Tour Into The App Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/ui/ControlPanel.tsx`
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Modify `src/tests/app-ui.test.tsx`:

1. Add the walkthrough storage constant near the existing `KEYBINDINGS_STORAGE_KEY` constant:

```ts
const WALKTHROUGH_STORAGE_KEY = "melee-weaving-practice.walkthrough.v1";
```

2. Add these tests inside `describe("App UI", () => { ... })`, near the existing render/default UI tests:

```tsx
  it("shows the first-run walkthrough and anchors the planned targets", () => {
    render(<App />);

    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    expect(screen.getByText(/Choose the rotation you want to practice/)).toBeInTheDocument();

    const rotationSelect = screen.getByLabelText("Rotation");
    const rotationTarget = rotationSelect.closest("[data-tour-target='rotation-select']");
    const practiceTarget = screen.getByRole("region", { name: "Practice field" });
    const keybindingsTarget = screen.getByRole("region", { name: "Keybindings" });

    expect(rotationTarget).not.toBeNull();
    expect(practiceTarget).toHaveAttribute("data-tour-target", "practice-hud");
    expect(keybindingsTarget).toHaveAttribute("data-tour-target", "keybindings");
  });

  it("keeps the walkthrough hidden after it has been dismissed", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(true));

    render(<App />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not let the walkthrough change rotation or keybinding behavior", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));
    fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "half-weave-22-1w" } });

    expect(screen.getByLabelText("Rotation")).toHaveValue("half-weave-22-1w");
    expect(screen.getByTestId("phaser-host")).toHaveAttribute(
      "data-ideal-count",
      String(expandRotationPattern(getRotationPreset("half-weave-22-1w")).length),
    );

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });

    expect(within(getArcaneShotKeybindingRow()).getByText("Q")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the integration tests to verify they fail**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `App` does not mount `WalkthroughTour` and the tour target attributes do not exist yet.

- [ ] **Step 3: Wire targets and mount the tour**

Modify `src/ui/ControlPanel.tsx` so the rotation field has the tour target:

```tsx
      <label className="field" data-tour-target="rotation-select">
        <span>Rotation</span>
        <select aria-label="Rotation" value={selectedPresetId} onChange={(event) => onPresetChange(event.target.value)}>
          {ROTATION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
```

Modify `src/App.tsx`:

1. Add the import with the other UI imports:

```ts
import { WalkthroughTour } from "./ui/WalkthroughTour";
```

2. Add the practice stage target:

```tsx
      <section className="practice-stage" aria-label="Practice field" data-tour-target="practice-hud">
```

3. Add a region label and target to the keybindings panel:

```tsx
        <section
          className="panel"
          aria-labelledby="keybindings-panel-title"
          role="region"
          data-tour-target="keybindings"
        >
```

4. Mount the tour after the side panels but still inside `main`:

```tsx
        <EventLogPanel events={events} onReset={handleResetLog} />
      </aside>
      <WalkthroughTour />
    </main>
```

- [ ] **Step 4: Run the integration tests to verify they pass**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit app integration**

```bash
git add src/App.tsx src/ui/ControlPanel.tsx src/tests/app-ui.test.tsx
git commit -m "feat: show first-run walkthrough"
```

## Task 4: Style The Anchored Walkthrough

**Files:**
- Modify: `src/styles.css`
- Test: `src/tests/walkthrough-tour.test.tsx`

- [ ] **Step 1: Add a style-focused test for class hooks**

Modify `src/tests/walkthrough-tour.test.tsx` and add this test inside `describe("WalkthroughTour", () => { ... })`:

```tsx
  it("renders overlay, highlight, and card styling hooks", () => {
    const { container } = renderTourTargets();

    expect(container.querySelector(".walkthrough-layer")).not.toBeNull();
    expect(container.querySelector(".walkthrough-scrim")).not.toBeNull();
    expect(container.querySelector(".walkthrough-highlight")).not.toBeNull();
    expect(screen.getByTestId("walkthrough-card")).toHaveClass("walkthrough-card");
  });
```

- [ ] **Step 2: Run the component tests**

Run:

```bash
npm test -- src/tests/walkthrough-tour.test.tsx
```

Expected: PASS, because the component already renders these class hooks. This test locks the CSS contract before the stylesheet changes.

- [ ] **Step 3: Add walkthrough CSS**

Modify `src/styles.css` after the `.empty-state` rules and before the media queries:

```css
.walkthrough-layer {
  position: fixed;
  inset: 0;
  z-index: 20;
  pointer-events: none;
}

.walkthrough-scrim {
  position: absolute;
  inset: 0;
  background: rgba(5, 8, 11, 0.58);
  pointer-events: auto;
}

.walkthrough-highlight {
  position: absolute;
  border: 2px solid #f5df9f;
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(21, 23, 25, 0.72),
    0 0 0 9999px rgba(5, 8, 11, 0.18);
  pointer-events: none;
}

.walkthrough-card {
  position: absolute;
  width: min(320px, calc(100vw - 48px));
  border: 1px solid rgba(244, 242, 237, 0.18);
  border-radius: 8px;
  padding: 14px;
  color: #f4f2ed;
  background: #2a2d31;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
  pointer-events: auto;
}

.walkthrough-card:focus {
  outline: 2px solid rgba(245, 223, 159, 0.78);
  outline-offset: 2px;
}

.walkthrough-progress {
  margin-bottom: 6px;
  color: rgba(244, 242, 237, 0.62);
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
}

.walkthrough-card h2 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.2;
}

.walkthrough-card p {
  margin: 8px 0 0;
  color: rgba(244, 242, 237, 0.82);
  font-size: 0.9rem;
  line-height: 1.45;
}

.walkthrough-actions {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  margin-top: 14px;
}

.walkthrough-actions .secondary-button:first-child {
  justify-self: start;
}
```

Add this mobile adjustment inside the existing `@media (max-width: 860px)` block:

```css
  .walkthrough-card {
    width: min(300px, calc(100vw - 32px));
  }
```

- [ ] **Step 4: Run component tests and a production build**

Run:

```bash
npm test -- src/tests/walkthrough-tour.test.tsx
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Commit walkthrough styling**

```bash
git add src/styles.css src/tests/walkthrough-tour.test.tsx
git commit -m "style: add walkthrough overlay"
```

## Task 5: Verify End-To-End Behavior

**Files:**
- No source changes expected.

- [ ] **Step 1: Run all unit tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run the build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start the local dev server**

Run:

```bash
npm run dev -- --port 5173
```

Expected: Vite starts and prints a local URL, usually `http://127.0.0.1:5173/`. If port 5173 is occupied, use another available port.

- [ ] **Step 4: Manually verify the walkthrough**

Open the local URL and verify:

- With `localStorage.removeItem("melee-weaving-practice.walkthrough.v1")`, the walkthrough appears on load.
- Step 1 highlights the rotation field and explains preset selection.
- `Next` moves to the practice HUD step.
- Step 2 targets the practice stage and says the HUD is read top to bottom: cast bar, melee swing bar, ranged swing bar, metrics/icons.
- `Next` moves to the keybindings step.
- Step 3 highlights the keybindings panel and explains persisted saved bindings.
- `Back` returns to the previous step without changing app state.
- `Skip` hides the walkthrough and writes `true` to `localStorage`.
- After clearing storage and reopening, `Done` on the final step hides the walkthrough and writes `true` to `localStorage`.
- Reloading after `Skip` or `Done` keeps the walkthrough hidden.
- On a narrow viewport, the card stays inside the viewport and the buttons remain usable.

- [ ] **Step 5: Stop the dev server**

Stop the Vite process with `Ctrl-C`.

- [ ] **Step 6: Commit any verification-only adjustments**

If manual verification required small positioning or CSS adjustments, commit them:

```bash
git add src/ui/WalkthroughTour.tsx src/styles.css src/tests/walkthrough-tour.test.tsx
git commit -m "fix: polish walkthrough positioning"
```

If no changes were required, do not create an empty commit.

## Self-Review Notes

- Spec coverage: storage persistence is covered by Task 1; anchored tour behavior and fallback positioning by Task 2; app targets and mounting by Task 3; visual overlay/card treatment by Task 4; manual desktop/mobile/reload checks by Task 5.
- Scope: this remains one subsystem and does not add replay controls, Phaser DOM bar nodes, or third-party tour dependencies.
- Type consistency: `WalkthroughTour`, `WALKTHROUGH_STORAGE_KEY`, `loadWalkthroughDismissed`, and `saveWalkthroughDismissed` names are consistent across tests, implementation, and integration steps.
