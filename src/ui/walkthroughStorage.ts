export const WALKTHROUGH_STORAGE_KEY = "melee-weaving-practice.walkthrough.v1";

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadWalkthroughDismissed(): boolean {
  const storage = getStorage();
  if (storage === null) {
    return false;
  }

  try {
    const stored = storage.getItem(WALKTHROUGH_STORAGE_KEY);
    if (stored === null) {
      return false;
    }

    return JSON.parse(stored) === true;
  } catch {
    return false;
  }
}

export function saveWalkthroughDismissed(): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(WALKTHROUGH_STORAGE_KEY, JSON.stringify(true));
  } catch {
    // Storage failures should never interrupt practice.
  }
}
