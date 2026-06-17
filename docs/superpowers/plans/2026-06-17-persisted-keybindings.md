# Persisted Keybindings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the full user keybinding map in `localStorage` and add a reset button that restores default keybindings.

**Architecture:** Keep storage parsing and validation in `src/input/keybindings.ts`, where binding model helpers already live. `App` will load bindings lazily on startup, save the full map after each successful capture, and clear storage when resetting to defaults.

**Tech Stack:** React 19, TypeScript, Vite, Vitest with jsdom, Testing Library.

---

## File Structure

- Modify: `src/input/keybindings.ts`
  - Add versioned storage key, validation helpers, cloning helpers, and exported `loadStoredKeybindings`, `saveStoredKeybindings`, and `clearStoredKeybindings`.
- Modify: `src/App.tsx`
  - Initialize keybinding state from storage.
  - Persist captured keybinding maps.
  - Add reset handler and Keybindings panel reset button.
- Modify: `src/tests/keybindings.test.ts`
  - Add storage helper tests using jsdom `localStorage` and `Storage.prototype` spies for exception paths.
- Modify: `src/tests/app-ui.test.tsx`
  - Add UI coverage for persisted rebinding, reset-to-default behavior, and canceling active capture.

---

### Task 1: Add Failing Keybinding Storage Helper Tests

**Files:**
- Modify: `src/tests/keybindings.test.ts`

- [ ] **Step 1: Add lifecycle cleanup and new imports**

In `src/tests/keybindings.test.ts`, change the imports at the top from:

```ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { attachBrowserInput } from "../input/browserInput";
import { findActionForBinding, formatKeyBinding, rebindAction } from "../input/keybindings";
import type { KeyBinding } from "../sim/types";
```

to:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { attachBrowserInput } from "../input/browserInput";
import {
  clearStoredKeybindings,
  findActionForBinding,
  formatKeyBinding,
  loadStoredKeybindings,
  rebindAction,
  saveStoredKeybindings,
} from "../input/keybindings";
import type { KeyBinding } from "../sim/types";
```

Then add this cleanup block after the imports:

```ts
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: Add storage helper tests**

In `src/tests/keybindings.test.ts`, add this `describe` block after the existing `describe("keybindings", ...)` block and before `describe("browser input adapter", ...)`:

```ts
describe("stored keybindings", () => {
  const storageKey = "melee-weaving-practice.keybindings.v1";

  it("loads defaults when no stored map exists", () => {
    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(DEFAULT_KEYBINDS);
  });

  it("saves and loads a complete custom map", () => {
    const custom = rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "KeyQ" }, true);

    saveStoredKeybindings(custom);

    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toEqual(custom);
    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(custom);
  });

  it("loads defaults when stored JSON is malformed", () => {
    localStorage.setItem(storageKey, "{not-json");

    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(DEFAULT_KEYBINDS);
  });

  it("loads defaults when a stored action is missing", () => {
    const custom = rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "KeyQ" }, true);
    const incomplete = { ...custom };
    delete incomplete.autoShot;

    localStorage.setItem(storageKey, JSON.stringify(incomplete));

    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(DEFAULT_KEYBINDS);
  });

  it("loads defaults when a stored binding shape is invalid", () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...DEFAULT_KEYBINDS,
        arcaneShot: { kind: "keyboard", code: 1 },
      }),
    );

    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(DEFAULT_KEYBINDS);
  });

  it("ignores stored keys that are not known actions", () => {
    const custom = rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "KeyQ" }, true);

    localStorage.setItem(storageKey, JSON.stringify({ ...custom, unknownAction: { kind: "keyboard", code: "KeyP" } }));

    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(custom);
  });

  it("clears stored keybindings", () => {
    saveStoredKeybindings(rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "KeyQ" }, true));

    clearStoredKeybindings();

    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("does not throw when storage read fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(loadStoredKeybindings(DEFAULT_KEYBINDS)).toEqual(DEFAULT_KEYBINDS);
  });

  it("does not throw when storage write fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => saveStoredKeybindings(DEFAULT_KEYBINDS)).not.toThrow();
  });

  it("does not throw when storage remove fails", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    expect(() => clearStoredKeybindings()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the focused failing tests**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: FAIL because `clearStoredKeybindings`, `loadStoredKeybindings`, and `saveStoredKeybindings` are not exported yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add src/tests/keybindings.test.ts
git commit -m "test: cover keybinding storage helpers"
```

