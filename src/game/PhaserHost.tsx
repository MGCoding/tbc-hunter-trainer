import { useEffect, useRef } from "react";
import type { Game as PhaserGame, Types as PhaserTypes } from "phaser";

import { attachBrowserInput } from "../input/browserInput";
import type { KeybindingMap } from "../input/keybindings";
import type { AbilityActionId, MovementKeys } from "../sim/types";
import type { PracticeState, RotationPreset } from "../sim/types";

interface PhaserHostProps {
  preset: RotationPreset;
  getPracticeState: () => PracticeState;
  getKeybindings: () => KeybindingMap;
  onMovementChange: (keys: MovementKeys) => void;
  onAbilityPress: (action: AbilityActionId) => void;
}

export function PhaserHost({
  preset,
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

    async function createGame(): Promise<void> {
      const [{ default: Phaser }, { PracticeScene }] = await Promise.all([import("phaser"), import("./PracticeScene")]);

      const host = parentRef.current;
      if (cancelled || !host) {
        return;
      }

      const config: PhaserTypes.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: host,
        backgroundColor: "#151719",
        scale: {
          mode: Phaser.Scale.RESIZE,
          parent: host,
          width: host.clientWidth,
          height: host.clientHeight,
        },
        scene: [],
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;
      game.scene.add("PracticeScene", PracticeScene, true, { preset, getPracticeState });
    }

    void createGame();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [preset, getPracticeState]);

  return <div ref={parentRef} className="phaser-host" data-testid="phaser-host" tabIndex={0} />;
}
