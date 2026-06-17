import { useEffect, useRef } from "react";
import type { Game as PhaserGame, Types as PhaserTypes } from "phaser";

import { attachBrowserInput } from "../input/browserInput";
import type { KeybindingMap } from "../input/keybindings";
import type { AbilityActionId, IdealEvent, MovementKeys } from "../sim/types";
import type { PracticeState, RotationPreset } from "../sim/types";
import { getEffectiveRenderScale, type RenderScalePreference } from "./renderScale";

interface PhaserHostProps {
  preset: RotationPreset;
  ideal: IdealEvent[];
  renderScalePreference: RenderScalePreference;
  getPracticeState: () => PracticeState;
  getKeybindings: () => KeybindingMap;
  onMovementChange: (keys: MovementKeys) => void;
  onAbilityPress: (action: AbilityActionId) => void;
}

interface HostSize {
  width: number;
  height: number;
}

interface PracticeSceneRenderSurface {
  updateRenderSurface: (logicalWidth: number, logicalHeight: number, effectiveRenderScale: number) => void;
}

function getHostSize(host: HTMLElement): HostSize {
  const rect = host.getBoundingClientRect();

  return {
    width: rect.width,
    height: rect.height,
  };
}

function getPhysicalSize(size: HostSize, effectiveRenderScale: number): HostSize {
  return {
    width: Math.max(1, Math.round(size.width * effectiveRenderScale)),
    height: Math.max(1, Math.round(size.height * effectiveRenderScale)),
  };
}

function getDevicePixelRatio(): number {
  return window.devicePixelRatio || 1;
}

function setCanvasCssSize(canvas: HTMLCanvasElement, size: HostSize): void {
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
}

function updatePracticeSceneRenderSurface(
  game: PhaserGame,
  logicalSize: HostSize,
  effectiveRenderScale: number,
): void {
  const scene = game.scene.getScene("PracticeScene") as Partial<PracticeSceneRenderSurface> | null;

  scene?.updateRenderSurface?.(logicalSize.width, logicalSize.height, effectiveRenderScale);
}

export function PhaserHost({
  preset,
  ideal,
  renderScalePreference,
  getPracticeState,
  getKeybindings,
  onMovementChange,
  onAbilityPress,
}: PhaserHostProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGame | null>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) {
      return undefined;
    }

    parent.focus();
    return attachBrowserInput(document, getKeybindings, {
      onMovementChange,
      onAbilityPress,
    });
  }, [getKeybindings, onAbilityPress, onMovementChange]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent || navigator.userAgent.includes("jsdom")) {
      return undefined;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function createGame(): Promise<void> {
      const [{ default: Phaser }, { PracticeScene }] = await Promise.all([import("phaser"), import("./PracticeScene")]);

      const host = parentRef.current;
      if (cancelled || !host) {
        return;
      }

      const gameHost = host;
      const initialLogicalSize = getHostSize(gameHost);
      const initialEffectiveRenderScale = getEffectiveRenderScale(renderScalePreference, getDevicePixelRatio());
      const initialPhysicalSize = getPhysicalSize(initialLogicalSize, initialEffectiveRenderScale);

      const config: PhaserTypes.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameHost,
        backgroundColor: "#151719",
        scale: {
          mode: Phaser.Scale.NONE,
          parent: gameHost,
          width: initialPhysicalSize.width,
          height: initialPhysicalSize.height,
        },
        scene: [],
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;
      setCanvasCssSize(game.canvas, initialLogicalSize);
      game.scene.add("PracticeScene", PracticeScene, true, {
        preset,
        ideal,
        logicalWidth: initialLogicalSize.width,
        logicalHeight: initialLogicalSize.height,
        effectiveRenderScale: initialEffectiveRenderScale,
        getPracticeState,
        getKeybindings,
      });

      function applyRenderSurface(): void {
        const logicalSize = getHostSize(gameHost);
        if (logicalSize.width <= 0 || logicalSize.height <= 0) {
          return;
        }

        const effectiveRenderScale = getEffectiveRenderScale(renderScalePreference, getDevicePixelRatio());
        const physicalSize = getPhysicalSize(logicalSize, effectiveRenderScale);

        game.scale.resize(physicalSize.width, physicalSize.height);
        setCanvasCssSize(game.canvas, logicalSize);
        updatePracticeSceneRenderSurface(game, logicalSize, effectiveRenderScale);
      }

      resizeObserver = new ResizeObserver(applyRenderSurface);
      resizeObserver.observe(gameHost);
      applyRenderSurface();
    }

    void createGame();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [preset, ideal, renderScalePreference, getPracticeState, getKeybindings]);

  return <div ref={parentRef} className="phaser-host" data-testid="phaser-host" data-ideal-count={ideal.length} tabIndex={0} />;
}
