import Phaser from "phaser";

import { MOVEMENT, TIMING } from "../data/constants";
import type { RotationPreset, SimulatorState } from "../sim/types";

export interface PracticeSceneData {
  preset: RotationPreset;
  getSimulatorState: () => SimulatorState;
}

const MAX_YARD_PX = 34;
const GRID_YARDS = 5;
const TARGET_YARDS = MOVEMENT.startingDistanceYards;
const MAX_PLAYER_RADIUS = 14;
const MAX_TARGET_RADIUS = 18;
const MAX_BAR_WIDTH = 260;

interface HudLayout {
  top: number;
  left: number;
  width: number;
  castHeight: number;
  barHeight: number;
  gap: number;
  totalHeight: number;
}

export interface PracticeLayout {
  yardPx: number;
  playerRadius: number;
  targetRadius: number;
  targetY: number;
  maxRangedRingRadius: number;
  hud: HudLayout;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function remainingProgress(nowMs: number, nextAtMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }

  return clamp01(1 - Math.max(0, nextAtMs - nowMs) / durationMs);
}

export function calculatePracticeLayout(width: number, height: number): PracticeLayout {
  const topMargin = height < 260 ? 12 : 16;
  const rangeRingMargin = height < 180 ? 4 : height < 320 ? 8 : 16;
  const targetRadius = clamp(height * 0.044, 10, MAX_TARGET_RADIUS);
  const availableTargetSpace = Math.max(0, height / 2 - targetRadius - topMargin);
  const availableRingRadius = Math.max(0, Math.min(width, height) / 2 - rangeRingMargin);
  const yardPx = Math.min(
    MAX_YARD_PX,
    availableTargetSpace / TARGET_YARDS,
    availableRingRadius / MOVEMENT.maximumRangedRangeYards,
  );
  const playerRadius = clamp(yardPx * 0.42, 9, MAX_PLAYER_RADIUS);
  const compactHud = height < 320 || width < 360;
  const barWidth = Math.min(compactHud ? 220 : MAX_BAR_WIDTH, Math.max(148, width - 40));
  const castHeight = compactHud ? 12 : 18;
  const barHeight = compactHud ? 8 : 14;
  const gap = compactHud ? 4 : 8;
  const totalHeight = castHeight + gap + barHeight + gap + barHeight;
  const bottomMargin = 8;
  const preferredTop = height / 2 + playerRadius + (compactHud ? 20 : 54);
  const top = clamp(preferredTop, bottomMargin, Math.max(bottomMargin, height - bottomMargin - totalHeight));

  return {
    yardPx,
    playerRadius,
    targetRadius,
    targetY: -TARGET_YARDS * yardPx,
    maxRangedRingRadius: MOVEMENT.maximumRangedRangeYards * yardPx,
    hud: {
      top,
      left: width / 2 - barWidth / 2,
      width: barWidth,
      castHeight,
      barHeight,
      gap,
      totalHeight,
    },
  };
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
    const layout = calculatePracticeLayout(width, height);
    const gridStep = GRID_YARDS * layout.yardPx;

    this.field.clear();

    this.field.lineStyle(1, 0xf4f2ed, 0.08);
    for (let x = -halfW; x <= halfW; x += gridStep) {
      this.field.lineBetween(x, -halfH, x, halfH);
    }
    for (let y = -halfH; y <= halfH; y += gridStep) {
      this.field.lineBetween(-halfW, y, halfW, y);
    }

    this.field.lineStyle(2, 0xd7a84a, 0.55);
    this.field.strokeCircle(0, 0, MOVEMENT.meleeRangeYards * layout.yardPx);

    this.field.lineStyle(2, 0x7e9dbc, 0.34);
    this.field.strokeCircle(0, 0, MOVEMENT.maximumRangedRangeYards * layout.yardPx);

    this.field.lineStyle(2, 0x9ba6ae, 0.28);
    this.field.strokeCircle(0, 0, MOVEMENT.minimumRangedRangeYards * layout.yardPx);

    this.field.lineStyle(2, 0xf4f2ed, 0.24);
    this.field.lineBetween(0, 0, 0, layout.targetY);

    this.field.fillStyle(0x27323b, 1);
    this.field.fillCircle(0, layout.targetY, layout.targetRadius);
    this.field.lineStyle(2, 0xd9664f, 0.9);
    this.field.strokeCircle(0, layout.targetY, layout.targetRadius);
    this.field.lineStyle(2, 0xd9664f, 0.45);
    this.field.lineBetween(-layout.targetRadius - 8, layout.targetY, layout.targetRadius + 8, layout.targetY);
    this.field.lineBetween(0, layout.targetY - layout.targetRadius - 8, 0, layout.targetY + layout.targetRadius + 8);

    this.field.fillStyle(0xd7a84a, 1);
    this.field.fillCircle(0, 0, layout.playerRadius);
    this.field.lineStyle(3, 0xf4f2ed, 0.82);
    this.field.strokeCircle(0, 0, layout.playerRadius);
    this.field.fillStyle(0x151719, 0.86);
    this.field.fillTriangle(0, -layout.playerRadius - 12, -7, -layout.playerRadius + 2, 7, -layout.playerRadius + 2);
  }

  private drawHud(state: SimulatorState): void {
    const camera = this.cameras.main;
    const { hud } = calculatePracticeLayout(camera.width, camera.height);

    this.hud.clear();

    const activeCast = state.activeCast;
    const castDuration = activeCast ? activeCast.completesAtMs - activeCast.startedAtMs : 1;
    const castProgress = activeCast ? clamp01((state.nowMs - activeCast.startedAtMs) / castDuration) : 0;
    this.drawBar(hud.left, hud.top, hud.width, hud.castHeight, castProgress, 0xd7a84a, 0.95);

    this.castLabel.setPosition(camera.width / 2, hud.top + hud.castHeight / 2 - 1);
    this.castLabel.setText(activeCast ? activeCast.ability : "");

    const meleeTop = hud.top + hud.castHeight + hud.gap;
    const meleeProgress = remainingProgress(state.nowMs, state.nextMeleeAtMs, this.preset.derivedMeleeSwingMs);
    this.drawBar(hud.left, meleeTop, hud.width, hud.barHeight, meleeProgress, 0xd9664f, 0.88);

    const rangedTop = meleeTop + hud.barHeight + hud.gap;
    const rangedProgress = remainingProgress(state.nowMs, state.nextAutoAtMs, this.preset.targetRangedSwingMs);
    this.drawBar(hud.left, rangedTop, hud.width, hud.barHeight, rangedProgress, 0x7e9dbc, 0.92);
    this.drawRangedSparks(hud.left, rangedTop, hud.width, hud.barHeight, state);
  }

  private drawBar(x: number, y: number, width: number, height: number, progress: number, color: number, alpha: number): void {
    this.hud.fillStyle(0x080b0e, 0.72);
    this.hud.fillRoundedRect(x, y, width, height, 4);
    this.hud.fillStyle(color, alpha);
    this.hud.fillRoundedRect(x + 2, y + 2, Math.max(0, width - 4) * progress, height - 4, 3);
    this.hud.lineStyle(1, 0xf4f2ed, 0.2);
    this.hud.strokeRoundedRect(x, y, width, height, 4);
  }

  private drawRangedSparks(x: number, y: number, width: number, height: number, state: SimulatorState): void {
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
      const sparkX = x + progress * width;
      const isPassed = spark.atMs <= nowMs;

      this.hud.lineStyle(2, spark.color, isPassed ? spark.alpha * 0.55 : spark.alpha);
      this.hud.lineBetween(sparkX, y - 3, sparkX, y + height + 3);
    }
  }
}
