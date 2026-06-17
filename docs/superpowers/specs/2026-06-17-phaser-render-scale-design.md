# Phaser Render Scale Design

## Purpose

The Phaser practice field looks softer than the React control panels on high-DPI displays because the canvas backing store is currently sized at roughly one backing pixel per CSS pixel. On a Retina-class display, DOM text and borders are rendered at the display's physical pixel density, while the Phaser canvas is effectively upscaled by the browser.

The fix is to keep the Phaser canvas visually filling exactly 100% of the measured practice frame, while rendering its backing buffer at an effective render scale.

## Root Cause Evidence

The live page was inspected with Playwright at a desktop viewport of `1848 x 1000`.

At `deviceScaleFactor: 1`:

- Canvas backing store: `1468 x 1000`
- Canvas CSS/display size: `1468 x 1000`

At `deviceScaleFactor: 2`:

- Canvas backing store: `1468 x 1000`
- Canvas CSS/display size: `1468 x 1000`

For a crisp high-DPI canvas at `2x`, the display size should remain `1468 x 1000` CSS pixels, but the backing store should be approximately `2936 x 2000` physical pixels.

The current CSS rule `.phaser-host canvas { width: 100%; height: 100%; }` makes the canvas fill the frame visually. Phaser `Scale.RESIZE` also sizes the game from parent CSS dimensions. The missing piece is a deliberate render-scale multiplier for the canvas backing store.

## User-Facing Behavior

Add a render scale setting for the Phaser practice field.

Options:

- `Auto`
- `1x`
- `1.5x`
- `2x`
- `3x`
- `4x`

Default:

- `Auto`

Auto behavior:

- Measure the Phaser host frame in CSS pixels.
- Use `window.devicePixelRatio` as the effective render scale.
- Clamp the effective render scale to the supported range of `1x` through `4x`.
- Keep the canvas display size at exactly 100% of the host frame.
- Render the canvas backing store at `host CSS size * effective render scale`.
- Show the effective value in the UI, for example `Auto (2x)`.

Manual behavior:

- Use the selected numeric scale as the effective render scale.
- Clamp any invalid stored or passed value to `1x` through `4x`.
- Keep the canvas display size at exactly 100% of the host frame.

## Architecture

React owns the user-facing setting and passes a render-scale preference into `PhaserHost`.

`PhaserHost` owns measuring the host frame, resolving the effective render scale, and resizing the Phaser canvas. It should use a `ResizeObserver` so changes to the practice frame are detected without relying only on window resize events.

`PracticeScene` should continue laying out the field, HUD, range rings, timeline rail, and labels in logical CSS-pixel dimensions. The render-scale multiplier is a presentation detail of the canvas backing buffer, not a change to gameplay coordinates or UI layout.

## Components

### App State

`App` should hold the render scale preference alongside the existing settings state. The setting should be passed to:

- The right-side control UI for display and changes.
- `PhaserHost` for rendering.

Persist the setting in `localStorage` with the same non-fatal storage posture used for keybindings. Use a separate versioned key:

```ts
const RENDER_SCALE_STORAGE_KEY = "melee-weaving-practice.renderScale.v1";
```

Store one preference value as JSON:

```ts
type RenderScalePreference = "auto" | 1 | 1.5 | 2 | 3 | 4;
```

Storage helpers should live near the render-scale parsing helpers rather than inside keybinding code. Loading should return `auto` when storage is unavailable, the key is missing, JSON parsing fails, or the parsed value is not one of the allowed preferences.

### Control Panel

The right-side UI should expose a compact `Render Scale` select control. It should not explain the blur problem in the app UI; the control label and current value are enough.

Display examples:

- `Auto (2x)` when Auto resolves to `2`.
- `1.5x` when manually selected.

### PhaserHost

`PhaserHost` should:

1. Measure the host frame's CSS-pixel width and height.
2. Resolve the effective render scale:
   - `Auto`: clamp `window.devicePixelRatio` to `1-4`.
   - Manual: clamp the chosen numeric value to `1-4`.
3. Keep the canvas CSS size equal to the host frame.
4. Set the canvas backing store to `round(hostCssWidth * effectiveScale)` by `round(hostCssHeight * effectiveScale)`.
5. Preserve logical scene dimensions as host CSS dimensions.
6. Update Phaser and the active scene when the host size or effective render scale changes.

The scene should receive both logical dimensions and effective scale only if it needs them to keep rendering coordinates correct. Prefer keeping scale-specific work inside `PhaserHost` if Phaser APIs allow it cleanly.

### PracticeScene

`PracticeScene` should keep its existing layout semantics:

- `calculatePracticeLayout(width, height)` receives logical CSS-pixel dimensions.
- Camera viewport and centering use logical CSS-pixel dimensions.
- HUD positions, icon sizes, line widths, and labels should not visually double when effective render scale is `2x`.

If Phaser requires the camera or root container to account for the backing-store scale, isolate that adjustment behind a small method so the rest of the scene remains layout-scale agnostic.

## Data Flow

1. User selects a render scale preference in the control panel.
2. `App` stores the preference.
3. `App` passes the preference to `PhaserHost`.
4. `PhaserHost` measures the host frame.
5. `PhaserHost` resolves the effective scale.
6. `PhaserHost` applies backing-store sizing and notifies Phaser of the logical size.
7. `PracticeScene` renders the field using logical CSS-pixel dimensions.

## Error Handling

If the host frame has no positive width or height, `PhaserHost` should avoid applying a backing-store resize and let the existing scene safeguards handle zero-size layouts.

If `window.devicePixelRatio` is missing, non-finite, or less than `1`, Auto should resolve to `1x`.

If a stored preference is unrecognized, the app should fall back to `Auto`.

If a numeric preference is outside the supported range, clamp it to `1x` or `4x`.

## Testing

Unit and component tests should verify:

- The render scale control renders with `Auto`, `1x`, `1.5x`, `2x`, `3x`, and `4x`.
- `Auto` is the default.
- Selecting a manual value updates the value passed to `PhaserHost`.
- Invalid stored values fall back to `Auto`.
- Saving and loading a valid manual value preserves that preference.
- Storage read/write failures do not throw and do not block in-memory preference changes.
- Effective scale calculation clamps `devicePixelRatio` to `1-4`.

Browser tests should verify:

- At `deviceScaleFactor: 2`, with Auto selected, the canvas display size still matches the Phaser host CSS size.
- At `deviceScaleFactor: 2`, with Auto selected, the canvas backing-store width and height are approximately 2x the CSS display dimensions.
- With manual `1x`, backing-store dimensions match CSS dimensions.
- The practice scene remains visible after changing render scale.

Existing layout tests should continue to validate logical CSS-pixel layout. They should not be rewritten around physical backing-store dimensions.

## Out Of Scope

This design does not change gameplay timing, movement, range calculations, rotation logic, keybindings, audio, or the simulator event model.

This design does not redesign the Phaser HUD or move Phaser-rendered UI into React.

This design does not require visual explanatory copy inside the application.
