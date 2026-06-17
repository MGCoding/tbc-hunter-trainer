import type { SimEvent } from "../sim/types";

export type AttackSoundGroupId =
  | "bowWindup"
  | "bowRelease"
  | "arrowImpact"
  | "arcaneShot"
  | "steadyShot"
  | "multiShot"
  | "killCommand"
  | "raptorStrike"
  | "meleeSwingWhoosh"
  | "meleeImpact";

interface AttackSoundVariant {
  label: string;
  url: string;
}

interface AudioLike {
  preload: string;
  volume: number;
  currentTime: number;
  load: () => void;
  play: () => Promise<void> | void;
  cloneNode: (deep?: boolean) => unknown;
}

type CreateAudio = (url: string) => AudioLike;

export interface AttackSoundPlayerOptions {
  createAudio?: CreateAudio;
  volume?: number;
}

export const ATTACK_SOUND_GROUPS = {
  bowWindup: [
    { label: "BowPullback02", url: "https://wow.zamimg.com/sound-ids/tbc/enus/123/567675/BowPullback02.ogg" },
    { label: "BowPullback03", url: "https://wow.zamimg.com/sound-ids/tbc/enus/124/567676/BowPullback03.ogg" },
    { label: "BowPullback", url: "https://wow.zamimg.com/sound-ids/tbc/enus/125/567677/BowPullback.ogg" },
  ],
  bowRelease: [
    { label: "BowRelease02", url: "https://wow.zamimg.com/sound-ids/tbc/enus/121/567673/BowRelease02.ogg" },
    { label: "BowRelease", url: "https://wow.zamimg.com/sound-ids/tbc/enus/122/567674/BowRelease.ogg" },
    { label: "BowRelease03", url: "https://wow.zamimg.com/sound-ids/tbc/enus/130/567682/BowRelease03.ogg" },
  ],
  arrowImpact: [
    { label: "ArrowHitC", url: "https://wow.zamimg.com/sound-ids/tbc/enus/119/567671/ArrowHitC.ogg" },
    { label: "ArrowHitA", url: "https://wow.zamimg.com/sound-ids/tbc/enus/120/567672/ArrowHitA.ogg" },
    { label: "ArrowHitB", url: "https://wow.zamimg.com/sound-ids/tbc/enus/129/567681/ArrowHitB.ogg" },
  ],
  arcaneShot: [
    { label: "ArcaneMissileImpact1C", url: "https://wow.zamimg.com/sound-ids/tbc/enus/210/569554/ArcaneMissileImpact1C.ogg" },
    { label: "ArcaneMissileImpact1B", url: "https://wow.zamimg.com/sound-ids/tbc/enus/221/569565/ArcaneMissileImpact1B.ogg" },
    { label: "ArcaneMissileImpact1A", url: "https://wow.zamimg.com/sound-ids/tbc/enus/31/569631/ArcaneMissileImpact1A.ogg" },
  ],
  steadyShot: [
    { label: "DecisiveStrike", url: "https://wow.zamimg.com/sound-ids/tbc/enus/10/569098/DecisiveStrike.ogg" },
  ],
  multiShot: [
    { label: "RecklessnessTarget", url: "https://wow.zamimg.com/sound-ids/tbc/enus/147/569491/RecklessnessTarget.ogg" },
  ],
  killCommand: [
    { label: "KillCommand", url: "https://wow.zamimg.com/sound-ids/tbc/enus/11/568075/KillCommand.ogg" },
  ],
  raptorStrike: [
    {
      label: "SwingWeaponSpecialWarriorC",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/227/569827/SwingWeaponSpecialWarriorC.ogg",
    },
    {
      label: "SwingWeaponSpecialWarriorA",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/228/569828/SwingWeaponSpecialWarriorA.ogg",
    },
    {
      label: "SwingWeaponSpecialWarriorD",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/229/569829/SwingWeaponSpecialWarriorD.ogg",
    },
    {
      label: "SwingWeaponSpecialWarriorB",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/230/569830/SwingWeaponSpecialWarriorB.ogg",
    },
    {
      label: "SwingWeaponSpecialWarriorE",
      url: "https://wow.zamimg.com/sound-ids/tbc/enus/231/569831/SwingWeaponSpecialWarriorE.ogg",
    },
  ],
  meleeSwingWhoosh: [
    { label: "mWooshMedium2", url: "https://wow.zamimg.com/sound-ids/tbc/enus/127/567935/mWooshMedium2.ogg" },
    { label: "mWooshMedium1", url: "https://wow.zamimg.com/sound-ids/tbc/enus/130/567938/mWooshMedium1.ogg" },
    { label: "mWooshMedium3", url: "https://wow.zamimg.com/sound-ids/tbc/enus/131/567939/mWooshMedium3.ogg" },
  ],
  meleeImpact: [
    { label: "m2hSwordHitFlesh1A", url: "https://wow.zamimg.com/sound-ids/tbc/enus/91/567899/m2hSwordHitFlesh1A.ogg" },
    { label: "m2hSwordHitFlesh1B", url: "https://wow.zamimg.com/sound-ids/tbc/enus/101/567909/m2hSwordHitFlesh1B.ogg" },
    { label: "m2hSwordHitFlesh1C", url: "https://wow.zamimg.com/sound-ids/tbc/enus/107/567915/m2hSwordHitFlesh1C.ogg" },
  ],
} as const satisfies Record<AttackSoundGroupId, readonly AttackSoundVariant[]>;

