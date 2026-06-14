import { useCallback, useMemo, useRef, useState } from "react";

import { getRotationPreset } from "./data/rotations";
import { PhaserHost } from "./game/PhaserHost";
import { scoreEvents } from "./sim/scoring";
import { createSimulator } from "./sim/simulator";
import { expandRotationPattern } from "./sim/timeline";
import type { Simulator } from "./sim/simulator";
import type { AbilityActionId, ScoreResult, SimEvent } from "./sim/types";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";

const DEFAULT_PRESET_ID = "french-weaving-5511-3w";

export function getSessionElapsedMs(nowMs: number, sessionStartedAtMs: number): number {
  return nowMs - sessionStartedAtMs;
}

export function tickSimulatorToSessionNow(simulator: Simulator, nowMs: number, sessionStartedAtMs: number): void {
  simulator.tick(getSessionElapsedMs(nowMs, sessionStartedAtMs));
}

export function clearSimulatorLogAtSessionNow(simulator: Simulator, nowMs: number, sessionStartedAtMs: number): void {
  tickSimulatorToSessionNow(simulator, nowMs, sessionStartedAtMs);
  simulator.resetLog();
}

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);

  const preset = useMemo(() => getRotationPreset(selectedPresetId), [selectedPresetId]);
  const simulatorRef = useRef<Simulator | null>(null);
  const sessionStartedAtRef = useRef(0);
  if (simulatorRef.current === null) {
    simulatorRef.current = createSimulator(preset);
  }
  function getSimulator(): Simulator {
    if (simulatorRef.current === null) {
      throw new Error("Simulator is not initialized");
    }
    return simulatorRef.current;
  }

  const ideal = useMemo(() => expandRotationPattern(preset), [preset]);
  const score = useMemo<ScoreResult>(() => {
    if (events.length === 0) {
      return { efficiency: 100, mistakes: [], nextExpected: ideal[0] ?? null };
    }
    return scoreEvents(ideal, events);
  }, [events, ideal]);
  const getSimulatorState = useCallback(() => getSimulator().getState(), []);

  function handlePresetChange(id: string): void {
    simulatorRef.current = createSimulator(getRotationPreset(id));
    setRunning(false);
    setSelectedPresetId(id);
    setEvents([]);
  }

  function handleStop(): void {
    if (running) {
      tickSimulatorToSessionNow(getSimulator(), performance.now(), sessionStartedAtRef.current);
    }

    setRunning(false);
    setEvents(getSimulator().getLog());
  }

  function handleStart(): void {
    simulatorRef.current = createSimulator(preset);
    sessionStartedAtRef.current = performance.now();
    setEvents([]);
    setRunning(true);
  }

  const handleAbilityPress = useCallback(
    (action: AbilityActionId): void => {
      if (!running) {
        return;
      }

      const simulator = getSimulator();
      simulator.pressAbility(action, getSessionElapsedMs(performance.now(), sessionStartedAtRef.current));
      setEvents(simulator.getLog());
    },
    [running],
  );

  function handleResetLog(): void {
    if (running) {
      clearSimulatorLogAtSessionNow(getSimulator(), performance.now(), sessionStartedAtRef.current);
    } else {
      getSimulator().resetLog();
    }

    setEvents([]);
  }

  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <PhaserHost preset={preset} getSimulatorState={getSimulatorState} onAbilityPress={handleAbilityPress} />
      </section>
      <aside className="side-panels" aria-label="Trainer controls">
        <ControlPanel
          selectedPresetId={selectedPresetId}
          score={score}
          running={running}
          onPresetChange={handlePresetChange}
          onStart={handleStart}
          onStop={handleStop}
        />
        <ReferencePanel preset={preset} />
        <EventLogPanel events={events} onReset={handleResetLog} />
      </aside>
    </main>
  );
}
