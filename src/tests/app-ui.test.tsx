import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ComponentProps } from "react";
import { App } from "../App";
import { playAttackSoundsForEvents, preloadAttackSounds } from "../audio/attackSounds";
import { playSuccessChime } from "../audio/successChime";
import { TIMING } from "../data/constants";
import { getRotationPreset } from "../data/rotations";
import type { RenderScalePreference } from "../game/renderScale";
import { expandRotationPattern } from "../sim/timeline";
import type { PracticeState, SimEvent } from "../sim/types";
import { EventLogPanel } from "../ui/EventLogPanel";

const KEYBINDINGS_STORAGE_KEY = "melee-weaving-practice.keybindings.v1";

const phaserHostTestHooks = vi.hoisted(() => ({
  getPracticeState: null as null | (() => PracticeState),
  renderScalePreference: null as null | RenderScalePreference,
}));

type MockPhaserHostProps = ComponentProps<typeof import("../game/PhaserHost").PhaserHost> & {
  renderScalePreference: RenderScalePreference;
};

vi.mock("../game/PhaserHost", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const { attachBrowserInput } = await vi.importActual<typeof import("../input/browserInput")>("../input/browserInput");

  return {
    PhaserHost(props: MockPhaserHostProps) {
      const parentRef = React.useRef<HTMLDivElement | null>(null);
      phaserHostTestHooks.getPracticeState = props.getPracticeState;
      phaserHostTestHooks.renderScalePreference = props.renderScalePreference;

      React.useEffect(() => {
        const parent = parentRef.current;
        if (!parent) {
          return undefined;
        }

        parent.focus();
        return attachBrowserInput(document, props.getKeybindings, {
          onMovementChange: props.onMovementChange,
          onAbilityPress: props.onAbilityPress,
        });
      }, [props.getKeybindings, props.onAbilityPress, props.onMovementChange]);

      return React.createElement("div", {
        ref: parentRef,
        className: "phaser-host",
        "data-testid": "phaser-host",
        "data-ideal-count": props.ideal.length,
        tabIndex: 0,
      });
    },
  };
});

vi.mock("../audio/attackSounds", () => ({
  preloadAttackSounds: vi.fn(),
  playAttackSoundsForEvents: vi.fn(),
}));

vi.mock("../audio/successChime", () => ({
  playSuccessChime: vi.fn(),
}));

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  phaserHostTestHooks.getPracticeState = null;
  phaserHostTestHooks.renderScalePreference = null;
});

