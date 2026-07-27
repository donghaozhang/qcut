import type { SoundEffect } from "@/types/sounds";

export function mergeUniqueAudio({
	primary,
	secondary,
}: {
	primary: readonly SoundEffect[];
	secondary: readonly SoundEffect[];
}): SoundEffect[] {
	const seen = new Set(primary.map((sound) => sound.id));
	return [...primary, ...secondary.filter((sound) => !seen.has(sound.id))];
}
