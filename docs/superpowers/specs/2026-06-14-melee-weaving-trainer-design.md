# Melee Weaving Timing Trainer Design

Date: 2026-06-14

## Goal

Build a browser-based timing trainer for World of Warcraft: The Burning Crusade hunter rotations, with special focus on melee weaving. The app helps players practice exact timing for ranged shots, melee weaves, movement in and out of range, and Auto Shot clipping avoidance. It is not a damage simulator.

The trainer will include both ranged-only and melee-weaving rotations from Diziet's TBC hunter rotation guide:

- Source: https://diziet559.github.io/rotationtools/#melee-weaving
- Rotation presets store the display name, compact pattern string, target haste profile, and reference text/link.

## Approved Approach

Use React + Phaser + TypeScript with Vite.

React owns application UI: rotation selection, settings, keybindings, scoring panels, event log, and session controls.

Phaser owns the live practice surface: player-centered 2D field, target/range visualization, continuous movement input, animation loop, and HUD bar rendering. React owns configuration and review panels around the practice surface.

The timing simulator core stays framework-agnostic. It should be testable without React or Phaser.

The app must build to static assets suitable for GitHub Pages.

## Practice Screen Layout

The main practice field is essentially full screen. The camera stays centered on the player, so the enemy, hitbox, melee range ring, and ranged range ring move relative to the hunter.

HUD bars sit stacked below the player:

1. Cast bar on top.
2. Compact melee swing timer in the middle.
3. Ranged swing timer on bottom.

The screen also includes compact panels for:

- selected rotation
- current efficiency score
- recent mistake callout
- reference rotation sequence
- link to Diziet's rotationtools page
- settings and session controls

A small guide section explains what each bar means.

## Timing Model

The simulator runs from a monotonic game clock.

Core timing rules:

- Global cooldown is `1.5s`.
- Spell queue window is configurable and defaults to `100ms`.
- Auto Shot uses a ranged swing timer derived from the selected rotation's haste profile and ranged weapon speed.
- Auto Shot has a short wind-up/cast phase at the end of the ranged swing. Once this wind-up starts, Steady Shot may begin without clipping that Auto Shot.
- Steady Shot is a `1.5s / haste` cast. The ranged swing timer shows a spark for when an active Steady Shot will complete.
- Multi-Shot is a `0.5s / haste` cast with GCD and cooldown. If the hunter is still casting Multi-Shot when the ranged timer reaches the no-move/no-cast spark, Auto Shot wind-up is prevented and the Auto Shot is clipped/delayed.
- Arcane Shot is instant, uses the GCD, and has a cooldown.
- Kill Command is off the GCD, but cannot be used while Steady Shot is actively casting.
- Raptor Strike / melee action requires melee range and has its own cooldown.
- Melee swing timer defaults to `3.5s` base speed, modified by the same haste factor used to put the selected ranged weapon into the target rotation speed.
- Range legality is determined from the 2D field. Melee actions require melee range; ranged actions require valid ranged range.

The ranged swing timer includes sparks for:

- no-move/no-cast point, defaulting to exactly `0.5s` before the Auto Shot is due
- current GCD end
- Steady Shot completion, when a Steady Shot is casting

## Movement And Input

Movement uses a fixed-facing 2D practice field.

- `W/S` move forward/back along the fixed facing vector.
- `A/D` strafe.
- The simulator continuously computes distance from player to target.
- The camera remains centered on the player.

Default keybindings:

- `W/A/S/D`: forward, strafe left, back, strafe right
- `1`: Arcane Shot
- `2`: Kill Command
- `3`: Multi-Shot
- `4`: Steady Shot
- `Mouse 4`: Raptor Strike / melee action
- `V`: Auto Shot

Keybindings are editable, including mouse buttons `Mouse 1-5`.

The input layer tracks simultaneous key state for movement and discrete key/button presses for abilities. Ability presses may enter the spell queue when legal under the configured queue window.

## Rotation Presets

V1 includes ranged-only and melee-weaving rotations from Diziet's guide.

Each preset includes:

- id
- display name
- category: ranged-only or melee-weaving
- compact pattern string, such as `asmawsaswasAaws`
- expanded reference sequence chips
- source URL
- recommended usage notes from the guide
- ranged weapon speed assumption
- target haste factor
- melee base speed and derived melee swing speed
- ideal event timeline used for scoring

