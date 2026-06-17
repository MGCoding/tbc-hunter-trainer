export const RENDER_SCALE_OPTIONS = ["auto", 1, 1.5, 2, 3, 4] as const;
export type RenderScalePreference = (typeof RENDER_SCALE_OPTIONS)[number];

const RENDER_SCALE_STORAGE_KEY = "melee-weaving-practice.renderScale.v1";
const MIN_RENDER_SCALE = 1;
const MAX_RENDER_SCALE = 4;

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseRenderScalePreference(value: unknown): RenderScalePreference | null {
  return (RENDER_SCALE_OPTIONS as readonly unknown[]).includes(value) ? (value as RenderScalePreference) : null;
}

export function clampRenderScale(value: number): number {
  if (!Number.isFinite(value) || value < MIN_RENDER_SCALE) {
    return MIN_RENDER_SCALE;
  }

  return Math.min(MAX_RENDER_SCALE, value);
}

export function getEffectiveRenderScale(preference: RenderScalePreference, devicePixelRatio: number): number {
  return preference === "auto" ? clampRenderScale(devicePixelRatio) : preference;
}

export function formatEffectiveRenderScale(scale: number): string {
  return `${Number.isInteger(scale) ? scale.toFixed(0) : String(Number(scale.toFixed(2)))}x`;
}

export function formatRenderScaleOptionLabel(preference: RenderScalePreference, effectiveAutoScale: number): string {
  if (preference === "auto") {
    return `Auto (${formatEffectiveRenderScale(effectiveAutoScale)})`;
  }

  return formatEffectiveRenderScale(preference);
}

export function loadStoredRenderScalePreference(): RenderScalePreference {
  const storage = getBrowserStorage();

  if (storage === null) {
    return "auto";
  }

  try {
    const rawValue = storage.getItem(RENDER_SCALE_STORAGE_KEY);
    if (rawValue === null) {
      return "auto";
    }

    return parseRenderScalePreference(JSON.parse(rawValue)) ?? "auto";
  } catch {
    return "auto";
  }
}

export function saveStoredRenderScalePreference(preference: RenderScalePreference): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(RENDER_SCALE_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    return;
  }
}

export function clearStoredRenderScalePreference(): void {
  const storage = getBrowserStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(RENDER_SCALE_STORAGE_KEY);
  } catch {
    return;
  }
}
