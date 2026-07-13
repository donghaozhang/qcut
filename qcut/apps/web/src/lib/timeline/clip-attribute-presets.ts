import {
	createMediaAttributeSnapshot,
	type MediaAttributeSnapshot,
} from "@/stores/timeline/timeline-clipboard-store";
import type { MediaElement } from "@/types/timeline";

const STORAGE_KEY = "qcut-clip-attribute-presets-v1";
const MAX_PRESETS = 20;

export interface ClipAttributePreset {
	id: string;
	name: string;
	createdAt: number;
	attributes: MediaAttributeSnapshot;
}

function storageAvailable() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadClipAttributePresets(): ClipAttributePreset[] {
	if (!storageAvailable()) return [];
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		if (!value) return [];
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(candidate): candidate is ClipAttributePreset =>
				typeof candidate === "object" &&
				candidate !== null &&
				"id" in candidate &&
				typeof candidate.id === "string" &&
				"name" in candidate &&
				typeof candidate.name === "string" &&
				"createdAt" in candidate &&
				typeof candidate.createdAt === "number" &&
				"attributes" in candidate &&
				typeof candidate.attributes === "object" &&
				candidate.attributes !== null
		);
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
	if (storageAvailable()) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
	}
	return { preset, presets };
}
