import type { ActionId, KeyBinding } from "../sim/types";

export type KeybindingMap = Record<ActionId, KeyBinding>;

function bindingsMatch(left: KeyBinding, right: KeyBinding): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "keyboard") {
    return right.kind === "keyboard" && left.code !== "" && right.code !== "" && left.code === right.code;
  }

  return right.kind === "mouse" && left.button === right.button;
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
