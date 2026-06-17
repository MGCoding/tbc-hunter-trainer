# Raptor Macro Mouse Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Raptor Strike macro that also attempts Kill Command, and support forward movement while left and right mouse buttons are held together.

**Architecture:** Keep macro behavior in `App` because it is an input convenience, not a simulator rule. Keep mouse chord state in `attachBrowserInput` because it already owns browser event normalization and movement state. The simulator, scoring, and keybinding resolver remain generic.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, Phaser host input bridge.

---

## File Structure

- Modify `src/input/browserInput.ts`: split forward movement into keyboard and mouse contributions, track left/right mouse button state, and emit merged movement state.
- Modify `src/tests/keybindings.test.ts`: add input-adapter tests for left+right mouse forward movement and keyboard/mouse source merging.
- Modify `src/App.tsx`: add macro option state/UI and route Raptor Strike input through a same-timestamp Kill Command then Raptor Strike sequence when enabled.
- Modify `src/styles.css`: make the checkbox row align with existing side-panel fields.
- Modify `src/tests/app-ui.test.tsx`: add app-level tests for the macro option default state, enabled behavior, disabled behavior, and Kill Command-only behavior.

## Task 1: Mouse Chord Movement Tests

**Files:**
- Test: `src/tests/keybindings.test.ts`

- [ ] **Step 1: Add failing tests for left+right mouse forward movement**

Append these tests inside the existing `describe("browser input adapter", () => { ... })` block in `src/tests/keybindings.test.ts`:

```ts
  it("moves forward while left and right mouse buttons are held together", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange,
      onAbilityPress: vi.fn(),
    });

    target.dispatchEvent(new MouseEvent("mousedown", { button: 0, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { button: 2, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { button: 0, cancelable: true }));

    expect(onMovementChange).toHaveBeenNthCalledWith(1, {
      forward: true,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(2, {
      forward: false,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("keeps keyboard forward active after releasing mouse-forward movement", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange,
      onAbilityPress: vi.fn(),
    });

    target.dispatchEvent(new MouseEvent("mousedown", { button: 0, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { button: 2, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { button: 2, cancelable: true }));

    expect(onMovementChange).toHaveBeenCalledTimes(1);

    target.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", cancelable: true }));

    expect(onMovementChange).toHaveBeenNthCalledWith(1, {
      forward: true,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(2, {
      forward: false,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenCalledTimes(2);

    cleanup();
  });
```

- [ ] **Step 2: Run the focused test file and verify RED**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: FAIL. The first new test should report that `onMovementChange` was not called with `forward: true`, because mouse buttons do not currently affect movement.

## Task 2: Mouse Chord Movement Implementation

**Files:**
- Modify: `src/input/browserInput.ts`
- Test: `src/tests/keybindings.test.ts`

- [ ] **Step 1: Implement source-aware forward movement**

In `src/input/browserInput.ts`, replace the single `movementKeys` object and `setMovement` helper with source-aware state:

```ts
  const movementKeys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  const keyboardMovementKeys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  let mouseForward = false;
  const pressedMouseButtons = new Set<number>();
  const activeMovementByCode = new Map<string, keyof MovementKeys>();

  const emitMovementIfChanged = (): void => {
    const nextMovementKeys: MovementKeys = {
      forward: keyboardMovementKeys.forward || mouseForward,
      backward: keyboardMovementKeys.backward,
      left: keyboardMovementKeys.left,
      right: keyboardMovementKeys.right,
    };

    if (
      movementKeys.forward === nextMovementKeys.forward &&
      movementKeys.backward === nextMovementKeys.backward &&
      movementKeys.left === nextMovementKeys.left &&
      movementKeys.right === nextMovementKeys.right
    ) {
      return;
    }

    movementKeys.forward = nextMovementKeys.forward;
    movementKeys.backward = nextMovementKeys.backward;
    movementKeys.left = nextMovementKeys.left;
    movementKeys.right = nextMovementKeys.right;
    handlers.onMovementChange({ ...movementKeys });
  };

  const setKeyboardMovement = (key: keyof MovementKeys, pressed: boolean): void => {
    if (keyboardMovementKeys[key] === pressed) {
      return;
    }

    keyboardMovementKeys[key] = pressed;
    emitMovementIfChanged();
  };

  const syncMouseForward = (): void => {
    const nextMouseForward = pressedMouseButtons.has(0) && pressedMouseButtons.has(2);
    if (mouseForward === nextMouseForward) {
      return;
    }

    mouseForward = nextMouseForward;
    emitMovementIfChanged();
  };
```

