import type { ActionId, KeyBinding } from "../sim/types";

export type KeybindingMap = Record<ActionId, KeyBinding>;

const KEYBINDINGS_STORAGE_KEY = "melee-weaving-practice.keybindings.v1";
const MIN_MOUSE_BUTTON = 0;
const MAX_MOUSE_BUTTON = 4;

function cloneKeyBinding(binding: KeyBinding): KeyBinding {
  if (binding.kind === "keyboard") {
    return { kind: "keyboard", code: binding.code };
  }

  return { kind: "mouse", button: binding.button };
}

function cloneKeybindings(bindings: KeybindingMap): KeybindingMap {
  return Object.fromEntries(
    (Object.entries(bindings) as [ActionId, KeyBinding][]).map(([action, binding]) => [action, cloneKeyBinding(binding)]),
  ) as KeybindingMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredKeyBinding(value: unknown): value is KeyBinding {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "keyboard") {
    return typeof value.code === "string";
  }

  if (value.kind === "mouse") {
    return (
      typeof value.button === "number" &&
      Number.isInteger(value.button) &&
      value.button >= MIN_MOUSE_BUTTON &&
      value.button <= MAX_MOUSE_BUTTON
    );
  }

  return false;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function bindingsMatch(left: KeyBinding, right: KeyBinding): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "keyboard") {
    return right.kind === "keyboard" && left.code !== "" && right.code !== "" && left.code === right.code;
  }

  return right.kind === "mouse" && left.button === right.button;
}

export function loadStoredKeybindings(defaultBindings: KeybindingMap): KeybindingMap {
  const fallback = cloneKeybindings(defaultBindings);
  const storage = getBrowserStorage();

  if (storage === null) {
    return fallback;
  }

  try {
    const rawValue = storage.getItem(KEYBINDINGS_STORAGE_KEY);
    if (rawValue === null) {
      return fallback;
    }

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue)) {
      return fallback;
    }

    const entries = Object.entries(defaultBindings) as [ActionId, KeyBinding][];
    const storedBindings: Partial<KeybindingMap> = {};

    for (const [action] of entries) {
      const storedBinding = parsedValue[action];
      if (!isStoredKeyBinding(storedBinding)) {
        return fallback;
      }

      storedBindings[action] = cloneKeyBinding(storedBinding);
    }

    return storedBindings as KeybindingMap;
  } catch {
    return fallback;
  }
}

export function createKeybindingMap(bindings: KeybindingMap): KeybindingMap {
  return cloneKeybindings(bindings);
}

export function saveStoredKeybindings(bindings: KeybindingMap): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    return;
  }
}

export function clearStoredKeybindings(): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(KEYBINDINGS_STORAGE_KEY);
  } catch {
    return;
  }
}

export function findActionForBinding(bindings: KeybindingMap, binding: KeyBinding): ActionId | null {
  for (const [action, actionBinding] of Object.entries(bindings) as [ActionId, KeyBinding][]) {
    if (bindingsMatch(actionBinding, binding)) {
      return action;
    }
  }

  return null;
}

export function formatKeyBinding(binding: KeyBinding, style: "compact" | "long" = "compact"): string {
  if (binding.kind === "mouse") {
    return `${style === "compact" ? "M" : "Mouse"}${binding.button + 1}`;
  }

  if (binding.code === "") {
    return "";
  }

  return binding.code.replace(/^Key/, "").replace(/^Digit/, "");
}

export function rebindAction(
  bindings: KeybindingMap,
  action: ActionId,
  binding: KeyBinding,
  replace = false,
): KeybindingMap {
  const existingAction = findActionForBinding(bindings, binding);

  if (existingAction !== null && existingAction !== action && !replace) {
    throw new Error(`Binding is already bound to ${existingAction}`);
  }

  const nextBindings: KeybindingMap = {
    ...bindings,
    [action]: binding,
  };

  if (existingAction !== null && existingAction !== action) {
    nextBindings[existingAction] = { kind: "keyboard", code: "" };
  }

  return nextBindings;
}
