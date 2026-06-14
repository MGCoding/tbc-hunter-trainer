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
