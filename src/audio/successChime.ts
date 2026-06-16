declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function playSuccessChime(): void {
  if (typeof window === "undefined") {
    return;
  }

  let context: AudioContext | null = null;
  try {
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    context = new AudioContextConstructor();
    const audioContext = context;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    oscillator.addEventListener("ended", () => {
      void audioContext.close().catch(() => undefined);
    });
  } catch {
    if (context !== null) {
      try {
        void context.close().catch(() => undefined);
      } catch {
        // Closing a partially initialized context is best effort.
      }
    }
    // Blocked audio should never interrupt practice.
  }
}
