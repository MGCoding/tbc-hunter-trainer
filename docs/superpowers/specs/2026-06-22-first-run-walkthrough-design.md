# First-Run Walkthrough Design

## Summary

Add a one-time anchored walkthrough that introduces the rotation dropdown, the central practice HUD bars, and the keybindings panel.

The walkthrough should appear when the app first runs, then stay dismissed on later visits after the user skips or completes it. It should use small cards positioned near the relevant app elements, with `Back`, `Next`, and `Skip` controls.

## Goals

- Explain that the rotation dropdown selects the rotation preset the user wants to practice.
- Explain the central practice HUD from top to bottom:
  - cast bar
  - melee swing bar
  - ranged swing bar and timing markers
  - metric row and ability icons beneath the bars
- Explain that keybindings can be edited and that saved bindings persist between visits.
- Persist walkthrough dismissal in `localStorage`.
- Keep the walkthrough cards correctly positioned across desktop, mobile, resize, and scroll.
- Keep the implementation small and local to the existing React UI.

## Non-Goals

- Do not add a visible "show walkthrough again" control.
- Do not persist the current walkthrough step.
- Do not add a third-party tour library.
- Do not make the Phaser canvas expose individual bar DOM nodes.
- Do not change rotation behavior, keybinding behavior, simulator timing, scoring, audio, or render scale.

## Current Context

`App` renders a two-column shell: a Phaser-powered practice stage on the left and React side panels on the right. The rotation dropdown lives in `ControlPanel`, the keybindings panel is currently inline in `App`, and the center HUD bars are drawn inside `PracticeScene` on the Phaser canvas.

The app already uses versioned `localStorage` keys for keybindings and render scale, and those helpers treat storage failures as non-fatal. The walkthrough should use the same posture: if browser storage is unavailable or throws, the app should still run and the tour should not break practice.

Because the HUD bars are canvas-rendered, the walkthrough cannot anchor to individual DOM elements for each bar. The tour should target the practice stage or Phaser host and use copy that explicitly names the bars in their visual top-to-bottom order.

## Approach

Build a small custom React walkthrough component rather than adding a tour dependency.

The component should:

- Own the step list and current step state.
- Render nothing when the tour is dismissed.
- Find the active target by a stable `data-tour-target` selector.
- Measure the active target with `getBoundingClientRect()`.
- Draw a fixed overlay and highlight rectangle around the target.
- Position a compact card near the target.
- Clamp the card inside the viewport.
- Recalculate placement when the step changes, the viewport resizes, or the page scrolls.
- Mark the tour dismissed when the user clicks `Skip` or completes the last step.

This keeps the feature small, testable, and consistent with the existing app without making Phaser responsible for onboarding UI.

## Tour Steps

### Step 1: Rotation Dropdown

Target:

```html
data-tour-target="rotation-select"
```

Suggested copy:

```text
Choose the rotation you want to practice. The selected preset controls the timing pattern, swing speeds, and reference sequence used during the session.
```

The target should be the field containing the `Rotation` label and select, not only the select control, so the highlight has enough visual context.

### Step 2: Practice HUD

Target:

```html
data-tour-target="practice-hud"
```

Suggested copy:

```text
The center HUD is read from top to bottom: cast bar first, melee swing bar second, ranged swing bar third, then your timing metrics and ability icons underneath.
```

The target should be the practice stage or Phaser host. The card should avoid covering the center HUD where possible. On narrow or short screens, clamping the card inside the viewport is more important than preserving the preferred side.

### Step 3: Keybindings

Target:

```html
data-tour-target="keybindings"
```

Suggested copy:

```text
Change your movement and ability bindings here. Saved keybindings are stored in this browser and persist when you come back later.
```

The target should be the whole keybindings panel so the reset button, macro option, rows, and `Set` buttons are understood as one area.

## Storage Design

Use a versioned storage key:

```ts
const WALKTHROUGH_STORAGE_KEY = "melee-weaving-practice.walkthrough.v1";
```

Store `JSON.stringify(true)` when the tour has been dismissed. The app only needs to know whether the tour has been dismissed.