Update existing keyboard movement calls:

```ts
      activeMovementByCode.set(event.code, movementKey);
      setKeyboardMovement(movementKey, true);
      return;
```

```ts
      activeMovementByCode.delete(event.code);
      setKeyboardMovement(activeMovementKey, false);
      return;
```

```ts
      activeMovementByCode.delete(event.code);
      setKeyboardMovement(movementKey, false);
```

- [ ] **Step 2: Track mouse button up/down state**

In `src/input/browserInput.ts`, update `handleMouseDown` so it records left/right button state before resolving mapped ability input:

```ts
  const handleMouseDown = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    if (event.button === 0 || event.button === 2) {
      pressedMouseButtons.add(event.button);
      syncMouseForward();
    }

    const action = findActionForBinding(getBindings(bindingsOrGetBindings), makeMouseBinding(event));
    if (action === null) {
      return;
    }

    event.preventDefault();

    if (isAbilityAction(action)) {
      handlers.onAbilityPress(action);
    }
  };
```

Add this new handler near `handleMouseDown`:

```ts
  const handleMouseUp = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    if (event.button === 0 || event.button === 2) {
      pressedMouseButtons.delete(event.button);
      syncMouseForward();
    }
  };
```

Register and unregister it:

```ts
  target.addEventListener("mouseup", handleMouseUp);
```

