# Melee Weaving Practice

Melee Weaving Practice is a browser-based trainer for practicing hunter ranged rotations and melee-weaving timing. It gives players a repeatable practice field where they can work on the cadence of Auto Shot, Steady Shot, Multi-Shot, Arcane Shot, Kill Command, Raptor Strike, and melee swings without needing to be in-game or in a live raid pull.

The app is built around the timing problems that make melee weaving difficult: staying in range long enough to land the melee event, returning to ranged range before the next Auto Shot matters, avoiding clipped autos, and keeping the expected rotation sequence moving. It shows the current rotation reference, ability cooldowns, range state, event log, mistakes, auto delay, weave time, and a running efficiency score so players can connect their inputs to the timing consequences immediately.

It helps players practice:

- Ranged hunter shot rhythms such as 1:1, 1:2, 1:3, French rotations, skipping rotations, and high-haste combined patterns.
- Melee-weaving presets such as 5:5:1:1 3w French weaving, half-weaves, high-haste weaves, and maximum-haste weave patterns.
- Moving into melee range for Raptor Strike or a white melee swing, then moving back out before ranged attacks are delayed.
- Timing casts and queued abilities inside a 100ms spell queue window.
- Recognizing clipped, delayed, missed, early, late, out-of-range, and cooldown-locked actions.
- Customizing keyboard and mouse bindings to match a player's real setup, including an optional Kill Command into Raptor Strike macro-style helper.

The rotation presets are based on the melee-weaving reference patterns from [Diziet rotationtools](https://diziet559.github.io/rotationtools/#melee-weaving).

## Build and Run Locally

This project uses Vite, React, Phaser, TypeScript, Vitest, and Playwright.

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Vite will print the local URL, usually `http://127.0.0.1:5173/`.

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run the unit and component test suite:

```bash
npm test
```

Run the Playwright end-to-end tests:

```bash
npm run e2e
```

## License

Melee Weaving Practice is open source software licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full license text.
