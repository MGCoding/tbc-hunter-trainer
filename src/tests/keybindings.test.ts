import { describe, expect, it } from "vitest";
import { DEFAULT_KEYBINDS } from "../data/constants";
import { findActionForBinding, rebindAction } from "../input/keybindings";

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