Recommended helper behavior:

- `loadWalkthroughDismissed()` returns `true` only when the stored JSON value is exactly `true`.
- `loadWalkthroughDismissed()` returns `false` when `window` or `localStorage` is unavailable, the key is missing, JSON parsing fails, the parsed value is not `true`, or storage throws.
- `saveWalkthroughDismissed()` catches storage errors and does not throw.

The helpers can live next to the tour component if no other feature consumes them. If the implementation grows, they can move into a small `src/ui/walkthroughStorage.ts` module.

## Positioning Design

The tour should use fixed viewport coordinates because targets can be in either the fixed-height practice stage or the scrollable side panel.

For each visible step:

1. Read the active target's bounding rect.
2. Compute a highlight rectangle with a small padding value.
3. Try preferred card placements near the target, such as right, left, bottom, then top.
4. Pick the first placement that fits within the viewport with a margin.
5. If no placement fully fits, clamp the best placement within the viewport bounds.
6. Re-run the measurement on step change, `resize`, and captured `scroll` events.

The overlay should not block the tour card controls. It may block the underlying app while the tour is active, which is acceptable for onboarding.

If a target is missing, the component should still render the step card in a centered fallback position instead of throwing. This keeps tests and unusual render timing from breaking app startup.

## UI Design

The card should match the app's existing restrained control-panel style:

- small radius, no large decorative shapes
- dark or light surface with strong contrast
- concise step title and body copy
- progress text such as `1 of 3`
- `Skip`, `Back`, and `Next` controls
- `Next` changes to `Done` on the final step

`Back` should remain visible but disabled on the first step so the controls stay stable. `Skip` should always be available.

The overlay should dim the rest of the app and draw a clear border around the current target. The highlight should not rely only on color; the dimmed cutout or border gives it shape.

## Accessibility

- Render the card as a dialog-like region with an accessible label or heading.
- Move keyboard focus into the tour card when it opens.
- Keep `Back`, `Next`, `Done`, and `Skip` reachable by keyboard.
- Allow `Escape` to skip/dismiss the walkthrough.
- Use buttons with clear accessible names.
- Preserve app startup when storage, measurement, or target lookup fails.

The tour does not need to trap focus for this small first-run guide, but the controls should be reachable and visible. If focus trapping is added, it should be tested carefully so it does not strand keyboard users.

## App Integration

Add stable tour target attributes:

- `ControlPanel`: add `data-tour-target="rotation-select"` to the rotation field.
- `App`: add `data-tour-target="practice-hud"` to the practice stage section.
- `App`: add `data-tour-target="keybindings"` to the keybindings panel section.

Mount the walkthrough near the end of `App` so it can overlay both the practice stage and side panels.

The tour should not pause, reset, or modify the practice session. If a session is running while the tour is visible, the overlay can visually sit above the app, but gameplay state should remain owned by the existing session logic.

## Testing Strategy

### Unit/UI Tests

- First render shows the walkthrough when storage has no dismissed flag.
- Existing dismissed storage prevents the walkthrough from rendering.
- `Next` advances through the three steps.
- `Back` returns to the previous step.
- `Skip` hides the tour and writes the dismissed flag.
- `Done` on the final step hides the tour and writes the dismissed flag.
- The HUD step copy explicitly describes the bars from top to bottom.
- Storage write failures do not crash the app.
- Missing targets use a fallback position instead of throwing.

### Manual Verification

- Desktop: cards appear near the rotation field, practice stage, and keybindings panel without clipping.
- Mobile/narrow viewport: cards remain inside the viewport and controls are reachable.
- Side panel scrolled: the keybindings target and card still align after scroll.
- Reload after skip or done: walkthrough stays hidden.

## Risks

- Canvas-drawn bars cannot be individually highlighted. The design addresses this by targeting the practice stage and using explicit copy.
- Positioning can be fragile around scroll containers. The component should listen for captured scroll events and remeasure from live bounding rects.
- First-run overlays can annoy returning users if storage fails. Storage failure should be silent and non-fatal, but in that case the tour may reappear on reload.
