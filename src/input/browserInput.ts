import type { AbilityActionId, ActionId, KeyBinding, MovementKeys } from "../sim/types";
import { findActionForBinding, type KeybindingMap } from "./keybindings";

export interface BrowserInputHandlers {
  onMovementChange(keys: MovementKeys): void;
  onAbilityPress(action: AbilityActionId): void;
}

export type KeybindingSource = KeybindingMap | (() => KeybindingMap);

type BrowserInputTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

const MOVEMENT_ACTION_KEYS = {
  moveForward: "forward",
  moveBackward: "backward",
  strafeLeft: "left",
  strafeRight: "right",
} as const satisfies Partial<Record<ActionId, keyof MovementKeys>>;

const ABILITY_ACTIONS = {
  arcaneShot: true,
  killCommand: true,
  multiShot: true,
  steadyShot: true,
  raptorStrike: true,
  autoShot: true,
} as const satisfies Record<AbilityActionId, true>;

function getBindings(source: KeybindingSource): KeybindingMap {
  return typeof source === "function" ? source() : source;
}

function isAbilityAction(action: ActionId): action is AbilityActionId {
  return action in ABILITY_ACTIONS;
}

function movementKeyForAction(action: ActionId): keyof MovementKeys | null {
  return MOVEMENT_ACTION_KEYS[action as keyof typeof MOVEMENT_ACTION_KEYS] ?? null;
}

function makeKeyboardBinding(event: KeyboardEvent): KeyBinding {
  return { kind: "keyboard", code: event.code };
}

function makeMouseBinding(event: MouseEvent): KeyBinding {
  return { kind: "mouse", button: event.button };
}

export function attachBrowserInput(
  target: BrowserInputTarget,
  bindingsOrGetBindings: KeybindingSource,
  handlers: BrowserInputHandlers,
): () => void {
  const movementKeys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  const activeMovementByCode = new Map<string, keyof MovementKeys>();

  const setMovement = (key: keyof MovementKeys, pressed: boolean): void => {
    if (movementKeys[key] === pressed) {
      return;
    }

    movementKeys[key] = pressed;
    handlers.onMovementChange({ ...movementKeys });
  };

  const handleKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const action = findActionForBinding(getBindings(bindingsOrGetBindings), makeKeyboardBinding(event));
    if (action === null) {
      return;
    }

    event.preventDefault();

    const movementKey = movementKeyForAction(action);
    if (movementKey !== null) {
      activeMovementByCode.set(event.code, movementKey);
      setMovement(movementKey, true);
      return;
    }

    if (!event.repeat && isAbilityAction(action)) {
      handlers.onAbilityPress(action);
    }
  };

  const handleKeyUp = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    const activeMovementKey = activeMovementByCode.get(event.code);
    if (activeMovementKey !== undefined) {
      event.preventDefault();
      activeMovementByCode.delete(event.code);
      setMovement(activeMovementKey, false);
      return;
    }

    const action = findActionForBinding(getBindings(bindingsOrGetBindings), makeKeyboardBinding(event));
    if (action === null) {
      return;
    }

    event.preventDefault();

    const movementKey = movementKeyForAction(action);
    if (movementKey !== null) {
      activeMovementByCode.delete(event.code);
      setMovement(movementKey, false);
    }
  };

  const handleMouseDown = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    const action = findActionForBinding(getBindings(bindingsOrGetBindings), makeMouseBinding(event));
    if (action === null) {
      return;
    }

    event.preventDefault();

    if (isAbilityAction(action)) {
      handlers.onAbilityPress(action);
    }
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("mousedown", handleMouseDown);

  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
    target.removeEventListener("mousedown", handleMouseDown);
  };
}
