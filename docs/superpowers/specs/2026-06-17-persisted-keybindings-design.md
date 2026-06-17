# Persisted Keybindings Design

## Summary

Persist the user's full keybinding map in `localStorage` and add a Keybindings panel control that restores the approved default bindings.

The app should load saved bindings on startup, save the complete map after successful rebinds, and recover gracefully when browser storage is unavailable or contains invalid data.

## Goals

- Keep user-edited keyboard and mouse bindings across page reloads.
- Store the complete action-to-binding map, not only the last edited action.
- Add a clear reset control that restores `DEFAULT_KEYBINDS`.
- Keep keybinding parsing, validation, and formatting close to the existing keybinding helpers.
- Avoid disrupting live input routing, movement release behavior, or the existing capture flow.

## Non-Goals

- Do not persist rotation selection, macro options, score, events, or session state.
- Do not add import/export, profiles, or multiple keybinding presets.
- Do not change the default bindings.
- Do not change duplicate binding replacement behavior.

## Current Context

`App` owns the live `keybindings` state and initializes it from `DEFAULT_KEYBINDS`. Rebinding happens through `applyBinding`, which calls `rebindAction(current, action, binding, true)` and clears the capture state.

`src/input/keybindings.ts` already owns binding matching, formatting, and rebinding helpers. This is the natural place for a small persistence API because storage data must be validated against the keybinding model before `App` consumes it.

The input adapter receives keybindings through a ref-backed getter, so updating React state already updates live gameplay input without recreating the adapter.

## Storage Design

Use a versioned storage key:

```ts
const KEYBINDINGS_STORAGE_KEY = "melee-weaving-practice.keybindings.v1";
```

Store the full `KeybindingMap` as JSON:

```json
{
  "moveForward": { "kind": "keyboard", "code": "KeyW" },
  "moveBackward": { "kind": "keyboard", "code": "KeyS" },
  "strafeLeft": { "kind": "keyboard", "code": "KeyA" },
  "strafeRight": { "kind": "keyboard", "code": "KeyD" },
  "arcaneShot": { "kind": "keyboard", "code": "Digit1" },
  "killCommand": { "kind": "keyboard", "code": "Digit2" },
  "multiShot": { "kind": "keyboard", "code": "Digit3" },
  "steadyShot": { "kind": "keyboard", "code": "Digit4" },
  "raptorStrike": { "kind": "mouse", "button": 3 },
  "autoShot": { "kind": "keyboard", "code": "KeyV" }
}
```

The loader should return defaults when:

- `window` or `localStorage` is unavailable.
- The key is missing.
- JSON parsing fails.
- The parsed value is not an object.
- Any required action is missing.
- Any action has an invalid binding shape.

Validation rules:

- Keyboard bindings require `{ kind: "keyboard", code: string }`.
- Mouse bindings require `{ kind: "mouse", button: number }`.
- Mouse buttons should remain in the browser-supported capture range of `0` through `4`.
- Empty keyboard codes remain valid because `rebindAction` can unbind duplicate actions by assigning `{ kind: "keyboard", code: "" }`.
- Extra stored keys are ignored by reconstructing a fresh map from the known action list.

## API Design

Add small helpers to `src/input/keybindings.ts`:

```ts
export function loadStoredKeybindings(defaultBindings: KeybindingMap): KeybindingMap;
export function saveStoredKeybindings(bindings: KeybindingMap): void;
export function clearStoredKeybindings(): void;
```

The helpers should catch storage errors so private browsing, restricted storage, and malformed data cannot break app startup or rebinding.

`loadStoredKeybindings` should clone either the stored map or the provided defaults. This avoids sharing the imported `DEFAULT_KEYBINDS` object by reference.

`clearStoredKeybindings` should remove the storage entry rather than writing the default map. That lets future default binding changes apply after reset.

## App Behavior

Initialize keybindings with a lazy state initializer:

```ts
const [keybindings, setKeybindings] = useState<KeybindingMap>(() => loadStoredKeybindings(DEFAULT_KEYBINDS));
```

When a user captures a new binding:

1. Build the next map with `rebindAction(current, action, binding, true)`.
2. Save the complete next map to storage.
3. Return the next map from the state updater.
4. Clear `captureAction`.

When a user resets:

1. Clear persisted keybindings from storage.
2. Set keybindings to a cloned copy of `DEFAULT_KEYBINDS`.
3. Clear `captureAction`.

No additional effect is needed for persistence. Saving only inside the explicit edit path keeps startup reads from immediately writing defaults and keeps reset semantics clear.

## UI Design

Add a secondary button in the Keybindings panel labeled `Reset to Default`.

The button should sit near the Keybindings heading so it is visually associated with the whole map, not a single row. The existing `Listening` status should remain visible while capture is active.

The reset control should use the existing secondary button style and an accessible button name of `Reset keybindings to default` if the visible label needs to stay compact.

## Error Handling

Storage failures are non-fatal. If `localStorage` throws on read, write, or remove, the app continues using in-memory state.

Malformed stored data is ignored and replaced in memory by defaults. The design does not require eagerly deleting malformed storage on load, but doing so is acceptable if the implementation keeps the helper simple and silent.

## Testing Strategy

### Keybinding Helper Tests

- Loading with no stored value returns the defaults.
- Saving a custom map writes the full JSON map.
- Loading a saved custom map returns that map.
- Loading malformed JSON returns defaults.
- Loading a map with a missing action returns defaults.
- Loading a map with an invalid binding shape returns defaults.
- Clearing storage removes the stored entry.
- Storage read/write/remove exceptions do not throw.

### UI Tests

- Rebinding Arcane Shot updates the displayed key, rerendering the app loads the saved binding, and the edited binding routes live input.
- Clicking `Reset to Default` restores the displayed default binding and clears the stored override.
- After reset, the default Arcane Shot key routes live input again.
- Clicking reset while listening cancels the capture state.

## Open Decisions Resolved

- Persist all keybindings as one map.
- Use a versioned `localStorage` key.
- Keep persistence helpers in `src/input/keybindings.ts`.
- Remove the storage entry on reset so future defaults can apply.