---

### Task 2: Implement Keybinding Storage Helpers

**Files:**
- Modify: `src/input/keybindings.ts`

- [ ] **Step 1: Add storage constants and cloning/validation helpers**

In `src/input/keybindings.ts`, add this code after the `KeybindingMap` type:

```ts
const KEYBINDINGS_STORAGE_KEY = "melee-weaving-practice.keybindings.v1";
const MIN_MOUSE_BUTTON = 0;
const MAX_MOUSE_BUTTON = 4;

function cloneKeyBinding(binding: KeyBinding): KeyBinding {
  if (binding.kind === "keyboard") {
    return { kind: "keyboard", code: binding.code };
  }

  return { kind: "mouse", button: binding.button };
}

function cloneKeybindings(bindings: KeybindingMap): KeybindingMap {
  return Object.fromEntries(
    (Object.entries(bindings) as [ActionId, KeyBinding][]).map(([action, binding]) => [action, cloneKeyBinding(binding)]),
  ) as KeybindingMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredKeyBinding(value: unknown): value is KeyBinding {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "keyboard") {
    return typeof value.code === "string";
  }

  if (value.kind === "mouse") {
    return (
      typeof value.button === "number" &&
      Number.isInteger(value.button) &&
      value.button >= MIN_MOUSE_BUTTON &&
      value.button <= MAX_MOUSE_BUTTON
    );
  }

  return false;
}

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
```

- [ ] **Step 2: Add the exported persistence API**

In `src/input/keybindings.ts`, add this code before `export function findActionForBinding`:

```ts
export function loadStoredKeybindings(defaultBindings: KeybindingMap): KeybindingMap {
  const fallback = cloneKeybindings(defaultBindings);
  const storage = getBrowserStorage();

  if (storage === null) {
    return fallback;
  }

  try {
    const rawValue = storage.getItem(KEYBINDINGS_STORAGE_KEY);
    if (rawValue === null) {
      return fallback;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue)) {
      return fallback;
    }

    const entries = Object.entries(defaultBindings) as [ActionId, KeyBinding][];
    const storedBindings: Partial<KeybindingMap> = {};

    for (const [action] of entries) {
      const storedBinding = parsedValue[action];
      if (!isStoredKeyBinding(storedBinding)) {
        return fallback;
      }

      storedBindings[action] = cloneKeyBinding(storedBinding);
    }

    return storedBindings as KeybindingMap;
  } catch {
    return fallback;
  }
}

export function saveStoredKeybindings(bindings: KeybindingMap): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    return;
  }
}

export function clearStoredKeybindings(): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(KEYBINDINGS_STORAGE_KEY);
  } catch {
    return;
  }
}
```

- [ ] **Step 3: Run the focused tests**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: PASS for `src/tests/keybindings.test.ts`.

- [ ] **Step 4: Commit the helper implementation**

```bash
git add src/input/keybindings.ts
git commit -m "feat: add keybinding storage helpers"
```

---

### Task 3: Add Failing UI Persistence and Reset Tests

**Files:**
- Modify: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Clear localStorage during existing UI test cleanup**

In `src/tests/app-ui.test.tsx`, update the existing `afterEach` block from:

```ts
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

to:

```ts
afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

- [ ] **Step 2: Add UI tests for persisted binding and reset**

In `src/tests/app-ui.test.tsx`, add these tests inside `describe("App UI", () => { ... })`, immediately after the existing test named `"lets users rebind an action and routes live input through the edited binding"`:

