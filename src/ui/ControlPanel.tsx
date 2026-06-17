import { TIMING } from "../data/constants";
import { ROTATION_PRESETS } from "../data/rotations";
import type { ScoreResult, TimingMetrics } from "../sim/types";

interface ControlPanelProps {
  selectedPresetId: string;
  score: ScoreResult;
  timingMetrics: TimingMetrics;
  running: boolean;
  onPresetChange: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
}

function formatMetricMs(value: number | null): string {
  return value === null ? "--ms" : `${Math.round(value)}ms`;
}

export function ControlPanel({
  selectedPresetId,
  score,
  timingMetrics,
  running,
  onPresetChange,
  onStart,
  onStop,
}: ControlPanelProps) {
  const latestMistake = score.mistakes.at(-1);

  return (
    <section className="panel" aria-labelledby="control-panel-title">
      <div className="panel-header">
        <h2 id="control-panel-title">Session</h2>
        <span className={running ? "status-pill is-running" : "status-pill"}>{running ? "Running" : "Stopped"}</span>
      </div>

      <label className="field">
        <span>Rotation</span>
        <select aria-label="Rotation" value={selectedPresetId} onChange={(event) => onPresetChange(event.target.value)}>
          {ROTATION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>

      <div className="metric-grid">
        <div className="metric">
          <span>Auto delay</span>
          <strong>{formatMetricMs(timingMetrics.autoDelayAverageMs)}</strong>
        </div>
        <div className="metric">
          <span>Weave time</span>
          <strong>{formatMetricMs(timingMetrics.weaveAverageMs)}</strong>
        </div>
        <div className="metric">
          <span>Queue window</span>
          <strong>{TIMING.spellQueueWindowMs}ms</strong>
        </div>
      </div>

      <div className="latest-mistake">
        <span>Latest mistake</span>
        <strong>{latestMistake ? latestMistake.label : "No mistakes recorded"}</strong>
      </div>

      <div className="button-row">
        <button type="button" onClick={onStart} disabled={running}>
          Start
        </button>
        <button type="button" onClick={onStop} disabled={!running}>
          Stop
        </button>
      </div>
    </section>
  );
}
