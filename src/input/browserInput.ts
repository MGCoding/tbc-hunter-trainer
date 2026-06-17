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

function hasModifierChord(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  ) {
    return true;
  }

  const editable = target.closest("[contenteditable]");
  return editable !== null && editable.getAttribute("contenteditable")?.toLowerCase() !== "false";
}

export function attachBrowserInput(
  target: BrowserInputTarget,
  bindingsOrGetBindings: KeybindingSource,
  handlers: BrowserInputHandlers,
): () => void {
  const keyboardMovementKeys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  const movementKeys: MovementKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  const activeMovementByCode = new Map<string, keyof MovementKeys>();
  const pressedMouseButtons = new Set<number>();
  let mouseForward = false;

  const emitMovementIfChanged = (): void => {
    const nextMovementKeys: MovementKeys = {
      ...keyboardMovementKeys,
      forward: keyboardMovementKeys.forward || mouseForward,
    };

    if (
      movementKeys.forward === nextMovementKeys.forward &&
      movementKeys.backward === nextMovementKeys.backward &&
      movementKeys.left === nextMovementKeys.left &&
      movementKeys.right === nextMovementKeys.right
    ) {
      return;
    }

    movementKeys.forward = nextMovementKeys.forward;
    movementKeys.backward = nextMovementKeys.backward;
    movementKeys.left = nextMovementKeys.left;
    movementKeys.right = nextMovementKeys.right;
    handlers.onMovementChange({ ...movementKeys });
  };

  const setKeyboardMovement = (key: keyof MovementKeys, pressed: boolean): void => {
    if (keyboardMovementKeys[key] === pressed) {
      return;
    }

    keyboardMovementKeys[key] = pressed;
    emitMovementIfChanged();
  };

  const syncMouseForward = (): void => {
    const nextMouseForward = pressedMouseButtons.has(0) && pressedMouseButtons.has(2);
    if (mouseForward === nextMouseForward) {
      return;
    }

    mouseForward = nextMouseForward;
    emitMovementIfChanged();
  };

  const handleKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    if (hasModifierChord(event) || isEditableKeyboardTarget(event.target)) {
      return;
    }

    const action = findActionForBinding(getBindings(bindingsOrGetBindings), makeKeyboardBinding(event));
    if (action === null) {
      return;
    }

    event.preventDefault();

    const movementKey = movementKeyForAction(action);
    if (movementKey !== null) {
      if (activeMovementByCode.has(event.code)) {
        return;
      }

      activeMovementByCode.set(event.code, movementKey);
      setKeyboardMovement(movementKey, true);
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
      setKeyboardMovement(activeMovementKey, false);
      return;
    }

    if (hasModifierChord(event) || isEditableKeyboardTarget(event.target)) {
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
      setKeyboardMovement(movementKey, false);
    }
  };

  const handleMouseDown = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    if (event.button === 0 || event.button === 2) {
      pressedMouseButtons.add(event.button);
      syncMouseForward();
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

  const handleMouseUp = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    if (event.button === 0 || event.button === 2) {
      pressedMouseButtons.delete(event.button);
      syncMouseForward();
    }
  };

  const handleContextMenu = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    event.preventDefault();
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("mousedown", handleMouseDown);
  target.addEventListener("mouseup", handleMouseUp);
  target.addEventListener("contextmenu", handleContextMenu);

  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
    target.removeEventListener("mousedown", handleMouseDown);
    target.removeEventListener("mouseup", handleMouseUp);
    target.removeEventListener("contextmenu", handleContextMenu);
  };
}
