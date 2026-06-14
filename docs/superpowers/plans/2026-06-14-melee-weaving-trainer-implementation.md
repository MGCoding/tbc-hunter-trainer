# Melee Weaving Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static browser-based TBC hunter timing trainer for ranged rotations and melee weaving.

**Architecture:** Vite + React hosts the app shell, settings, references, scoring, and event log. Phaser renders the full-screen player-centered practice field and stacked HUD bars. A pure TypeScript simulator owns timing, movement, legality, scoring, and event logging so tests can verify behavior without rendering.

**Tech Stack:** TypeScript, Vite, React, Phaser, Vitest, Testing Library, Playwright.

---

## File Structure

- `package.json`: scripts and dependencies.
- `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`: build and test configuration.
- `src/main.tsx`: React entrypoint.
- `src/App.tsx`: top-level state wiring for selected rotation, settings, session, Phaser host, and panels.
- `src/styles.css`: full-screen layout and panel styling.
- `src/data/constants.ts`: timing, range, movement, and keybinding constants.
- `src/data/rotations.ts`: rotation presets sourced from Diziet rotationtools.
- `src/sim/types.ts`: shared simulator types.
- `src/sim/abilities.ts`: ability metadata and timing helpers.
- `src/sim/movement.ts`: fixed-facing 2D movement and range checks.
- `src/sim/timeline.ts`: conversion from compact rotation strings into expected events.
- `src/sim/scoring.ts`: exact timeline scoring.
- `src/sim/sessionLog.ts`: event log helper.
- `src/sim/simulator.ts`: state machine for queue, GCD, casts, swings, movement, and scoring.
- `src/input/keybindings.ts`: editable keybinding model and duplicate prevention.
- `src/input/browserInput.ts`: keyboard/mouse event adapter.
- `src/game/PracticeScene.ts`: Phaser scene for field, camera, range rings, target, player, and HUD bars.
- `src/game/PhaserHost.tsx`: React wrapper that creates and destroys the Phaser game.
- `src/ui/ControlPanel.tsx`: rotation selection, score, settings, and session controls.
- `src/ui/ReferencePanel.tsx`: selected Diziet reference rotation chips and link.
- `src/ui/EventLogPanel.tsx`: session event log review/reset UI.
- `src/tests/*.test.ts`: simulator, data, input, and UI tests.
- `e2e/app.spec.ts`: Playwright smoke tests.

---

### Task 1: Scaffold Vite React TypeScript App

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Create package and config files**

Create `package.json`:

```json
{
  "name": "melee-weaving-practice",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "phaser": "^3.90.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.54.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.2.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^3.2.0"
  }
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Melee Weaving Trainer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "e2e"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 2: Create minimal React shell**

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <div className="stage-title">Melee Weaving Trainer</div>
      </section>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #16202b;
  background: #101820;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
select,
input {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  background: #101820;
}

.practice-stage {
  min-height: 100vh;
  display: grid;
  place-items: center;
  color: #eaf0f6;
}

.stage-title {
  border: 1px solid rgba(234, 240, 246, 0.25);
  border-radius: 8px;
  padding: 24px;
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install exits with code `0`.

- [ ] **Step 4: Verify scaffold**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build complete and create `dist/`.

- [ ] **Step 5: Commit scaffold**

```bash
git add package.json package-lock.json index.html vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts src/main.tsx src/App.tsx src/styles.css
git commit -m "chore: scaffold trainer app"
```

---

### Task 2: Add Constants, Types, And Rotation Presets

**Files:**
- Create: `src/data/constants.ts`
- Create: `src/data/rotations.ts`
- Create: `src/sim/types.ts`
- Create: `src/tests/rotations.test.ts`

- [ ] **Step 1: Write failing rotation data tests**

Create `src/tests/rotations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDS, TIMING } from "../data/constants";
import { ROTATION_PRESETS, getRotationPreset } from "../data/rotations";

