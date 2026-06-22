import { TIMING } from "../data/constants";
import { ROTATION_PRESETS } from "../data/rotations";
import {
  RENDER_SCALE_OPTIONS,
  formatRenderScaleOptionLabel,
  getEffectiveRenderScale,
  parseRenderScalePreference,
  type RenderScalePreference,
} from "../game/renderScale";
import type { ScoreResult, TimingMetrics } from "../sim/types";

interface ControlPanelProps {
  selectedPresetId: string;
  score: ScoreResult;
  timingMetrics: TimingMetrics;
  running: boolean;
  renderScalePreference: RenderScalePreference;
  devicePixelRatio: number;
  onPresetChange: (id: string) => void;
  onRenderScalePreferenceChange: (preference: RenderScalePreference) => void;
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
  renderScalePreference,
  devicePixelRatio,
  onPresetChange,
  onRenderScalePreferenceChange,
  onStart,
  onStop,
}: ControlPanelProps) {
  const effectiveAutoScale = getEffectiveRenderScale("auto", devicePixelRatio);

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

      <label className="field">
        <span>Render Scale</span>
        <select
          aria-label="Render Scale"
          value={String(renderScalePreference)}
          onChange={(event) => {
            const nextPreference = parseRenderScalePreference(
              event.target.value === "auto" ? "auto" : Number(event.target.value),
            );
            if (nextPreference !== null) {
              onRenderScalePreferenceChange(nextPreference);
            }
          }}
        >
          {RENDER_SCALE_OPTIONS.map((option) => (
            <option key={String(option)} value={String(option)}>
              {formatRenderScaleOptionLabel(option, effectiveAutoScale)}
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
