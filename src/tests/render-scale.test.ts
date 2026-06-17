import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RENDER_SCALE_OPTIONS,
  clearStoredRenderScalePreference,
  formatEffectiveRenderScale,
  formatRenderScaleOptionLabel,
  getEffectiveRenderScale,
  loadStoredRenderScalePreference,
  parseRenderScalePreference,
  saveStoredRenderScalePreference,
} from "../game/renderScale";

const storageKey = "melee-weaving-practice.renderScale.v1";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("render scale helpers", () => {
  it("defines Auto and the supported manual scale options", () => {
    expect(RENDER_SCALE_OPTIONS).toEqual(["auto", 1, 1.5, 2, 3, 4]);
  });

  it("parses only supported preferences", () => {
    expect(parseRenderScalePreference("auto")).toBe("auto");
    expect(parseRenderScalePreference(1)).toBe(1);
    expect(parseRenderScalePreference(1.5)).toBe(1.5);
    expect(parseRenderScalePreference(2)).toBe(2);
    expect(parseRenderScalePreference(3)).toBe(3);
    expect(parseRenderScalePreference(4)).toBe(4);
    expect(parseRenderScalePreference(0)).toBeNull();
    expect(parseRenderScalePreference(2.5)).toBeNull();
    expect(parseRenderScalePreference("2")).toBeNull();
  });

  it("resolves Auto from devicePixelRatio and clamps it to one through four", () => {
    expect(getEffectiveRenderScale("auto", 0)).toBe(1);
    expect(getEffectiveRenderScale("auto", Number.NaN)).toBe(1);
    expect(getEffectiveRenderScale("auto", 1.25)).toBe(1.25);
    expect(getEffectiveRenderScale("auto", 5)).toBe(4);
  });

  it("uses manual preferences directly", () => {
    expect(getEffectiveRenderScale(1, 3)).toBe(1);
    expect(getEffectiveRenderScale(1.5, 3)).toBe(1.5);
    expect(getEffectiveRenderScale(4, 1)).toBe(4);
  });

  it("formats option labels and effective scale labels", () => {
    expect(formatRenderScaleOptionLabel("auto", 2)).toBe("Auto (2x)");
    expect(formatRenderScaleOptionLabel(1.5, 2)).toBe("1.5x");
    expect(formatEffectiveRenderScale(1.25)).toBe("1.25x");
    expect(formatEffectiveRenderScale(2)).toBe("2x");
  });

  it("loads Auto when no stored preference exists", () => {
    expect(loadStoredRenderScalePreference()).toBe("auto");
  });

  it("saves and loads a valid manual preference", () => {
    saveStoredRenderScalePreference(3);

    expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toBe(3);
    expect(loadStoredRenderScalePreference()).toBe(3);
  });

  it("loads Auto for malformed or unsupported stored preferences", () => {
    localStorage.setItem(storageKey, "{not-json");
    expect(loadStoredRenderScalePreference()).toBe("auto");

    localStorage.setItem(storageKey, JSON.stringify(2.5));
    expect(loadStoredRenderScalePreference()).toBe("auto");
  });

  it("clears stored render scale preference", () => {
    saveStoredRenderScalePreference(2);

    clearStoredRenderScalePreference();

    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("does not throw when storage read or write fails", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(loadStoredRenderScalePreference()).toBe("auto");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => saveStoredRenderScalePreference(2)).not.toThrow();
  });
});