describe("rotation presets", () => {
  it("includes ranged-only and melee-weaving rotations from the design", () => {
    expect(ROTATION_PRESETS.some((preset) => preset.category === "ranged")).toBe(true);
    expect(ROTATION_PRESETS.some((preset) => preset.category === "weaving")).toBe(true);
    expect(getRotationPreset("french-weaving-5511-3w").pattern).toBe("asmawsaswasAaws");
    expect(getRotationPreset("one-one").pattern).toBe("as");
  });

  it("uses approved default keybindings and timing constants", () => {
    expect(TIMING.gcdMs).toBe(1500);
    expect(TIMING.spellQueueWindowMs).toBe(100);
    expect(TIMING.noMoveNoCastLeadMs).toBe(500);
    expect(DEFAULT_KEYBINDS.arcaneShot).toEqual({ kind: "keyboard", code: "Digit1" });
    expect(DEFAULT_KEYBINDS.killCommand).toEqual({ kind: "keyboard", code: "Digit2" });
    expect(DEFAULT_KEYBINDS.raptorStrike).toEqual({ kind: "mouse", button: 3 });
  });

  it("derives haste factor from ranged weapon speed and target effective speed", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    expect(preset.rangedWeaponSpeedMs).toBe(3000);
    expect(preset.targetRangedSwingMs).toBeCloseTo(2173.913, 3);
    expect(preset.hasteFactor).toBeCloseTo(1.38, 3);
    expect(preset.derivedMeleeSwingMs).toBeCloseTo(2536.232, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/rotations.test.ts
```

Expected: FAIL because `src/data/constants.ts` and `src/data/rotations.ts` do not exist.

- [ ] **Step 3: Add shared types**

Create `src/sim/types.ts`:

```ts
export type AbilityId =
  | "autoShot"
  | "steadyShot"
  | "multiShot"
  | "arcaneShot"
  | "killCommand"
  | "raptorStrike"
  | "meleeSwing";

export type RotationCategory = "ranged" | "weaving";

export type RotationToken = "a" | "s" | "m" | "A" | "w";

export interface RotationPreset {
  id: string;
  name: string;
  category: RotationCategory;
  pattern: string;
  sourceUrl: string;
  usage: string;
  rangedWeaponSpeedMs: number;
  targetRangedSwingMs: number;
  hasteFactor: number;
  meleeBaseSwingMs: number;
  derivedMeleeSwingMs: number;
}

export interface KeyBinding {
  kind: "keyboard" | "mouse";
  code?: string;
  button?: number;
}

export type ActionId =
  | "moveForward"
  | "moveBackward"
  | "strafeLeft"
  | "strafeRight"
  | "arcaneShot"
  | "killCommand"
  | "multiShot"
  | "steadyShot"
  | "raptorStrike"
  | "autoShot";

export type AbilityActionId = Exclude<ActionId, "moveForward" | "moveBackward" | "strafeLeft" | "strafeRight">;
```

- [ ] **Step 4: Add constants and presets**

Create `src/data/constants.ts`:

```ts
import type { ActionId, KeyBinding } from "../sim/types";

export const TIMING = {
  gcdMs: 1500,
  spellQueueWindowMs: 100,
  noMoveNoCastLeadMs: 500,
  autoWindupMs: 500,
  steadyBaseCastMs: 1500,
  multiBaseCastMs: 500,
  arcaneCooldownMs: 6000,
  multiCooldownMs: 10000,
  raptorCooldownMs: 6000,
  killCommandCooldownMs: 5000,
} as const;

export const MOVEMENT = {
  yardsPerSecond: 7,
  strafeYardsPerSecond: 7,
  meleeRangeYards: 5,
  minimumRangedRangeYards: 5,
  maximumRangedRangeYards: 35,
  startingDistanceYards: 7.8,
} as const;

export const DEFAULT_KEYBINDS: Record<ActionId, KeyBinding> = {
  moveForward: { kind: "keyboard", code: "KeyW" },
  moveBackward: { kind: "keyboard", code: "KeyS" },
  strafeLeft: { kind: "keyboard", code: "KeyA" },
  strafeRight: { kind: "keyboard", code: "KeyD" },
  arcaneShot: { kind: "keyboard", code: "Digit1" },
  killCommand: { kind: "keyboard", code: "Digit2" },
  multiShot: { kind: "keyboard", code: "Digit3" },
  steadyShot: { kind: "keyboard", code: "Digit4" },
  raptorStrike: { kind: "mouse", button: 3 },
  autoShot: { kind: "keyboard", code: "KeyV" },
};
```

Create `src/data/rotations.ts`:

```ts
import type { RotationPreset } from "../sim/types";

const SOURCE_URL = "https://diziet559.github.io/rotationtools/#melee-weaving";
const MELEE_BASE_SWING_MS = 3500;

function preset(input: Omit<RotationPreset, "hasteFactor" | "derivedMeleeSwingMs" | "sourceUrl" | "meleeBaseSwingMs">): RotationPreset {
  const hasteFactor = input.rangedWeaponSpeedMs / input.targetRangedSwingMs;
  return {
    ...input,
    sourceUrl: SOURCE_URL,
    meleeBaseSwingMs: MELEE_BASE_SWING_MS,
    hasteFactor,
    derivedMeleeSwingMs: MELEE_BASE_SWING_MS / hasteFactor,
  };
}

export const ROTATION_PRESETS: RotationPreset[] = [
  preset({
    id: "one-one",
    name: "1:1",
    category: "ranged",
    pattern: "as",
    usage: "Simple Auto Shot then Steady Shot rhythm.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 1.38,
  }),
  preset({
    id: "one-two",
    name: "1:2",
    category: "ranged",
    pattern: "asa",
    usage: "One Steady Shot across two Auto Shots.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 1450,
  }),
  preset({
    id: "one-three",
    name: "1:3",
    category: "ranged",
    pattern: "asaa",
    usage: "One Steady Shot across three Auto Shots.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 950,
  }),
  preset({
    id: "short-french-5411",
    name: "5:4:1:1",
    category: "ranged",
    pattern: "asmasasAass",
    usage: "Short French rotation for survival haste ranges.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 1.15,
  }),
  preset({
    id: "french-5511",
    name: "5:5:1:1",
    category: "ranged",
    pattern: "asmasasAasas",
    usage: "Standard French rotation.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 1.38,
  }),
  preset({
    id: "long-french-5611",
    name: "5:6:1:1",
    category: "ranged",
    pattern: "asAamasasasas",
    usage: "Long French rotation for Aspect of the Hawk haste ranges.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.15),
  }),
  preset({
    id: "skipping-5911",
    name: "5:9:1:1",
    category: "ranged",
    pattern: "asasasamaasasaAa",
    usage: "Skipping rotation for high ranged haste.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.5 * 1.15),
  }),
  preset({
    id: "two-three",
    name: "2:3",
    category: "ranged",
    pattern: "saasa",
    usage: "Combined 1:1 and 1:2 rhythm.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 1200,
  }),
  preset({
    id: "two-five",
    name: "2:5",
    category: "ranged",
    pattern: "saaasaa",
    usage: "High haste combined rhythm.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 780,
  }),
  preset({
    id: "french-weaving-5511-3w",
    name: "5:5:1:1 3w - French weaving",
    category: "weaving",
    pattern: "asmawsaswasAaws",
    usage: "Use with no haste effect other than Drums of Battle. Weaves alternate Raptor Strike and melee white hits.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / 1.38,
  }),
  preset({
    id: "half-weave-22-1w",
    name: "2:2 1w - 1:1 half-weave",
    category: "weaving",
    pattern: "asasw",
    usage: "Use with improved Aspect, DST, or Bloodlust haste ranges.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.3 * 1.2 * 1.15 * 1.15),
  }),
  preset({
    id: "weaving-6911-3w",
    name: "6:9:1:1 3w",
    category: "weaving",
    pattern: "asamwasasawsasasawAa",
    usage: "Use with Rapid Fire or similar high ranged haste.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.5),
  }),
  preset({
    id: "weaving-61111-3w",
    name: "6:11:1:1 3w",
    category: "weaving",
    pattern: "asawsasamawasasaAawasa",
    usage: "Use with Rapid Fire plus improved Aspect or Bloodlust haste ranges.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 3000 / (1.05 * 1.2 * 1.15 * 1.15 * 1.5),
  }),
  preset({
    id: "weaving-37-2w",
    name: "3:7 2w",
    category: "weaving",
    pattern: "awasaawasaas",
    usage: "Maximum haste weaving rotation; example drawn for very low effective weapon speed.",
    rangedWeaponSpeedMs: 3000,
    targetRangedSwingMs: 700,
  }),
];

export function getRotationPreset(id: string): RotationPreset {
  const preset = ROTATION_PRESETS.find((rotation) => rotation.id === id);
  if (!preset) {
    throw new Error(`Unknown rotation preset: ${id}`);
  }
  return preset;
}
```

- [ ] **Step 5: Verify tests pass**

Run:

```bash
npm test -- src/tests/rotations.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit constants and presets**

```bash
git add src/data/constants.ts src/data/rotations.ts src/sim/types.ts src/tests/rotations.test.ts
git commit -m "feat: add rotation presets and constants"
```

---

### Task 3: Implement Movement And Range Model

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/sim/movement.ts`
- Create: `src/tests/movement.test.ts`

- [ ] **Step 1: Write failing movement tests**

Create `src/tests/movement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MOVEMENT } from "../data/constants";
import { createInitialPosition, getRangeState, updateMovement } from "../sim/movement";

describe("movement", () => {
  it("moves forward, backward, and strafe with fixed facing", () => {
    const start = createInitialPosition(MOVEMENT.startingDistanceYards);
    const forward = updateMovement(start, { forward: true, backward: false, left: false, right: false }, 1000);
    expect(forward.player.y).toBeCloseTo(start.player.y - MOVEMENT.yardsPerSecond);

    const back = updateMovement(start, { forward: false, backward: true, left: false, right: false }, 1000);
    expect(back.player.y).toBeCloseTo(start.player.y + MOVEMENT.yardsPerSecond);

    const left = updateMovement(start, { forward: false, backward: false, left: true, right: false }, 1000);
    expect(left.player.x).toBeCloseTo(start.player.x - MOVEMENT.strafeYardsPerSecond);
  });

  it("computes melee and ranged legality from distance", () => {
    const start = createInitialPosition(7.8);
    expect(getRangeState(start).canMelee).toBe(false);
    expect(getRangeState(start).canUseRanged).toBe(true);

    const inMelee = createInitialPosition(4.8);
    expect(getRangeState(inMelee).canMelee).toBe(true);
    expect(getRangeState(inMelee).canUseRanged).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/movement.test.ts
```

Expected: FAIL because `src/sim/movement.ts` does not exist.

- [ ] **Step 3: Add movement types**

Append to `src/sim/types.ts`:

```ts
export interface Vector2 {
  x: number;
  y: number;
}

export interface PracticePosition {
  player: Vector2;
  target: Vector2;
}

export interface MovementKeys {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export interface RangeState {
  distanceYards: number;
  canMelee: boolean;
  canUseRanged: boolean;
}
```

- [ ] **Step 4: Implement movement**

Create `src/sim/movement.ts`:

```ts
import { MOVEMENT } from "../data/constants";
import type { MovementKeys, PracticePosition, RangeState } from "./types";

export function createInitialPosition(distanceYards = MOVEMENT.startingDistanceYards): PracticePosition {
  return {
    player: { x: 0, y: 0 },
    target: { x: 0, y: -distanceYards },
  };
}

export function distanceBetween(position: PracticePosition): number {
  const dx = position.player.x - position.target.x;
  const dy = position.player.y - position.target.y;
  return Math.hypot(dx, dy);
}

export function getRangeState(position: PracticePosition): RangeState {
  const distanceYards = distanceBetween(position);
  return {
    distanceYards,
    canMelee: distanceYards <= MOVEMENT.meleeRangeYards,
    canUseRanged:
      distanceYards > MOVEMENT.minimumRangedRangeYards &&
      distanceYards <= MOVEMENT.maximumRangedRangeYards,
  };
}

export function updateMovement(position: PracticePosition, keys: MovementKeys, deltaMs: number): PracticePosition {
  const seconds = deltaMs / 1000;
  const forwardAxis = Number(keys.backward) - Number(keys.forward);
  const strafeAxis = Number(keys.right) - Number(keys.left);

  return {
    player: {
      x: position.player.x + strafeAxis * MOVEMENT.strafeYardsPerSecond * seconds,
      y: position.player.y + forwardAxis * MOVEMENT.yardsPerSecond * seconds,
    },
    target: position.target,
  };
}
```

- [ ] **Step 5: Verify tests pass**

Run:

```bash
npm test -- src/tests/movement.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit movement model**

```bash
git add src/sim/types.ts src/sim/movement.ts src/tests/movement.test.ts
git commit -m "feat: add movement and range model"
```

---

### Task 4: Implement Ability Metadata And Timeline Expansion

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/sim/abilities.ts`
- Create: `src/sim/timeline.ts`
- Create: `src/tests/abilities-timeline.test.ts`

- [ ] **Step 1: Write failing ability and timeline tests**

Create `src/tests/abilities-timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { getAbilityTiming } from "../sim/abilities";
import { expandRotationPattern } from "../sim/timeline";

describe("abilities and timelines", () => {
  it("applies haste to Steady Shot and Multi-Shot casts", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    expect(getAbilityTiming("steadyShot", preset).castMs).toBeCloseTo(1500 / preset.hasteFactor);
    expect(getAbilityTiming("multiShot", preset).castMs).toBeCloseTo(500 / preset.hasteFactor);
    expect(getAbilityTiming("arcaneShot", preset).castMs).toBe(0);
  });

  it("expands compact Diziet pattern tokens into ability events", () => {
    const preset = getRotationPreset("french-weaving-5511-3w");
    const events = expandRotationPattern(preset);
    expect(events.map((event) => event.ability).slice(0, 5)).toEqual([
      "autoShot",
      "steadyShot",
      "multiShot",
      "autoShot",
      "meleeSwing",
    ]);
    expect(events[0].idealAtMs).toBe(0);
    expect(events[1].idealAtMs).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/abilities-timeline.test.ts
```

Expected: FAIL because `src/sim/abilities.ts` and `src/sim/timeline.ts` do not exist.

- [ ] **Step 3: Add timeline types**

Append to `src/sim/types.ts`:

```ts
export interface AbilityTiming {
  ability: AbilityId;
  castMs: number;
  cooldownMs: number;
  usesGcd: boolean;
  requiresMelee: boolean;
  requiresRanged: boolean;
  offGcd: boolean;
}

export interface IdealEvent {
  index: number;
  token: RotationToken;
  ability: AbilityId;
  idealAtMs: number;
  label: string;
}
```

- [ ] **Step 4: Implement ability metadata**

Create `src/sim/abilities.ts`:

```ts
import { TIMING } from "../data/constants";
import type { AbilityId, AbilityTiming, RotationPreset } from "./types";

export function getAbilityTiming(ability: AbilityId, preset: RotationPreset): AbilityTiming {
  const hastedSteady = TIMING.steadyBaseCastMs / preset.hasteFactor;
  const hastedMulti = TIMING.multiBaseCastMs / preset.hasteFactor;

  const table: Record<AbilityId, AbilityTiming> = {
    autoShot: {
      ability,
      castMs: TIMING.autoWindupMs / preset.hasteFactor,
      cooldownMs: preset.targetRangedSwingMs,
      usesGcd: false,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: true,
    },
    steadyShot: {
      ability,
      castMs: hastedSteady,
      cooldownMs: 0,
      usesGcd: true,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: false,
    },
    multiShot: {
      ability,
      castMs: hastedMulti,
      cooldownMs: TIMING.multiCooldownMs,
      usesGcd: true,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: false,
    },
    arcaneShot: {
      ability,
      castMs: 0,
      cooldownMs: TIMING.arcaneCooldownMs,
      usesGcd: true,
      requiresMelee: false,
      requiresRanged: true,
      offGcd: false,
    },
    killCommand: {
      ability,
      castMs: 0,
      cooldownMs: TIMING.killCommandCooldownMs,
      usesGcd: false,
      requiresMelee: false,
      requiresRanged: false,
      offGcd: true,
    },
    raptorStrike: {
      ability,
      castMs: 0,
      cooldownMs: TIMING.raptorCooldownMs,
      usesGcd: false,
      requiresMelee: true,
      requiresRanged: false,
      offGcd: true,
    },
    meleeSwing: {
      ability,
      castMs: 0,
      cooldownMs: preset.derivedMeleeSwingMs,
      usesGcd: false,
      requiresMelee: true,
      requiresRanged: false,
      offGcd: true,
    },
  };

  return table[ability];
}
```

- [ ] **Step 5: Implement pattern expansion**

Create `src/sim/timeline.ts`:

```ts
import type { AbilityId, IdealEvent, RotationPreset, RotationToken } from "./types";

const TOKEN_TO_ABILITY: Record<RotationToken, AbilityId> = {
  a: "autoShot",
  s: "steadyShot",
  m: "multiShot",
  A: "arcaneShot",
  w: "meleeSwing",
};

const TOKEN_TO_LABEL: Record<RotationToken, string> = {
  a: "Auto",
  s: "Steady",
  m: "Multi",
  A: "Arcane",
  w: "Weave",
};

export function parseRotationTokens(pattern: string): RotationToken[] {
  return pattern.split("").map((token) => {
    if (!["a", "s", "m", "A", "w"].includes(token)) {
      throw new Error(`Unsupported rotation token: ${token}`);
    }
    return token as RotationToken;
  });
}

export function expandRotationPattern(preset: RotationPreset): IdealEvent[] {
  let currentMs = 0;
  return parseRotationTokens(preset.pattern).map((token, index) => {
    const event: IdealEvent = {
      index,
      token,
      ability: TOKEN_TO_ABILITY[token],
      label: TOKEN_TO_LABEL[token],
      idealAtMs: currentMs,
    };
    currentMs += token === "a" ? preset.targetRangedSwingMs : 1500 / preset.hasteFactor;
    return event;
  });
}
```

- [ ] **Step 6: Verify tests pass**

Run:

```bash
npm test -- src/tests/abilities-timeline.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit ability and timeline helpers**

```bash
git add src/sim/types.ts src/sim/abilities.ts src/sim/timeline.ts src/tests/abilities-timeline.test.ts
git commit -m "feat: add ability timing and rotation timelines"
```

---

### Task 5: Implement Simulator Core For Casts, Queue, Swings, And Clipping

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/sim/sessionLog.ts`
- Create: `src/sim/simulator.ts`
- Create: `src/tests/simulator.test.ts`

- [ ] **Step 1: Write failing simulator tests**

Create `src/tests/simulator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { createSimulator } from "../sim/simulator";

describe("simulator", () => {
  it("queues a GCD ability inside the 100ms spell queue window", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("arcaneShot", 1450);
    sim.tick(1500);
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "cast-start",
      atMs: 1500,
      ability: "arcaneShot",
    }));
  });

  it("allows Steady Shot after Auto Shot wind-up begins", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    const autoDue = sim.getState().nextAutoAtMs;
    sim.tick(autoDue - 10);
    sim.pressAbility("steadyShot", autoDue - 10);
    expect(sim.getLog().some((event) => event.type === "cast-start" && event.ability === "steadyShot")).toBe(true);
  });

  it("clips Auto Shot when Multi-Shot is still casting at no-move/no-cast spark", () => {
    const sim = createSimulator(getRotationPreset("french-weaving-5511-3w"));
    const spark = sim.getState().nextAutoAtMs - 500;
    sim.pressAbility("multiShot", spark - 50);
    sim.tick(sim.getState().nextAutoAtMs);
    expect(sim.getLog().some((event) => event.type === "auto-clipped")).toBe(true);
  });

  it("blocks Kill Command during Steady Shot", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    sim.pressAbility("killCommand", 10);
    expect(sim.getLog()).toContainEqual(expect.objectContaining({
      type: "invalid-input",
      ability: "killCommand",
      reason: "kill-command-during-steady",
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/simulator.test.ts
```

Expected: FAIL because `src/sim/simulator.ts` does not exist.

- [ ] **Step 3: Add simulator types**

Append to `src/sim/types.ts`:

```ts
export type SimEventType =
  | "ability-press"
  | "queued"
  | "cast-start"
  | "cast-complete"
  | "auto-windup"
  | "auto-fire"
  | "auto-clipped"
  | "invalid-input"
  | "range-change"
  | "score";

export interface SimEvent {
  type: SimEventType;
  atMs: number;
  ability?: AbilityId;
  reason?: string;
  detail?: string;
}

export interface ActiveCast {
  ability: AbilityId;
  startedAtMs: number;
  completesAtMs: number;
}

export interface SimulatorState {
  nowMs: number;
  gcdReadyAtMs: number;
  nextAutoAtMs: number;
  nextMeleeAtMs: number;
  activeCast: ActiveCast | null;
  queuedAbility: AbilityId | null;
}
```

- [ ] **Step 4: Implement session log helper**

Create `src/sim/sessionLog.ts`:

```ts
import type { SimEvent } from "./types";

export class SessionLog {
  private events: SimEvent[] = [];

  add(event: SimEvent): void {
    this.events.push(event);
  }

  all(): SimEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
  }
}
```

- [ ] **Step 5: Implement simulator**

Create `src/sim/simulator.ts`:

```ts
import { TIMING } from "../data/constants";
import { getAbilityTiming } from "./abilities";
import { SessionLog } from "./sessionLog";
import type { AbilityId, RotationPreset, SimulatorState } from "./types";

const GCD_ABILITIES = new Set<AbilityId>(["steadyShot", "multiShot", "arcaneShot"]);

export function createSimulator(preset: RotationPreset) {
  return new Simulator(preset);
}

export class Simulator {
  private readonly log = new SessionLog();
  private state: SimulatorState;

  constructor(private readonly preset: RotationPreset) {
    this.state = {
      nowMs: 0,
      gcdReadyAtMs: 0,
      nextAutoAtMs: preset.targetRangedSwingMs,
      nextMeleeAtMs: preset.derivedMeleeSwingMs,
      activeCast: null,
      queuedAbility: null,
    };
  }

  getState(): SimulatorState {
    return { ...this.state, activeCast: this.state.activeCast ? { ...this.state.activeCast } : null };
  }

  getLog() {
    return this.log.all();
  }

  pressAbility(ability: AbilityId, atMs: number): void {
    this.tick(atMs);
    this.log.add({ type: "ability-press", atMs, ability });

    if (ability === "killCommand" && this.state.activeCast?.ability === "steadyShot") {
      this.log.add({ type: "invalid-input", atMs, ability, reason: "kill-command-during-steady" });
      return;
    }

    if (GCD_ABILITIES.has(ability) && atMs < this.state.gcdReadyAtMs) {
      if (this.state.gcdReadyAtMs - atMs <= TIMING.spellQueueWindowMs) {
        this.state.queuedAbility = ability;
        this.log.add({ type: "queued", atMs, ability });
      } else {
        this.log.add({ type: "invalid-input", atMs, ability, reason: "gcd-locked" });
      }
      return;
    }

    this.startCast(ability, atMs);
  }

  tick(toMs: number): void {
    if (toMs < this.state.nowMs) {
      return;
    }

    this.processAutoWindow(toMs);
    this.completeActiveCast(toMs);
    this.state.nowMs = toMs;

    if (this.state.queuedAbility && this.state.nowMs >= this.state.gcdReadyAtMs) {
      const queued = this.state.queuedAbility;
      this.state.queuedAbility = null;
      this.startCast(queued, this.state.nowMs);
    }
  }

  private startCast(ability: AbilityId, atMs: number): void {
    const timing = getAbilityTiming(ability, this.preset);
    const completesAtMs = atMs + timing.castMs;
    this.state.activeCast = { ability, startedAtMs: atMs, completesAtMs };
    this.log.add({ type: "cast-start", atMs, ability });

    if (timing.usesGcd) {
      this.state.gcdReadyAtMs = atMs + TIMING.gcdMs;
    }

    if (timing.castMs === 0) {
      this.completeActiveCast(atMs);
    }
  }

  private completeActiveCast(toMs: number): void {
    const active = this.state.activeCast;
    if (!active || active.completesAtMs > toMs) {
      return;
    }
    this.log.add({ type: "cast-complete", atMs: active.completesAtMs, ability: active.ability });
    this.state.activeCast = null;
  }

  private processAutoWindow(toMs: number): void {
    const sparkAt = this.state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs;
    const active = this.state.activeCast;
    if (active && active.ability === "multiShot" && active.completesAtMs > sparkAt && toMs >= this.state.nextAutoAtMs) {
      this.log.add({ type: "auto-clipped", atMs: this.state.nextAutoAtMs, ability: "autoShot", reason: "casting-at-spark" });
      this.state.nextAutoAtMs += active.completesAtMs - sparkAt;
      return;
    }

    if (toMs >= this.state.nextAutoAtMs) {
      this.log.add({ type: "auto-windup", atMs: this.state.nextAutoAtMs - TIMING.autoWindupMs / this.preset.hasteFactor, ability: "autoShot" });
      this.log.add({ type: "auto-fire", atMs: this.state.nextAutoAtMs, ability: "autoShot" });
      this.state.nextAutoAtMs += this.preset.targetRangedSwingMs;
    }
  }
}
```

- [ ] **Step 6: Verify tests pass**

Run:

```bash
npm test -- src/tests/simulator.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit simulator core**

```bash
git add src/sim/types.ts src/sim/sessionLog.ts src/sim/simulator.ts src/tests/simulator.test.ts
git commit -m "feat: add simulator timing core"
```

---

### Task 6: Implement Exact Scoring And Event Log Review Data

**Files:**
- Modify: `src/sim/types.ts`
- Create: `src/sim/scoring.ts`
- Create: `src/tests/scoring.test.ts`

- [ ] **Step 1: Write failing scoring tests**

Create `src/tests/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { scoreEvents } from "../sim/scoring";
import { expandRotationPattern } from "../sim/timeline";
import type { SimEvent } from "../sim/types";

describe("scoring", () => {
  it("scores perfect exact timeline inputs at 100", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = ideal.map((event) => ({
      type: "cast-start",
      atMs: event.idealAtMs,
      ability: event.ability,
    }));
    expect(scoreEvents(ideal, events).efficiency).toBe(100);
  });

  it("penalizes late, wrong, clipped, and invalid actions", () => {
    const ideal = expandRotationPattern(getRotationPreset("one-one"));
    const events: SimEvent[] = [
      { type: "cast-start", atMs: ideal[0].idealAtMs + 250, ability: ideal[0].ability },
      { type: "cast-start", atMs: ideal[1].idealAtMs, ability: "arcaneShot" },
      { type: "auto-clipped", atMs: 2000, ability: "autoShot" },
      { type: "invalid-input", atMs: 2100, ability: "killCommand", reason: "kill-command-during-steady" },
    ];
    const result = scoreEvents(ideal, events);
    expect(result.efficiency).toBeLessThan(100);
    expect(result.mistakes.map((mistake) => mistake.label)).toContain("Auto clipped");
    expect(result.mistakes.map((mistake) => mistake.label)).toContain("Invalid Kill Command");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/scoring.test.ts
```

Expected: FAIL because `src/sim/scoring.ts` does not exist.

- [ ] **Step 3: Add scoring types**

Append to `src/sim/types.ts`:

```ts
export interface ScoreMistake {
  atMs: number;
  label: string;
  penalty: number;
}

export interface ScoreResult {
  efficiency: number;
  mistakes: ScoreMistake[];
  nextExpected: IdealEvent | null;
}
```

- [ ] **Step 4: Implement scoring**

Create `src/sim/scoring.ts`:

```ts
import type { IdealEvent, ScoreMistake, ScoreResult, SimEvent } from "./types";

const TIMING_TOLERANCE_MS = 100;

export function scoreEvents(ideal: IdealEvent[], events: SimEvent[]): ScoreResult {
  const mistakes: ScoreMistake[] = [];
  const castEvents = events.filter((event) => event.type === "cast-start" || event.type === "auto-fire");

  ideal.forEach((expected, index) => {
    const actual = castEvents[index];
    if (!actual) {
      mistakes.push({ atMs: expected.idealAtMs, label: `${expected.label} missed`, penalty: 8 });
      return;
    }
    if (actual.ability !== expected.ability) {
      mistakes.push({ atMs: actual.atMs, label: `Expected ${expected.label}`, penalty: 10 });
      return;
    }
    const offset = actual.atMs - expected.idealAtMs;
    if (Math.abs(offset) > TIMING_TOLERANCE_MS) {
      mistakes.push({
        atMs: actual.atMs,
        label: `${expected.label} ${Math.abs(Math.round(offset))}ms ${offset > 0 ? "late" : "early"}`,
        penalty: Math.min(12, Math.abs(offset) / 50),
      });
    }
  });

  for (const event of events) {
    if (event.type === "auto-clipped") {
      mistakes.push({ atMs: event.atMs, label: "Auto clipped", penalty: 15 });
    }
    if (event.type === "invalid-input" && event.ability === "killCommand") {
      mistakes.push({ atMs: event.atMs, label: "Invalid Kill Command", penalty: 6 });
    }
    if (event.type === "invalid-input" && event.reason === "out-of-range") {
      mistakes.push({ atMs: event.atMs, label: `${event.ability ?? "Ability"} out of range`, penalty: 8 });
    }
  }

  const penalty = mistakes.reduce((sum, mistake) => sum + mistake.penalty, 0);
  const matchedCount = Math.min(castEvents.length, ideal.length);
  return {
    efficiency: Math.max(0, Math.round(100 - penalty)),
    mistakes,
    nextExpected: ideal[matchedCount] ?? null,
  };
}
```

- [ ] **Step 5: Verify tests pass**

Run:

```bash
npm test -- src/tests/scoring.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit scoring**

```bash
git add src/sim/types.ts src/sim/scoring.ts src/tests/scoring.test.ts
git commit -m "feat: add exact timeline scoring"
```

---

### Task 7: Implement Keybinding Model And Browser Input Adapter

**Files:**
- Create: `src/input/keybindings.ts`
- Create: `src/input/browserInput.ts`
- Create: `src/tests/keybindings.test.ts`

- [ ] **Step 1: Write failing keybinding tests**

Create `src/tests/keybindings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { findActionForBinding, rebindAction } from "../input/keybindings";

describe("keybindings", () => {
  it("finds keyboard and mouse actions", () => {
    expect(findActionForBinding(DEFAULT_KEYBINDS, { kind: "keyboard", code: "Digit1" })).toBe("arcaneShot");
    expect(findActionForBinding(DEFAULT_KEYBINDS, { kind: "mouse", button: 3 })).toBe("raptorStrike");
  });

  it("prevents duplicate bindings unless replace is true", () => {
    expect(() => rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "Digit3" })).toThrow("already bound");
    const rebound = rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "Digit3" }, true);
    expect(rebound.arcaneShot).toEqual({ kind: "keyboard", code: "Digit3" });
    expect(rebound.multiShot).toEqual({ kind: "keyboard", code: "" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: FAIL because `src/input/keybindings.ts` does not exist.

- [ ] **Step 3: Implement keybinding helpers**

Create `src/input/keybindings.ts`:

```ts
import type { ActionId, KeyBinding } from "../sim/types";

export type KeybindingMap = Record<ActionId, KeyBinding>;

function sameBinding(a: KeyBinding, b: KeyBinding): boolean {
  return a.kind === b.kind && a.code === b.code && a.button === b.button;
}

export function findActionForBinding(bindings: KeybindingMap, binding: KeyBinding): ActionId | null {
  const entry = Object.entries(bindings).find(([, existing]) => sameBinding(existing, binding));
  return entry ? (entry[0] as ActionId) : null;
}

export function rebindAction(bindings: KeybindingMap, action: ActionId, binding: KeyBinding, replace = false): KeybindingMap {
  const existingAction = findActionForBinding(bindings, binding);
  if (existingAction && existingAction !== action && !replace) {
    throw new Error(`${binding.kind} binding is already bound to ${existingAction}`);
  }

  const next: KeybindingMap = { ...bindings, [action]: binding };
  if (existingAction && existingAction !== action) {
    next[existingAction] = { ...next[existingAction], code: "", button: undefined };
  }
  return next;
}
```

- [ ] **Step 4: Implement browser input adapter**

Create `src/input/browserInput.ts`:

```ts
import type { AbilityActionId, ActionId, MovementKeys } from "../sim/types";
import { findActionForBinding, type KeybindingMap } from "./keybindings";

export interface BrowserInputHandlers {
  onMovementChange(keys: MovementKeys): void;
  onAbilityPress(action: AbilityActionId): void;
}

export function attachBrowserInput(target: HTMLElement, bindings: KeybindingMap, handlers: BrowserInputHandlers): () => void {
  const movement: MovementKeys = { forward: false, backward: false, left: false, right: false };

  function updateMovement(action: ActionId, pressed: boolean): void {
    if (action === "moveForward") movement.forward = pressed;
    if (action === "moveBackward") movement.backward = pressed;
    if (action === "strafeLeft") movement.left = pressed;
    if (action === "strafeRight") movement.right = pressed;
    handlers.onMovementChange({ ...movement });
  }

  function onKeyDown(event: KeyboardEvent): void {
    const action = findActionForBinding(bindings, { kind: "keyboard", code: event.code });
    if (!action) return;
    event.preventDefault();
    if (action.startsWith("move") || action.startsWith("strafe")) {
      updateMovement(action, true);
    } else if (!event.repeat) {
      handlers.onAbilityPress(action as AbilityActionId);
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    const action = findActionForBinding(bindings, { kind: "keyboard", code: event.code });
    if (!action) return;
    event.preventDefault();
    if (action.startsWith("move") || action.startsWith("strafe")) {
      updateMovement(action, false);
    }
  }

  function onMouseDown(event: MouseEvent): void {
    const action = findActionForBinding(bindings, { kind: "mouse", button: event.button });
    if (!action) return;
    event.preventDefault();
    handlers.onAbilityPress(action);
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("mousedown", onMouseDown);

  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("mousedown", onMouseDown);
  };
}
```

- [ ] **Step 5: Verify tests pass**

Run:

```bash
npm test -- src/tests/keybindings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit input model**

```bash
git add src/input/keybindings.ts src/input/browserInput.ts src/tests/keybindings.test.ts
git commit -m "feat: add editable keybinding model"
```

---

### Task 8: Build React Panels And Session State

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/ui/ControlPanel.tsx`
- Create: `src/ui/ReferencePanel.tsx`
- Create: `src/ui/EventLogPanel.tsx`
- Create: `src/tests/app-ui.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `src/tests/app-ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App";

describe("App UI", () => {
  it("shows rotation reference, score, settings, and event log controls", () => {
    render(<App />);
    expect(screen.getByLabelText("Rotation")).toBeInTheDocument();
    expect(screen.getByText("Reference Rotation")).toBeInTheDocument();
    expect(screen.getByText("Diziet rotationtools")).toBeInTheDocument();
    expect(screen.getByText("Efficiency")).toBeInTheDocument();
    expect(screen.getByText("Queue window")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Log" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: FAIL because the shell does not render panels.

- [ ] **Step 3: Add jest-dom setup**

Create `src/tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Modify `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/tests/setup.ts"],
  },
});
```

- [ ] **Step 4: Create UI panels**

Create `src/ui/ReferencePanel.tsx`:

```tsx
import { expandRotationPattern } from "../sim/timeline";
import type { RotationPreset } from "../sim/types";

export function ReferencePanel({ preset }: { preset: RotationPreset }) {
  return (
    <section className="panel reference-panel">
      <h2>Reference Rotation</h2>
      <div className="chips">
        {expandRotationPattern(preset).map((event) => (
          <span className="chip" key={`${event.index}-${event.token}`}>{event.label}</span>
        ))}
      </div>
      <p>Ideal pattern: <strong>{preset.pattern}</strong></p>
      <p>{preset.usage}</p>
      <a href={preset.sourceUrl} target="_blank" rel="noreferrer">Diziet rotationtools</a>
    </section>
  );
}
```

Create `src/ui/ControlPanel.tsx`:

```tsx
import { ROTATION_PRESETS } from "../data/rotations";
import type { RotationPreset, ScoreResult } from "../sim/types";

interface ControlPanelProps {
  preset: RotationPreset;
  score: ScoreResult;
  queueWindowMs: number;
  onPresetChange(id: string): void;
  onStart(): void;
  onStop(): void;
}

export function ControlPanel({ preset, score, queueWindowMs, onPresetChange, onStart, onStop }: ControlPanelProps) {
  return (
    <section className="panel control-panel">
      <label>
        <span>Rotation</span>
        <select aria-label="Rotation" value={preset.id} onChange={(event) => onPresetChange(event.target.value)}>
          {ROTATION_PRESETS.map((rotation) => (
            <option key={rotation.id} value={rotation.id}>{rotation.name}</option>
          ))}
        </select>
      </label>
      <div>
        <h2>Efficiency</h2>
        <strong className="score">{score.efficiency}%</strong>
        <p>{score.mistakes[0]?.label ?? "No mistakes recorded"}</p>
      </div>
      <div>
        <h2>Queue window</h2>
        <p>{queueWindowMs}ms</p>
      </div>
      <div className="panel-actions">
        <button type="button" onClick={onStart}>Start</button>
        <button type="button" onClick={onStop}>Stop</button>
      </div>
    </section>
  );
}
```

Create `src/ui/EventLogPanel.tsx`:

```tsx
import type { SimEvent } from "../sim/types";

export function EventLogPanel({ events, onReset }: { events: SimEvent[]; onReset(): void }) {
  return (
    <section className="panel event-log-panel">
      <h2>Event Log</h2>
      <button type="button" onClick={onReset}>Reset Log</button>
      <ol>
        {events.slice(-8).map((event, index) => (
          <li key={`${event.atMs}-${event.type}-${index}`}>
            {Math.round(event.atMs)}ms - {event.type}{event.ability ? ` - ${event.ability}` : ""}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Wire App state**

Replace `src/App.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { TIMING } from "./data/constants";
import { getRotationPreset } from "./data/rotations";
import { scoreEvents } from "./sim/scoring";
import { expandRotationPattern } from "./sim/timeline";
import type { SimEvent } from "./sim/types";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";

export function App() {
  const [presetId, setPresetId] = useState("french-weaving-5511-3w");
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);
  const preset = getRotationPreset(presetId);
  const ideal = useMemo(() => expandRotationPattern(preset), [preset]);
  const score = useMemo(() => scoreEvents(ideal, events), [ideal, events]);

  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <div className="stage-title">Practice field loads in Task 9</div>
      </section>
      <aside className="side-panels">
        <ControlPanel
          preset={preset}
          score={score}
          queueWindowMs={TIMING.spellQueueWindowMs}
          onPresetChange={(id) => {
            if (running) setRunning(false);
            setPresetId(id);
            setEvents([]);
          }}
          onStart={() => setRunning(true)}
          onStop={() => setRunning(false)}
        />
        <ReferencePanel preset={preset} />
        <EventLogPanel events={events} onReset={() => setEvents([])} />
      </aside>
    </main>
  );
}
```

- [ ] **Step 6: Add layout CSS**

Append to `src/styles.css`:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
}

.practice-stage {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

.side-panels {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: #17212c;
  overflow-y: auto;
}

.panel {
  background: #f7fafc;
  border: 1px solid #d6e0ea;
  border-radius: 8px;
  padding: 12px;
}

.panel h2 {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: #536579;
}

.panel label {
  display: grid;
  gap: 6px;
}

.panel select,
.panel button {
  border: 1px solid #c5d1de;
  border-radius: 6px;
  background: #fff;
  padding: 8px;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.score {
  display: block;
  font-size: 2.25rem;
  line-height: 1;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  border-radius: 5px;
  background: #e8f0f7;
  padding: 4px 7px;
  font-size: 0.75rem;
}

@media (max-width: 860px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .side-panels {
    max-height: none;
  }
}
```

- [ ] **Step 7: Verify UI tests pass**

Run:

```bash
npm test -- src/tests/app-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit React panels**

```bash
git add vitest.config.ts src/App.tsx src/styles.css src/ui/ControlPanel.tsx src/ui/ReferencePanel.tsx src/ui/EventLogPanel.tsx src/tests/setup.ts src/tests/app-ui.test.tsx
git commit -m "feat: add trainer control panels"
```

---

### Task 9: Build Phaser Practice Field And HUD Bars

**Files:**
- Create: `src/game/PracticeScene.ts`
- Create: `src/game/PhaserHost.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create Phaser scene**

Create `src/game/PracticeScene.ts`:

```ts
import Phaser from "phaser";
import { MOVEMENT, TIMING } from "../data/constants";
import type { RotationPreset, SimulatorState } from "../sim/types";

export interface PracticeSceneData {
  preset: RotationPreset;
  getSimulatorState(): SimulatorState;
}

export class PracticeScene extends Phaser.Scene {
  private preset!: RotationPreset;
  private getSimulatorState!: () => SimulatorState;
  private player!: Phaser.GameObjects.Arc;
  private target!: Phaser.GameObjects.Arc;
  private hud!: Phaser.GameObjects.Container;

  constructor() {
    super("PracticeScene");
  }

  init(data: PracticeSceneData): void {
    this.preset = data.preset;
    this.getSimulatorState = data.getSimulatorState;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#e9f0f4");
    this.drawGrid();
    this.target = this.add.circle(0, -MOVEMENT.startingDistanceYards * 40, 18, 0x9a4c4c);
    this.add.circle(0, -MOVEMENT.startingDistanceYards * 40, MOVEMENT.meleeRangeYards * 40, 0x9a4c4c, 0.08).setStrokeStyle(2, 0x9a4c4c, 0.6);
    this.add.circle(0, -MOVEMENT.startingDistanceYards * 40, MOVEMENT.maximumRangedRangeYards * 8, 0x4f6680, 0).setStrokeStyle(1, 0x4f6680, 0.35);
    this.player = this.add.circle(0, 0, 16, 0x5f9f6b);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.hud = this.add.container(0, 0).setScrollFactor(0);
  }

  update(): void {
    this.drawHud();
  }

  private drawGrid(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x9aabba, 0.18);
    for (let i = -1200; i <= 1200; i += 40) {
      graphics.lineBetween(i, -1200, i, 1200);
      graphics.lineBetween(-1200, i, 1200, i);
    }
  }

  private drawHud(): void {
    this.hud.removeAll(true);
    const state = this.getSimulatorState();
    const width = Math.min(this.scale.width * 0.82, 760);
    const x = (this.scale.width - width) / 2;
    const y = this.scale.height - 145;
    this.drawBar(x, y, width, 22, "Cast bar", state.activeCast ? (state.nowMs - state.activeCast.startedAtMs) / (state.activeCast.completesAtMs - state.activeCast.startedAtMs) : 0, 0xb74b4b);
    this.drawBar(x, y + 43, width, 12, "Melee swing", (state.nowMs % this.preset.derivedMeleeSwingMs) / this.preset.derivedMeleeSwingMs, 0xc89550);
    this.drawBar(x, y + 74, width, 22, "Ranged swing timer", 1 - (state.nextAutoAtMs - state.nowMs) / this.preset.targetRangedSwingMs, 0x6f92b8);
    this.drawSpark(x + width * (1 - TIMING.noMoveNoCastLeadMs / this.preset.targetRangedSwingMs), y + 70, 32, 0xb74b4b);
    const rangedCycleStart = state.nextAutoAtMs - this.preset.targetRangedSwingMs;
    const gcdSpark = (state.gcdReadyAtMs - rangedCycleStart) / this.preset.targetRangedSwingMs;
    this.drawSpark(x + width * Math.max(0, Math.min(1, gcdSpark)), y + 70, 32, 0x26313d);
  }

  private drawBar(x: number, y: number, width: number, height: number, label: string, progress: number, color: number): void {
    const bg = this.add.rectangle(x, y, width, height, 0xffffff, 0.92).setOrigin(0, 0);
    const fill = this.add.rectangle(x, y, Math.max(0, Math.min(1, progress)) * width, height, color, 1).setOrigin(0, 0);
    const text = this.add.text(x, y - 16, label, { color: "#26313d", fontSize: "11px" });
    this.hud.add([bg, fill, text]);
  }

  private drawSpark(x: number, y: number, height: number, color: number): void {
    const spark = this.add.rectangle(x, y, 2, height, color, 1).setOrigin(0.5, 0);
    this.hud.add(spark);
  }
}
```

- [ ] **Step 2: Create React Phaser host**

Create `src/game/PhaserHost.tsx`:

```tsx
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { PracticeScene } from "./PracticeScene";
import type { RotationPreset, SimulatorState } from "../sim/types";

interface PhaserHostProps {
  preset: RotationPreset;
  getSimulatorState(): SimulatorState;
}

export function PhaserHost({ preset, getSimulatorState }: PhaserHostProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current,
      width: ref.current.clientWidth,
      height: ref.current.clientHeight,
      backgroundColor: "#e9f0f4",
      scene: PracticeScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: ref.current,
      },
    });

    game.scene.start("PracticeScene", { preset, getSimulatorState });

    return () => {
      game.destroy(true);
    };
  }, [preset, getSimulatorState]);

  return <div className="phaser-host" ref={ref} />;
}
```

- [ ] **Step 3: Wire host into App**

Modify `src/App.tsx` to create a simulator reference and render `PhaserHost`:

```tsx
import { useMemo, useRef, useState } from "react";
import { TIMING } from "./data/constants";
import { getRotationPreset } from "./data/rotations";
import { PhaserHost } from "./game/PhaserHost";
import { scoreEvents } from "./sim/scoring";
import { createSimulator } from "./sim/simulator";
import { expandRotationPattern } from "./sim/timeline";
import type { SimEvent } from "./sim/types";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";

export function App() {
  const [presetId, setPresetId] = useState("french-weaving-5511-3w");
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);
  const preset = getRotationPreset(presetId);
  const simulator = useRef(createSimulator(preset));
  const ideal = useMemo(() => expandRotationPattern(preset), [preset]);
  const score = useMemo(() => scoreEvents(ideal, events), [ideal, events]);

  function resetForPreset(id: string): void {
    const nextPreset = getRotationPreset(id);
    simulator.current = createSimulator(nextPreset);
    setPresetId(id);
    setEvents([]);
    setRunning(false);
  }

  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <PhaserHost preset={preset} getSimulatorState={() => simulator.current.getState()} />
      </section>
      <aside className="side-panels">
        <ControlPanel
          preset={preset}
          score={score}
          queueWindowMs={TIMING.spellQueueWindowMs}
          onPresetChange={resetForPreset}
          onStart={() => setRunning(true)}
          onStop={() => {
            setRunning(false);
            setEvents(simulator.current.getLog());
          }}
        />
        <ReferencePanel preset={preset} />
        <EventLogPanel events={events} onReset={() => setEvents([])} />
      </aside>
    </main>
  );
}
```

- [ ] **Step 4: Add host CSS**

Append to `src/styles.css`:

```css
.phaser-host {
  position: absolute;
  inset: 0;
}

.phaser-host canvas {
  display: block;
}
```

- [ ] **Step 5: Verify build**

Run:

```bash
npm run build
```

Expected: PASS and `dist/` is created.

- [ ] **Step 6: Commit Phaser field**

```bash
git add src/App.tsx src/styles.css src/game/PracticeScene.ts src/game/PhaserHost.tsx
git commit -m "feat: add Phaser practice field"
```

---

### Task 10: Connect Live Input To Simulator And Event Log

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/game/PhaserHost.tsx`
- Modify: `src/sim/simulator.ts`
- Create: `src/tests/session-flow.test.ts`

- [ ] **Step 1: Write failing session flow test**

Create `src/tests/session-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getRotationPreset } from "../data/rotations";
import { createSimulator } from "../sim/simulator";

describe("session flow", () => {
  it("records ability events and can reset log", () => {
    const sim = createSimulator(getRotationPreset("one-one"));
    sim.pressAbility("steadyShot", 0);
    expect(sim.getLog().length).toBeGreaterThan(0);
    sim.resetLog();
    expect(sim.getLog()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/tests/session-flow.test.ts
```

Expected: FAIL because `resetLog` does not exist.

- [ ] **Step 3: Add simulator resetLog**

Add this method to `Simulator` in `src/sim/simulator.ts`:

```ts
  resetLog(): void {
    this.log.reset();
  }
```

- [ ] **Step 4: Extend PhaserHost to attach input**

Replace `src/game/PhaserHost.tsx` with:

```tsx
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { attachBrowserInput } from "../input/browserInput";
import { PracticeScene } from "./PracticeScene";
import type { AbilityActionId, RotationPreset, SimulatorState } from "../sim/types";

interface PhaserHostProps {
  preset: RotationPreset;
  getSimulatorState(): SimulatorState;
  onAbilityPress(action: AbilityActionId): void;
}

export function PhaserHost({ preset, getSimulatorState, onAbilityPress }: PhaserHostProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    ref.current.tabIndex = 0;
    ref.current.focus();

    const detachInput = attachBrowserInput(ref.current, DEFAULT_KEYBINDS, {
      onMovementChange: () => {},
      onAbilityPress,
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current,
      width: ref.current.clientWidth,
      height: ref.current.clientHeight,
      backgroundColor: "#e9f0f4",
      scene: PracticeScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: ref.current,
      },
    });

    game.scene.start("PracticeScene", { preset, getSimulatorState });

    return () => {
      detachInput();
      game.destroy(true);
    };
  }, [preset, getSimulatorState, onAbilityPress]);

  return <div className="phaser-host" ref={ref} />;
}
```

- [ ] **Step 5: Pass ability presses from App**

Update the `PhaserHost` call in `src/App.tsx`:

```tsx
<PhaserHost
  preset={preset}
  getSimulatorState={() => simulator.current.getState()}
  onAbilityPress={(action) => {
    if (!running) return;
    simulator.current.pressAbility(action, performance.now());
    setEvents(simulator.current.getLog());
  }}
/>
```

- [ ] **Step 6: Verify tests and build**

Run:

```bash
npm test -- src/tests/session-flow.test.ts
npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit live input wiring**

```bash
git add src/App.tsx src/game/PhaserHost.tsx src/sim/simulator.ts src/tests/session-flow.test.ts
git commit -m "feat: connect input to simulator"
```

---

### Task 11: Add Playwright Smoke Test And Final Verification

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/app.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev -- --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 2: Add e2e smoke test**

Create `e2e/app.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("loads trainer and changes rotation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Practice field")).toBeVisible();
  await expect(page.getByLabel("Rotation")).toBeVisible();
  await page.getByLabel("Rotation").selectOption("half-weave-22-1w");
  await expect(page.getByText("2:2 1w - 1:1 half-weave")).toBeVisible();
  await expect(page.getByText("Diziet rotationtools")).toBeVisible();
});
```

- [ ] **Step 3: Install Playwright browser**

Run:

```bash
npx playwright install chromium
```

Expected: Chromium browser is installed for Playwright.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npm run build
npm run e2e
```

Expected: all commands PASS.

- [ ] **Step 5: Commit verification**

```bash
git add package.json package-lock.json playwright.config.ts e2e/app.spec.ts
git commit -m "test: add trainer smoke coverage"
```

---

## Final Manual Verification

- [ ] Run `npm run dev`.
- [ ] Open the local URL printed by Vite.
- [ ] Confirm the practice field fills the available screen and the camera centers on the player.
- [ ] Confirm bars are stacked under the player in this order: cast, compact melee, ranged.
- [ ] Confirm the ranged bar has visible sparks for no-move/no-cast and GCD.
- [ ] Press Start, then press `4`, `3`, `1`, `2`, `Mouse 4`, and `V`; confirm event log entries appear.
- [ ] Select a different rotation and confirm reference chips, pattern string, and timers update.
- [ ] Run `npm run build` and confirm static assets in `dist/`.
