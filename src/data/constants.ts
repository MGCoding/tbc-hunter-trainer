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
  meleeRangeYards: 2,
  minimumRangedRangeYards: 2,
  maximumRangedRangeYards: 35,
  startingDistanceYards: 2.5,
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