```ts
  it("loads a saved keybinding map when the app remounts", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });

    expect(screen.getByText("Q")).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(screen.getByText("Q")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "Digit1" });
    expect(screen.queryByText("ability-press")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(screen.getByText("ability-press")).toBeInTheDocument();
    expect(screen.getAllByText("arcaneShot").length).toBeGreaterThan(0);
  });

  it("resets saved keybindings to defaults and restores default live input", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(screen.getByText("Q")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset keybindings to default" }));

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(localStorage.getItem("melee-weaving-practice.keybindings.v1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(screen.queryByText("ability-press")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: "Digit1" });
    expect(screen.getByText("ability-press")).toBeInTheDocument();
    expect(screen.getAllByText("arcaneShot").length).toBeGreaterThan(0);
  });

  it("cancels active keybinding capture when resetting to defaults", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    expect(screen.getByText("Listening")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset keybindings to default" }));

    expect(screen.queryByText("Listening")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: "KeyQ" });

    expect(screen.getByText("1")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the focused failing UI tests**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because `App` does not load stored keybindings, does not save captured maps, and does not render `Reset keybindings to default` yet.

- [ ] **Step 4: Commit the failing UI tests**

```bash
git add src/tests/app-ui.test.tsx
git commit -m "test: cover persisted keybinding UI"
```

---

### Task 4: Wire Persistence and Reset into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update keybinding imports**

In `src/App.tsx`, change:

```ts
import { formatKeyBinding, rebindAction, type KeybindingMap } from "./input/keybindings";
```

to:

```ts
import {
  clearStoredKeybindings,
  formatKeyBinding,
  loadStoredKeybindings,
  rebindAction,
  saveStoredKeybindings,
  type KeybindingMap,
} from "./input/keybindings";
```

- [ ] **Step 2: Load stored keybindings lazily**

In `src/App.tsx`, change:

```ts
const [keybindings, setKeybindings] = useState<KeybindingMap>(DEFAULT_KEYBINDS);
```

to:

```ts
const [keybindings, setKeybindings] = useState<KeybindingMap>(() => loadStoredKeybindings(DEFAULT_KEYBINDS));
```

- [ ] **Step 3: Persist successful captures and add reset handler**

In `src/App.tsx`, replace the current `applyBinding` function:

```ts
function applyBinding(action: ActionId, binding: KeyBinding): void {
  setKeybindings((current) => rebindAction(current, action, binding, true));
  setCaptureAction(null);
}
```

with:

```ts
function applyBinding(action: ActionId, binding: KeyBinding): void {
  setKeybindings((current) => {
    const nextBindings = rebindAction(current, action, binding, true);
    saveStoredKeybindings(nextBindings);
    return nextBindings;
  });
  setCaptureAction(null);
}

function handleResetKeybindings(): void {
  clearStoredKeybindings();
  setKeybindings(loadStoredKeybindings(DEFAULT_KEYBINDS));
  setCaptureAction(null);
}
```

- [ ] **Step 4: Render the reset button in the Keybindings panel**

In `src/App.tsx`, replace the Keybindings panel header:

```tsx
<div className="panel-header">
  <h2 id="keybindings-panel-title">Keybindings</h2>
  {captureAction ? <span className="status-pill is-running">Listening</span> : null}
</div>
```

with:

```tsx
<div className="panel-header">
  <h2 id="keybindings-panel-title">Keybindings</h2>
  {captureAction ? <span className="status-pill is-running">Listening</span> : null}
</div>
<button
  type="button"
  className="secondary-button"
  aria-label="Reset keybindings to default"
  onClick={handleResetKeybindings}
>
  Reset to Default
</button>
```

- [ ] **Step 5: Run the focused UI tests**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS for `src/tests/app-ui.test.tsx`.

- [ ] **Step 6: Run the keybinding helper tests again**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: PASS for `src/tests/keybindings.test.ts`.

- [ ] **Step 7: Commit the app wiring**

```bash
git add src/App.tsx
git commit -m "feat: persist keybinding selections"
```

---

### Task 5: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected: PASS for all Vitest suites.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS with TypeScript compilation and Vite build completed.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: no unstaged or untracked implementation files.
