import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_KEYBINDS } from "./data/constants";
import { playAttackSoundsForEvents, preloadAttackSounds } from "./audio/attackSounds";
import { playSuccessChime } from "./audio/successChime";
import { getRotationPreset } from "./data/rotations";
import { PhaserHost } from "./game/PhaserHost";
import {
  getEffectiveRenderScale,
  loadStoredRenderScalePreference,
  saveStoredRenderScalePreference,
  type RenderScalePreference,
} from "./game/renderScale";
import { getAbilityTiming } from "./sim/abilities";
import { createInitialPosition, getRangeState, updateMovement } from "./sim/movement";
import { scoreEvents } from "./sim/scoring";
import { createSimulator } from "./sim/simulator";
import { getTimingMetrics } from "./sim/timingMetrics";
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
import {
  clearStoredKeybindings,
  createKeybindingMap,
  formatKeyBinding,
  loadStoredKeybindings,
  rebindAction,
  saveStoredKeybindings,
  type KeybindingMap,
} from "./input/keybindings";
import { ControlPanel } from "./ui/ControlPanel";
import { EventLogPanel } from "./ui/EventLogPanel";
import { ReferencePanel } from "./ui/ReferencePanel";
import { WalkthroughTour } from "./ui/WalkthroughTour";

const DEFAULT_PRESET_ID = "french-weaving-5511-3w";
const EMPTY_MOVEMENT_KEYS: MovementKeys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

