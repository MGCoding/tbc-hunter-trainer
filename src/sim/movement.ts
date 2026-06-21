import { MOVEMENT } from "../data/constants";
import type { MovementKeys, PracticePosition, RangeState } from "./types";

export function createInitialPosition(distanceYards: number = MOVEMENT.startingDistanceYards): PracticePosition {
  return {
    player: { x: 0, y: 0 },
    target: { x: 0, y: -distanceYards },
  };
}

export function distanceBetween(position: PracticePosition): number {
  const dx = position.player.x - position.target.x;
  const dy = position.player.y - position.target.y;
  return Math.hypot(dx, dy);
}

export function getRangeState(position: PracticePosition): RangeState {
  const distanceYards = distanceBetween(position);
  return {
    distanceYards,
    canMelee: distanceYards <= MOVEMENT.meleeRangeYards,
    canUseRanged:
      distanceYards > MOVEMENT.minimumRangedRangeYards &&
      distanceYards <= MOVEMENT.maximumRangedRangeYards,
  };
}

export function updateMovement(position: PracticePosition, keys: MovementKeys, deltaMs: number): PracticePosition {
  const seconds = deltaMs / 1000;
  const forwardAxis = Number(keys.backward) - Number(keys.forward);
  const strafeAxis = Number(keys.right) - Number(keys.left);
  const movingBackward = forwardAxis > 0;
  const ySpeed = movingBackward ? MOVEMENT.backwardYardsPerSecond : MOVEMENT.yardsPerSecond;
  const maxSpeed = movingBackward ? MOVEMENT.backwardYardsPerSecond : MOVEMENT.yardsPerSecond;
  const velocityX = strafeAxis * MOVEMENT.strafeYardsPerSecond;
  const velocityY = forwardAxis * ySpeed;
  const speed = Math.hypot(velocityX, velocityY);
  const scale = speed > maxSpeed ? maxSpeed / speed : 1;

  return {
    player: {
      x: position.player.x + velocityX * scale * seconds,
      y: position.player.y + velocityY * scale * seconds,
    },
    target: { ...position.target },
  };
}
