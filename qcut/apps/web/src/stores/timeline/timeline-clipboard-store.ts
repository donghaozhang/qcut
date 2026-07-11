import { create } from "zustand";
import type {
	CreateTimelineElement,
	MediaElement,
	TimelineElement,
	TrackType,
} from "@/types/timeline";

export type MediaAttributeSnapshot = Partial<
	Pick<
		MediaElement,
		| "volume"
		| "x"
		| "y"
		| "width"
		| "height"
		| "rotation"
		| "effectIds"
		| "colorLabel"
		| "scaleX"
		| "scaleY"
		| "maintainAspectRatio"
		| "flipHorizontal"
		| "flipVertical"
		| "opacity"
		| "blendMode"
		| "fitMode"
		| "crop"
		| "perspective"
		| "keyframes"
		| "animationInType"
		| "animationInDuration"
		| "animationOutType"
		| "animationOutDuration"
		| "comboAnimationType"
		| "comboAnimationIntensity"
		| "adjustments"
		| "color"
		| "mask"
		| "masks"
		| "chromaKey"
		| "enhancements"
		| "audio"
		| "audioFadeIn"
		| "audioFadeOut"
		| "audioNormalize"
		| "audioDenoise"
		| "audioPan"
		| "playbackRate"
		| "speedKeyframes"
		| "reverse"
		| "freezeFrameTime"
		| "freezeFrameDuration"
	>
>;

const MEDIA_ATTRIBUTE_KEYS = [
	"volume",
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"effectIds",
	"colorLabel",
	"scaleX",
	"scaleY",
	"maintainAspectRatio",
	"flipHorizontal",
	"flipVertical",
	"opacity",
	"blendMode",
	"fitMode",
	"crop",
	"perspective",
	"keyframes",
	"animationInType",
	"animationInDuration",
	"animationOutType",
	"animationOutDuration",
	"comboAnimationType",
	"comboAnimationIntensity",
	"adjustments",
	"color",
	"mask",
	"masks",
	"chromaKey",
	"enhancements",
	"audio",
	"audioFadeIn",
	"audioFadeOut",
	"audioNormalize",
	"audioDenoise",
	"audioPan",
	"playbackRate",
	"speedKeyframes",
	"reverse",
	"freezeFrameTime",
	"freezeFrameDuration",
] as const satisfies readonly (keyof MediaAttributeSnapshot)[];

export interface TimelineClipboardEntry {
	trackId: string;
	trackType: TrackType;
	element: TimelineElement;
}

interface TimelineClipboardStore {
	clip: TimelineClipboardEntry | null;
	mediaAttributes: MediaAttributeSnapshot | null;
	copyClip: (entry: TimelineClipboardEntry) => void;
	copyMediaAttributes: (element: MediaElement) => void;
	clear: () => void;
}

function cloneValue<T>({ value }: { value: T }): T {
	return structuredClone(value);
}

export function createMediaAttributeSnapshot({
	element,
}: {
	element: MediaElement;
}): MediaAttributeSnapshot {
	const snapshot: MediaAttributeSnapshot = {};
	for (const key of MEDIA_ATTRIBUTE_KEYS) {
		const value = element[key];
		if (value !== undefined) {
			Object.assign(snapshot, { [key]: cloneValue({ value }) });
		}
	}
	return snapshot;
}

export function createPastedTimelineElement({
	entry,
	startTime,
}: {
	entry: TimelineClipboardEntry;
	startTime: number;
}): CreateTimelineElement {
	const element = cloneValue({ value: entry.element });
	const elementWithoutId = { ...element } as TimelineElement &
		Record<string, unknown>;
	Reflect.deleteProperty(elementWithoutId, "id");
	return {
		...elementWithoutId,
		name: `${element.name} (copy)`,
		startTime: Math.max(0, startTime),
	} as CreateTimelineElement;
}

export const useTimelineClipboardStore = create<TimelineClipboardStore>(
	(set) => ({
		clip: null,
		mediaAttributes: null,
		copyClip: (entry) =>
			set({
				clip: cloneValue({ value: entry }),
			}),
		copyMediaAttributes: (element) =>
			set({ mediaAttributes: createMediaAttributeSnapshot({ element }) }),
		clear: () => set({ clip: null, mediaAttributes: null }),
	})
);
