import type { SimEvent } from "../sim/types";

interface EventLogPanelProps {
  events: SimEvent[];
  onReset: () => void;
}

function formatEventTime(atMs: number): string {
  return `${(atMs / 1000).toFixed(2)}s`;
}

export function EventLogPanel({ events, onReset }: EventLogPanelProps) {
  const latestEvents = events.slice(-8).reverse();

  return (
    <section className="panel" aria-labelledby="event-log-panel-title">
      <div className="panel-header">
        <h2 id="event-log-panel-title">Event Log</h2>
        <button type="button" className="secondary-button" onClick={onReset}>
          Reset Log
        </button>
      </div>

      {latestEvents.length > 0 ? (
        <ol className="event-list">
          {latestEvents.map((event, index) => (
            <li key={`${event.atMs}-${event.type}-${event.ability ?? "none"}-${index}`}>
              <time>{formatEventTime(event.atMs)}</time>
              <span>{event.type}</span>
              {event.ability ? <strong>{event.ability}</strong> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-state">No events yet</p>
      )}
    </section>
  );
}
