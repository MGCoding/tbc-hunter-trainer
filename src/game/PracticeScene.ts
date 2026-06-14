import Phaser from "phaser";

import { MOVEMENT, TIMING } from "../data/constants";
import type { RotationPreset, SimulatorState } from "../sim/types";

export interface PracticeSceneData {
  preset: RotationPreset;
  getSimulatorState: () => SimulatorState;
}

const YARD_PX = 34;
const GRID_YARDS = 5;
const TARGET_YARDS = MOVEMENT.startingDistanceYards;
const PLAYER_RADIUS = 14;
const TARGET_RADIUS = 18;
const BAR_WIDTH = 260;
const BAR_HEIGHT = 14;
const BAR_GAP = 8;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function remainingProgress(nowMs: number, nextAtMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }

  return clamp01(1 - Math.max(0, nextAtMs - nowMs) / durationMs);
}

export class PracticeScene extends Phaser.Scene {
  private preset!: RotationPreset;
  private getSimulatorState!: () => SimulatorState;
  private field!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private castLabel!: Phaser.GameObjects.Text;

  constructor() {
    super("PracticeScene");
  }

  init(data: PracticeSceneData): void {
    this.preset = data.preset;
    this.getSimulatorState = data.getSimulatorState;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#151719");
    this.cameras.main.centerOn(0, 0);

    this.field = this.add.graphics();
    this.hud = this.add.graphics();
    this.hud.setScrollFactor(0);
    this.castLabel = this.add
      .text(0, 0, "", {
        color: "#f4f2ed",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "11px",
        fontStyle: "700",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.drawField();
  }

  update(): void {
    this.cameras.main.centerOn(0, 0);
    this.drawHud(this.getSimulatorState());
  }

  shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    this.cameras.main.centerOn(0, 0);
    this.drawField();
  }

  private drawField(): void {
    const camera = this.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const halfW = width / 2;
    const halfH = height / 2;
    const targetY = -TARGET_YARDS * YARD_PX;

    this.field.clear();

    this.field.lineStyle(1, 0xf4f2ed, 0.08);
    for (let x = -halfW; x <= halfW; x += GRID_YARDS * YARD_PX) {
      this.field.lineBetween(x, -halfH, x, halfH);
    }
    for (let y = -halfH; y <= halfH; y += GRID_YARDS * YARD_PX) {
      this.field.lineBetween(-halfW, y, halfW, y);
    }

    this.field.lineStyle(2, 0xd7a84a, 0.55);
    this.field.strokeCircle(0, 0, MOVEMENT.meleeRangeYards * YARD_PX);

    this.field.lineStyle(2, 0x7e9dbc, 0.34);
    this.field.strokeCircle(0, 0, MOVEMENT.maximumRangedRangeYards * YARD_PX);

    this.field.lineStyle(2, 0x9ba6ae, 0.28);
    this.field.strokeCircle(0, 0, MOVEMENT.minimumRangedRangeYards * YARD_PX);

    this.field.lineStyle(2, 0xf4f2ed, 0.24);
    this.field.lineBetween(0, 0, 0, targetY);

    this.field.fillStyle(0x27323b, 1);
    this.field.fillCircle(0, targetY, TARGET_RADIUS);
    this.field.lineStyle(2, 0xd9664f, 0.9);
    this.field.strokeCircle(0, targetY, TARGET_RADIUS);
    this.field.lineStyle(2, 0xd9664f, 0.45);
    this.field.lineBetween(-TARGET_RADIUS - 8, targetY, TARGET_RADIUS + 8, targetY);
    this.field.lineBetween(0, targetY - TARGET_RADIUS - 8, 0, targetY + TARGET_RADIUS + 8);

    this.field.fillStyle(0xd7a84a, 1);
    this.field.fillCircle(0, 0, PLAYER_RADIUS);
    this.field.lineStyle(3, 0xf4f2ed, 0.82);
    this.field.strokeCircle(0, 0, PLAYER_RADIUS);
    this.field.fillStyle(0x151719, 0.86);
    this.field.fillTriangle(0, -PLAYER_RADIUS - 12, -7, -PLAYER_RADIUS + 2, 7, -PLAYER_RADIUS + 2);
  }

  private drawHud(state: SimulatorState): void {
    const camera = this.cameras.main;
    const left = camera.width / 2 - BAR_WIDTH / 2;
    const top = camera.height / 2 + 82;

    this.hud.clear();

    const activeCast = state.activeCast;
    const castDuration = activeCast ? activeCast.completesAtMs - activeCast.startedAtMs : 1;
    const castProgress = activeCast ? clamp01((state.nowMs - activeCast.startedAtMs) / castDuration) : 0;
    this.drawBar(left, top, BAR_WIDTH, BAR_HEIGHT + 4, castProgress, 0xd7a84a, 0.95);

    this.castLabel.setPosition(camera.width / 2, top + (BAR_HEIGHT + 4) / 2 - 1);
    this.castLabel.setText(activeCast ? activeCast.ability : "");

    const meleeTop = top + BAR_HEIGHT + BAR_GAP + 4;
    const meleeProgress = remainingProgress(state.nowMs, state.nextMeleeAtMs, this.preset.derivedMeleeSwingMs);
    this.drawBar(left, meleeTop, BAR_WIDTH, BAR_HEIGHT, meleeProgress, 0xd9664f, 0.88);

    const rangedTop = meleeTop + BAR_HEIGHT + BAR_GAP;
    const rangedProgress = remainingProgress(state.nowMs, state.nextAutoAtMs, this.preset.targetRangedSwingMs);
    this.drawBar(left, rangedTop, BAR_WIDTH, BAR_HEIGHT, rangedProgress, 0x7e9dbc, 0.92);
    this.drawRangedSparks(left, rangedTop, state);
  }

  private drawBar(x: number, y: number, width: number, height: number, progress: number, color: number, alpha: number): void {
    this.hud.fillStyle(0x080b0e, 0.72);
    this.hud.fillRoundedRect(x, y, width, height, 4);
    this.hud.fillStyle(color, alpha);
    this.hud.fillRoundedRect(x + 2, y + 2, Math.max(0, width - 4) * progress, height - 4, 3);
    this.hud.lineStyle(1, 0xf4f2ed, 0.2);
    this.hud.strokeRoundedRect(x, y, width, height, 4);
  }

  private drawRangedSparks(x: number, y: number, state: SimulatorState): void {
    const nowMs = state.nowMs;
    const cycleStartMs = state.nextAutoAtMs - this.preset.targetRangedSwingMs;
    const sparkTimes = [
      { atMs: state.nextAutoAtMs - TIMING.noMoveNoCastLeadMs, color: 0xf5df9f, alpha: 0.95 },
      { atMs: state.gcdReadyAtMs, color: 0xf4f2ed, alpha: 0.72 },
    ];

    if (state.activeCast?.ability === "steadyShot") {
      sparkTimes.push({ atMs: state.activeCast.completesAtMs, color: 0x7fd1a8, alpha: 0.92 });
    }

    for (const spark of sparkTimes) {
      if (spark.atMs < cycleStartMs || spark.atMs > state.nextAutoAtMs) {
        continue;
      }

      const progress = clamp01((spark.atMs - cycleStartMs) / this.preset.targetRangedSwingMs);
      const sparkX = x + progress * BAR_WIDTH;
      const isPassed = spark.atMs <= nowMs;

      this.hud.lineStyle(2, spark.color, isPassed ? spark.alpha * 0.55 : spark.alpha);
      this.hud.lineBetween(sparkX, y - 3, sparkX, y + BAR_HEIGHT + 3);
    }
  }
}
