# Raptor Macro And Mouse Forward Design

Date: 2026-06-16

## Goal

Add two World of Warcraft input behaviors to the melee weaving trainer:

- an option that makes the Raptor Strike input also attempt Kill Command
- forward movement while the left and right mouse buttons are held together

Both behaviors should feel like input conveniences. The simulator should continue to decide whether an ability is usable, queued, invalid, on cooldown, in range, or scored correctly.

## Approved Approach

Use app-level macro expansion for the Raptor Strike option.

When the option is enabled, pressing the Raptor Strike binding attempts Kill Command first, then Raptor Strike, using the same input timestamp. Pressing the Kill Command binding still attempts only Kill Command. Each attempted ability flows through the existing app and simulator ability press logic so cooldown, range, GCD, event logging, sounds, scoring, and success chimes remain consistent.

Use input-adapter state for mouse-forward movement.

The browser input adapter should track left and right mouse button down/up state. While both buttons are down, it contributes forward movement. This contribution should merge with keyboard forward movement: releasing either mouse button stops only the mouse-forward contribution, and releasing the keyboard forward key stops only the keyboard contribution.

## User Controls

Add a checkbox or toggle near the keybinding controls:

- Label: `Macro Kill Command into Raptor Strike`
- Default: off

The option does not change displayed keybinds. The Raptor Strike keybinding remains the visible binding for the melee input, and Kill Command remains separately bindable.

## Component Boundaries

Suggested changes:

- `src/App.tsx`: own the macro option state, render the toggle, and expand Raptor Strike inputs into Kill Command plus Raptor Strike when enabled.
- `src/input/browserInput.ts`: track mouse button state and merge mouse-forward movement with existing keyboard movement.
- `src/tests/app-ui.test.tsx`: verify the toggle and app-level macro behavior.
- `src/tests/keybindings.test.ts`: verify simultaneous left and right mouse buttons drive forward movement and release cleanly.

The simulator should not know about macros or mouse chords. Keybinding resolution should remain generic and should not gain Raptor Strike-specific behavior.

## Data Flow

1. User starts a practice session.
2. User enables `Macro Kill Command into Raptor Strike`.
3. User presses the Raptor Strike binding.
4. App syncs movement and range once to get a single elapsed timestamp for the input.
5. App attempts Kill Command at that timestamp.
6. App attempts Raptor Strike at that same timestamp.
7. New simulator log entries are processed through existing sound, scoring, and UI update paths.

Mouse-forward movement:

1. User holds left mouse button.
2. User holds right mouse button.
3. Browser input emits movement with `forward: true`.
4. User releases either mouse button.
5. Browser input removes the mouse-forward contribution. `forward` stays true only if another source, such as the keyboard forward binding, is still active.

## Error Handling

- If the macro option is enabled while the session is stopped, Raptor Strike input still does nothing because ability input is already ignored while stopped.
- If Kill Command is unusable, the simulator records or ignores it according to existing rules, then Raptor Strike is still attempted.
- If Raptor Strike is out of range, its existing invalid-input behavior remains unchanged.
- Mouse-forward state should reset through normal button-up events and cleanup listeners.

## Testing Strategy

Automated tests should cover:

- the macro option renders off by default
- enabling the option makes Raptor Strike input attempt Kill Command and Raptor Strike
- pressing Kill Command does not attempt Raptor Strike
- disabled macro mode preserves existing Raptor Strike-only behavior
- left and right mouse down together set `forward: true`
- releasing either mouse button removes the mouse-forward contribution
- keyboard forward movement remains active after mouse-forward is released

Manual browser verification should confirm:

- the toggle is visible near keybindings
- Raptor Strike input logs Kill Command before Raptor Strike when enabled
- normal Raptor Strike behavior returns when disabled
- holding both mouse buttons moves the character toward the target
- mouse-forward movement does not interfere with WASD movement
