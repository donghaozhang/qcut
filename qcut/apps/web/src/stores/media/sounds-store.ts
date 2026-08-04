/**
 * Sounds Store
 *
 * Manages sound effects search, playback, and saved sounds library.
 * Integrates with Freesound API for sound effect discovery.
 *
 * @module stores/sounds-store
 */

import { create } from "zustand";
import type { SoundEffect, SavedSound } from "@/types/sounds";
import { toast } from "sonner";
import { createObjectURL, revokeObjectURL } from "@/lib/media/blob-manager";
import { createAudioLibraryAssetEntry } from "@/lib/assets/freesound-asset";
import { reportAudioTrackDownload } from "@/lib/audio/audio-download-metrics";
import { ensureAssetResources } from "@/lib/assets/asset-resource-cache";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { translate, type TranslationKey } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale-store";
import {
	AUDIO_FOLDER_NAME_MAX_LENGTH,
	AUDIO_LIBRARY_MAX_FOLDER_ITEMS,
	AUDIO_LIBRARY_MAX_FOLDERS,
	audioLibraryAssetKey,
	loadAudioLibraryFavorites,
	loadAudioLibraryFolders,
	loadAudioLibraryRecents,
	persistAudioLibraryFavorites,
	persistAudioLibraryFolders,
	persistAudioLibraryRecents,
	type AudioLibraryFolder,
} from "@/lib/audio/audio-library-personal";
import { generateUUID } from "@/lib/utils";
import {
	getVisualTimelineEnd,
	type AudioBeatAlignment,
} from "@/lib/audio/audio-library-placement";
import {
	insertAudioLibraryMedia,
	type AudioTimelineAddMode,
} from "./audio-library-timeline";
import type { MediaItem } from "./media-store-types";

export type { AudioTimelineAddMode } from "./audio-library-timeline";

type AudioAssetKind = "sound-effect" | "music";

function localizedAudioMessage({
	key,
	values,
}: {
	key: TranslationKey;
	values?: Record<string, string | number>;
}): string {
	return translate({ locale: useLocaleStore.getState().locale, key, values });
}

// Illegal filename characters for file system safety
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

const MAX_RECENT_SOUNDS = 24;

// Browser detection for SSR safety
const isBrowser = typeof window !== "undefined";

interface SoundsStore {
	topSoundEffects: SoundEffect[];
	isLoading: boolean;
	error: string | null;
	hasLoaded: boolean;

	// Filter state
	showCommercialOnly: boolean;
	toggleCommercialFilter: () => void;

	// Search state
	searchQuery: string;
	searchResults: SoundEffect[];
	isSearching: boolean;
	searchError: string | null;
	lastSearchQuery: string;
	scrollPosition: number;

	// Pagination state
	currentPage: number;
	hasNextPage: boolean;
	totalCount: number;
	isLoadingMore: boolean;

	// Saved sounds state
	savedSounds: SavedSound[];
	isSavedSoundsLoaded: boolean;
	isLoadingSavedSounds: boolean;
	savedSoundsError: string | null;
	recentSounds: SavedSound[];
	audioFolders: AudioLibraryFolder[];

	// Timeline integration
	addSoundToTimeline: (input: {
		sound: SoundEffect;
		kind?: AudioAssetKind;
		startTime?: number;
		mode?: AudioTimelineAddMode;
		autoDucking?: boolean;
		beatAlignment?: AudioBeatAlignment;
	}) => Promise<boolean>;
	addSoundCuesToTimeline: ({
		cues,
	}: {
		cues: Array<{
			sound: SoundEffect;
			kind: AudioAssetKind;
			startTime: number;
		}>;
	}) => Promise<number>;