Known melee-weaving presets include:

- French weaving `5:5:1:1 3w`
- 1:1 half-weave `2:2 1w`
- `6:9:1:1 3w`
- `6:11:1:1 3w`
- `3:7 2w`

Known ranged-only presets include the basic, complex, and combined rotations from the guide, including `1:1`, `1:2`, `1:3`, `5:4:1:1`, `5:5:1:1`, `5:6:1:1`, `5:9:1:1`, `2:3`, and `2:5`.

## Scoring And Feedback

Scoring compares player actions against the exact scripted ideal timeline for the selected rotation preset.

The app shows a `0-100%` session efficiency score and recent mistake callouts.

Scoring penalties include:

- pressing the wrong next ability
- pressing the right ability too early or too late
- Auto Shot clipping or delay from moving/casting through the no-move/no-cast window
- failing to be in melee range for a required weave
- failing to return to valid ranged range for the next ranged action
- missed or late Raptor/melee actions
- invalid Kill Command attempts during Steady Shot
- unqueued or unused available GCD windows when the ideal sequence expected an action

Feedback includes:

- next expected events
- timing offsets in milliseconds
- concise mistake labels, such as `Steady 92ms late`, `Auto clipped by movement`, or `Raptor out of range`

## Event Log

The app keeps a session event log. During practice, it records:

- ability presses
- queued abilities
- cast starts and completions
- Auto Shot wind-ups, fires, clips, and delays
- melee swings
- range changes
- score events
- invalid inputs

When the session ends, the user can open the full log, review all events, and reset it before starting again.

## Component Boundaries

Suggested source layout:

- `src/sim/`: pure timing engine, movement model, ability rules, rotation timeline generation, scoring, and event logging.
- `src/input/`: keybinding definitions, keyboard and mouse input adapter, simultaneous movement state, and ability press mapping.
- `src/game/`: Phaser scene, camera, target/player rendering, range rings, and in-field HUD rendering.
- `src/ui/`: React panels for settings, rotation reference, session controls, score, keybindings, and event log.
- `src/data/`: rotation presets and constants.
- `src/tests/`: unit tests for timing rules, scoring, movement range checks, and keybinding behavior.

No component should own both simulation truth and rendering. React and Phaser observe simulator state and dispatch user inputs; the simulator decides legality, timing, and scoring.

## Data Flow

1. User selects a rotation preset.
2. App initializes simulator state from the preset.
3. Phaser input adapter updates movement state continuously.
4. Ability key presses go through the input layer into the simulator.
5. Simulator applies queue, cooldown, GCD, casting, range, and swing timer rules.
6. Simulator emits state snapshots and event log entries.
7. Phaser renders field, range rings, player-centered camera, and HUD bars.
8. React renders score, settings, reference rotation, session controls, and event log.

## Error Handling

Invalid actions should not crash the session. They should produce clear feedback and event log entries.

Examples:

- pressing an unbound key is ignored
- pressing a bound ability at an illegal time creates an invalid-input event
- attempting Raptor outside melee range creates an out-of-range event
- attempting Kill Command during Steady Shot creates an invalid-input event
- changing rotation during an active session prompts or resets the session

User-editable keybindings must prevent duplicate bindings unless the user explicitly replaces the existing binding.

## Testing Strategy

Unit tests should cover the pure simulator first:

- Steady Shot `1.5s / haste` cast duration.
- Multi-Shot `0.5s / haste` cast duration and Auto Shot clipping behavior.
- Auto Shot wind-up allowing Steady Shot after wind-up starts.
- GCD and `100ms` queue window behavior.
- Kill Command off-GCD legality and Steady Shot restriction.
- Melee swing speed derived from `3.5s / hasteFactor`.
- Range legality for ranged and melee actions.
- Exact timeline scoring for at least one ranged-only preset and one melee-weaving preset.
- Event log entries for valid, queued, invalid, clipped, and missed actions.

Integration/browser checks should cover:

- simultaneous movement keys
- mouse button keybindings
- session start/reset
- rotation dropdown updating preset/reference/timers
- static build running from the Vite output

## Implementation Notes

The no-move/no-cast spark defaults to `0.5s` before Auto Shot and remains configurable in constants.

The first implementation can use handcrafted preset timelines from Diziet's compact pattern strings. Later versions can add a timeline generator if manual preset maintenance becomes awkward.
