/**
 * Moyin per-project persistence helpers.
 * Handles save/load of Moyin state to localStorage scoped by project ID.
 * Extracted from moyin-store.ts to keep it under 800 lines.
 */

import type {
	Episode,
	ScriptCharacter,
	ScriptScene,
	Shot,
	ScriptData,
} from "@/types/moyin-script";
export type ParseStatus = "idle" | "parsing" | "ready" | "error";

/** Fields that get persisted per project. */
export interface MoyinPersistedState {
	rawScript: string;
	scriptData: ScriptData | null;
	parseStatus: ParseStatus;
	characters: ScriptCharacter[];
	scenes: ScriptScene[];
	shots: Shot[];
	episodes: Episode[];
	selectedStyleId: string;
	selectedProfileId: string;
	language: string;
	sceneCount: string;
	shotCount: string;
	imageProvider?: "fal" | "gmi";
	videoProvider?: "fal" | "gmi";
}

// Kept at 4 — adding the optional `imageProvider`/`videoProvider` fields is
// fully backward compatible: old envelopes simply lack those keys and the
// store defaults to `"fal"` via initialState during `loadProject`. Bumping
// the version would silently discard every user's prior moyin state.
const STORAGE_VERSION = 4;
const STORAGE_PREFIX = "moyin-project-";

export function getMoyinStorageKey(projectId: string): string {
	return `${STORAGE_PREFIX}${projectId}`;
}

/** Extract only the fields we want to persist from full state. */
export function partializeMoyinState(state: {
	rawScript: string;
	scriptData: ScriptData | null;
	parseStatus: ParseStatus;
	characters: ScriptCharacter[];
	scenes: ScriptScene[];
	shots: Shot[];
	episodes: Episode[];
	selectedStyleId: string;
	selectedProfileId: string;
	language: string;
	sceneCount: string;
	shotCount: string;
	imageProvider?: "fal" | "gmi";
	videoProvider?: "fal" | "gmi";
}): MoyinPersistedState {
	return {
		rawScript: state.rawScript,
		scriptData: state.scriptData,
		parseStatus: state.parseStatus,
		characters: state.characters,
		scenes: state.scenes,
		shots: state.shots,
		episodes: state.episodes,
		selectedStyleId: state.selectedStyleId,
		selectedProfileId: state.selectedProfileId,
		language: state.language,
		sceneCount: state.sceneCount,
		shotCount: state.shotCount,
		imageProvider: state.imageProvider,
		videoProvider: state.videoProvider,
	};
}

interface StorageEnvelope {
	version: number;
	data: MoyinPersistedState;
}

/** Save project state to localStorage. */
export function saveMoyinProject(
	projectId: string,
	state: MoyinPersistedState
): void {
	if (!projectId) return;
	try {
		const envelope: StorageEnvelope = { version: STORAGE_VERSION, data: state };
		localStorage.setItem(
			getMoyinStorageKey(projectId),
			JSON.stringify(envelope)
		);
	} catch {
		// localStorage full or unavailable — silently skip
	}
}

/** Load project state from localStorage. Returns null if not found. */
export function loadMoyinProject(
	projectId: string
): MoyinPersistedState | null {
	if (!projectId) return null;
	try {
		const raw = localStorage.getItem(getMoyinStorageKey(projectId));
		if (!raw) return null;
		const envelope = JSON.parse(raw) as StorageEnvelope;
		if (envelope.version !== STORAGE_VERSION) return null;
		return envelope.data;
	} catch {
		return null;
	}
}

/** Remove persisted data for a project. */
export function clearMoyinProject(projectId: string): void {
	if (!projectId) return;
	localStorage.removeItem(getMoyinStorageKey(projectId));
}

/** Export project state as a downloadable JSON file. */
export function exportProjectJSON(
	state: MoyinPersistedState,
	title?: string
): void {
	const envelope: StorageEnvelope = { version: STORAGE_VERSION, data: state };
	const json = JSON.stringify(envelope, null, 2);
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `moyin-project-${title || "export"}-${Date.now()}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

/** Validate and parse an imported JSON project file. Returns null if invalid. */
export function parseImportedProjectJSON(
	json: string
): MoyinPersistedState | null {
	try {
		const envelope = JSON.parse(json) as StorageEnvelope;
		if (!envelope || typeof envelope.version !== "number" || !envelope.data)
			return null;
		const d = envelope.data;
		if (
			!Array.isArray(d.characters) ||
			!Array.isArray(d.scenes) ||
			!Array.isArray(d.shots)
		)
			return null;
		return d;
	} catch {
		return null;
	}
}
