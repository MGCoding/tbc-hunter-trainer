import { describe, expect, it } from "vitest";
import {
  ATTACK_SOUND_GROUPS,
  createAttackSoundPlayer,
  getAttackSoundGroupsForEvent,
  type AttackSoundGroupId,
} from "../audio/attackSounds";
import type { SimEvent } from "../sim/types";

interface MockAudio {
  url: string;
  preload: string;
  volume: number;
  currentTime: number;
  loadCalls: number;
  load: () => void;
  play: () => Promise<void> | void;
  cloneNode: () => MockAudio;
}

function createMockAudioFactory(options: {
  throwOnLoad?: boolean;
  throwOnPlay?: boolean;
  rejectOnPlay?: boolean;
} = {}) {
  const created: MockAudio[] = [];
  const played: MockAudio[] = [];

  const createMockAudio = (url: string): MockAudio => {
    const audio: MockAudio = {
      url,
      preload: "",
      volume: 1,
      currentTime: 0,
      loadCalls: 0,
      load: () => {
        audio.loadCalls += 1;
        if (options.throwOnLoad) {
          throw new Error("load failed");
        }
      },
      play: () => {
        played.push(audio);
        if (options.throwOnPlay) {
          throw new Error("play failed");
        }
        if (options.rejectOnPlay) {
          return Promise.reject(new Error("play failed"));
        }
        return Promise.resolve();
      },
      cloneNode: () => createMockAudio(`${url}#clone`),
    };
    created.push(audio);
    return audio;
  };

  return { created, played, createAudio: createMockAudio };
}

describe("attack sound event mapping", () => {
  it("maps Auto Shot events to bow sound groups", () => {
    expect(getAttackSoundGroupsForEvent({ type: "auto-windup", atMs: 1500, ability: "autoShot" })).toEqual([
      "bowWindup",
    ]);
    expect(getAttackSoundGroupsForEvent({ type: "auto-fire", atMs: 2000, ability: "autoShot" })).toEqual([
      "bowRelease",
      "arrowImpact",
    ]);
  });

  it("keeps non-attack events silent", () => {
    expect(getAttackSoundGroupsForEvent({ type: "auto-clipped", atMs: 1500, ability: "autoShot" })).toEqual([]);
    expect(getAttackSoundGroupsForEvent({ type: "invalid-input", atMs: 2000, ability: "steadyShot" })).toEqual([]);
  });

  it.each<[SimEvent, AttackSoundGroupId[]]>([
    [{ type: "cast-complete", atMs: 1000, ability: "arcaneShot" }, ["arcaneShot"]],
    [{ type: "cast-complete", atMs: 1000, ability: "steadyShot" }, ["steadyShot"]],
    [{ type: "cast-complete", atMs: 1000, ability: "multiShot" }, ["multiShot", "bowRelease", "arrowImpact"]],
    [{ type: "cast-complete", atMs: 1000, ability: "killCommand" }, ["killCommand"]],
    [{ type: "cast-complete", atMs: 1000, ability: "raptorStrike" }, ["raptorStrike", "meleeImpact"]],
    [{ type: "cast-complete", atMs: 1000, ability: "meleeSwing" }, ["meleeSwingWhoosh", "meleeImpact"]],
    [{ type: "cast-complete", atMs: 1000, ability: "autoShot" }, []],
  ])("maps completed $ability events", (event, groups) => {
    expect(getAttackSoundGroupsForEvent(event)).toEqual(groups);
  });
});

describe("attack sound player", () => {
  it("preloads every configured sound once", () => {
    const { created, createAudio } = createMockAudioFactory();
    const player = createAttackSoundPlayer({ createAudio });
    const configuredSoundCount = Object.values(ATTACK_SOUND_GROUPS).flat().length;

    player.preloadAttackSounds();
    player.preloadAttackSounds();

    expect(created).toHaveLength(configuredSoundCount);
    for (const audio of created) {
      expect(audio.preload).toBe("auto");
      expect(audio.volume).toBe(0.36);
      expect(audio.loadCalls).toBe(1);
    }
  });

  it("cycles variants deterministically and applies configured volume to played clones", () => {
    const { played, createAudio } = createMockAudioFactory();
    const player = createAttackSoundPlayer({ createAudio, volume: 0.25 });

    player.playAttackSoundsForEvents([
      { type: "auto-windup", atMs: 1000, ability: "autoShot" },
      { type: "auto-windup", atMs: 2000, ability: "autoShot" },
      { type: "auto-windup", atMs: 3000, ability: "autoShot" },
      { type: "auto-windup", atMs: 4000, ability: "autoShot" },
    ]);

    expect(played.map((audio) => audio.url)).toEqual([
      `${ATTACK_SOUND_GROUPS.bowWindup[0].url}#clone`,
      `${ATTACK_SOUND_GROUPS.bowWindup[1].url}#clone`,
      `${ATTACK_SOUND_GROUPS.bowWindup[2].url}#clone`,
      `${ATTACK_SOUND_GROUPS.bowWindup[0].url}#clone`,
    ]);
    expect(played.every((audio) => audio.volume === 0.25)).toBe(true);
  });

  it("plays only sound groups resolved from a batch of events", () => {
    const { played, createAudio } = createMockAudioFactory();
    const player = createAttackSoundPlayer({ createAudio });

    player.playAttackSoundsForEvents([
      { type: "auto-fire", atMs: 1000, ability: "autoShot" },
      { type: "cast-complete", atMs: 1500, ability: "arcaneShot" },
      { type: "invalid-input", atMs: 2000, ability: "steadyShot" },
    ]);

    expect(played.map((audio) => audio.url)).toEqual([
      `${ATTACK_SOUND_GROUPS.bowRelease[0].url}#clone`,
      `${ATTACK_SOUND_GROUPS.arrowImpact[0].url}#clone`,
      `${ATTACK_SOUND_GROUPS.arcaneShot[0].url}#clone`,
    ]);
  });

  it("swallows load exceptions and rejected play promises", () => {
    const loadMocks = createMockAudioFactory({ throwOnLoad: true });
    const loadPlayer = createAttackSoundPlayer({ createAudio: loadMocks.createAudio });
    expect(() => loadPlayer.preloadAttackSounds()).not.toThrow();

    const playMocks = createMockAudioFactory({ rejectOnPlay: true });
    const playPlayer = createAttackSoundPlayer({ createAudio: playMocks.createAudio });
    expect(() => playPlayer.playAttackSoundsForEvents([
      { type: "auto-windup", atMs: 1000, ability: "autoShot" },
    ])).not.toThrow();
  });

  it("swallows synchronous play exceptions", () => {
    const playMocks = createMockAudioFactory({ throwOnPlay: true });
    const playPlayer = createAttackSoundPlayer({ createAudio: playMocks.createAudio });

    expect(() => playPlayer.playAttackSoundsForEvents([
      { type: "auto-windup", atMs: 1000, ability: "autoShot" },
    ])).not.toThrow();
    expect(playMocks.played.map((audio) => audio.url)).toEqual([
      `${ATTACK_SOUND_GROUPS.bowWindup[0].url}#clone`,
    ]);
  });
});
