import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { loadWalkthroughDismissed, saveWalkthroughDismissed } from "./walkthroughStorage";

interface WalkthroughStep {
  target: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardPosition {
  top: number;
  left: number;
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    target: "rotation-select",
    title: "Rotation preset",
    body:
      "Choose the rotation you want to practice. The selected preset controls the timing pattern, swing speeds, and reference sequence used during the session.",
  },
  {
    target: "practice-hud",
    title: "Practice HUD",
    body:
      "The center HUD is read from top to bottom: cast bar first, melee swing bar second, ranged swing bar third, then your timing metrics and ability icons underneath.",
  },
  {
    target: "keybindings",
    title: "Keybindings",
    body:
      "Change your movement and ability bindings here. Saved keybindings are stored in this browser and persist when you come back later.",
  },
];

const VIEWPORT_MARGIN = 24;
const TARGET_PADDING = 8;
const CARD_GAP = 14;
const DEFAULT_CARD_WIDTH = 320;
const DEFAULT_CARD_HEIGHT = 210;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }

  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
  };
}

function toHighlightRect(targetRect: DOMRect): Rect {
  return {
    top: Math.max(VIEWPORT_MARGIN / 2, targetRect.top - TARGET_PADDING),
    left: Math.max(VIEWPORT_MARGIN / 2, targetRect.left - TARGET_PADDING),
    width: targetRect.width + TARGET_PADDING * 2,
    height: targetRect.height + TARGET_PADDING * 2,
  };
}

function getFallbackRect(): Rect {
  const viewport = getViewportSize();

  return {
    top: viewport.height / 2 - 110,
    left: viewport.width / 2 - 160,
    width: 320,
    height: 220,
  };
}

function getCardPosition(target: Rect, cardWidth: number, cardHeight: number): CardPosition {
  const viewport = getViewportSize();
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - cardWidth - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - cardHeight - VIEWPORT_MARGIN);
  const centeredTop = target.top + target.height / 2 - cardHeight / 2;
  const centeredLeft = target.left + target.width / 2 - cardWidth / 2;
  const candidates: CardPosition[] = [
    { top: centeredTop, left: target.left + target.width + CARD_GAP },
    { top: centeredTop, left: target.left - cardWidth - CARD_GAP },
    { top: target.top + target.height + CARD_GAP, left: centeredLeft },
    { top: target.top - cardHeight - CARD_GAP, left: centeredLeft },
  ];

  const fittingCandidate = candidates.find((candidate) => {
    return (
      candidate.left >= VIEWPORT_MARGIN &&
      candidate.top >= VIEWPORT_MARGIN &&
      candidate.left + cardWidth <= viewport.width - VIEWPORT_MARGIN &&
      candidate.top + cardHeight <= viewport.height - VIEWPORT_MARGIN
    );
  });

  const bestCandidate = fittingCandidate ?? candidates[0];

  return {
    top: clamp(bestCandidate.top, VIEWPORT_MARGIN, maxTop),
    left: clamp(bestCandidate.left, VIEWPORT_MARGIN, maxLeft),
  };
}

function getCenteredCardPosition(cardWidth: number, cardHeight: number): CardPosition {
  const viewport = getViewportSize();
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - cardWidth - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - cardHeight - VIEWPORT_MARGIN);

  return {
    top: clamp(viewport.height / 2 - cardHeight / 2, VIEWPORT_MARGIN, maxTop),
    left: clamp(viewport.width / 2 - cardWidth / 2, VIEWPORT_MARGIN, maxLeft),
  };
}

function getMeasuredCardSize(card: HTMLDivElement | null): { width: number; height: number } {
  if (card === null) {
    return { width: DEFAULT_CARD_WIDTH, height: DEFAULT_CARD_HEIGHT };
  }

  const rect = card.getBoundingClientRect();

  return {
    width: rect.width || DEFAULT_CARD_WIDTH,
    height: rect.height || DEFAULT_CARD_HEIGHT,
  };
}

function getActiveHTMLElement(): HTMLElement | null {
  if (typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)) {
    return null;
  }

  return document.activeElement;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    return !element.hasAttribute("disabled") && element.tabIndex >= 0;
  });
}

export function WalkthroughTour() {
  const [dismissed, setDismissed] = useState(() => loadWalkthroughDismissed());
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState<Rect>(() => getFallbackRect());
  const [cardPosition, setCardPosition] = useState<CardPosition>({ top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(getActiveHTMLElement());
  const activeStep = WALKTHROUGH_STEPS[stepIndex];

  const measure = useCallback(() => {
    if (dismissed) {
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-tour-target="${activeStep.target}"]`);
    const nextHighlight = target ? toHighlightRect(target.getBoundingClientRect()) : getFallbackRect();
    const cardSize = getMeasuredCardSize(cardRef.current);

    setHighlightRect(nextHighlight);
    setCardPosition(
      target === null
        ? getCenteredCardPosition(cardSize.width, cardSize.height)
        : getCardPosition(nextHighlight, cardSize.width, cardSize.height),
    );
  }, [activeStep.target, dismissed]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (dismissed) {
      return undefined;
    }

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [dismissed, measure]);

  const restoreFocus = useCallback(() => {
    const previouslyFocusedElement = previouslyFocusedElementRef.current;

    if (
      previouslyFocusedElement !== null &&
      previouslyFocusedElement !== document.body &&
      previouslyFocusedElement.isConnected
    ) {
      previouslyFocusedElement.focus();
    }
  }, []);

  const dismiss = useCallback(() => {
    saveWalkthroughDismissed();
    setDismissed(true);
    restoreFocus();
  }, [restoreFocus]);

  useEffect(() => {
    if (dismissed) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const card = cardRef.current;
      if (card === null) {
        return;
      }

      const focusableElements = getFocusableElements(card);
      if (focusableElements.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];
      const activeElement = getActiveHTMLElement();
      const focusIsInsideCard = activeElement !== null && card.contains(activeElement);

      if (event.shiftKey) {
        if (!focusIsInsideCard || activeElement === card || activeElement === firstFocusableElement) {
          event.preventDefault();
          lastFocusableElement.focus();
        }

        return;
      }

      if (!focusIsInsideCard || activeElement === card || activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, dismissed]);

  useEffect(() => {
    if (!dismissed) {
      cardRef.current?.focus();
    }
  }, [dismissed, stepIndex]);

  if (dismissed) {
    return null;
  }

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === WALKTHROUGH_STEPS.length - 1;

  return (
    <div className="walkthrough-layer" aria-live="polite">
      <div className="walkthrough-scrim" />
      <div
        className="walkthrough-highlight"
        style={{
          top: `${highlightRect.top}px`,
          left: `${highlightRect.left}px`,
          width: `${highlightRect.width}px`,
          height: `${highlightRect.height}px`,
        }}
      />
      <div
        ref={cardRef}
        className="walkthrough-card"
        data-testid="walkthrough-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        tabIndex={-1}
        style={{
          top: `${cardPosition.top}px`,
          left: `${cardPosition.left}px`,
        }}
      >
        <div className="walkthrough-progress">
          {stepIndex + 1} of {WALKTHROUGH_STEPS.length}
        </div>
        <h2 id="walkthrough-title">{activeStep.title}</h2>
        <p>{activeStep.body}</p>
        <div className="walkthrough-actions">
          <button type="button" className="secondary-button" onClick={dismiss} aria-label="Skip walkthrough">
            Skip
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={isFirstStep}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (isLastStep) {
                dismiss();
                return;
              }

              setStepIndex((current) => Math.min(WALKTHROUGH_STEPS.length - 1, current + 1));
            }}
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
