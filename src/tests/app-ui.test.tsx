import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { SimEvent } from "../sim/types";
import { EventLogPanel } from "../ui/EventLogPanel";

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
    fireEvent.keyDown(document, { code: "Digit4" });

    expect(screen.getByText("ability-press")).toBeInTheDocument();
    expect(screen.getAllByText("steadyShot").length).toBeGreaterThan(0);
  });
});

describe("EventLogPanel", () => {
  it("renders the latest 8 events newest first", () => {
    const events: SimEvent[] = Array.from({ length: 10 }, (_, index) => ({
      type: "cast-start",
      atMs: index * 1000,
      ability: index % 2 === 0 ? "steadyShot" : "multiShot",
    }));

    render(<EventLogPanel events={events} onReset={() => undefined} />);

    const rows = screen.getAllByRole("listitem");

    expect(rows).toHaveLength(8);
    expect(within(rows[0]).getByText("9.00s")).toBeInTheDocument();
    expect(within(rows[0]).getByText("multiShot")).toBeInTheDocument();
    expect(within(rows[7]).getByText("2.00s")).toBeInTheDocument();
    expect(screen.queryByText("1.00s")).not.toBeInTheDocument();
  });

  it("calls reset when Reset Log is clicked", () => {
    const onReset = vi.fn();

    render(<EventLogPanel events={[]} onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset Log" }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
