import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../App";

describe("App UI", () => {
  it("renders trainer controls and reference panels", () => {
    render(<App />);

    expect(screen.getByLabelText("Rotation")).toBeInTheDocument();
    expect(screen.getByText("Reference Rotation")).toBeInTheDocument();
    expect(screen.getByText("Diziet rotationtools")).toBeInTheDocument();
    expect(screen.getByText("Efficiency")).toBeInTheDocument();
    expect(screen.getByText("Queue window")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Log" })).toBeInTheDocument();
  });
});
