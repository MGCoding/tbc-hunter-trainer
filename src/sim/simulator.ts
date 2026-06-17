import { TIMING } from "../data/constants";
import { getAbilityTiming } from "./abilities";
import { SessionLog } from "./sessionLog";
import type { AbilityId, RotationPreset, SimEvent, SimulatorState } from "./types";

const GCD_ABILITIES = new Set<AbilityId>(["steadyShot", "multiShot", "arcaneShot"]);
const RANGED_ATTACK_ABILITIES = new Set<AbilityId>(["steadyShot", "multiShot", "arcaneShot"]);

export function createSimulator(preset: RotationPreset): Simulator {
  return new Simulator(preset);
}

export class Simulator {
  private readonly log = new SessionLog();
  private state: SimulatorState;
  private readonly cooldownReadyAtMs: Partial<Record<AbilityId, number>> = {};
  private autoWindupLoggedForAutoAtMs: number | null = null;

  constructor(private readonly preset: RotationPreset) {
    this.state = {
      nowMs: 0,
      gcdReadyAtMs: 0,
      nextAutoAtMs: preset.targetRangedSwingMs,
      nextMeleeAtMs: preset.derivedMeleeSwingMs,
      raptorReadyAtMs: 0,
      activeCast: null,
      queuedAbility: null,
      autoPaused: false,
      autoRangeBlocked: false,
    };
  }

  getState(): SimulatorState {
    return {
      ...this.state,
      activeCast: this.state.activeCast ? { ...this.state.activeCast } : null,
      abilityReadyAtMs: { ...this.cooldownReadyAtMs },
    };
  }

  getLog(): SimEvent[] {
    return this.log.all();
  }

  resetLog(): void {
    this.log.reset();
  }

  getAbilityReadyAtMs(ability: AbilityId): number {
    return this.cooldownReadyAtMs[ability] ?? 0;
  }

  recordInvalidInput(ability: AbilityId, atMs: number, reason: string): void {
    this.tick(atMs);
    this.log.add({ type: "ability-press", atMs, ability });
    this.log.add({ type: "invalid-input", atMs, ability, reason });
  }

  setAutoShotRangeAllowed(isAllowed: boolean, atMs: number): void {
    if (!isAllowed) {
      this.state.autoRangeBlocked = true;
      this.tick(atMs);
      return;
    }

    if (this.state.autoRangeBlocked) {
      const sparkAtMs = this.state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs;
      if (!this.state.autoPaused && atMs >= sparkAtMs) {
        this.rescheduleNextAuto(atMs + TIMING.autoWindupMs / this.preset.hasteFactor);
      }
    }

    this.state.autoRangeBlocked = false;
    this.tick(atMs);
  }

