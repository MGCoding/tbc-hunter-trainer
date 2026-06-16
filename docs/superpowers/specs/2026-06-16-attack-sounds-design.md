# Attack Sounds Design

Date: 2026-06-16

## Goal

Add World of Warcraft: The Burning Crusade attack sounds to the hunter melee weaving simulator. Sounds should reinforce actual resolved combat timing: abilities should sound only when they go off, Auto Shot should sound its windup when windup begins, and canceled Auto Shots should not play release or impact audio.

## Approved Approach

Use an event-driven audio layer with linked Wowhead/Zamimg OGG files.

The simulator remains the source of truth for timing, legality, queued casts, Auto Shot windup, Auto Shot firing, clipping, and melee swing resolution. Audio is triggered from newly observed `SimEvent` entries after `App` syncs or ticks the simulator, not directly from raw keyboard or mouse input.

This keeps sound behavior aligned with the simulator log:

- valid resolved simulator events produce audio
- invalid inputs stay silent
- delayed events such as cast completes and automatic Auto Shot fires can play at the moment they enter the simulator log
- Auto Shot windup can sound even if the shot is later clipped
- Auto Shot release and arrow impact only sound on `auto-fire`

The app will link remote OGG files from `https://wow.zamimg.com/sound-ids/tbc/enus/...`, matching the existing remote Wowhead icon approach in `PracticeScene`.

## Event Mapping

Sound playback follows simulator events:

- `auto-windup`: play bow pullback/windup
- `auto-fire`: play bow release and arrow impact
- `cast-complete` for `arcaneShot`: play Arcane Shot impact
- `cast-complete` for `steadyShot`: play Steady Shot sound
- `cast-complete` for `multiShot`: play Multi-Shot sound, bow release, and arrow impact
- `cast-complete` for `killCommand`: play Kill Command sound
- `cast-complete` for `raptorStrike`: play Raptor Strike melee special swing or impact sound
- `cast-complete` for `meleeSwing`: play normal melee swing or impact sound

Events that do not represent an attack going off stay silent:

- `ability-press`
- `queued`
- `cast-start`, except Auto Shot's separate `auto-windup`
- `invalid-input`
- `auto-clipped`
- `auto-paused`
- `auto-resumed`
- `range-change`
- `score`

## Sound Data

Use curated sound groups checked into source code rather than scraping Wowhead at runtime. The direct OGG URLs are stable enough to link, and runtime scraping would add fragility without improving the user experience.

Initial sound groups:

- Bow windup: `BowPrecastOneshot` / `BowPullback*`
- Bow release: `BowRelease*`
- Arrow impact: `ArrowThrowHit` / `ArrowHit*`
- Arcane Shot: `ArcaneMissileImpact1*`
- Steady Shot: `DecisiveStrike`
- Multi-Shot: TBC Multi-Shot page sound, plus bow release and arrow impact
- Kill Command: `KillCommand`
- Raptor Strike: `SwingWeaponSpecialWarrior*` / `DecisiveStrike`
- Melee Swing: standard weapon whoosh plus weapon impact

When Wowhead page HTML exposes localized path segments such as `dede` or `itit`, normalize linked files to the same TBC `enus` path style used by the existing Arcane Shot example, as long as the URL resolves.

Sound variants should cycle deterministically per sound group. This gives repeated attacks variation while keeping tests stable and reproducible.

## Preloading And Playback

Preload linked OGGs on app load.

`App` should call a preload helper once during startup. The audio module creates reusable `HTMLAudioElement` instances for every linked OGG and calls `load()`. Playback uses cloned or pooled audio elements so rapid events can overlap without cutting each other off.

Browser behavior may still defer network fetches or block playback until a user gesture. The implementation should treat that as normal:

- preload attempts should fail soft
- playback attempts should fail soft
- audio errors should never interrupt practice
- starting, stopping, or resetting a session should not reload the sound catalog
- the preloaded catalog should live for the page lifetime

Volume should be centralized and conservative so attack sounds do not overwhelm the timing HUD or the existing success chime.

## Component Boundaries

Suggested additions and changes:

- `src/audio/attackSounds.ts`: own remote URL data, sound groups, preloading, variant cycling, fail-soft playback, and event-to-sound dispatch helpers.
- `src/App.tsx`: call attack sound preloading on startup, track the last processed simulator log index, and forward only new simulator events to the attack sound layer after simulator sync points.
- `src/tests/app-ui.test.tsx`: verify startup preloading and app-level forwarding of new simulator events.
- `src/tests/attack-sounds.test.ts`: verify pure event-to-sound behavior, variant cycling, and error swallowing around browser audio primitives.

The simulator should not import audio code. Phaser should not own attack sound playback for this version because the relevant event stream already lives in React/App and the simulator log.

## Data Flow

1. App loads and calls the attack sound preload helper.
2. The audio module builds the linked OGG catalog and warms the browser audio elements.
3. User starts a practice session.
4. App resets the simulator and resets its processed-audio event cursor.
5. Input, movement, stop, reset, and live state reads continue to sync or tick the simulator.
6. After each sync point that may create simulator log entries, App reads new log entries since the previous cursor.
7. App passes only those new events to the attack sound layer.
8. The audio layer maps each event to zero or more sound groups and plays the next deterministic variant for each group.
9. If playback fails, the audio layer catches the failure and practice continues.

## Error Handling

The feature should fail soft:

- If `HTMLAudioElement` playback is blocked, skip audio silently.
- If an OGG URL fails to load, skip that file and keep other sounds working.
- If a sound group is empty or unavailable, skip that sound group.
- If a simulator event is unknown to the audio layer, ignore it.
- If the same simulator event is observed again during a render refresh, do not replay it.

## Testing Strategy

Unit tests should cover the audio module first:

- preloading creates and loads every configured OGG once
- `auto-windup` maps to bow windup
- `auto-fire` maps to bow release and arrow impact
- `auto-clipped` does not map to release or impact
- `cast-complete` maps each supported ability to the correct sound group
- invalid and non-attack events stay silent
- deterministic variant cycling advances per sound group
- load and playback failures are swallowed

App-level tests should cover integration:

- startup calls the preload helper once
- new simulator events are forwarded to attack sound playback
- already processed simulator events are not replayed across state refreshes
- stopping a running session processes delayed events that became due before stop
- invalid out-of-range inputs do not trigger attack sounds

Manual browser verification should confirm:

- sounds preload on page load as much as the browser allows
- Auto Shot windup plays when windup starts
- clipped Auto Shots do not play release or impact sounds
- Auto Shot release and impact play only when `auto-fire` occurs
- each hunter attack has audible feedback when it resolves
- rapid events can overlap without cutting each other off
- audio failures do not break the practice session
