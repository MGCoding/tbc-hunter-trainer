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

  it("normalizes diagonal movement to the configured speed", () => {
    const start = createInitialPosition(MOVEMENT.startingDistanceYards);
    const updated = updateMovement(start, { forward: true, backward: false, left: true, right: false }, 1000);
    const distanceTraveled = Math.hypot(updated.player.x - start.player.x, updated.player.y - start.player.y);

    expect(distanceTraveled).toBeCloseTo(MOVEMENT.yardsPerSecond);
  });

  it("returns an immutable target snapshot when movement updates", () => {
    const start = createInitialPosition(MOVEMENT.startingDistanceYards);
    const updated = updateMovement(start, { forward: true, backward: false, left: false, right: false }, 1000);

    expect(updated.target).toEqual(start.target);
    expect(updated.target).not.toBe(start.target);
  });

  it("computes melee and ranged legality from distance", () => {
    const start = createInitialPosition(7.8);
    expect(getRangeState(start).canMelee).toBe(false);
    expect(getRangeState(start).canUseRanged).toBe(true);

    const inMelee = createInitialPosition(1.8);
    expect(getRangeState(inMelee).canMelee).toBe(true);
    expect(getRangeState(inMelee).canUseRanged).toBe(false);
  });

  it("computes melee and ranged legality at range boundaries", () => {
    const exactMelee = getRangeState(createInitialPosition(2));
    expect(exactMelee.canMelee).toBe(true);
    expect(exactMelee.canUseRanged).toBe(false);

    const justOverMelee = getRangeState(createInitialPosition(2.01));
    expect(justOverMelee.canMelee).toBe(false);
    expect(justOverMelee.canUseRanged).toBe(true);

    const exactMaximumRanged = getRangeState(createInitialPosition(35));
    expect(exactMaximumRanged.canMelee).toBe(false);
    expect(exactMaximumRanged.canUseRanged).toBe(true);

    const overMaximumRanged = getRangeState(createInitialPosition(35.01));
    expect(overMaximumRanged.canMelee).toBe(false);
    expect(overMaximumRanged.canUseRanged).toBe(false);
  });
});