  pressAbility(ability: AbilityId, atMs: number): void {
    this.tick(atMs);
    this.log.add({ type: "ability-press", atMs, ability });

    if (ability === "autoShot") {
      this.resumeAutoShot(atMs);
      return;
    }

    if (ability === "killCommand" && this.state.activeCast?.ability === "steadyShot") {
      this.log.add({ type: "invalid-input", atMs, ability, reason: "kill-command-during-steady" });
      return;
    }

    if (ability === "raptorStrike") {
      this.resolveMeleeAction(atMs);
      return;
    }

    if (atMs < this.getAbilityReadyAtMs(ability)) {
      this.log.add({ type: "invalid-input", atMs, ability, reason: "cooldown-locked" });
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

    if (RANGED_ATTACK_ABILITIES.has(ability)) {
      this.resumeAutoShot(atMs);
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

  private resolveMeleeAction(atMs: number): void {
    if (atMs < this.state.nextMeleeAtMs) {
      this.log.add({ type: "invalid-input", atMs, ability: "raptorStrike", reason: "melee-action-not-ready" });
      return;
    }

    if (atMs >= this.state.raptorReadyAtMs) {
      const timing = getAbilityTiming("raptorStrike", this.preset);
      this.pauseAutoShot(atMs);
      this.startCast("raptorStrike", atMs);
      this.state.raptorReadyAtMs = atMs + timing.cooldownMs;
      this.state.nextMeleeAtMs = atMs + this.preset.derivedMeleeSwingMs;
      return;
    }

    this.startCast("meleeSwing", atMs);
    this.state.nextMeleeAtMs = atMs + this.preset.derivedMeleeSwingMs;
  }

  private startCast(ability: AbilityId, atMs: number): void {
    const timing = getAbilityTiming(ability, this.preset);
    const completesAtMs = atMs + timing.castMs;
    this.log.add({ type: "cast-start", atMs, ability });

    if (timing.cooldownMs > 0 && ability !== "raptorStrike" && ability !== "meleeSwing") {
      this.cooldownReadyAtMs[ability] = atMs + timing.cooldownMs;
    }

    if (timing.usesGcd) {
      this.state.gcdReadyAtMs = atMs + TIMING.gcdMs;
    }

    if (timing.castMs === 0) {
      this.log.add({ type: "cast-complete", atMs, ability });
      return;
    }

    this.state.activeCast = { ability, startedAtMs: atMs, completesAtMs };
  }

  private pauseAutoShot(atMs: number): void {
    if (this.state.autoPaused) {
      return;
    }

    this.state.autoPaused = true;
    this.log.add({ type: "auto-paused", atMs, ability: "autoShot" });
  }

  private resumeAutoShot(atMs: number): void {
    if (!this.state.autoPaused) {
      return;
    }

    const sparkAtMs = this.state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs;
    if (atMs >= sparkAtMs) {
      this.rescheduleNextAuto(atMs + TIMING.autoWindupMs / this.preset.hasteFactor);
    }

    this.state.autoPaused = false;
    this.log.add({ type: "auto-resumed", atMs, ability: "autoShot" });
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
    if (this.state.autoPaused || this.state.autoRangeBlocked) {
      return;
    }

    this.emitAutoWindupIfDue(toMs);

    while (toMs >= this.state.nextAutoAtMs) {
      const currentAutoAtMs = this.state.nextAutoAtMs;
      const sparkAt = currentAutoAtMs - TIMING.noMoveNoCastLeadMs;
      const active = this.state.activeCast;
      const activeCastBlocksAuto =
        active !== null && active.startedAtMs <= sparkAt && active.completesAtMs > sparkAt;

      this.emitAutoWindupIfDue(currentAutoAtMs);

      if (activeCastBlocksAuto) {
        this.log.add({
          type: "auto-clipped",
          atMs: currentAutoAtMs,
          ability: "autoShot",
          reason: "casting-at-spark",
        });
        this.rescheduleNextAuto(this.state.nextAutoAtMs + active.completesAtMs - sparkAt);
      } else {
        this.log.add({ type: "auto-fire", atMs: currentAutoAtMs, ability: "autoShot" });
        this.rescheduleNextAuto(this.state.nextAutoAtMs + this.preset.targetRangedSwingMs);
      }

      if (this.state.nextAutoAtMs <= currentAutoAtMs) {
        this.rescheduleNextAuto(currentAutoAtMs + this.preset.targetRangedSwingMs);
      }
    }
  }

  private getAutoWindupAtMs(autoAtMs: number): number {
    return autoAtMs - TIMING.autoWindupMs / this.preset.hasteFactor;
  }

  private emitAutoWindupIfDue(toMs: number): void {
    if (this.state.autoPaused || this.state.autoRangeBlocked) {
      return;
    }

    const autoAtMs = this.state.nextAutoAtMs;
    const windupAtMs = this.getAutoWindupAtMs(autoAtMs);
    if (toMs < windupAtMs || this.autoWindupLoggedForAutoAtMs === autoAtMs) {
      return;
    }

    this.log.add({ type: "auto-windup", atMs: windupAtMs, ability: "autoShot" });
    this.autoWindupLoggedForAutoAtMs = autoAtMs;
  }

  private rescheduleNextAuto(nextAutoAtMs: number): void {
    if (this.state.nextAutoAtMs !== nextAutoAtMs) {
      this.autoWindupLoggedForAutoAtMs = null;
    }

    this.state.nextAutoAtMs = nextAutoAtMs;
  }
}
