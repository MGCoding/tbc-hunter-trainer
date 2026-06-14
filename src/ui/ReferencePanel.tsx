import { expandRotationPattern } from "../sim/timeline";
import type { RotationPreset } from "../sim/types";

interface ReferencePanelProps {
  preset: RotationPreset;
}

export function ReferencePanel({ preset }: ReferencePanelProps) {
  const ideal = expandRotationPattern(preset);

  return (
    <section className="panel" aria-labelledby="reference-panel-title">
      <div className="panel-header">
        <h2 id="reference-panel-title">Reference Rotation</h2>
        <a href={preset.sourceUrl} target="_blank" rel="noreferrer">
          Diziet rotationtools
        </a>
      </div>
      <div className="sequence-chips" aria-label={`${preset.name} sequence`}>
        {ideal.map((event) => (
          <span className="sequence-chip" key={`${event.index}-${event.token}`}>
            {event.label}
          </span>
        ))}
      </div>
      <dl className="panel-details">
        <div>
          <dt>Ideal pattern</dt>
          <dd>{preset.pattern}</dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>{preset.usage}</dd>
        </div>
      </dl>
    </section>
  );
}
