import type { SimEvent } from "./types";

export class SessionLog {
  private events: SimEvent[] = [];

  add(event: SimEvent): void {
    const insertAt = this.events.findIndex((existing) => existing.atMs > event.atMs);
    const snapshot = { ...event };
    if (insertAt === -1) {
      this.events.push(snapshot);
      return;
    }

    this.events.splice(insertAt, 0, snapshot);
  }

  all(): SimEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  reset(): void {
    this.events = [];
  }
}
