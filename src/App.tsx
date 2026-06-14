import { useMemo, useState } from "react";

import { getRotationPreset } from "./data/rotations";
import { scoreEvents } from "./sim/scoring";
import { expandRotationPattern } from "./sim/timeline";
import type { SimEvent } from "./sim/types";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";

const DEFAULT_PRESET_ID = "french-weaving-5511-3w";

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);

  const preset = useMemo(() => getRotationPreset(selectedPresetId), [selectedPresetId]);
  const ideal = useMemo(() => expandRotationPattern(preset), [preset]);
  const score = useMemo(() => scoreEvents(ideal, events), [events, ideal]);

  function handlePresetChange(id: string): void {
    setRunning(false);
    setSelectedPresetId(id);
    setEvents([]);
  }

  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <div className="stage-title">
          <h1>Melee Weaving Trainer</h1>
          <p>Practice field loads in Task 9</p>
        </div>
      </section>
      <aside className="side-panels" aria-label="Trainer controls">
        <ControlPanel
          selectedPresetId={selectedPresetId}
          score={score}
          running={running}
          onPresetChange={handlePresetChange}
          onStart={() => setRunning(true)}
          onStop={() => setRunning(false)}
        />
        <ReferencePanel preset={preset} />
        <EventLogPanel events={events} onReset={() => setEvents([])} />
      </aside>
    </main>
  );
}
