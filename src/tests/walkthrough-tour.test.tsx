import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WalkthroughTour } from "../ui/WalkthroughTour";
import { WALKTHROUGH_STORAGE_KEY } from "../ui/walkthroughStorage";

interface MockRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function toDomRect(rect: MockRect): DOMRect {
  return {
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  } as DOMRect;
}

function stubMeasuredRects(targetRects: Record<string, MockRect>, cardRect: MockRect): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(
    this: HTMLElement,
  ) {
    const element = this;

    if (element.classList.contains("walkthrough-card")) {
      return toDomRect(cardRect);
    }

    const targetName = element.dataset.tourTarget;
    if (targetName && targetRects[targetName]) {
      return toDomRect(targetRects[targetName]);
    }

    return toDomRect({ top: 0, left: 0, width: 0, height: 0 });
  });
}

function renderTourTargets() {
  return render(
    <>
      <div data-testid="tour-scroll-container">
        <main>
          <label data-tour-target="rotation-select">
            <span>Rotation</span>
            <select aria-label="Rotation">
              <option>French Weaving</option>
            </select>
          </label>
          <section data-tour-target="practice-hud" aria-label="Practice field" />
          <section data-tour-target="keybindings" aria-label="Keybindings" />
        </main>
      </div>
      <WalkthroughTour />
    </>,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("WalkthroughTour", () => {
  it("renders the first step when the tour has not been dismissed", () => {
    renderTourTargets();

    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Choose the rotation you want to practice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip walkthrough" })).toBeEnabled();
  });

  it("renders overlay, highlight, and card styling hooks", () => {
    const { container } = renderTourTargets();

    expect(container.querySelector(".walkthrough-layer")).not.toBeNull();
    expect(container.querySelector(".walkthrough-scrim")).not.toBeNull();
    expect(container.querySelector(".walkthrough-highlight")).not.toBeNull();
    expect(screen.getByTestId("walkthrough-card")).toHaveClass("walkthrough-card");
  });

  it("does not render when the tour has already been dismissed", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(true));

    renderTourTargets();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves forward and backward through the steps", () => {
    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("dialog", { name: "Practice HUD" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/read from top to bottom: cast bar first/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  it("dismisses and persists when skipped", () => {
    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
  });

  it("dismisses and persists when completed", () => {
    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("dialog", { name: "Keybindings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
  });

  it("dismisses when Escape is pressed", () => {
    renderTourTargets();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
  });

  it("centers the highlight and card when the active target is missing", async () => {
    vi.stubGlobal("innerWidth", 900);
    vi.stubGlobal("innerHeight", 700);

    const { container } = render(<WalkthroughTour />);
    const highlight = container.querySelector<HTMLElement>(".walkthrough-highlight");

    expect(highlight).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "Rotation preset" })).toBeInTheDocument();
    await waitFor(() => {
      expect(highlight).toHaveStyle({
        top: "240px",
        left: "290px",
        width: "320px",
        height: "220px",
      });
      expect(screen.getByTestId("walkthrough-card")).toHaveStyle({
        top: "245px",
        left: "290px",
      });
    });
  });

  it("continues to dismiss when storage write fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    renderTourTargets();

    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("positions the highlight and card from the measured active target", async () => {
    stubMeasuredRects(
      {
        "rotation-select": { top: 100, left: 120, width: 200, height: 40 },
      },
      { top: 0, left: 0, width: 280, height: 180 },
    );

    const { container } = renderTourTargets();
    const highlight = container.querySelector<HTMLElement>(".walkthrough-highlight");
    const card = screen.getByTestId("walkthrough-card");

    expect(highlight).not.toBeNull();
    await waitFor(() => {
      expect(highlight).toHaveStyle({
        top: "92px",
        left: "112px",
        width: "216px",
        height: "56px",
      });
      expect(card).toHaveStyle({
        top: "30px",
        left: "342px",
      });
    });
  });

  it("clamps the card inside the viewport margins near the right and bottom edges", async () => {
    vi.stubGlobal("innerWidth", 500);
    vi.stubGlobal("innerHeight", 400);
    stubMeasuredRects(
      {
        "rotation-select": { top: 330, left: 460, width: 30, height: 40 },
      },
      { top: 0, left: 0, width: 180, height: 120 },
    );

    renderTourTargets();

    await waitFor(() => {
      expect(screen.getByTestId("walkthrough-card")).toHaveStyle({
        top: "256px",
        left: "296px",
      });
    });
  });

  it("measures the new target when the active step changes", async () => {
    stubMeasuredRects(
      {
        "rotation-select": { top: 100, left: 120, width: 200, height: 40 },
        "practice-hud": { top: 300, left: 400, width: 200, height: 80 },
      },
      { top: 0, left: 0, width: 280, height: 180 },
    );

    const { container } = renderTourTargets();
    const highlight = container.querySelector<HTMLElement>(".walkthrough-highlight");

    expect(highlight).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("dialog", { name: "Practice HUD" })).toBeInTheDocument();
    await waitFor(() => {
      expect(highlight).toHaveStyle({
        top: "292px",
        left: "392px",
        width: "216px",
        height: "96px",
      });
      expect(screen.getByTestId("walkthrough-card")).toHaveStyle({
        top: "250px",
        left: "622px",
      });
    });
  });

  it("remeasures the active target on resize", async () => {
    const targetRects: Record<string, MockRect> = {
      "rotation-select": { top: 100, left: 120, width: 200, height: 40 },
    };
    stubMeasuredRects(targetRects, { top: 0, left: 0, width: 280, height: 180 });

    const { container } = renderTourTargets();
    const highlight = container.querySelector<HTMLElement>(".walkthrough-highlight");

    expect(highlight).not.toBeNull();
    await waitFor(() => {
      expect(highlight).toHaveStyle({ top: "92px", left: "112px" });
    });

    targetRects["rotation-select"] = { top: 150, left: 180, width: 240, height: 60 };
    fireEvent.resize(window);

    await waitFor(() => {
      expect(highlight).toHaveStyle({
        top: "142px",
        left: "172px",
        width: "256px",
        height: "76px",
      });
      expect(screen.getByTestId("walkthrough-card")).toHaveStyle({
        top: "90px",
        left: "442px",
      });
    });
  });

  it("remeasures when a nested element dispatches a captured scroll event", async () => {
    const targetRects: Record<string, MockRect> = {
      "rotation-select": { top: 100, left: 120, width: 200, height: 40 },
    };
    stubMeasuredRects(targetRects, { top: 0, left: 0, width: 280, height: 180 });
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    const { container } = renderTourTargets();
    const highlight = container.querySelector<HTMLElement>(".walkthrough-highlight");

    expect(addEventListenerSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(highlight).not.toBeNull();
    await waitFor(() => {
      expect(highlight).toHaveStyle({ top: "92px", left: "112px" });
    });

    targetRects["rotation-select"] = { top: 220, left: 260, width: 160, height: 70 };
    fireEvent.scroll(screen.getByTestId("tour-scroll-container"));

    await waitFor(() => {
      expect(highlight).toHaveStyle({
        top: "212px",
        left: "252px",
        width: "176px",
        height: "86px",
      });
      expect(screen.getByTestId("walkthrough-card")).toHaveStyle({
        top: "165px",
        left: "442px",
      });
    });
  });

  it("marks the dialog modal and traps tab focus within the card", () => {
    renderTourTargets();

    const dialog = screen.getByRole("dialog", { name: "Rotation preset" });
    const skipButton = screen.getByRole("button", { name: "Skip walkthrough" });
    const nextButton = screen.getByRole("button", { name: "Next" });

    expect(dialog).toHaveAttribute("aria-modal", "true");

    nextButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(skipButton).toHaveFocus();

    skipButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(nextButton).toHaveFocus();
  });

  it("restores focus to the previously active element when dismissed", () => {
    render(<button type="button">Before tour</button>);
    const beforeTour = screen.getByRole("button", { name: "Before tour" });

    beforeTour.focus();
    expect(beforeTour).toHaveFocus();

    render(
      <>
        <main>
          <label data-tour-target="rotation-select">
            <span>Rotation</span>
            <select aria-label="Rotation">
              <option>French Weaving</option>
            </select>
          </label>
        </main>
        <WalkthroughTour />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Skip walkthrough" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(beforeTour).toHaveFocus();
  });
});
