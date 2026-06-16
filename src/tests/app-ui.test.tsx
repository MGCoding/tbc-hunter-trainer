import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { playAttackSoundsForEvents, preloadAttackSounds } from "../audio/attackSounds";
import { playSuccessChime } from "../audio/successChime";
import { TIMING } from "../data/constants";
import { getRotationPreset } from "../data/rotations";
import { expandRotationPattern } from "../sim/timeline";
import type { SimEvent } from "../sim/types";
import { EventLogPanel } from "../ui/EventLogPanel";

vi.mock("../audio/attackSounds", () => ({
  preloadAttackSounds: vi.fn(),
  playAttackSoundsForEvents: vi.fn(),
}));

vi.mock("../audio/successChime", () => ({
  playSuccessChime: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("App UI", () => {
  it("renders trainer controls and reference panels", () => {
    render(<App />);

    expect(screen.getByTestId("phaser-host")).toBeInTheDocument();
    expect(screen.queryByText("Practice field loads in Task 9")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Rotation")).toBeInTheDocument();
    expect(screen.getByText("Reference Rotation")).toBeInTheDocument();
    expect(screen.getByText("Diziet rotationtools")).toBeInTheDocument();
    expect(screen.getByText("Efficiency")).toBeInTheDocument();
    expect(screen.getByText("Queue window")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Log" })).toBeInTheDocument();
  });

  it("starts with a neutral score before any session events", () => {
    render(<App />);

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("No mistakes recorded")).toBeInTheDocument();
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
    expect(forwardedEvents).toContainEqual({ type: "auto-fire", atMs: expectedAutoFireAtMs, ability: "autoShot" });
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

    vi.mocked(playAttackSoundsForEvents).mockClear();
    now.mockReturnValue(2_600);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    const forwardedEvents = vi.mocked(playAttackSoundsForEvents).mock.calls.flatMap(([events]) => events);

    expect(forwardedEvents).toContainEqual({
      type: "auto-windup",
      atMs: expectedAutoWindupAtMs,
      ability: "autoShot",
    });
    expect(forwardedEvents).toContainEqual({ type: "auto-fire", atMs: expectedAutoFireAtMs, ability: "autoShot" });
    expect(forwardedEvents).not.toContainEqual({ type: "ability-press", atMs: 1800, ability: "steadyShot" });
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

  it("updates movement from live input before enforcing ranged minimum range", () => {
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(0);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));
    fireEvent.keyDown(document, { code: "KeyW" });
    now.mockReturnValue(1_000);
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
    now.mockReturnValue(1_000);
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
    now.mockReturnValue(1_000);
    fireEvent.keyUp(document, { code: "KeyW" });
    now.mockReturnValue(2_600);
    fireEvent.mouseDown(document, { button: 3 });

    expect(screen.getByText("cast-start")).toBeInTheDocument();
    expect(screen.getAllByText("raptorStrike").length).toBeGreaterThan(0);
    expect(screen.queryByText("invalid-input")).not.toBeInTheDocument();
  });

  it("logs melee actions as invalid when the player is out of melee range", () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    render(<App />);

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
