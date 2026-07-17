import type { SavedSound } from "@/types/sounds";
import {
	notifyUserLibraryChanged,
	USER_LIBRARY_NAMESPACES,
} from "@/lib/user-library/user-library-events";
import type { UserLibraryItem } from "@/lib/user-library/user-library-contract";

export const AUDIO_LIBRARY_FAVORITES_STORAGE_KEY = "qcut-saved-sounds";
export const AUDIO_LIBRARY_RECENTS_STORAGE_KEY = "qcut-recent-sounds";
export const AUDIO_LIBRARY_FOLDERS_STORAGE_KEY = "qcut-audio-folders-v1";
export const AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT =
	"qcut:audio-library-personal-changed";

export const AUDIO_LIBRARY_MAX_FOLDERS = 100;
export const AUDIO_LIBRARY_MAX_FOLDER_ITEMS = 500;
export const AUDIO_FOLDER_NAME_MAX_LENGTH = 40;

export type AudioLibraryAssetKind = "music" | "sound-effect";

export interface AudioLibraryFolder {
	id: string;
	name: string;
	assetKeys: string[];
	createdAt: number;
	updatedAt: number;
}

interface AudioLibraryFavoriteCloudItem extends UserLibraryItem {
	id: string;
	type: "favorite";
	sound: SavedSound;
}

interface AudioLibraryFolderCloudItem extends UserLibraryItem {
	id: string;
	type: "folder";
	folder: AudioLibraryFolder;
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function optionalString({ value }: { value: unknown }): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function optionalNumber({ value }: { value: unknown }): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function stringArray({ value }: { value: unknown }): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function parseArtworkColors({
	value,
}: {
	value: unknown;
}): readonly [string, string] | undefined {
	return Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === "string" &&
		typeof value[1] === "string"
		? [value[0], value[1]]
		: undefined;
}

export function audioLibraryAssetKey({
	kind,
	id,
}: {
	kind: AudioLibraryAssetKind;
	id: number;
}): string {
	return `${kind}:${id}`;
}

export function parseSavedAudio({
	value,
}: {
	value: unknown;
}): SavedSound | null {
	const record = asRecord({ value });
	if (
		!record ||
		typeof record.id !== "number" ||
		!Number.isFinite(record.id) ||
		typeof record.name !== "string" ||
		!record.name.trim() ||
		typeof record.username !== "string" ||
		typeof record.duration !== "number" ||
		!Number.isFinite(record.duration) ||
		record.duration < 0 ||
		typeof record.license !== "string" ||
		typeof record.savedAt !== "string"
	) {
		return null;
	}
	const kind =
		record.kind === "music" || record.kind === "sound-effect"
			? record.kind
			: undefined;
	const source =
		record.source === "freesound" ||
		record.source === "qcut" ||
		record.source === "project"
			? record.source
			: undefined;
	return {
		id: record.id,
		kind,
		name: record.name,
		username: record.username,
		previewUrl: optionalString({ value: record.previewUrl }),
		downloadUrl: optionalString({ value: record.downloadUrl }),
		duration: record.duration,
		tags: stringArray({ value: record.tags }),
		license: record.license,
		savedAt: record.savedAt,
		description: optionalString({ value: record.description }),
		source,
		mediaId: optionalString({ value: record.mediaId }),
		localizedName: optionalString({ value: record.localizedName }),
		localizedDescription: optionalString({
			value: record.localizedDescription,
		}),
		artworkColors: parseArtworkColors({ value: record.artworkColors }),
		artworkUrl: optionalString({ value: record.artworkUrl }),
		bpm: optionalNumber({ value: record.bpm }),
		musicalKey: optionalString({ value: record.musicalKey }),
		moods: stringArray({ value: record.moods }),
		scenes: stringArray({ value: record.scenes }),
		loopable:
			typeof record.loopable === "boolean" ? record.loopable : undefined,
	};
}

export function parseAudioLibraryFolder({
	value,
}: {
	value: unknown;
}): AudioLibraryFolder | null {
	const record = asRecord({ value });
	if (
		!record ||
		typeof record.id !== "string" ||
		!record.id.trim() ||
		typeof record.name !== "string" ||
		!record.name.trim() ||
		record.name.trim().length > AUDIO_FOLDER_NAME_MAX_LENGTH ||
		typeof record.createdAt !== "number" ||
		!Number.isFinite(record.createdAt) ||
		typeof record.updatedAt !== "number" ||
		!Number.isFinite(record.updatedAt)
	) {
		return null;
	}
	const assetKeys = [
		...new Set(stringArray({ value: record.assetKeys })),
	].slice(0, AUDIO_LIBRARY_MAX_FOLDER_ITEMS);
	return {
		id: record.id,
		name: record.name.trim(),
		assetKeys,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

function readJsonArray({ key }: { key: string }): unknown[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

export function loadAudioLibraryFavorites(): SavedSound[] {
	return readJsonArray({ key: AUDIO_LIBRARY_FAVORITES_STORAGE_KEY })
		.map((value) => parseSavedAudio({ value }))
		.filter((sound): sound is SavedSound => sound !== null);
}

export function loadAudioLibraryRecents(): SavedSound[] {
	return readJsonArray({ key: AUDIO_LIBRARY_RECENTS_STORAGE_KEY })
		.map((value) => parseSavedAudio({ value }))
		.filter((sound): sound is SavedSound => sound !== null);
}

export function loadAudioLibraryFolders(): AudioLibraryFolder[] {
	return readJsonArray({ key: AUDIO_LIBRARY_FOLDERS_STORAGE_KEY })
		.slice(0, AUDIO_LIBRARY_MAX_FOLDERS)
		.map((value) => parseAudioLibraryFolder({ value }))
		.filter((folder): folder is AudioLibraryFolder => folder !== null);
}

/**
 * Clamp folders to the same limits the readers enforce so writes can never
 * persist data that would silently disappear on the next load.
 */
export function normalizeAudioLibraryFolders({
	folders,
}: {
	folders: readonly AudioLibraryFolder[];
}): AudioLibraryFolder[] {
	return folders.slice(0, AUDIO_LIBRARY_MAX_FOLDERS).map((folder) =>
		folder.assetKeys.length > AUDIO_LIBRARY_MAX_FOLDER_ITEMS
			? {
					...folder,
					assetKeys: folder.assetKeys.slice(0, AUDIO_LIBRARY_MAX_FOLDER_ITEMS),
				}
			: folder
	);
}

function dispatchPersonalLibraryChanged(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new Event(AUDIO_LIBRARY_PERSONAL_CHANGED_EVENT));
}

function notifyAudioLibrarySync(): void {
	notifyUserLibraryChanged({ namespace: USER_LIBRARY_NAMESPACES.audioLibrary });
}

export function persistAudioLibraryFavorites({
	sounds,
	notify = true,
}: {
	sounds: readonly SavedSound[];
	notify?: boolean;
}): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(
		AUDIO_LIBRARY_FAVORITES_STORAGE_KEY,
		JSON.stringify(sounds)
	);
	if (notify) notifyAudioLibrarySync();
}

export function persistAudioLibraryRecents({
	sounds,
}: {
	sounds: readonly SavedSound[];
}): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(
		AUDIO_LIBRARY_RECENTS_STORAGE_KEY,
		JSON.stringify(sounds)
	);
}

export function persistAudioLibraryFolders({
	folders,
	notify = true,
}: {
	folders: readonly AudioLibraryFolder[];
	notify?: boolean;
}): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(
		AUDIO_LIBRARY_FOLDERS_STORAGE_KEY,
		JSON.stringify(normalizeAudioLibraryFolders({ folders }))
	);
	if (notify) notifyAudioLibrarySync();
}

