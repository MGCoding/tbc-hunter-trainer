import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_KEYBINDS } from "./data/constants";
import { playSuccessChime } from "./audio/successChime";
import { getRotationPreset } from "./data/rotations";
import { PhaserHost } from "./game/PhaserHost";
import { getAbilityTiming } from "./sim/abilities";
import { createInitialPosition, getRangeState, updateMovement } from "./sim/movement";
import { scoreEvents } from "./sim/scoring";
import { createSimulator } from "./sim/simulator";
import { describePerfectPressKey, expandRotationPattern, findPerfectPress } from "./sim/timeline";
import type { Simulator } from "./sim/simulator";
import type {
  AbilityActionId,
  ActionId,
  KeyBinding,
  MovementKeys,
  PracticePosition,
  PracticeState,
  RangeState,
  ScoreResult,
  SimEvent,
  SimulatorState,
} from "./sim/types";
import { formatKeyBinding, rebindAction, type KeybindingMap } from "./input/keybindings";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";

const DEFAULT_PRESET_ID = "french-weaving-5511-3w";
const EMPTY_MOVEMENT_KEYS: MovementKeys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};
const KEYBINDING_ROWS: { action: ActionId; label: string }[] = [
  { action: "moveForward", label: "Move Forward" },
  { action: "moveBackward", label: "Move Backward" },
  { action: "strafeLeft", label: "Strafe Left" },
  { action: "strafeRight", label: "Strafe Right" },
  { action: "arcaneShot", label: "Arcane Shot" },
  { action: "killCommand", label: "Kill Command" },
  { action: "multiShot", label: "Multi-Shot" },
  { action: "steadyShot", label: "Steady Shot" },
  { action: "raptorStrike", label: "Raptor Strike / Melee Swing" },
  { action: "autoShot", label: "Auto Shot" },
];

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

export function readSimulatorStateAtSessionNow(
  simulator: Simulator,
  running: boolean,
  nowMs: number,
  sessionStartedAtMs: number,
): SimulatorState {
  if (running) {
    tickSimulatorToSessionNow(simulator, nowMs, sessionStartedAtMs);
  }

  return simulator.getState();
}