	setTopSoundEffects: (sounds: SoundEffect[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	setHasLoaded: (loaded: boolean) => void;

	// Search actions
	setSearchQuery: (query: string) => void;
	setSearchResults: (results: SoundEffect[]) => void;
	setSearching: (searching: boolean) => void;
	setSearchError: (error: string | null) => void;
	setLastSearchQuery: (query: string) => void;
	setScrollPosition: (position: number) => void;

	// Pagination actions
	setCurrentPage: (page: number) => void;
	setHasNextPage: (hasNext: boolean) => void;
	setTotalCount: (count: number) => void;
	setLoadingMore: (loading: boolean) => void;
	appendSearchResults: (results: SoundEffect[]) => void;
	appendTopSounds: (results: SoundEffect[]) => void;
	resetPagination: () => void;

	// Saved sounds actions
	loadSavedSounds: () => Promise<void>;
	reloadPersonalLibrary: () => void;
	saveSoundEffect: (
		soundEffect: SoundEffect,
		kind?: AudioAssetKind
	) => Promise<void>;
	removeSavedSound: (soundId: number, kind?: AudioAssetKind) => Promise<void>;
	isSoundSaved: (soundId: number, kind?: AudioAssetKind) => boolean;
	toggleSavedSound: (
		soundEffect: SoundEffect,
		kind?: AudioAssetKind
	) => Promise<void>;
	clearSavedSounds: () => Promise<void>;
	markSoundRecent: (sound: SoundEffect, kind?: AudioAssetKind) => void;
	createAudioFolder: ({ name }: { name: string }) => string | null;
	renameAudioFolder: ({
		folderId,
		name,
	}: {
		folderId: string;
		name: string;
	}) => boolean;
	deleteAudioFolder: ({ folderId }: { folderId: string }) => void;
	toggleSoundInFolder: ({
		folderId,
		sound,
		kind,
	}: {
		folderId: string;
		sound: SoundEffect;
		kind: AudioAssetKind;
	}) => Promise<void>;
	isSoundInFolder: ({
		folderId,
		soundId,
		kind,
	}: {
		folderId: string;
		soundId: number;
		kind: AudioAssetKind;
	}) => boolean;
}

function soundToSavedSound({
	sound,
	kind,
	timestamp,
}: {
	sound: SoundEffect;
	kind: AudioAssetKind;
	timestamp: string;
}): SavedSound {
	return {
		id: sound.id,
		kind,
		name: sound.name,
		username: sound.username,
		previewUrl: sound.previewUrl,
		downloadUrl: sound.downloadUrl,
		duration: sound.duration,
		tags: sound.tags,
		license: sound.license,
		savedAt: timestamp,
		description: sound.description,
		source: sound.source === "sound-effects-lab" ? undefined : sound.source,
		mediaId: sound.mediaId,
		localizedName: sound.localizedName,
		localizedDescription: sound.localizedDescription,
		artworkColors: sound.artworkColors,
		artworkUrl: sound.artworkUrl,
		bpm: sound.bpm,
		musicalKey: sound.musicalKey,
		moods: sound.moods,
		scenes: sound.scenes,
		loopable: sound.loopable,
	};
}

function syncAssetLibraryFavorites({
	sounds,
}: {
	sounds: readonly SavedSound[];
}): void {
	const assetLibrary = useAssetLibraryStore.getState();
	const savedIdentities = new Set(
		sounds.map((sound) =>
			audioLibraryAssetKey({
				kind: sound.kind ?? "sound-effect",
				id: sound.id,
			})
		)
	);
	for (const identity of Object.keys(assetLibrary.favorites)) {
		if (
			(identity.startsWith("music:") || identity.startsWith("sound-effect:")) &&
			!savedIdentities.has(identity)
		) {
			const separator = identity.indexOf(":");
			assetLibrary.setFavorite({
				kind: identity.slice(0, separator) as AudioAssetKind,
				id: identity.slice(separator + 1),
				favorite: false,
			});
		}
	}
	for (const sound of sounds) {
		assetLibrary.setFavorite({
			kind: sound.kind ?? "sound-effect",
			id: String(sound.id),
			favorite: true,
		});
	}
}

function matchesImportedAudioAsset({
	item,
	kind,
	soundId,
}: {
	item: MediaItem;
	kind: AudioAssetKind;
	soundId: number;
}): boolean {
	const metadata = item.metadata as Record<string, unknown> | undefined;
	return (
		item.type === "audio" &&
		metadata?.source === "audio-library" &&
		metadata.audioAssetKind === kind &&
		metadata.audioAssetId === String(soundId)
	);
}

export const useSoundsStore = create<SoundsStore>((set, get) => ({
	topSoundEffects: [],
	isLoading: false,
	error: null,
	hasLoaded: false,
	showCommercialOnly: true,

	toggleCommercialFilter: () => {
		set((state) => ({ showCommercialOnly: !state.showCommercialOnly }));
	},

	// Search state
	searchQuery: "",
	searchResults: [],
	isSearching: false,
	searchError: null,
	lastSearchQuery: "",
	scrollPosition: 0,

	// Pagination state
	currentPage: 1,
	hasNextPage: false,
	totalCount: 0,
	isLoadingMore: false,

	// Saved sounds state
	savedSounds: [],
	isSavedSoundsLoaded: false,
	isLoadingSavedSounds: false,
	savedSoundsError: null,
	recentSounds: [],
	audioFolders: [],

	setTopSoundEffects: (sounds) => set({ topSoundEffects: sounds }),
	setLoading: (loading) => set({ isLoading: loading }),
	setError: (error) => set({ error }),
	setHasLoaded: (loaded) => set({ hasLoaded: loaded }),

	// Search actions
	setSearchQuery: (query) => set({ searchQuery: query }),
	setSearchResults: (results) =>
		set({ searchResults: results, currentPage: 1 }),
	setSearching: (searching) => set({ isSearching: searching }),
	setSearchError: (error) => set({ searchError: error }),
	setLastSearchQuery: (query) => set({ lastSearchQuery: query }),
	setScrollPosition: (position) => set({ scrollPosition: position }),

	// Pagination actions
	setCurrentPage: (page) => set({ currentPage: page }),
	setHasNextPage: (hasNext) => set({ hasNextPage: hasNext }),
	setTotalCount: (count) => set({ totalCount: count }),
	setLoadingMore: (loading) => set({ isLoadingMore: loading }),
	appendSearchResults: (results) =>
		set((state) => {
			const existingIds = new Set(state.searchResults.map((s) => s.id));
			const deduped = results.filter((r) => !existingIds.has(r.id));
			return { searchResults: [...state.searchResults, ...deduped] };
		}),
	appendTopSounds: (results) =>
		set((state) => {
			const existingIds = new Set(state.topSoundEffects.map((s) => s.id));
			const deduped = results.filter((r) => !existingIds.has(r.id));
			return { topSoundEffects: [...state.topSoundEffects, ...deduped] };
		}),
	resetPagination: () =>
		set({
			currentPage: 1,
			hasNextPage: false,
			totalCount: 0,
			isLoadingMore: false,
		}),

	// Saved sounds and folders are persisted locally and synced by user-library.
	loadSavedSounds: async () => {
		if (!isBrowser) return;
		if (get().isSavedSoundsLoaded) return;

		try {
			set({ isLoadingSavedSounds: true, savedSoundsError: null });
			const savedSounds = loadAudioLibraryFavorites();
			const recentSounds = loadAudioLibraryRecents();
			const audioFolders = loadAudioLibraryFolders();

			set({
				savedSounds,
				recentSounds,
				audioFolders,
				isSavedSoundsLoaded: true,
				isLoadingSavedSounds: false,
			});
			syncAssetLibraryFavorites({ sounds: savedSounds });
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: localizedAudioMessage({ key: "audioLibrary.error.loadSaved" });
			set({
				savedSoundsError: errorMessage,
				isLoadingSavedSounds: false,
			});
		}
	},

	reloadPersonalLibrary: () => {
		const savedSounds = loadAudioLibraryFavorites();
		set({
			savedSounds,
			recentSounds: loadAudioLibraryRecents(),
			audioFolders: loadAudioLibraryFolders(),
			isSavedSoundsLoaded: true,
			isLoadingSavedSounds: false,
			savedSoundsError: null,
		});
		syncAssetLibraryFavorites({ sounds: savedSounds });
	},

	saveSoundEffect: async (
		soundEffect: SoundEffect,
		kind: AudioAssetKind = "sound-effect"
	) => {
		if (soundEffect.source === "sound-effects-lab") return;
		try {
			const savedSound = soundToSavedSound({
				sound: soundEffect,
				kind,
				timestamp: new Date().toISOString(),
			});

			const currentSounds = get().savedSounds;
			// Deduplicate by id
			if (
				currentSounds.some(
					(sound) =>
						sound.id === savedSound.id &&
						(sound.kind ?? "sound-effect") === kind
				)
			) {
				return;
			}
			const updatedSounds = [...currentSounds, savedSound];
			persistAudioLibraryFavorites({ sounds: updatedSounds });
			set({ savedSounds: updatedSounds });
			useAssetLibraryStore.getState().setFavorite({
				kind,
				id: String(soundEffect.id),
				favorite: true,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: localizedAudioMessage({ key: "audioLibrary.error.save" });
			set({ savedSoundsError: errorMessage });
			toast.error(localizedAudioMessage({ key: "audioLibrary.error.save" }));
		}
	},

	removeSavedSound: async (
		soundId: number,
		kind: AudioAssetKind = "sound-effect"
	) => {
		try {
			const currentSounds = get().savedSounds;
			const updatedSounds = currentSounds.filter(
				(sound) =>
					sound.id !== soundId || (sound.kind ?? "sound-effect") !== kind
			);
			const assetKey = audioLibraryAssetKey({ kind, id: soundId });
			const updatedFolders = get().audioFolders.map((folder) =>
				folder.assetKeys.includes(assetKey)
					? {
							...folder,
							assetKeys: folder.assetKeys.filter(
								(candidate) => candidate !== assetKey
							),
							updatedAt: Date.now(),
						}
					: folder
			);
			persistAudioLibraryFavorites({ sounds: updatedSounds });
			persistAudioLibraryFolders({ folders: updatedFolders });
			set({ savedSounds: updatedSounds, audioFolders: updatedFolders });
			useAssetLibraryStore.getState().setFavorite({
				kind,
				id: String(soundId),
				favorite: false,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: localizedAudioMessage({ key: "audioLibrary.error.remove" });
			set({ savedSoundsError: errorMessage });
			toast.error(localizedAudioMessage({ key: "audioLibrary.error.remove" }));
		}
	},

	isSoundSaved: (soundId: number, kind: AudioAssetKind = "sound-effect") => {
		const { savedSounds } = get();
		return savedSounds.some(
			(sound) => sound.id === soundId && (sound.kind ?? "sound-effect") === kind
		);
	},

	toggleSavedSound: async (
		soundEffect: SoundEffect,
		kind: AudioAssetKind = "sound-effect"
	) => {
		const { isSoundSaved, saveSoundEffect, removeSavedSound } = get();

		if (isSoundSaved(soundEffect.id, kind)) {
			await removeSavedSound(soundEffect.id, kind);
		} else {
			await saveSoundEffect(soundEffect, kind);
		}
	},

	clearSavedSounds: async () => {
		try {
			for (const sound of get().savedSounds) {
				useAssetLibraryStore.getState().setFavorite({
					kind: sound.kind ?? "sound-effect",
					id: String(sound.id),
					favorite: false,
				});
			}
			const audioFolders = get().audioFolders.map((folder) => ({
				...folder,
				assetKeys: [],
				updatedAt: Date.now(),
			}));
			persistAudioLibraryFavorites({ sounds: [] });
			persistAudioLibraryFolders({ folders: audioFolders });
			set({
				savedSounds: [],
				audioFolders,
				savedSoundsError: null,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: localizedAudioMessage({ key: "audioLibrary.error.clear" });
			set({ savedSoundsError: errorMessage });
			toast.error(localizedAudioMessage({ key: "audioLibrary.error.clear" }));
		}
	},

	markSoundRecent: (sound, kind: AudioAssetKind = "sound-effect") => {
		if (sound.source === "sound-effects-lab") return;
		const recentSound = soundToSavedSound({
			sound,
			kind,
			timestamp: new Date().toISOString(),
		});
		const recentSounds = [
			recentSound,
			...get().recentSounds.filter(
				(item) => item.id !== sound.id || (item.kind ?? "sound-effect") !== kind
			),
		].slice(0, MAX_RECENT_SOUNDS);
		set({ recentSounds });
		// Recent history is best-effort bookkeeping: a storage failure must
		// never reject the timeline insertion that triggered it.
		try {
			persistAudioLibraryRecents({ sounds: recentSounds });
		} catch {
			// Ignore persistence failures (e.g. storage quota exceeded).
		}
	},

	createAudioFolder: ({ name }) => {
		const normalizedName = name.trim();
		if (
			!normalizedName ||
			normalizedName.length > AUDIO_FOLDER_NAME_MAX_LENGTH
		) {
			return null;
		}
		if (get().audioFolders.length >= AUDIO_LIBRARY_MAX_FOLDERS) {
			return null;
		}
		if (
			get().audioFolders.some(
				(folder) =>
					folder.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
			)
		) {
			return null;
		}
		const now = Date.now();
		const folder: AudioLibraryFolder = {
			id: generateUUID(),
			name: normalizedName,
			assetKeys: [],
			createdAt: now,
			updatedAt: now,
		};
		const audioFolders = [...get().audioFolders, folder];
		persistAudioLibraryFolders({ folders: audioFolders });
		set({ audioFolders });
		return folder.id;
	},

	renameAudioFolder: ({ folderId, name }) => {
		const normalizedName = name.trim();
		if (
			!normalizedName ||
			normalizedName.length > AUDIO_FOLDER_NAME_MAX_LENGTH
		) {
			return false;
		}
		if (
			get().audioFolders.some(
				(folder) =>
					folder.id !== folderId &&
					folder.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
			)
		) {
			return false;
		}
		let found = false;
		const audioFolders = get().audioFolders.map((folder) => {
			if (folder.id !== folderId) return folder;
			found = true;
			return { ...folder, name: normalizedName, updatedAt: Date.now() };
		});
		if (!found) return false;
		persistAudioLibraryFolders({ folders: audioFolders });
		set({ audioFolders });
		return true;
	},

	deleteAudioFolder: ({ folderId }) => {
		const audioFolders = get().audioFolders.filter(
			(folder) => folder.id !== folderId
		);
		if (audioFolders.length === get().audioFolders.length) return;
		persistAudioLibraryFolders({ folders: audioFolders });
		set({ audioFolders });
	},

	toggleSoundInFolder: async ({ folderId, sound, kind }) => {
		const assetKey = audioLibraryAssetKey({ kind, id: sound.id });
		const targetFolder = get().audioFolders.find(
			(folder) => folder.id === folderId
		);
		if (!targetFolder) return;
		const includesSound = targetFolder.assetKeys.includes(assetKey);
		if (
			!includesSound &&
			targetFolder.assetKeys.length >= AUDIO_LIBRARY_MAX_FOLDER_ITEMS
		) {
			toast.error(localizedAudioMessage({ key: "audioLibrary.folders.full" }));
			return;
		}
		// Only adding membership implies favoriting; removal must not save.
		if (!includesSound && !get().isSoundSaved(sound.id, kind)) {
			await get().saveSoundEffect(sound, kind);
		}
		const audioFolders = get().audioFolders.map((folder) =>
			folder.id === folderId
				? {
						...folder,
						assetKeys: includesSound
							? folder.assetKeys.filter((candidate) => candidate !== assetKey)
							: [...folder.assetKeys, assetKey],
						updatedAt: Date.now(),
					}
				: folder
		);
		persistAudioLibraryFolders({ folders: audioFolders });
		set({ audioFolders });
	},

	isSoundInFolder: ({ folderId, soundId, kind }) => {
		const assetKey = audioLibraryAssetKey({ kind, id: soundId });
		return (
			get()
				.audioFolders.find((folder) => folder.id === folderId)
				?.assetKeys.includes(assetKey) ?? false
		);
	},

	addSoundCuesToTimeline: ({ cues }) =>
		cues.reduce<Promise<number>>(
			(result, cue) =>
				result.then(async (count) => {
					const added = await get().addSoundToTimeline({
						sound: cue.sound,
						kind: cue.kind,
						startTime: cue.startTime,
					});
					return count + (added ? 1 : 0);
				}),
			Promise.resolve(0)
		),

	addSoundToTimeline: async ({
		sound,
		kind = "sound-effect",
		startTime,
		mode = "single",
		autoDucking = false,
		beatAlignment,
	}: {
		sound: SoundEffect;
		kind?: AudioAssetKind;
		startTime?: number;
		mode?: AudioTimelineAddMode;
		autoDucking?: boolean;
		beatAlignment?: AudioBeatAlignment;
	}) => {
		// Dynamic imports to avoid circular dependencies and improve code splitting
		const [
			{ useProjectStore },
			{ useMediaStore },
			{ useTimelineStore },
			{ usePlaybackStore },
		] = await Promise.all([
			import("../project-store"),
			import("./media-store"),
			import("../timeline/timeline-store"),
			import("../editor/playback-store"),
		]);

		const activeProject = useProjectStore.getState().activeProject;
		if (!activeProject) {
			toast.error(
				localizedAudioMessage({ key: "audioLibrary.error.noProject" })
			);
			return false;
		}

		if (mode === "fit-project" && !sound.loopable) {
			toast.error(
				localizedAudioMessage({ key: "audioLibrary.toast.notLoopable" })
			);
			return false;
		}
		if (
			mode === "fit-project" &&
			getVisualTimelineEnd({
				tracks: useTimelineStore.getState().tracks,
				fps: activeProject.fps,
			}) <= 0
		) {
			toast.error(
				localizedAudioMessage({ key: "audioLibrary.toast.noVisualContent" })
			);
			return false;
		}

		if (sound.mediaId) {
			const mediaItem = useMediaStore
				.getState()
				.mediaItems.find((item) => item.id === sound.mediaId);
			if (!mediaItem) {
				toast.error(
					localizedAudioMessage({ key: "audioLibrary.error.unavailable" })
				);
				return false;
			}
			const insertion = insertAudioLibraryMedia({
				timeline: useTimelineStore.getState(),
				mediaItem,
				mode,
				startTime: startTime ?? usePlaybackStore.getState().currentTime,
				autoDucking,
				bpm: sound.bpm,
				beatAlignment,
				fps: activeProject.fps,
			});
			if (insertion.success) {
				get().markSoundRecent(sound, kind);
				reportAudioTrackDownload({ sound, kind });
			}
			return insertion.success;
		}

		const existingMedia = useMediaStore
			.getState()
			.mediaItems.find((item) =>
				matchesImportedAudioAsset({ item, kind, soundId: sound.id })
			);
		if (existingMedia) {
			const insertion = insertAudioLibraryMedia({
				timeline: useTimelineStore.getState(),
				mediaItem: existingMedia,
				mode,
				startTime: startTime ?? usePlaybackStore.getState().currentTime,
				autoDucking,
				bpm: sound.bpm,
				beatAlignment,
				fps: activeProject.fps,
			});
			if (insertion.success) {
				get().markSoundRecent(sound, kind);
				reportAudioTrackDownload({ sound, kind });
			}
			return insertion.success;
		}

		// Project-backed and already-imported sounds are reused above without a
		// download; only materialization needs a preview URL.
		const audioUrl = sound.previewUrl;
		if (!audioUrl) {
			toast.error(
				localizedAudioMessage({ key: "audioLibrary.error.unavailable" })
			);
			return false;
		}

		let objectUrl: string | null = null;
		const asset = createAudioLibraryAssetEntry({ sound, kind });
		const updateRuntimeState =
			useAssetLibraryStore.getState().updateRuntimeState;

		try {
			updateRuntimeState({
				asset,
				patch: {
					downloadStatus: "downloading",
					cacheStatus: "caching",
					progress: 0.1,
					error: undefined,
				},
			});
			const [resource] = await ensureAssetResources({
				asset,
				cacheBundledResources: true,
				onProgress: ({ progress }) =>
					updateRuntimeState({
						asset,
						patch: { progress: 0.1 + progress * 0.8 },
					}),
				roles: ["preview"],
			});
			const blob = resource?.blob;
			if (!blob) {
				throw new Error(
					localizedAudioMessage({
						key: "audioLibrary.error.downloadUnavailable",
					})
				);
			}
			const contentType = resource.mimeType || blob.type || "audio/mpeg";
			const ext = contentType.includes("ogg")
				? "ogg"
				: contentType.includes("wav")
					? "wav"
					: "mp3";
			const safeName = sound.name
				.replace(ILLEGAL_FILENAME_CHARS, "_")
				.slice(0, 100);
			const file = new File([blob], `${safeName}.${ext}`, {
				type: contentType,
			});

			objectUrl = createObjectURL(file, "sounds-download");

			const mediaId = await useMediaStore
				.getState()
				.addMediaItem(activeProject.id, {
					name: sound.name,
					type: "audio",
					file,
					duration: sound.duration,
					url: objectUrl,
					originalUrl: audioUrl, // Preserve original URL for export
					metadata: {
						source: "audio-library",
						audioAssetKind: kind,
						audioAssetId: String(sound.id),
					},
				});

			const mediaItem = useMediaStore
				.getState()
				.mediaItems.find((item) => item.id === mediaId);
			if (!mediaItem) {
				throw new Error(
					localizedAudioMessage({ key: "audioLibrary.error.mediaCreate" })
				);
			}

			const insertion = insertAudioLibraryMedia({
				timeline: useTimelineStore.getState(),
				mediaItem,
				mode,
				startTime: startTime ?? usePlaybackStore.getState().currentTime,
				autoDucking,
				bpm: sound.bpm,
				beatAlignment,
				fps: activeProject.fps,
			});
			const success = insertion.success;

			if (success) {
				get().markSoundRecent(sound, kind);
				reportAudioTrackDownload({ sound, kind });
				updateRuntimeState({
					asset,
					patch: {
						downloadStatus: "downloaded",
						cacheStatus: "cached",
						progress: 1,
						cacheKey: resource.cacheKey,
						error: undefined,
					},
				});
				if (mode === "fit-project") {
					toast.success(
						localizedAudioMessage({
							key: "audioLibrary.toast.fitAdded",
							values: { count: insertion.segmentCount },
						})
					);
					if (autoDucking && insertion.duckingSourceCount === 0) {
						toast.info(
							localizedAudioMessage({
								key: "audioLibrary.toast.noDuckingSource",
							})
						);
					}
				}
				return true;
			}
			throw new Error(
				localizedAudioMessage({
					key:
						insertion.reason === "no-visual-content"
							? "audioLibrary.toast.noVisualContent"
							: mode === "fit-project"
								? "audioLibrary.error.fitFailed"
								: "audioLibrary.error.overlap",
				})
			);
		} catch (error) {
			updateRuntimeState({
				asset,
				patch: {
					downloadStatus: "failed",
					cacheStatus: "failed",
					progress: 0,
					error:
						error instanceof Error
							? error.message
							: localizedAudioMessage({
									key: "audioLibrary.error.downloadFailed",
								}),
				},
			});
			// Best-effort cleanup: revoke object URL if it was created
			if (objectUrl) {
				try {
					revokeObjectURL(objectUrl);
				} catch {
					// ignore cleanup errors
				}
			}

			toast.error(
				error instanceof Error
					? error.message
					: localizedAudioMessage({ key: "audioLibrary.error.addFailed" }),
				{ id: `sound-${sound.id}` }
			);
			return false;
		}
	},
}));
