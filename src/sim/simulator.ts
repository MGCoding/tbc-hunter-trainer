import { TIMING } from "../data/constants";
import { getAbilityTiming } from "./abilities";
import { SessionLog } from "./sessionLog";
import type { AbilityId, RotationPreset, SimEvent, SimulatorState } from "./types";

const GCD_ABILITIES = new Set<AbilityId>(["steadyShot", "multiShot", "arcaneShot"]);

export function createSimulator(preset: RotationPreset): Simulator {
  return new Simulator(preset);
}

export class Simulator {
  private readonly log = new SessionLog();
  private state: SimulatorState;

  constructor(private readonly preset: RotationPreset) {
    this.state = {
      nowMs: 0,
      gcdReadyAtMs: 0,
      nextAutoAtMs: preset.targetRangedSwingMs,
      nextMeleeAtMs: preset.derivedMeleeSwingMs,
      activeCast: null,
      queuedAbility: null,
    };
  }

  getState(): SimulatorState {
    return {
      ...this.state,
      activeCast: this.state.activeCast ? { ...this.state.activeCast } : null,
    };
  }

  getLog(): SimEvent[] {
    return this.log.all();
  }

  pressAbility(ability: AbilityId, atMs: number): void {
    this.tick(atMs);
    this.log.add({ type: "ability-press", atMs, ability });

    if (ability === "killCommand" && this.state.activeCast?.ability === "steadyShot") {
      this.log.add({ type: "invalid-input", atMs, ability, reason: "kill-command-during-steady" });
      return;
    }

    if (GCD_ABILITIES.has(ability) && atMs < this.state.gcdReadyAtMs) {
      if (this.state.gcdReadyAtMs - atMs <= TIMING.spellQueueWindowMs) {
        this.state.queuedAbility = ability;
        this.log.add({ type: "queued", atMs, ability });
      } else {
        this.log.add({ type: "invalid-input", atMs, ability, reason: "gcd-locked" });
      }
      return;
    }

    this.startCast(ability, atMs);
  }

  tick(toMs: number): void {
    if (toMs < this.state.nowMs) {
      return;
    }

    this.startQueuedAbility(toMs);
    this.processAutoWindow(toMs);
    this.completeActiveCast(toMs);
    this.state.nowMs = toMs;
  }

  private startQueuedAbility(toMs: number): void {
    if (this.state.queuedAbility && toMs >= this.state.gcdReadyAtMs) {
      const queuedAtMs = this.state.gcdReadyAtMs;
      this.completeActiveCast(queuedAtMs);
      if (this.state.activeCast) {
        return;
      }

      const queued = this.state.queuedAbility;
      this.state.queuedAbility = null;
      this.startCast(queued, queuedAtMs);
    }
  }

  private startCast(ability: AbilityId, atMs: number): void {
    const timing = getAbilityTiming(ability, this.preset);
    const completesAtMs = atMs + timing.castMs;
    this.log.add({ type: "cast-start", atMs, ability });

    if (timing.usesGcd) {
      this.state.gcdReadyAtMs = atMs + TIMING.gcdMs;
    }

    if (timing.castMs === 0) {
      this.log.add({ type: "cast-complete", atMs, ability });
      return;
    }

    this.state.activeCast = { ability, startedAtMs: atMs, completesAtMs };
  }

  private completeActiveCast(toMs: number): void {
    const active = this.state.activeCast;
    if (!active || active.completesAtMs > toMs) {
      return;
    }

    this.log.add({ type: "cast-complete", atMs: active.completesAtMs, ability: active.ability });
    this.state.activeCast = null;
  }

  private processAutoWindow(toMs: number): void {
    const sparkAt = this.state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs;
    const active = this.state.activeCast;
    if (active && active.ability === "multiShot" && active.completesAtMs > sparkAt && toMs >= this.state.nextAutoAtMs) {
      this.log.add({
        type: "auto-clipped",
        atMs: this.state.nextAutoAtMs,
        ability: "autoShot",
        reason: "casting-at-spark",
      });
      this.state.nextAutoAtMs += active.completesAtMs - sparkAt;
      return;
    }

    if (toMs >= this.state.nextAutoAtMs) {
      this.log.add({
        type: "auto-windup",
        atMs: this.state.nextAutoAtMs - TIMING.autoWindupMs / this.preset.hasteFactor,
        ability: "autoShot",
      });
      this.log.add({ type: "auto-fire", atMs: this.state.nextAutoAtMs, ability: "autoShot" });
      this.state.nextAutoAtMs += this.preset.targetRangedSwingMs;
    }
  }
}