export function App() {
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_PRESET_ID);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [keybindings, setKeybindings] = useState<KeybindingMap>(DEFAULT_KEYBINDS);
  const [captureAction, setCaptureAction] = useState<ActionId | null>(null);

  const preset = useMemo(() => getRotationPreset(selectedPresetId), [selectedPresetId]);
  const simulatorRef = useRef<Simulator | null>(null);
  const sessionStartedAtRef = useRef(0);
  const runningRef = useRef(false);
  const positionRef = useRef<PracticePosition>(createInitialPosition());
  const movementKeysRef = useRef<MovementKeys>({ ...EMPTY_MOVEMENT_KEYS });
  const movementUpdatedAtMsRef = useRef(0);
  const keybindingsRef = useRef<KeybindingMap>(keybindings);
  const lastPerfectPressKeyRef = useRef<string | null>(null);
  runningRef.current = running;
  keybindingsRef.current = keybindings;

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

  function syncMovementToElapsed(elapsedMs: number): void {
    if (!runningRef.current) {
      movementUpdatedAtMsRef.current = elapsedMs;
      return;
    }

    const deltaMs = elapsedMs - movementUpdatedAtMsRef.current;
    if (deltaMs > 0) {
      positionRef.current = updateMovement(positionRef.current, movementKeysRef.current, deltaMs);
    }
    movementUpdatedAtMsRef.current = elapsedMs;
  }

  function syncMovementToNow(nowMs: number): number {
    const elapsedMs = getSessionElapsedMs(nowMs, sessionStartedAtRef.current);
    syncMovementToElapsed(elapsedMs);
    return elapsedMs;
  }

  function syncAutoShotRangeToElapsed(elapsedMs: number): RangeState {
    const range = getRangeState(positionRef.current);
    if (runningRef.current) {
      getSimulator().setAutoShotRangeAllowed(range.canUseRanged, elapsedMs);
    }
    return range;
  }

  function syncLiveStateToNow(nowMs: number): { elapsedMs: number; range: RangeState } {
    const elapsedMs = syncMovementToNow(nowMs);
    const range = syncAutoShotRangeToElapsed(elapsedMs);
    return { elapsedMs, range };
  }

  const getPracticeState = useCallback((): PracticeState => {
    const nowMs = performance.now();
    const { range } = syncLiveStateToNow(nowMs);
    const simulator = getSimulator();
    const simulatorState = readSimulatorStateAtSessionNow(
      simulator,
      runningRef.current,
      nowMs,
      sessionStartedAtRef.current,
    );

    return {
      simulator: simulatorState,
      position: {
        player: { ...positionRef.current.player },
        target: { ...positionRef.current.target },
      },
      range,
    };
  }, []);

  const getKeybindings = useCallback(() => keybindingsRef.current, []);

  function handlePresetChange(id: string): void {
    simulatorRef.current = createSimulator(getRotationPreset(id));
    positionRef.current = createInitialPosition();
    movementKeysRef.current = { ...EMPTY_MOVEMENT_KEYS };
    movementUpdatedAtMsRef.current = 0;
    lastPerfectPressKeyRef.current = null;
    setRunning(false);
    setSelectedPresetId(id);
    setEvents([]);
  }

  function handleStop(): void {
    if (running) {
      const nowMs = performance.now();
      syncLiveStateToNow(nowMs);
      tickSimulatorToSessionNow(getSimulator(), nowMs, sessionStartedAtRef.current);
    }

    setRunning(false);
    setEvents(getSimulator().getLog());
  }

  function handleStart(): void {
    simulatorRef.current = createSimulator(preset);
    positionRef.current = createInitialPosition();
    movementKeysRef.current = { ...EMPTY_MOVEMENT_KEYS };
    movementUpdatedAtMsRef.current = 0;
    lastPerfectPressKeyRef.current = null;
    sessionStartedAtRef.current = performance.now();
    setEvents([]);
    setRunning(true);
  }

  const handleMovementChange = useCallback((keys: MovementKeys): void => {
    if (runningRef.current) {
      syncMovementToNow(performance.now());
    }
    movementKeysRef.current = keys;
  }, []);

  const handleAbilityPress = useCallback(
    (action: AbilityActionId): void => {
      if (!runningRef.current) {
        return;
      }

      const { elapsedMs: atMs, range } = syncLiveStateToNow(performance.now());
      const simulator = getSimulator();
      const timing = getAbilityTiming(action, preset);
      if ((timing.requiresMelee && !range.canMelee) || (timing.requiresRanged && !range.canUseRanged)) {
        simulator.recordInvalidInput(action, atMs, "out-of-range");
        setEvents(simulator.getLog());
        return;
      }

      const perfectPress = findPerfectPress(ideal, action, atMs);
      const perfectPressKey = perfectPress ? describePerfectPressKey(perfectPress) : null;
      const logLengthBeforePress = simulator.getLog().length;
      simulator.pressAbility(action, atMs);
      const newLogEntries = simulator.getLog().slice(logLengthBeforePress);
      const inputWasInvalid = newLogEntries.some((event) => event.type === "invalid-input" && event.atMs === atMs);
      if (perfectPressKey !== null && !inputWasInvalid && lastPerfectPressKeyRef.current !== perfectPressKey) {
        lastPerfectPressKeyRef.current = perfectPressKey;
        playSuccessChime();
      }
      setEvents(simulator.getLog());
    },
    [ideal, preset],
  );

  function handleResetLog(): void {
    if (running) {
      const nowMs = performance.now();
      syncLiveStateToNow(nowMs);
      clearSimulatorLogAtSessionNow(getSimulator(), nowMs, sessionStartedAtRef.current);
    } else {
      getSimulator().resetLog();
    }

    setEvents([]);
  }

  function applyBinding(action: ActionId, binding: KeyBinding): void {
    setKeybindings((current) => rebindAction(current, action, binding, true));
    setCaptureAction(null);
  }

  useEffect(() => {
    if (captureAction === null) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      applyBinding(captureAction, { kind: "keyboard", code: event.code });
    };

    const handleMouseDown = (event: MouseEvent): void => {
      if (event.button < 0 || event.button > 4) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      applyBinding(captureAction, { kind: "mouse", button: event.button });
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [captureAction]);

  return (
    <main className="app-shell">
      <section className="practice-stage" aria-label="Practice field">
        <PhaserHost
          preset={preset}
          ideal={ideal}
          getPracticeState={getPracticeState}
          getKeybindings={getKeybindings}
          onMovementChange={handleMovementChange}
          onAbilityPress={handleAbilityPress}
        />
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
        <section className="panel" aria-labelledby="keybindings-panel-title">
          <div className="panel-header">
            <h2 id="keybindings-panel-title">Keybindings</h2>
            {captureAction ? <span className="status-pill is-running">Listening</span> : null}
          </div>
          <div className="keybinding-list">
            {KEYBINDING_ROWS.map(({ action, label }) => (
              <div className="keybinding-row" key={action}>
                <span>{label}</span>
                <strong>{formatKeyBinding(keybindings[action], "long") || "Unbound"}</strong>
                <button
                  type="button"
                  className="secondary-button"
                  aria-label={`Set ${label}`}
                  onClick={() => setCaptureAction(action)}
                >
                  Set
                </button>
              </div>
            ))}
          </div>
        </section>
        <ReferencePanel preset={preset} />
        <EventLogPanel events={events} onReset={handleResetLog} />
      </aside>
    </main>
  );
}
