import Phaser from "phaser";

import { MOVEMENT, TIMING } from "../data/constants";
import { formatKeyBinding, type KeybindingMap } from "../input/keybindings";
import type {
  AbilityActionId,
  AbilityId,
  ActiveCast,
  PracticePosition,
  PracticeState,
  RangeState,
  RotationPreset,
  SimulatorState,
} from "../sim/types";

export interface PracticeSceneData {
  preset: RotationPreset;
  getPracticeState: () => PracticeState;
  getKeybindings: () => KeybindingMap;
}

export const WOWHEAD_ICON_BASE_URL = "https://wow.zamimg.com/images/wow/icons/large/";

const MAX_YARD_PX = 34;
const GRID_YARDS = 5;
const TARGET_YARDS = MOVEMENT.startingDistanceYards;
const MAX_PLAYER_RADIUS = 14;
const MAX_TARGET_RADIUS = 18;
const MAX_BAR_WIDTH = 260;
const ICON_COUNT = 6;
const MELEE_READY_COLOR = 0x7fd1a8;
const MELEE_WAITING_COLOR = 0xd9664f;

const ABILITY_ICON_DEFS = [
  {
    action: "arcaneShot",
    ability: "arcaneShot",
    label: "Arcane",
    icon: "ability_impalingbolt.jpg",
  },
  {
    action: "killCommand",
    ability: "killCommand",
    label: "Kill",
    icon: "ability_hunter_killcommand.jpg",
  },
  {
    action: "multiShot",
    ability: "multiShot",
    label: "Multi",
    icon: "ability_upgrademoonglaive.jpg",
  },
  {
    action: "steadyShot",
    ability: "steadyShot",
    label: "Steady",
    icon: "ability_hunter_steadyshot.jpg",
  },
  {
    action: "raptorStrike",
    ability: "raptorStrike",
    label: "Melee",
    icon: "ability_meleedamage.jpg",
  },
  {
    action: "autoShot",
    ability: "autoShot",
    label: "Auto",
    icon: "ability_whirlwind.jpg",
  },
] as const satisfies {
  action: AbilityActionId;
  ability: AbilityId;
  label: string;
  icon: string;
}[];

interface HudLayout {
  top: number;
  left: number;
  width: number;
  castHeight: number;
  barHeight: number;
  iconTop: number;
  iconSize: number;
  iconGap: number;
  gap: number;
  totalHeight: number;
}

interface AbilityIconObject {
  image: Phaser.GameObjects.Image;
  hotkeyText: Phaser.GameObjects.Text;
  cooldownText: Phaser.GameObjects.Text;
}

export interface AbilityIconView {
  action: AbilityActionId;
  ability: AbilityId;
  label: string;
  iconKey: string;
  iconUrl: string;
  hotkey: string;
  cooldownLabel: string;
  cooldownRemainingMs: number;
  isReady: boolean;
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

function formatCooldown(remainingMs: number): string {
  const seconds = Math.max(0, remainingMs) / 1000;
  return seconds >= 10 ? `${Math.ceil(seconds)}` : seconds.toFixed(1);
}

function getAbilityReadyAtMs(action: AbilityActionId, state: SimulatorState): number {
  if (action === "autoShot") {
    return state.nextAutoAtMs;
  }

  if (action === "raptorStrike") {
    return Math.min(state.raptorReadyAtMs, state.nextMeleeAtMs);
  }

  const abilityReadyAtMs = state.abilityReadyAtMs?.[action] ?? 0;
  if (action === "arcaneShot" || action === "multiShot" || action === "steadyShot") {
    return Math.max(state.gcdReadyAtMs, abilityReadyAtMs);
  }

  return abilityReadyAtMs;
}

export function getAbilityIconViews(
  state: SimulatorState,
  preset: RotationPreset,
  keybindings: KeybindingMap,
): AbilityIconView[] {
  void preset;

  return ABILITY_ICON_DEFS.map((definition) => {
    if (definition.action === "autoShot" && state.autoPaused) {
      return {
        action: definition.action,
        ability: definition.ability,
        label: definition.label,
        iconKey: `ability-icon-${definition.action}`,
        iconUrl: `${WOWHEAD_ICON_BASE_URL}${definition.icon}`,
        hotkey: formatKeyBinding(keybindings[definition.action]),
        cooldownLabel: "Paused",
        cooldownRemainingMs: Number.POSITIVE_INFINITY,
        isReady: false,
      };
    }

    const readyAtMs = getAbilityReadyAtMs(definition.action, state);
    const cooldownRemainingMs = Math.max(0, readyAtMs - state.nowMs);

    return {
      action: definition.action,
      ability: definition.ability,
      label: definition.label,
      iconKey: `ability-icon-${definition.action}`,
      iconUrl: `${WOWHEAD_ICON_BASE_URL}${definition.icon}`,
      hotkey: formatKeyBinding(keybindings[definition.action]),
      cooldownLabel: cooldownRemainingMs > 0 ? formatCooldown(cooldownRemainingMs) : "",
      cooldownRemainingMs,
      isReady: cooldownRemainingMs === 0,
    };
  });
}

export function getMeleeBarColor(range: RangeState): number {
  return range.canMelee ? MELEE_READY_COLOR : MELEE_WAITING_COLOR;
}

export function getCastBarDisplay(state: SimulatorState, preset: RotationPreset): ActiveCast | null {
  if (state.activeCast !== null) {
    return state.activeCast;
  }

  const windupMs = TIMING.autoWindupMs / preset.hasteFactor;
  const startedAtMs = state.nextAutoAtMs - windupMs;
  if (state.nowMs < startedAtMs || state.nowMs > state.nextAutoAtMs) {
    return null;
  }

  return {
    ability: "autoShot",
    startedAtMs,
    completesAtMs: state.nextAutoAtMs,
  };
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
  const iconSize = compactHud ? 28 : 36;
  const iconGap = compactHud ? 5 : 7;
  const gap = compactHud ? 4 : 8;
  const totalHeight = castHeight + gap + barHeight + gap + barHeight + gap + iconSize;
  const bottomMargin = 8;
  const preferredTop = height / 2 + playerRadius + (compactHud ? 20 : 54);
  const top = clamp(preferredTop, bottomMargin, Math.max(bottomMargin, height - bottomMargin - totalHeight));
  const rangedTop = top + castHeight + gap + barHeight + gap;

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
      iconTop: rangedTop + barHeight + gap,
      iconSize,
      iconGap,
      gap,
      totalHeight,
    },
  };
}

