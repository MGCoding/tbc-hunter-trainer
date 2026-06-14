import type { SimEvent } from "./types";

export class SessionLog {
  private events: SimEvent[] = [];

  add(event: SimEvent): void {
    this.events.push(event);
  }

  all(): SimEvent[] {
    return [...this.events];
  }

  reset(): void {
    this.events = [];
  }
}
