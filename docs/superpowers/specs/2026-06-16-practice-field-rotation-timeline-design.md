# Practice Field Rotation Timeline Design

Date: 2026-06-16

## Goal

Add a minimal vertical rotation timeline overlay to the practice field. The timeline helps the player see the selected rotation's upcoming spell, Auto Shot, and melee events, and gives immediate success audio only when the player times the matching input correctly.

## Approved Approach

Use a Phaser-native overlay rendered inside `PracticeScene`.

The overlay is pinned to the right side of the practice field rather than placed in the React side panel. It reuses the existing in-app ability icon system from `src/game/PracticeScene.ts`, including the current Wowhead icon keys and image loading path used by the cooldown icon row. This keeps the visual language consistent and avoids adding new icon assets.

React remains responsible for session control and input handling. `App` computes the selected preset and expanded ideal rotation with `expandRotationPattern(preset)`, tracks live session elapsed time while running, and passes the timeline data through `PhaserHost` to `PracticeScene`.

`PracticeScene` only renders the timeline. It does not decide whether an input was successful.

## Timeline Behavior

The overlay uses a minimal rail treatment:

- no text labels in V1
- static ability icons
- a thin horizontal gold timing bar
- compact right-edge placement over the practice field

The rail should show as much of the selected rotation as possible. Most presets should fit as a full expanded pattern. On smaller viewports, the layout adapts icon size and spacing within readable bounds, then crops only if the full pattern physically cannot fit.

The icons stay fixed for the selected rotation pattern. The gold timing bar moves downward based on session elapsed time and the ideal event times from the expanded rotation. Events are positioned by their real `idealAtMs` timing rather than equal spacing, so dense rotation sections appear dense and longer waits appear as larger gaps.

When elapsed time reaches the end of the selected pattern, the timing bar loops back to the top and continues through repeated practice cycles.

Ability icon mapping:

- Auto Shot uses the existing Auto icon mapping.
- Steady Shot uses the existing Steady icon mapping.
- Multi-Shot uses the existing Multi icon mapping.
- Arcane Shot uses the existing Arcane icon mapping.
- Raptor Strike uses the existing melee/Raptor icon mapping.
- White melee swing events reuse the existing melee icon image with a distinct neutral border/tint so they are visually separate from Raptor Strike without adding another external asset.

## Input Feedback And Sound

The success sound plays only when the user times the input correctly.

On each ability input, the app checks the current loop of the ideal timeline. A press succeeds only when:

- the pressed ability matches the expected ideal event
- the press lands within `+/-100ms` of that event's ideal time in the current loop
- the same loop/event pair has not already produced a success sound

Pressing the wrong ability, pressing too early, pressing too late, or pressing when no ideal event is active stays silent.

The sound is a short Web Audio chime generated in code. No audio files are needed. Since it plays in response to keyboard or mouse input, it should satisfy browser user-gesture requirements. If Web Audio is unavailable or blocked, the app skips the sound without interrupting the session.

## Data Flow

1. User selects a rotation preset.
2. `App` resolves the preset and expands it into ideal events.
3. Starting a session resets the simulator and captures `sessionStartedAtMs`.
4. While running, `App` exposes live elapsed session time to Phaser.
5. `PhaserHost` passes the preset, ideal timeline, and live practice state accessors into `PracticeScene`.
6. `PracticeScene` renders the right-edge rail, static icons, and moving timing bar each frame.
7. On an ability input, `App` syncs the simulator to the live timestamp, checks perfect input timing, plays the success chime when appropriate, then continues with the existing simulator press flow.

## Component Boundaries

Suggested additions and changes:

- `src/sim/timeline.ts`: add pure helpers for looped ideal timing and perfect-input detection alongside the existing rotation expansion helpers.
- `src/game/PracticeScene.ts`: render the minimal right-edge rail and reuse exported icon definitions or a shared helper for timeline icon keys.
- `src/game/PhaserHost.tsx`: accept and forward timeline data needed by the scene.
- `src/App.tsx`: track live elapsed time for rendering, evaluate perfect input timing on ability presses, and call the success sound helper.
- `src/audio/successChime.ts`: contain the small Web Audio helper so audio behavior is isolated from App.

The simulator should remain the authority for timing rules, action legality, and event logs. The timeline overlay is a visual guide. The success chime is immediate UI feedback and does not need to become a score event in V1.

## Error Handling

The timeline should fail soft:

- If an icon image is not loaded, Phaser should continue rendering the rail without crashing.
- If the ideal timeline is empty, the rail should hide.
- If the viewport is too small to fit useful icons, the rail should collapse to the smallest readable treatment rather than overlapping core HUD bars.
- If Web Audio is blocked or unavailable, the success sound should be skipped silently.
- Changing rotation resets the active session as it does today, which also resets timeline progress and duplicate-sound tracking.

## Testing Strategy

Unit tests should cover pure logic first:

- mapping elapsed session time into the correct rotation loop and event offset
- detecting a perfect press within `+/-100ms`
- rejecting wrong ability presses
- rejecting early and late presses outside tolerance
- suppressing duplicate success feedback for the same loop/event pair
- calculating rail layout so it shows as much of the pattern as possible without unreadably tiny icons

Existing UI tests can verify:

- selected rotation changes update the timeline data passed toward the Phaser host
- starting a session resets live timeline timing
- perfect input detection is invoked from the existing ability input path

Existing Phaser layout tests can verify:

- the rail is pinned to the right side of the practice field
- icon size and spacing adapt to viewport height
- the rail avoids the bottom HUD bars where possible

Manual browser verification should confirm:

- the minimal rail appears over the practice field, not inside the side panel
- the full selected rotation is shown when the viewport allows it
- the timing bar moves downward and loops smoothly
- success audio plays only for correctly timed matching inputs
- success audio does not repeat on double taps inside one timing window
- the overlay remains readable on desktop and mobile-sized viewports
