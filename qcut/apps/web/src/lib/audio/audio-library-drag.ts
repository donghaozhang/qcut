import type { AudioLibraryKind } from "./audio-library-catalog";
import type { SoundEffect } from "@/types/sounds";

export const AUDIO_LIBRARY_DRAG_MIME = "application/x-qcut-audio-library";

export interface AudioLibraryDragPayload {
	kind: AudioLibraryKind;
	sound: SoundEffect;
}

export function serializeAudioLibraryDrag({
	payload,
}: {
	payload: AudioLibraryDragPayload;
}): string {
	return JSON.stringify(payload);
}

export function parseAudioLibraryDrag({
	value,
}: {
	value: string;
}): AudioLibraryDragPayload | null {
	try {
		const candidate = JSON.parse(value) as Partial<AudioLibraryDragPayload>;
		if (
			(candidate.kind !== "music" && candidate.kind !== "sound-effect") ||
			!candidate.sound ||
			typeof candidate.sound.id !== "number" ||
			typeof candidate.sound.name !== "string" ||
			typeof candidate.sound.duration !== "number"
		) {
			return null;
		}
		return { kind: candidate.kind, sound: candidate.sound };
	} catch {
		return null;
	}
}
