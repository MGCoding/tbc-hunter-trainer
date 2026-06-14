import { useCallback, useMemo, useRef, useState } from "react";

import { getRotationPreset } from "./data/rotations";
import { PhaserHost } from "./game/PhaserHost";
import { scoreEvents } from "./sim/scoring";
import { createSimulator } from "./sim/simulator";
import { expandRotationPattern } from "./sim/timeline";
import type { ScoreResult, SimEvent } from "./sim/types";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";

const DEFAULT_PRESET_ID = "french-weaving-5511-3w";

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);

  const preset = useMemo(() => getRotationPreset(selectedPresetId), [selectedPresetId]);
  const simulatorRef = useRef(createSimulator(preset));
  const ideal = useMemo(() => expandRotationPattern(preset), [preset]);
  const score = useMemo<ScoreResult>(() => {
    if (events.length === 0) {
      return { efficiency: 100, mistakes: [], nextExpected: ideal[0] ?? null };
    }
    return scoreEvents(ideal, events);
  }, [events, ideal]);
  const getSimulatorState = useCallback(() => simulatorRef.current.getState(), []);

  function handlePresetChange(id: string): void {
    simulatorRef.current = createSimulator(getRotationPreset(id));
    setRunning(false);
    setSelectedPresetId(id);
    setEvents([]);
  }

  function handleStop(): void {
    setRunning(false);
    setEvents(simulatorRef.current.getLog());
  }

  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <PhaserHost preset={preset} getSimulatorState={getSimulatorState} />
      </section>
      <aside className="side-panels" aria-label="Trainer controls">
        <ControlPanel
          selectedPresetId={selectedPresetId}
          score={score}
          running={running}
          onPresetChange={handlePresetChange}
          onStart={() => setRunning(true)}
          onStop={handleStop}
        />
        <ReferencePanel preset={preset} />
        <EventLogPanel events={events} onReset={() => setEvents([])} />
      </aside>
    </main>
  );
}
