import type { SoundEffect, SoundEffectsLabSoundMetadata } from "@/types/sounds";

export function hasValidSoundEffectsLabRights({
	provider,
	redistribution,
}: Pick<SoundEffectsLabSoundMetadata, "provider" | "redistribution">): boolean {
	return (
		(provider === "freesound" && redistribution === "allowed") ||
		(provider === "jianying-reference" && redistribution === "prohibited")
	);
}

export function isReusableSoundEffectsLabSound({
	sound,
}: {
	sound: SoundEffect;
}): boolean {
	return (
		sound.source === "sound-effects-lab" &&
		sound.soundEffectsLab?.provider === "freesound" &&
		hasValidSoundEffectsLabRights(sound.soundEffectsLab) &&
		sound.soundEffectsLab?.redistribution === "allowed"
	);
}

export function isPersistableSoundEffectsLabSound({
	sound,
}: {
	sound: SoundEffect;
}): boolean {
	return (
		isReusableSoundEffectsLabSound({ sound }) &&
		Boolean(sound.soundEffectsLab?.asset)
	);
}

export function isRestrictedSoundEffectsLabSound({
	sound,
}: {
	sound: SoundEffect;
}): boolean {
	return (
		sound.source === "sound-effects-lab" &&
		!isReusableSoundEffectsLabSound({ sound })
	);
}
