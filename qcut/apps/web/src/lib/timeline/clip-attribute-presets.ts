import {
	createMediaAttributeSnapshot,
	type MediaAttributeSnapshot,
} from "@/stores/timeline/timeline-clipboard-store";
import type { MediaElement } from "@/types/timeline";
import {
	notifyUserLibraryChanged,
	USER_LIBRARY_NAMESPACES,
} from "@/lib/user-library/user-library-events";

export const CLIP_ATTRIBUTE_PRESET_STORAGE_KEY =
	"qcut-clip-attribute-presets-v1";
const MAX_PRESETS = 20;

export interface ClipAttributePreset {
	id: string;
	name: string;
	createdAt: number;
	attributes: MediaAttributeSnapshot;
}

export function parseClipAttributePreset({
	value,
}: {
	value: unknown;
}): ClipAttributePreset | null {
	if (
		typeof value !== "object" ||
		value === null ||
		!("id" in value) ||
		typeof value.id !== "string" ||
		!("name" in value) ||
		typeof value.name !== "string" ||
		!("createdAt" in value) ||
		typeof value.createdAt !== "number" ||
		!("attributes" in value) ||
		typeof value.attributes !== "object" ||
		value.attributes === null
	) {
		return null;
	}
	return value as ClipAttributePreset;
}

function storageAvailable() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadClipAttributePresets(): ClipAttributePreset[] {
	if (!storageAvailable()) return [];
	try {
		const value = localStorage.getItem(CLIP_ATTRIBUTE_PRESET_STORAGE_KEY);
		if (!value) return [];
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((value) => parseClipAttributePreset({ value }))
			.filter((preset): preset is ClipAttributePreset => preset !== null);
	} catch {
		return [];
	}
}

export function saveClipAttributePreset({
	element,
	name,
}: {
	element: MediaElement;
	name?: string;
}): { preset: ClipAttributePreset; presets: ClipAttributePreset[] } {
	const existing = loadClipAttributePresets();
	const preset: ClipAttributePreset = {
		id:
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `clip-preset-${Date.now()}`,
		name:
			name?.trim() || `${element.name || "Clip"} preset ${existing.length + 1}`,
		createdAt: Date.now(),
		attributes: createMediaAttributeSnapshot({ element }),
	};
	const presets = [preset, ...existing].slice(0, MAX_PRESETS);
	persistClipAttributePresets({ presets });
	return { preset, presets };
}

export function persistClipAttributePresets({
	presets,
}: {
	presets: ClipAttributePreset[];
}): void {
	if (!storageAvailable()) return;
	localStorage.setItem(
		CLIP_ATTRIBUTE_PRESET_STORAGE_KEY,
		JSON.stringify(presets.slice(0, MAX_PRESETS))
	);
	notifyUserLibraryChanged({
		namespace: USER_LIBRARY_NAMESPACES.clipPresets,
	});
}
