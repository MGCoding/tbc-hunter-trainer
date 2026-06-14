import { useEffect, useRef } from "react";
import type { Game as PhaserGame, Types as PhaserTypes } from "phaser";

import type { RotationPreset, SimulatorState } from "../sim/types";

interface PhaserHostProps {
  preset: RotationPreset;
  getSimulatorState: () => SimulatorState;
}

export function PhaserHost({ preset, getSimulatorState }: PhaserHostProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGame | null>(null);

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
      game.scene.add("PracticeScene", PracticeScene, true, { preset, getSimulatorState });
    }

    void createGame();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [preset, getSimulatorState]);

  return <div ref={parentRef} className="phaser-host" data-testid="phaser-host" />;
}