export function loadAudioLibraryCloudItems(): UserLibraryItem[] {
	const favorites: AudioLibraryFavoriteCloudItem[] =
		loadAudioLibraryFavorites().map((sound) => ({
			id: `favorite:${audioLibraryAssetKey({
				kind: sound.kind ?? "sound-effect",
				id: sound.id,
			})}`,
			type: "favorite",
			sound,
		}));
	const folders: AudioLibraryFolderCloudItem[] = loadAudioLibraryFolders().map(
		(folder) => ({
			id: `folder:${folder.id}`,
			type: "folder",
			folder,
		})
	);
	return [...favorites, ...folders];
}

function parseCloudFavorite({
	value,
}: {
	value: UserLibraryItem;
}): SavedSound | null {
	return value.type === "favorite"
		? parseSavedAudio({ value: value.sound })
		: null;
}

function parseCloudFolder({
	value,
}: {
	value: UserLibraryItem;
}): AudioLibraryFolder | null {
	return value.type === "folder"
		? parseAudioLibraryFolder({ value: value.folder })
		: null;
}

export function persistAudioLibraryCloudItems({
	items,
}: {
	items: UserLibraryItem[];
}): void {
	const sounds = items
		.map((item) => parseCloudFavorite({ value: item }))
		.filter((sound): sound is SavedSound => sound !== null);
	const folders = items
		.map((item) => parseCloudFolder({ value: item }))
		.filter((folder): folder is AudioLibraryFolder => folder !== null);
	persistAudioLibraryFavorites({ sounds, notify: false });
	persistAudioLibraryFolders({ folders, notify: false });
	dispatchPersonalLibraryChanged();
}
