import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WALKTHROUGH_STORAGE_KEY,
  loadWalkthroughDismissed,
  saveWalkthroughDismissed,
} from "../ui/walkthroughStorage";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("walkthrough storage", () => {
  it("loads false when the dismissed flag is missing", () => {
    expect(loadWalkthroughDismissed()).toBe(false);
  });

  it("saves and loads the dismissed flag", () => {
    saveWalkthroughDismissed();

    expect(localStorage.getItem(WALKTHROUGH_STORAGE_KEY)).toBe("true");
    expect(loadWalkthroughDismissed()).toBe(true);
  });

  it("loads false for malformed JSON", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "{not-json");

    expect(loadWalkthroughDismissed()).toBe(false);
  });

  it("loads false for stored values other than true", () => {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(false));

    expect(loadWalkthroughDismissed()).toBe(false);

    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify("true"));

    expect(loadWalkthroughDismissed()).toBe(false);
  });

  it("does not throw when browser storage is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(loadWalkthroughDismissed()).toBe(false);
    expect(() => saveWalkthroughDismissed()).not.toThrow();
  });

  it("does not throw when storage read or write fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage read blocked");
    });

    expect(loadWalkthroughDismissed()).toBe(false);

    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    expect(() => saveWalkthroughDismissed()).not.toThrow();
  });
});