function hasActiveMovement(keys: MovementKeys): boolean {
  return keys.forward || keys.backward || keys.left || keys.right;
}

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
  const [keybindings, setKeybindings] = useState<KeybindingMap>(() => loadStoredKeybindings(DEFAULT_KEYBINDS));
  const [renderScalePreference, setRenderScalePreference] = useState<RenderScalePreference>(() =>
    loadStoredRenderScalePreference(),
  );
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : getEffectiveRenderScale("auto", window.devicePixelRatio),
  );
  const [captureAction, setCaptureAction] = useState<ActionId | null>(null);
  const [macroKillCommandIntoRaptorStrike, setMacroKillCommandIntoRaptorStrike] = useState(true);

  const preset = useMemo(() => getRotationPreset(selectedPresetId), [selectedPresetId]);
  const simulatorRef = useRef<Simulator | null>(null);
  const sessionStartedAtRef = useRef(0);
  const runningRef = useRef(false);
  const positionRef = useRef<PracticePosition>(createInitialPosition());
  const movementKeysRef = useRef<MovementKeys>({ ...EMPTY_MOVEMENT_KEYS });
  const movementUpdatedAtMsRef = useRef(0);
  const keybindingsRef = useRef<KeybindingMap>(keybindings);
  const macroKillCommandIntoRaptorStrikeRef = useRef(macroKillCommandIntoRaptorStrike);
  const perfectPressKeysRef = useRef<Set<string>>(new Set());
  const processedAttackSoundEventsRef = useRef<Map<string, number>>(new Map());
  const publishedSimulatorLogSignatureRef = useRef("");
  runningRef.current = running;
  keybindingsRef.current = keybindings;
  macroKillCommandIntoRaptorStrikeRef.current = macroKillCommandIntoRaptorStrike;

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
  const timingMetrics = useMemo(() => getTimingMetrics(events), [events]);

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

  function syncAutoShotMovementToElapsed(elapsedMs: number, keys = movementKeysRef.current): void {
    if (runningRef.current) {
      getSimulator().setAutoShotMovementAllowed(!hasActiveMovement(keys), elapsedMs);
    }
  }

  function syncLiveStateToNow(nowMs: number): { elapsedMs: number; range: RangeState } {
    const elapsedMs = syncMovementToNow(nowMs);
    syncAutoShotMovementToElapsed(elapsedMs);
    const range = syncAutoShotRangeToElapsed(elapsedMs);
    return { elapsedMs, range };
  }

  function getAttackSoundEventSignature(event: SimEvent): string {
    return JSON.stringify([event.type, event.atMs, event.ability ?? null, event.reason ?? null, event.detail ?? null]);
  }

  function getSimulatorLogEventSignature(event: SimEvent): string {
    return JSON.stringify([
      event.type,
      event.atMs,
      event.ability ?? null,
      event.reason ?? null,
      event.detail ?? null,
      event.delayMs ?? null,
      event.originalAtMs ?? null,
      event.rescheduledAtMs ?? null,
    ]);
  }

  function getSimulatorLogSignature(log: SimEvent[]): string {
    const lastEvent = log.at(-1);
    return `${log.length}:${lastEvent ? getSimulatorLogEventSignature(lastEvent) : "empty"}`;
  }

  function markSimulatorLogPublished(log: SimEvent[]): void {
    publishedSimulatorLogSignatureRef.current = getSimulatorLogSignature(log);
  }

  function publishSimulatorLogIfChanged(log = getSimulator().getLog()): void {
    const signature = getSimulatorLogSignature(log);
    if (signature === publishedSimulatorLogSignatureRef.current) {
      return;
    }

    publishedSimulatorLogSignatureRef.current = signature;
    setEvents(log);
  }

  function resetProcessedAttackSoundEvents(): void {
    processedAttackSoundEventsRef.current = new Map();
  }

  function playNewAttackSoundEvents(): void {
    const log = getSimulator().getLog();
    const processedEvents = processedAttackSoundEventsRef.current;
    const scannedEvents = new Map<string, number>();
    const newEvents: SimEvent[] = [];

    for (const event of log) {
      const signature = getAttackSoundEventSignature(event);
      const occurrenceCount = (scannedEvents.get(signature) ?? 0) + 1;
      scannedEvents.set(signature, occurrenceCount);

      if (occurrenceCount > (processedEvents.get(signature) ?? 0)) {
        newEvents.push(event);
      }
    }

    processedAttackSoundEventsRef.current = scannedEvents;

    if (newEvents.length > 0) {
      playAttackSoundsForEvents(newEvents);
    }
  }

  useEffect(() => {
    preloadAttackSounds();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function syncDevicePixelRatio(): void {
      setDevicePixelRatio(getEffectiveRenderScale("auto", window.devicePixelRatio));
    }

    syncDevicePixelRatio();
    window.addEventListener("resize", syncDevicePixelRatio);

    return () => {
      window.removeEventListener("resize", syncDevicePixelRatio);
    };
  }, []);

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
    const log = simulator.getLog();
    const metrics = getTimingMetrics(log);
    playNewAttackSoundEvents();
    publishSimulatorLogIfChanged(log);

    return {
      simulator: simulatorState,
      position: {
        player: { ...positionRef.current.player },
        target: { ...positionRef.current.target },
      },
      range,
      metrics,
    };
  }, []);

  const getKeybindings = useCallback(() => keybindingsRef.current, []);

  function handlePresetChange(id: string): void {
    simulatorRef.current = createSimulator(getRotationPreset(id));
    resetProcessedAttackSoundEvents();
    positionRef.current = createInitialPosition();
    movementKeysRef.current = { ...EMPTY_MOVEMENT_KEYS };
    movementUpdatedAtMsRef.current = 0;
    perfectPressKeysRef.current.clear();
    setRunning(false);
    setSelectedPresetId(id);
    markSimulatorLogPublished([]);
    setEvents([]);
  }

  function handleRenderScalePreferenceChange(preference: RenderScalePreference): void {
    setRenderScalePreference(preference);
    saveStoredRenderScalePreference(preference);
  }

  function handleStop(): void {
    if (running) {
      const nowMs = performance.now();
      syncLiveStateToNow(nowMs);
      tickSimulatorToSessionNow(getSimulator(), nowMs, sessionStartedAtRef.current);
      playNewAttackSoundEvents();
    }

    setRunning(false);
    publishSimulatorLogIfChanged();
  }

  function handleStart(): void {
    simulatorRef.current = createSimulator(preset);
    resetProcessedAttackSoundEvents();
    positionRef.current = createInitialPosition();
    movementKeysRef.current = { ...EMPTY_MOVEMENT_KEYS };
    movementUpdatedAtMsRef.current = 0;
    perfectPressKeysRef.current.clear();
    sessionStartedAtRef.current = performance.now();
    markSimulatorLogPublished([]);
    setEvents([]);
    setRunning(true);
  }

  const handleMovementChange = useCallback((keys: MovementKeys): void => {
    const nowMs = performance.now();
    const elapsedMs = syncMovementToNow(nowMs);
    movementKeysRef.current = keys;
    syncAutoShotMovementToElapsed(elapsedMs, keys);
    syncAutoShotRangeToElapsed(elapsedMs);
    playNewAttackSoundEvents();
    publishSimulatorLogIfChanged();
  }, []);

  const handleAbilityPress = useCallback(
    (action: AbilityActionId): void => {
      if (!runningRef.current) {
        return;
      }

      const { elapsedMs: atMs, range } = syncLiveStateToNow(performance.now());
      const simulator = getSimulator();
      const actionsToPress: AbilityActionId[] =
        action === "raptorStrike" && macroKillCommandIntoRaptorStrikeRef.current
          ? ["killCommand", "raptorStrike"]
          : [action];

      for (const actionToPress of actionsToPress) {
        const timing = getAbilityTiming(actionToPress, preset);
        if ((timing.requiresMelee && !range.canMelee) || (timing.requiresRanged && !range.canUseRanged)) {
          simulator.recordInvalidInput(actionToPress, atMs, "out-of-range");
          continue;
        }

        const perfectPress = findPerfectPress(ideal, actionToPress, atMs);
        const perfectPressKey = perfectPress ? describePerfectPressKey(perfectPress) : null;
        const logLengthBeforePress = simulator.getLog().length;
        simulator.pressAbility(actionToPress, atMs);
        const newLogEntries = simulator.getLog().slice(logLengthBeforePress);
        const inputWasInvalid = newLogEntries.some((event) => event.type === "invalid-input" && event.atMs === atMs);
        if (perfectPressKey !== null && !inputWasInvalid && !perfectPressKeysRef.current.has(perfectPressKey)) {
          perfectPressKeysRef.current.add(perfectPressKey);
          playSuccessChime();
        }
      }

      playNewAttackSoundEvents();
      publishSimulatorLogIfChanged(simulator.getLog());
    },
    [ideal, preset],
  );

  function handleResetLog(): void {
    if (running) {
      const nowMs = performance.now();
      syncLiveStateToNow(nowMs);
      playNewAttackSoundEvents();
      clearSimulatorLogAtSessionNow(getSimulator(), nowMs, sessionStartedAtRef.current);
      resetProcessedAttackSoundEvents();
    } else {
      getSimulator().resetLog();
      resetProcessedAttackSoundEvents();
    }

    markSimulatorLogPublished([]);
    setEvents([]);
  }

  function applyBinding(action: ActionId, binding: KeyBinding): void {
    setKeybindings((current) => {
      const nextBindings = rebindAction(current, action, binding, true);
      saveStoredKeybindings(nextBindings);
      return nextBindings;
    });
    setCaptureAction(null);
  }

  function handleResetKeybindings(): void {
    clearStoredKeybindings();
    setKeybindings(createKeybindingMap(DEFAULT_KEYBINDS));
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
      <section className="practice-stage" aria-label="Practice field" data-tour-target="practice-hud">
        <PhaserHost
          preset={preset}
          ideal={ideal}
          renderScalePreference={renderScalePreference}
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
          timingMetrics={timingMetrics}
          running={running}
          renderScalePreference={renderScalePreference}
          devicePixelRatio={devicePixelRatio}
          onPresetChange={handlePresetChange}
          onRenderScalePreferenceChange={handleRenderScalePreferenceChange}
          onStart={handleStart}
          onStop={handleStop}
        />
        <section
          className="panel"
          aria-labelledby="keybindings-panel-title"
          role="region"
          data-tour-target="keybindings"
        >
          <div className="panel-header">
            <h2 id="keybindings-panel-title">Keybindings</h2>
            {captureAction ? <span className="status-pill is-running">Listening</span> : null}
          </div>
          <button
            type="button"
            className="secondary-button keybinding-reset-button"
            aria-label="Reset keybindings to default"
            onClick={handleResetKeybindings}
          >
            Reset to Default
          </button>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={macroKillCommandIntoRaptorStrike}
              onChange={(event) => setMacroKillCommandIntoRaptorStrike(event.currentTarget.checked)}
            />
            <span>Macro Kill Command into Raptor Strike</span>
          </label>
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
      <WalkthroughTour />
    </main>
  );
}
