import { describe, expect, it } from "vitest";
import { MOVEMENT } from "../data/constants";
import { createInitialPosition, getRangeState, updateMovement } from "../sim/movement";

describe("movement", () => {
  it("moves forward, backward, and strafe with fixed facing", () => {
    const start = createInitialPosition(MOVEMENT.startingDistanceYards);
    const forward = updateMovement(start, { forward: true, backward: false, left: false, right: false }, 1000);
    expect(forward.player.y).toBeCloseTo(start.player.y - MOVEMENT.yardsPerSecond);

    const back = updateMovement(start, { forward: false, backward: true, left: false, right: false }, 1000);
    expect(back.player.y).toBeCloseTo(start.player.y + MOVEMENT.yardsPerSecond);

    const left = updateMovement(start, { forward: false, backward: false, left: true, right: false }, 1000);
    expect(left.player.x).toBeCloseTo(start.player.x - MOVEMENT.strafeYardsPerSecond);
  });

  it("computes melee and ranged legality from distance", () => {
    const start = createInitialPosition(7.8);
    expect(getRangeState(start).canMelee).toBe(false);
    expect(getRangeState(start).canUseRanged).toBe(true);

    const inMelee = createInitialPosition(4.8);
    expect(getRangeState(inMelee).canMelee).toBe(true);
    expect(getRangeState(inMelee).canUseRanged).toBe(false);
  });
});