export function getPracticeGridStep(layout: Pick<PracticeLayout, "yardPx">): number {
  return GRID_YARDS * layout.yardPx;
}

export function canDrawPracticeField(width: number, height: number, layout: Pick<PracticeLayout, "yardPx">): boolean {
  return width > 0 && height > 0 && Number.isFinite(getPracticeGridStep(layout)) && getPracticeGridStep(layout) > 0;
}

export class PracticeScene extends Phaser.Scene {
  private preset!: RotationPreset;
  private getPracticeState!: () => PracticeState;
  private getKeybindings!: () => KeybindingMap;
  private field!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private castLabel!: Phaser.GameObjects.Text;
  private distanceLabel!: Phaser.GameObjects.Text;
  private abilityIcons: AbilityIconObject[] = [];

  constructor() {
    super("PracticeScene");
  }

  init(data: PracticeSceneData): void {
    this.preset = data.preset;
    this.getPracticeState = data.getPracticeState;
    this.getKeybindings = data.getKeybindings;
  }

  preload(): void {
    for (const view of getAbilityIconViews(
      {
        nowMs: 0,
        gcdReadyAtMs: 0,
        nextAutoAtMs: this.preset.targetRangedSwingMs,
        nextMeleeAtMs: this.preset.derivedMeleeSwingMs,
        raptorReadyAtMs: 0,
        activeCast: null,
        queuedAbility: null,
        autoPaused: false,
      },
      this.preset,
      this.getKeybindings(),
    )) {
      this.load.image(view.iconKey, view.iconUrl);
    }
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
    this.distanceLabel = this.add
      .text(0, 0, "", {
        color: "#f4f2ed",
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "12px",
        fontStyle: "700",
      })
      .setOrigin(0.5);
    this.abilityIcons = ABILITY_ICON_DEFS.map(() => {
      const image = this.add.image(0, 0, "").setScrollFactor(0);
      const hotkeyText = this.add
        .text(0, 0, "", {
          color: "#f4f2ed",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "10px",
          fontStyle: "800",
          stroke: "#080b0e",
          strokeThickness: 3,
        })
        .setOrigin(1, 1)
        .setScrollFactor(0);
      const cooldownText = this.add
        .text(0, 0, "", {
          color: "#ffffff",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "13px",
          fontStyle: "900",
          stroke: "#080b0e",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setScrollFactor(0);

      return { image, hotkeyText, cooldownText };
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.drawField(this.getPracticeState());
  }

  update(): void {
    const state = this.getPracticeState();
    this.cameras.main.centerOn(0, 0);
    this.drawField(state);
    this.drawHud(state);
  }

  shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    this.cameras.main.centerOn(0, 0);
    this.drawField(this.getPracticeState());
  }

  private getTargetOffset(position: PracticePosition, yardPx: number): { x: number; y: number } {
    return {
      x: (position.target.x - position.player.x) * yardPx,
      y: (position.target.y - position.player.y) * yardPx,
    };
  }

  private drawField(state: PracticeState): void {
    const camera = this.cameras.main;
    const width = camera.width;
    const height = camera.height;
    const halfW = width / 2;
    const halfH = height / 2;
    const layout = calculatePracticeLayout(width, height);
    const gridStep = getPracticeGridStep(layout);

    this.field.clear();
    if (!canDrawPracticeField(width, height, layout)) {
      return;
    }

    const targetOffset = this.getTargetOffset(state.position, layout.yardPx);

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
    this.field.lineBetween(0, 0, targetOffset.x, targetOffset.y);

    this.field.fillStyle(0x27323b, 1);
    this.field.fillCircle(targetOffset.x, targetOffset.y, layout.targetRadius);
    this.field.lineStyle(2, 0xd9664f, 0.9);
    this.field.strokeCircle(targetOffset.x, targetOffset.y, layout.targetRadius);
    this.field.lineStyle(2, 0xd9664f, 0.45);
    this.field.lineBetween(
      targetOffset.x - layout.targetRadius - 8,
      targetOffset.y,
      targetOffset.x + layout.targetRadius + 8,
      targetOffset.y,
    );
    this.field.lineBetween(
      targetOffset.x,
      targetOffset.y - layout.targetRadius - 8,
      targetOffset.x,
      targetOffset.y + layout.targetRadius + 8,
    );

    this.field.fillStyle(0xd7a84a, 1);
    this.field.fillCircle(0, 0, layout.playerRadius);
    this.field.lineStyle(3, 0xf4f2ed, 0.82);
    this.field.strokeCircle(0, 0, layout.playerRadius);
    this.field.fillStyle(0x151719, 0.86);
    this.field.fillTriangle(0, -layout.playerRadius - 12, -7, -layout.playerRadius + 2, 7, -layout.playerRadius + 2);

    this.distanceLabel.setPosition(targetOffset.x / 2, targetOffset.y / 2);
    this.distanceLabel.setText(`${state.range.distanceYards.toFixed(1)} yd`);
  }

  private drawHud(practiceState: PracticeState): void {
    const camera = this.cameras.main;
    const state = practiceState.simulator;
    const { hud } = calculatePracticeLayout(camera.width, camera.height);

    this.hud.clear();

    const activeCast = getCastBarDisplay(state, this.preset);
    const castDuration = activeCast ? activeCast.completesAtMs - activeCast.startedAtMs : 1;
    const castProgress = activeCast ? clamp01((state.nowMs - activeCast.startedAtMs) / castDuration) : 0;
    this.drawBar(hud.left, hud.top, hud.width, hud.castHeight, castProgress, 0xd7a84a, 0.95);

    this.castLabel.setPosition(camera.width / 2, hud.top + hud.castHeight / 2 - 1);
    this.castLabel.setText(activeCast ? activeCast.ability : "");

    const meleeTop = hud.top + hud.castHeight + hud.gap;
    const meleeProgress = remainingProgress(state.nowMs, state.nextMeleeAtMs, this.preset.derivedMeleeSwingMs);
    this.drawBar(hud.left, meleeTop, hud.width, hud.barHeight, meleeProgress, getMeleeBarColor(practiceState.range), 0.88);

    const rangedTop = meleeTop + hud.barHeight + hud.gap;
    const rangedProgress = remainingProgress(state.nowMs, state.nextAutoAtMs, this.preset.targetRangedSwingMs);
    this.drawBar(hud.left, rangedTop, hud.width, hud.barHeight, rangedProgress, 0x7e9dbc, 0.92);
    this.drawRangedSparks(hud.left, rangedTop, hud.width, hud.barHeight, state);
    this.drawAbilityIcons(hud, getAbilityIconViews(state, this.preset, this.getKeybindings()));
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

  private drawAbilityIcons(hud: HudLayout, views: AbilityIconView[]): void {
    const totalWidth = ICON_COUNT * hud.iconSize + (ICON_COUNT - 1) * hud.iconGap;
    const startX = hud.left + hud.width / 2 - totalWidth / 2;

    for (let index = 0; index < views.length; index += 1) {
      const view = views[index];
      const object = this.abilityIcons[index];
      const x = startX + index * (hud.iconSize + hud.iconGap);
      const y = hud.iconTop;
      const centerX = x + hud.iconSize / 2;
      const centerY = y + hud.iconSize / 2;

      this.hud.fillStyle(0x080b0e, 0.78);
      this.hud.fillRoundedRect(x, y, hud.iconSize, hud.iconSize, 5);
      this.hud.lineStyle(1, view.isReady ? 0xf5df9f : 0xf4f2ed, view.isReady ? 0.62 : 0.24);
      this.hud.strokeRoundedRect(x, y, hud.iconSize, hud.iconSize, 5);

      object.image.setTexture(view.iconKey);
      object.image.setPosition(centerX, centerY);
      object.image.setDisplaySize(hud.iconSize - 4, hud.iconSize - 4);
      object.image.setAlpha(view.isReady ? 1 : 0.42);

      if (!view.isReady) {
        this.hud.fillStyle(0x080b0e, 0.45);
        this.hud.fillRoundedRect(x + 2, y + 2, hud.iconSize - 4, hud.iconSize - 4, 4);
      }

      object.hotkeyText.setText(view.hotkey);
      object.hotkeyText.setPosition(x + hud.iconSize - 3, y + hud.iconSize - 2);
      object.hotkeyText.setFontSize(hud.iconSize < 32 ? 9 : 10);

      object.cooldownText.setText(view.cooldownLabel);
      object.cooldownText.setPosition(centerX, centerY);
      object.cooldownText.setFontSize(hud.iconSize < 32 ? 11 : 13);
    }
  }
}