const DEFAULT_VOLUME = 0.36;

const createBrowserAudio: CreateAudio = (url) => new Audio(url);

export function getAttackSoundGroupsForEvent(event: SimEvent): AttackSoundGroupId[] {
  if (event.type === "auto-windup" && event.ability === "autoShot") {
    return ["bowWindup"];
  }

  if (event.type === "auto-fire" && event.ability === "autoShot") {
    return ["bowRelease", "arrowImpact"];
  }

  if (event.type !== "cast-complete") {
    return [];
  }

  switch (event.ability) {
    case "arcaneShot":
      return ["arcaneShot"];
    case "steadyShot":
      return ["steadyShot"];
    case "multiShot":
      return ["multiShot", "bowRelease", "arrowImpact"];
    case "killCommand":
      return ["killCommand"];
    case "raptorStrike":
      return ["raptorStrike", "meleeImpact"];
    case "meleeSwing":
      return ["meleeSwingWhoosh", "meleeImpact"];
    default:
      return [];
  }
}

export function createAttackSoundPlayer(options: AttackSoundPlayerOptions = {}) {
  const createAudio = options.createAudio ?? createBrowserAudio;
  const volume = options.volume ?? DEFAULT_VOLUME;
  const loadedAudio = new Map<string, AudioLike>();
  const nextVariantIndexes = new Map<AttackSoundGroupId, number>();
  let didPreload = false;

  function preloadAttackSounds(): void {
    if (didPreload) {
      return;
    }

    didPreload = true;

    for (const variants of Object.values(ATTACK_SOUND_GROUPS)) {
      for (const variant of variants) {
        try {
          const audio = createAudio(variant.url);
          audio.preload = "auto";
          audio.volume = volume;
          loadedAudio.set(variant.url, audio);
          audio.load();
        } catch {
          // Browser audio setup should never interrupt simulation playback.
        }
      }
    }
  }

  function playGroup(groupId: AttackSoundGroupId): void {
    const variants = ATTACK_SOUND_GROUPS[groupId];
    const variantIndex = nextVariantIndexes.get(groupId) ?? 0;
    const variant = variants[variantIndex];
    nextVariantIndexes.set(groupId, (variantIndex + 1) % variants.length);

    const baseAudio = loadedAudio.get(variant.url);
    if (!baseAudio) {
      return;
    }

    try {
      const audio = baseAudio.cloneNode(true) as AudioLike;
      audio.volume = volume;
      audio.currentTime = 0;
      const playResult = audio.play();
      if (playResult && typeof playResult.catch === "function") {
        void playResult.catch(() => {
          // Rejected play promises are expected when browser audio is blocked.
        });
      }
    } catch {
      // Blocked audio should never interrupt practice.
    }
  }

  function playAttackSoundsForEvents(events: SimEvent[]): void {
    preloadAttackSounds();
    for (const event of events) {
      for (const groupId of getAttackSoundGroupsForEvent(event)) {
        playGroup(groupId);
      }
    }
  }

  return {
    preloadAttackSounds,
    playAttackSoundsForEvents,
  };
}

const singletonAttackSoundPlayer = createAttackSoundPlayer();

export function preloadAttackSounds(): void {
  singletonAttackSoundPlayer.preloadAttackSounds();
}

export function playAttackSoundsForEvents(events: SimEvent[]): void {
  singletonAttackSoundPlayer.playAttackSoundsForEvents(events);
}
