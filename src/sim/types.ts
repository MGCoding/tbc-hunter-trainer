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

export type KeyBinding =
  | {
      kind: "keyboard";
      code: string;
      button?: never;
    }
  | {
      kind: "mouse";
      button: number;
      code?: never;
    };

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
  expectedClipAtMs?: number[];
}

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
  raptorReadyAtMs: number;
  activeCast: ActiveCast | null;
  queuedAbility: AbilityId | null;
}

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
