import { describe, expect, it, vi } from "vitest";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { attachBrowserInput } from "../input/browserInput";
import { findActionForBinding, rebindAction } from "../input/keybindings";
import type { KeyBinding } from "../sim/types";

describe("keybindings", () => {
  it("finds keyboard and mouse actions", () => {
    expect(findActionForBinding(DEFAULT_KEYBINDS, { kind: "keyboard", code: "Digit1" })).toBe("arcaneShot");
    expect(findActionForBinding(DEFAULT_KEYBINDS, { kind: "mouse", button: 3 })).toBe("raptorStrike");
  });

  it("prevents duplicate bindings unless replace is true", () => {
    expect(() => rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "Digit3" })).toThrow(
      "already bound",
    );

    const rebound = rebindAction(DEFAULT_KEYBINDS, "arcaneShot", { kind: "keyboard", code: "Digit3" }, true);

    expect(rebound.arcaneShot).toEqual({ kind: "keyboard", code: "Digit3" });
    expect(rebound.multiShot).toEqual({ kind: "keyboard", code: "" });
  });
});

describe("browser input adapter", () => {
  it("tracks simultaneous movement key state", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange,
      onAbilityPress: vi.fn(),
    });

    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", cancelable: true }));

    expect(onMovementChange).toHaveBeenNthCalledWith(1, {
      forward: true,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(2, {
      forward: true,
      backward: false,
      left: true,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(3, {
      forward: false,
      backward: false,
      left: true,
      right: false,
    });

    cleanup();
  });

  it("suppresses repeated keyboard ability presses", () => {
    const target = new EventTarget();
    const onAbilityPress = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });

    target.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, repeat: false }));
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, repeat: true }));

    expect(onAbilityPress).toHaveBeenCalledOnce();
    expect(onAbilityPress).toHaveBeenCalledWith("arcaneShot");

    cleanup();
  });

  it("dispatches mouse button ability presses", () => {
    const target = new EventTarget();
    const onAbilityPress = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });

    target.dispatchEvent(new MouseEvent("mousedown", { button: 3, cancelable: true }));

    expect(onAbilityPress).toHaveBeenCalledOnce();
    expect(onAbilityPress).toHaveBeenCalledWith("raptorStrike");

    cleanup();
  });

  it("prevents default for mapped inputs", () => {
    const target = new EventTarget();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress: vi.fn(),
    });
    const movementEvent = new KeyboardEvent("keydown", { code: "KeyW", cancelable: true });
    const abilityEvent = new KeyboardEvent("keydown", { code: "Digit1", cancelable: true });
    const mouseEvent = new MouseEvent("mousedown", { button: 3, cancelable: true });

    target.dispatchEvent(movementEvent);
    target.dispatchEvent(abilityEvent);
    target.dispatchEvent(mouseEvent);

    expect(movementEvent.defaultPrevented).toBe(true);
    expect(abilityEvent.defaultPrevented).toBe(true);
    expect(mouseEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("ignores mapped keyboard inputs with meta shortcuts without preventing default", () => {
    const target = new EventTarget();
    const onAbilityPress = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });
    const shortcutEvent = new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, metaKey: true });

    target.dispatchEvent(shortcutEvent);

    expect(onAbilityPress).not.toHaveBeenCalled();
    expect(shortcutEvent.defaultPrevented).toBe(false);

    cleanup();
  });

  it("ignores mapped keyboard inputs with control shortcuts without preventing default", () => {
    const target = new EventTarget();
    const onAbilityPress = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });
    const shortcutEvent = new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, ctrlKey: true });

    target.dispatchEvent(shortcutEvent);

    expect(onAbilityPress).not.toHaveBeenCalled();
    expect(shortcutEvent.defaultPrevented).toBe(false);

    cleanup();
  });

  it("ignores mapped keyboard inputs from descendants inside contenteditable containers", () => {
    const target = document.createElement("div");
    const editor = document.createElement("div");
    const child = document.createElement("span");
    const onAbilityPress = vi.fn();

    editor.setAttribute("contenteditable", "");
    editor.appendChild(child);
    target.appendChild(editor);
    document.body.appendChild(target);

    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });
    const typingEvent = new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, bubbles: true });

    child.dispatchEvent(typingEvent);

    expect(onAbilityPress).not.toHaveBeenCalled();
    expect(typingEvent.defaultPrevented).toBe(false);

    cleanup();
    target.remove();
  });

  it("ignores mapped keyboard inputs from plaintext-only contenteditable targets", () => {
    const target = document.createElement("div");
    const editor = document.createElement("div");
    const onAbilityPress = vi.fn();

    editor.setAttribute("contenteditable", "plaintext-only");
    target.appendChild(editor);
    document.body.appendChild(target);

    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });
    const typingEvent = new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, bubbles: true });

    editor.dispatchEvent(typingEvent);

    expect(onAbilityPress).not.toHaveBeenCalled();
    expect(typingEvent.defaultPrevented).toBe(false);

    cleanup();
    target.remove();
  });

  it("handles mapped keyboard inputs from contenteditable false targets", () => {
    const target = document.createElement("div");
    const editor = document.createElement("div");
    const onAbilityPress = vi.fn();

    editor.setAttribute("contenteditable", "false");
    target.appendChild(editor);
    document.body.appendChild(target);

    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });
    const typingEvent = new KeyboardEvent("keydown", { code: "Digit1", cancelable: true, bubbles: true });

    editor.dispatchEvent(typingEvent);

    expect(onAbilityPress).toHaveBeenCalledWith("arcaneShot");
    expect(typingEvent.defaultPrevented).toBe(true);

    cleanup();
    target.remove();
  });

  it("removes listeners during cleanup", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    const onAbilityPress = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange,
      onAbilityPress,
    });

    cleanup();
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", cancelable: true }));
    target.dispatchEvent(new MouseEvent("mousedown", { button: 3, cancelable: true }));

    expect(onMovementChange).not.toHaveBeenCalled();
    expect(onAbilityPress).not.toHaveBeenCalled();
  });

  it("uses current bindings from a getter after rebinding", () => {
    const target = new EventTarget();
    const onAbilityPress = vi.fn();
    let bindings = DEFAULT_KEYBINDS;
    const cleanup = attachBrowserInput(target, () => bindings, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });

    bindings = rebindAction(bindings, "arcaneShot", { kind: "keyboard", code: "KeyQ" });
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", cancelable: true }));

    expect(onAbilityPress).toHaveBeenCalledOnce();
    expect(onAbilityPress).toHaveBeenCalledWith("arcaneShot");

    cleanup();
  });

  it("releases movement keys held across rebinding", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    let bindings = DEFAULT_KEYBINDS;
    const cleanup = attachBrowserInput(target, () => bindings, {
      onMovementChange,
      onAbilityPress: vi.fn(),
    });

    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    bindings = rebindAction(bindings, "moveForward", { kind: "keyboard", code: "KeyQ" });
    const keyUpEvent = new KeyboardEvent("keyup", { code: "KeyW", cancelable: true });
    target.dispatchEvent(keyUpEvent);

    expect(onMovementChange).toHaveBeenNthCalledWith(1, {
      forward: true,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(2, {
      forward: false,
      backward: false,
      left: false,
      right: false,
    });
    expect(keyUpEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("releases active movement keys even when keyup has a modifier chord", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    const cleanup = attachBrowserInput(target, DEFAULT_KEYBINDS, {
      onMovementChange,
      onAbilityPress: vi.fn(),
    });

    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    const keyUpEvent = new KeyboardEvent("keyup", { code: "KeyW", cancelable: true, shiftKey: true });
    target.dispatchEvent(keyUpEvent);

    expect(onMovementChange).toHaveBeenNthCalledWith(1, {
      forward: true,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(2, {
      forward: false,
      backward: false,
      left: false,
      right: false,
    });
    expect(keyUpEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("ignores held movement repeats after rebinding the same physical key", () => {
    const target = new EventTarget();
    const onMovementChange = vi.fn();
    let bindings = DEFAULT_KEYBINDS;
    const cleanup = attachBrowserInput(target, () => bindings, {
      onMovementChange,
      onAbilityPress: vi.fn(),
    });

    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    bindings = rebindAction(bindings, "moveBackward", { kind: "keyboard", code: "KeyW" }, true);
    const repeatEvent = new KeyboardEvent("keydown", { code: "KeyW", cancelable: true, repeat: true });
    target.dispatchEvent(repeatEvent);
    target.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", cancelable: true }));

    expect(repeatEvent.defaultPrevented).toBe(true);
    expect(onMovementChange).toHaveBeenNthCalledWith(1, {
      forward: true,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenNthCalledWith(2, {
      forward: false,
      backward: false,
      left: false,
      right: false,
    });
    expect(onMovementChange).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("keeps static map usage working", () => {
    const target = new EventTarget();
    const onAbilityPress = vi.fn();
    const bindings = {
      ...DEFAULT_KEYBINDS,
      arcaneShot: { kind: "keyboard", code: "KeyQ" } satisfies KeyBinding,
    };
    const cleanup = attachBrowserInput(target, bindings, {
      onMovementChange: vi.fn(),
      onAbilityPress,
    });

    target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", cancelable: true }));

    expect(onAbilityPress).toHaveBeenCalledOnce();
    expect(onAbilityPress).toHaveBeenCalledWith("arcaneShot");

    cleanup();
  });
});