```ts
    target.removeEventListener("mouseup", handleMouseUp);
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: PASS. All keybinding and browser input adapter tests should pass.

- [ ] **Step 4: Commit mouse movement changes**

Run:

```bash
git add src/input/browserInput.ts src/tests/keybindings.test.ts
git commit -m "feat: support mouse chord forward movement"
```

Expected: commit succeeds.

## Task 3: Raptor Macro App Tests

**Files:**
- Test: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Add failing UI tests for the macro option**

Inside the existing `describe("App UI", () => { ... })` block in `src/tests/app-ui.test.tsx`, add these tests near the existing Raptor Strike tests:

```tsx
  it("renders the Raptor Strike macro option off by default", () => {
    render(<App />);

    expect(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" })).not.toBeChecked();
  });

  it("attempts Kill Command before Raptor Strike from the Raptor Strike binding when the macro is enabled", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(100);
    fireEvent.keyUp(document, { code: "KeyW" });
    now.mockReturnValue(2_600);
    fireEvent.mouseDown(document, { button: 3 });

    const chronologicalRows = [...screen.getAllByRole("listitem")].reverse();
    const abilityPressRows = chronologicalRows.filter((row) => within(row).queryByText("ability-press") !== null);

    expect(within(abilityPressRows[0]).getByText("killCommand")).toBeInTheDocument();
    expect(within(abilityPressRows[1]).getByText("raptorStrike")).toBeInTheDocument();
  });

  it("keeps Kill Command input from attempting Raptor Strike when the macro is enabled", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "Digit2" });

    expect(screen.getAllByText("killCommand").length).toBeGreaterThan(0);
    expect(screen.queryByText("raptorStrike")).not.toBeInTheDocument();
  });

  it("preserves Raptor Strike-only input while the macro is disabled", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.mouseDown(document, { button: 3 });

    expect(screen.getAllByText("raptorStrike").length).toBeGreaterThan(0);
    expect(screen.queryByText("killCommand")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the focused app UI tests and verify RED**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL. The first new test should fail because the checkbox does not exist yet.

## Task 4: Raptor Macro Implementation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Add macro option state**

In `src/App.tsx`, add this state next to the existing React state declarations:

```tsx
  const [macroKillCommandIntoRaptorStrike, setMacroKillCommandIntoRaptorStrike] = useState(false);
```

- [ ] **Step 2: Extract same-timestamp ability processing**

In `src/App.tsx`, replace the body of `handleAbilityPress` with a helper that can process multiple actions at one timestamp.

Use this implementation:

```tsx
  const handleAbilityPress = useCallback(
    (action: AbilityActionId): void => {
      if (!runningRef.current) {
        return;
      }

      const { elapsedMs: atMs, range } = syncLiveStateToNow(performance.now());
      const simulator = getSimulator();
      const actionsToPress: AbilityActionId[] =
        action === "raptorStrike" && macroKillCommandIntoRaptorStrike ? ["killCommand", "raptorStrike"] : [action];

      for (const actionToPress of actionsToPress) {
        const timing = getAbilityTiming(actionToPress, preset);
        if ((timing.requiresMelee && !range.canMelee) || (timing.requiresRanged && !range.canUseRanged)) {
          simulator.recordInvalidInput(actionToPress, atMs, "out-of-range");
          continue;
        }

        const perfectPress = findPerfectPress(ideal, actionToPress, atMs);
        const perfectPressKey = perfectPress ? describePerfectPressKey(perfectPress) : null;
        const logLengthBeforePress = simulator.getLog().length;
        simulator.pressAbility(actionToPress, atMs);
        const newLogEntries = simulator.getLog().slice(logLengthBeforePress);
        const inputWasInvalid = newLogEntries.some((event) => event.type === "invalid-input" && event.atMs === atMs);
        if (perfectPressKey !== null && !inputWasInvalid && !perfectPressKeysRef.current.has(perfectPressKey)) {
          perfectPressKeysRef.current.add(perfectPressKey);
          playSuccessChime();
        }
      }

      playNewAttackSoundEvents();
      setEvents(simulator.getLog());
    },
    [ideal, macroKillCommandIntoRaptorStrike, preset],
  );
```

This preserves one movement/range sync and one timestamp per macro press. It also keeps Raptor Strike attempted even when Kill Command is invalid.

- [ ] **Step 3: Render the macro checkbox near keybindings**

In `src/App.tsx`, inside the keybindings panel after the `panel-header` and before `<div className="keybinding-list">`, add:

```tsx
          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={macroKillCommandIntoRaptorStrike}
              onChange={(event) => setMacroKillCommandIntoRaptorStrike(event.target.checked)}
            />
            <span>Macro Kill Command into Raptor Strike</span>
          </label>
```

- [ ] **Step 4: Style the checkbox row**

In `src/styles.css`, add this rule near the existing field styles:

```css
.checkbox-field {
  grid-template-columns: auto 1fr;
  align-items: center;
}

.checkbox-field input {
  width: auto;
}
```

- [ ] **Step 5: Run focused app UI tests and verify GREEN**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS. App UI tests should confirm the checkbox default and macro behavior.

- [ ] **Step 6: Run the focused keybinding tests again**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: PASS. The input adapter changes should remain green after App changes.

- [ ] **Step 7: Commit macro changes**

Run:

```bash
git add src/App.tsx src/styles.css src/tests/app-ui.test.tsx
git commit -m "feat: add raptor strike kill command macro"
```

Expected: commit succeeds.

## Task 5: Full Verification

**Files:**
- Verify all modified files and build output.

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
npm test
```

Expected: PASS. Vitest should report all test files passing.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS. TypeScript build and Vite build should complete with exit code 0.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or the worktree is clean if the task commits were made.

- [ ] **Step 4: Manual browser verification**

Run:

```bash
npm run dev
```

Open the local Vite URL. Verify:

- the checkbox appears near keybindings and starts unchecked
- unchecked Raptor Strike input logs only Raptor Strike behavior
- checked Raptor Strike input logs Kill Command before Raptor Strike
- Kill Command input logs only Kill Command
- holding left and right mouse buttons moves the character forward
- releasing either mouse button stops mouse-forward movement unless keyboard forward is still held