describe("App UI", () => {
  const chronologicalAbilityPressNames = () =>
    [...within(screen.getByRole("region", { name: "Event Log" })).queryAllByRole("listitem")]
      .reverse()
      .filter((row) => within(row).queryByText("ability-press") !== null)
      .map((row) => within(row).getByText(/^[a-z][A-Za-z]+$/, { selector: "strong" }).textContent ?? "");

  const getArcaneShotKeybindingRow = () => {
    const setButton = screen.getByRole("button", { name: "Set Arcane Shot" });
    const row = setButton.closest(".keybinding-row");
    if (row === null) {
      throw new Error("Arcane Shot keybinding row not found");
    }
    return row as HTMLElement;
  };

  it("renders trainer controls and reference panels", () => {
    render(<App />);

    expect(screen.getByTestId("phaser-host")).toBeInTheDocument();
    expect(screen.queryByText("Practice field loads in Task 9")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rotation")).toBeInTheDocument();
    expect(screen.getByText("Reference Rotation")).toBeInTheDocument();
    expect(screen.getByText("Diziet rotationtools")).toBeInTheDocument();
    expect(screen.queryByText("Efficiency")).not.toBeInTheDocument();
    expect(screen.getByText("Auto delay")).toBeInTheDocument();
    expect(screen.getByText("Weave time")).toBeInTheDocument();
    expect(screen.getByText("Queue window")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Log" })).toBeInTheDocument();
  });

  it("renders Auto render scale by default and passes it to PhaserHost", () => {
    render(<App />);

    const renderScaleSelect = screen.getByLabelText("Render Scale");

    expect(renderScaleSelect).toHaveValue("auto");
    expect(within(renderScaleSelect).getByRole("option", { name: "Auto (1x)" })).toBeInTheDocument();
    expect(within(renderScaleSelect).getByRole("option", { name: "1x" })).toBeInTheDocument();
    expect(within(renderScaleSelect).getByRole("option", { name: "1.5x" })).toBeInTheDocument();
    expect(within(renderScaleSelect).getByRole("option", { name: "2x" })).toBeInTheDocument();
    expect(within(renderScaleSelect).getByRole("option", { name: "3x" })).toBeInTheDocument();
    expect(within(renderScaleSelect).getByRole("option", { name: "4x" })).toBeInTheDocument();
    expect(phaserHostTestHooks.renderScalePreference).toBe("auto");
  });

  it("updates and persists the selected render scale", () => {
    const { unmount } = render(<App />);

    fireEvent.change(screen.getByLabelText("Render Scale"), { target: { value: "2" } });

    expect(screen.getByLabelText("Render Scale")).toHaveValue("2");
    expect(phaserHostTestHooks.renderScalePreference).toBe(2);

    unmount();
    render(<App />);

    expect(screen.getByLabelText("Render Scale")).toHaveValue("2");
    expect(phaserHostTestHooks.renderScalePreference).toBe(2);
  });

  it("falls back to Auto for an invalid stored render scale", () => {
    localStorage.setItem("melee-weaving-practice.renderScale.v1", JSON.stringify(2.5));

    render(<App />);

    expect(screen.getByLabelText("Render Scale")).toHaveValue("auto");
    expect(phaserHostTestHooks.renderScalePreference).toBe("auto");
  });

  it("starts with quiet timing metric placeholders before any session events", () => {
    render(<App />);

    expect(screen.getAllByText("--ms").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Latest mistake")).not.toBeInTheDocument();
    expect(screen.queryByText("No mistakes recorded")).not.toBeInTheDocument();
  });

  it("preloads attack sounds once on app load", () => {
    render(<App />);

    expect(preloadAttackSounds).toHaveBeenCalledTimes(1);
  });

  it("forwards new simulator attack events when stopping a running session", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const expectedAutoFireAtMs = preset.targetRangedSwingMs;
    const expectedAutoWindupAtMs = expectedAutoFireAtMs - TIMING.autoWindupMs / preset.hasteFactor;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    vi.mocked(playAttackSoundsForEvents).mockClear();
    now.mockReturnValue(2_600);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    const forwardedEvents = vi.mocked(playAttackSoundsForEvents).mock.calls.flatMap(([events]) => events);

    expect(forwardedEvents).toContainEqual({
      type: "auto-windup",
      atMs: expectedAutoWindupAtMs,
      ability: "autoShot",
    });
    expect(forwardedEvents).toContainEqual(
      expect.objectContaining({ type: "auto-fire", atMs: expectedAutoFireAtMs, ability: "autoShot" }),
    );
  });

  it("does not replay already processed attack events across later state updates", () => {
    const now = vi.spyOn(performance, "now");

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    vi.mocked(playAttackSoundsForEvents).mockClear();
    now.mockReturnValue(2_600);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    const callCountAfterStop = vi.mocked(playAttackSoundsForEvents).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));

    expect(callCountAfterStop).toBeGreaterThan(0);
    expect(playAttackSoundsForEvents).toHaveBeenCalledTimes(callCountAfterStop);
  });

  it("forwards sorted-inserted auto events without replaying already processed ability events", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const expectedAutoFireAtMs = preset.targetRangedSwingMs;
    const expectedAutoWindupAtMs = expectedAutoFireAtMs - TIMING.autoWindupMs / preset.hasteFactor;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    vi.mocked(playAttackSoundsForEvents).mockClear();

    now.mockReturnValue(1_800);
    fireEvent.keyDown(document, { code: "Digit4" });

    const abilityEvents = vi.mocked(playAttackSoundsForEvents).mock.calls.flatMap(([events]) => events);
    expect(abilityEvents).toContainEqual({ type: "ability-press", atMs: 1800, ability: "steadyShot" });
    expect(abilityEvents).toContainEqual({
      type: "auto-windup",
      atMs: expectedAutoWindupAtMs,
      ability: "autoShot",
    });

    vi.mocked(playAttackSoundsForEvents).mockClear();
    now.mockReturnValue(2_600);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    const forwardedEvents = vi.mocked(playAttackSoundsForEvents).mock.calls.flatMap(([events]) => events);

    expect(forwardedEvents).not.toContainEqual({
      type: "auto-windup",
      atMs: expectedAutoWindupAtMs,
      ability: "autoShot",
    });
    expect(forwardedEvents).toContainEqual(
      expect.objectContaining({ type: "auto-fire", atMs: expectedAutoFireAtMs, ability: "autoShot" }),
    );
    expect(forwardedEvents).not.toContainEqual({ type: "ability-press", atMs: 1800, ability: "steadyShot" });
  });

  it("syncs movement blocking into the simulator and records a moving Auto delay", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("one-one");
    const autoDue = preset.targetRangedSwingMs;
    const spark = autoDue - TIMING.noMoveNoCastLeadMs;
    const stopMovingAtMs = autoDue + 250;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "one-one" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(spark);
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(stopMovingAtMs);
    fireEvent.keyUp(document, { code: "KeyW" });

    const eventLog = within(screen.getByRole("region", { name: "Event Log" }));
    const clippedRow = eventLog
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText("auto-clipped") !== null);

    expect(clippedRow).toBeDefined();
    expect(within(clippedRow!).getByText("moving")).toBeInTheDocument();
  });

  it("publishes passive Auto delay events to the side panel while still running", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("one-one");
    const sparkAtMs = preset.targetRangedSwingMs - TIMING.noMoveNoCastLeadMs;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "one-one" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(sparkAtMs - 650);
    fireEvent.keyDown(document, { code: "Digit4" });
    now.mockReturnValue(preset.targetRangedSwingMs + 250);
    act(() => {
      phaserHostTestHooks.getPracticeState?.();
    });

    const eventLog = within(screen.getByRole("region", { name: "Event Log" }));
    const clippedRow = eventLog
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText("auto-clipped") !== null);

    expect(clippedRow).toBeDefined();
    expect(within(clippedRow!).getByText("casting-at-spark")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  });

  it("toggles running status and start stop disabled states", () => {
    render(<App />);

    const startButton = screen.getByRole("button", { name: "Start" });
    const stopButton = screen.getByRole("button", { name: "Stop" });

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(startButton).toBeEnabled();
    expect(stopButton).toBeDisabled();

    fireEvent.click(startButton);

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(startButton).toBeDisabled();
    expect(stopButton).toBeEnabled();

    fireEvent.click(stopButton);

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(startButton).toBeEnabled();
    expect(stopButton).toBeDisabled();
  });

  it("updates the selected rotation", () => {
    render(<App />);

    const rotationSelect = screen.getByLabelText("Rotation");

    fireEvent.change(rotationSelect, { target: { value: "half-weave-22-1w" } });

    expect(rotationSelect).toHaveValue("half-weave-22-1w");
    expect(screen.getByTestId("phaser-host")).toHaveAttribute(
      "data-ideal-count",
      String(expandRotationPattern(getRotationPreset("half-weave-22-1w")).length),
    );
  });

  it("keeps mapped ability input live after side-panel focus changes", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document.activeElement ?? document, { code: "Digit4" });

    expect(screen.getByText("ability-press")).toBeInTheDocument();
    expect(screen.getAllByText("steadyShot").length).toBeGreaterThan(0);
  });

  it("plays a success chime for a correctly timed expected ability input", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(steady.idealAtMs + 75);
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(playSuccessChime).toHaveBeenCalledTimes(1);
  });

  it("does not play a success chime for wrong or late ability input", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(steady.idealAtMs);
    fireEvent.keyDown(document, { code: "Digit1" });
    now.mockReturnValue(steady.idealAtMs + 250);
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(playSuccessChime).not.toHaveBeenCalled();
  });

  it("plays only one success chime for repeated presses inside the same ideal event window", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("french-weaving-5511-3w");
    const ideal = expandRotationPattern(preset);
    const steady = ideal.find((event) => event.ability === "steadyShot")!;

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(steady.idealAtMs);
    fireEvent.keyDown(document, { code: "Digit4" });
    fireEvent.keyUp(document, { code: "Digit4" });
    now.mockReturnValue(steady.idealAtMs + 20);
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(playSuccessChime).toHaveBeenCalledTimes(1);
  });

  it("does not replay a success chime for an interleaved duplicate ideal event press", () => {
    const now = vi.spyOn(performance, "now");
    const preset = getRotationPreset("one-one");
    const ideal = expandRotationPattern(preset);
    const overlappingAuto = ideal.find((event) => {
      return (
        event.ability === "autoShot" &&
        ideal.some((entry) => entry.index !== event.index && entry.ability === "steadyShot" && entry.idealAtMs === event.idealAtMs)
      );
    });

    if (!overlappingAuto) {
      throw new Error("Expected one-one to include overlapping Auto Shot and Steady Shot events");
    }

    now.mockReturnValue(0);
    render(<App />);

    fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "one-one" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    now.mockReturnValue(overlappingAuto.idealAtMs);
    fireEvent.keyDown(document, { code: "KeyV" });
    fireEvent.keyUp(document, { code: "KeyV" });
    fireEvent.keyDown(document, { code: "Digit4" });
    fireEvent.keyUp(document, { code: "Digit4" });
    fireEvent.keyDown(document, { code: "KeyV" });

    expect(playSuccessChime).toHaveBeenCalledTimes(2);
  });

  it("updates movement from live input before enforcing ranged minimum range", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(100);
    fireEvent.keyUp(document, { code: "KeyW" });
    fireEvent.keyDown(document, { code: "Digit1" });

    expect(screen.getByText("invalid-input")).toBeInTheDocument();
    expect(screen.getAllByText("arcaneShot").length).toBeGreaterThan(0);
    expect(screen.queryByText("cast-start")).not.toBeInTheDocument();
  });

  it("prevents automatic Auto Shot fires while the live player position is in melee range", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(100);
    fireEvent.keyUp(document, { code: "KeyW" });
    now.mockReturnValue(6_000);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(screen.queryByText("auto-fire")).not.toBeInTheDocument();
  });

  it("fires Raptor Strike from melee range when the melee swing is ready", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(100);
    fireEvent.keyUp(document, { code: "KeyW" });
    now.mockReturnValue(2_600);
    fireEvent.mouseDown(document, { button: 3 });

    expect(screen.getAllByText("cast-start").length).toBeGreaterThan(0);
    expect(screen.getAllByText("raptorStrike").length).toBeGreaterThan(0);
    expect(screen.queryByText("invalid-input")).not.toBeInTheDocument();
  });

  it("renders the Raptor Strike macro option on by default", () => {
    render(<App />);

    expect(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" })).toBeChecked();
  });

  it("attempts Kill Command before Raptor Strike from the Raptor Strike binding by default", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(100);
    fireEvent.keyUp(document, { code: "KeyW" });
    now.mockReturnValue(2_600);
    fireEvent.mouseDown(document, { button: 3 });

    const abilityPressNames = chronologicalAbilityPressNames();

    expect(abilityPressNames.slice(0, 2)).toEqual(["killCommand", "raptorStrike"]);
  });

  it("keeps Kill Command input from attempting Raptor Strike when the macro is enabled", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "Digit2" });

    const abilityPressNames = chronologicalAbilityPressNames();

    expect(abilityPressNames).toContain("killCommand");
    expect(abilityPressNames).not.toContain("raptorStrike");
  });

  it("preserves Raptor Strike-only input when the macro is disabled", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.mouseDown(document, { button: 3 });

    const abilityPressNames = chronologicalAbilityPressNames();

    expect(abilityPressNames).toContain("raptorStrike");
    expect(abilityPressNames).not.toContain("killCommand");
  });

  it("keeps held movement input releasable after toggling the Raptor Strike macro option", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" }));
    now.mockReturnValue(50);
    fireEvent.keyUp(document, { code: "KeyW" });
    now.mockReturnValue(200);
    fireEvent.keyDown(document, { code: "Digit1" });

    expect(screen.getAllByText("arcaneShot").length).toBeGreaterThan(0);
    expect(screen.queryByText("invalid-input")).not.toBeInTheDocument();
  });

  it("logs melee actions as invalid when the player is out of melee range", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Macro Kill Command into Raptor Strike" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.mouseDown(document, { button: 3 });

    expect(screen.getByText("invalid-input")).toBeInTheDocument();
    expect(screen.getAllByText("raptorStrike").length).toBeGreaterThan(0);
    expect(screen.queryByText("cast-start")).not.toBeInTheDocument();
  });

  it("lets users rebind an action and routes live input through the edited binding", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));

    fireEvent.keyDown(document, { code: "Digit1" });
    expect(screen.queryByText("ability-press")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(screen.getByText("ability-press")).toBeInTheDocument();
    expect(screen.getAllByText("arcaneShot").length).toBeGreaterThan(0);
  });

  it("loads a saved keybinding map when the app remounts", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });

    expect(within(getArcaneShotKeybindingRow()).getByText("Q")).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(within(getArcaneShotKeybindingRow()).getByText("Q")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "Digit1" });
    expect(chronologicalAbilityPressNames()).not.toContain("arcaneShot");

    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(chronologicalAbilityPressNames()).toContain("arcaneShot");
  });

  it("resets saved keybindings to defaults and restores default live input", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(within(getArcaneShotKeybindingRow()).getByText("Q")).toBeInTheDocument();
    expect(localStorage.getItem(KEYBINDINGS_STORAGE_KEY)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset keybindings to default" }));

    expect(within(getArcaneShotKeybindingRow()).getByText("1")).toBeInTheDocument();
    expect(localStorage.getItem(KEYBINDINGS_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(chronologicalAbilityPressNames()).not.toContain("arcaneShot");

    fireEvent.keyDown(document, { code: "Digit1" });
    expect(chronologicalAbilityPressNames()).toContain("arcaneShot");
  });

  it("restores default keybindings in memory even when stored reset fails", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(within(getArcaneShotKeybindingRow()).getByText("Q")).toBeInTheDocument();
    expect(localStorage.getItem(KEYBINDINGS_STORAGE_KEY)).not.toBeNull();

    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset keybindings to default" }));

    expect(within(getArcaneShotKeybindingRow()).getByText("1")).toBeInTheDocument();
    expect(localStorage.getItem(KEYBINDINGS_STORAGE_KEY)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyQ" });
    expect(chronologicalAbilityPressNames()).not.toContain("arcaneShot");

    fireEvent.keyDown(document, { code: "Digit1" });
    expect(chronologicalAbilityPressNames()).toContain("arcaneShot");
  });

  it("cancels active keybinding capture when resetting to defaults", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Set Arcane Shot" }));
    expect(screen.getByText("Listening")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset keybindings to default" }));

    expect(screen.queryByText("Listening")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { code: "KeyQ" });

    expect(within(getArcaneShotKeybindingRow()).getByText("1")).toBeInTheDocument();
  });
});

describe("success chime", () => {
  it("does not throw when called outside a browser window", async () => {
    const actual = await vi.importActual<typeof import("../audio/successChime")>("../audio/successChime");

    vi.stubGlobal("window", undefined);

    expect(() => actual.playSuccessChime()).not.toThrow();
  });
});

describe("EventLogPanel", () => {
  it("renders every event newest first", () => {
    const events: SimEvent[] = Array.from({ length: 10 }, (_, index) => ({
      type: "cast-start",
      atMs: index * 1000,
      ability: index % 2 === 0 ? "steadyShot" : "multiShot",
    }));

    render(<EventLogPanel events={events} onReset={() => undefined} />);

    const rows = screen.getAllByRole("listitem");

    expect(rows).toHaveLength(10);
    expect(within(rows[0]).getByText("9.00s")).toBeInTheDocument();
    expect(within(rows[0]).getByText("multiShot")).toBeInTheDocument();
    expect(within(rows[9]).getByText("0.00s")).toBeInTheDocument();
    expect(screen.getByText("1.00s")).toBeInTheDocument();
  });

  it("calls reset when Reset Log is clicked", () => {
    const onReset = vi.fn();

    render(<EventLogPanel events={[]} onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
