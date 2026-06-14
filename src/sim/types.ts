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
