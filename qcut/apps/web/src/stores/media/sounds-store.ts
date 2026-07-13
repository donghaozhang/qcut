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
import { createFreesoundAssetEntry } from "@/lib/assets/freesound-asset";
import { useAssetLibraryStore } from "@/stores/asset-library-store";

type AudioAssetKind = "sound-effect" | "music";

// Illegal filename characters for file system safety
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

// Constants for localStorage
const SAVED_SOUNDS_KEY = "qcut-saved-sounds";

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

	// Timeline integration
	addSoundToTimeline: (
		sound: SoundEffect,
		kind?: AudioAssetKind
	) => Promise<boolean>;

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

	// Saved sounds actions (simplified - using localStorage for now)
	loadSavedSounds: async () => {
		if (!isBrowser) return;
		if (get().isSavedSoundsLoaded) return;

		try {
			set({ isLoadingSavedSounds: true, savedSoundsError: null });
			const savedSoundsJson = localStorage.getItem(SAVED_SOUNDS_KEY);

			let savedSounds: SavedSound[] = [];
			if (savedSoundsJson) {
				try {
					const parsed = JSON.parse(savedSoundsJson);
					savedSounds = Array.isArray(parsed) ? parsed : [];
				} catch {
					// Invalid JSON, start with empty array
					localStorage.removeItem(SAVED_SOUNDS_KEY);
				}
			}

			set({
				savedSounds,
				isSavedSoundsLoaded: true,
				isLoadingSavedSounds: false,
			});
			for (const sound of savedSounds) {
				useAssetLibraryStore.getState().setFavorite({
					kind: sound.kind ?? "sound-effect",
					id: String(sound.id),
					favorite: true,
				});
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to load saved sounds";
			set({
				savedSoundsError: errorMessage,
				isLoadingSavedSounds: false,
			});
		}
	},

	saveSoundEffect: async (
		soundEffect: SoundEffect,
		kind: AudioAssetKind = "sound-effect"
	) => {
		try {
			const savedSound: SavedSound = {
				id: soundEffect.id,
				kind,
				name: soundEffect.name,
				username: soundEffect.username,
				previewUrl: soundEffect.previewUrl,
				downloadUrl: soundEffect.downloadUrl,
				duration: soundEffect.duration,
				tags: soundEffect.tags,
				license: soundEffect.license,
				savedAt: new Date().toISOString(),
			};

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
			if (isBrowser) {
				localStorage.setItem(SAVED_SOUNDS_KEY, JSON.stringify(updatedSounds));
			}
			set({ savedSounds: updatedSounds });
			useAssetLibraryStore.getState().setFavorite({
				kind,
				id: String(soundEffect.id),
				favorite: true,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to save sound";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to save sound");
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
			if (isBrowser) {
				localStorage.setItem(SAVED_SOUNDS_KEY, JSON.stringify(updatedSounds));
			}
			set({ savedSounds: updatedSounds });
			useAssetLibraryStore.getState().setFavorite({
				kind,
				id: String(soundId),
				favorite: false,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to remove sound";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to remove sound");
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
			if (isBrowser) {
				localStorage.removeItem(SAVED_SOUNDS_KEY);
			}
			set({
				savedSounds: [],
				savedSoundsError: null,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to clear saved sounds";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to clear saved sounds");
		}
	},

	addSoundToTimeline: async (sound, kind: AudioAssetKind = "sound-effect") => {
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
			toast.error("No active project");
			return false;
		}

		const audioUrl = sound.previewUrl;
		if (!audioUrl) {
			toast.error("Sound file not available");
			return false;
		}

		let objectUrl: string | null = null;
		const asset = createFreesoundAssetEntry({ sound, kind });
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
			const response = await fetch(audioUrl);
			if (!response.ok)
				throw new Error(`Failed to download audio: ${response.statusText}`);

			const blob = await response.blob();
			const contentType = response.headers.get("content-type") || "audio/mpeg";
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
				});

			const mediaItem = useMediaStore
				.getState()
				.mediaItems.find((item) => item.id === mediaId);
			if (!mediaItem) throw new Error("Failed to create media item");

			const success = useTimelineStore
				.getState()
				.addMediaAtTime(mediaItem, usePlaybackStore.getState().currentTime);

			if (success) {
				updateRuntimeState({
					asset,
					patch: {
						downloadStatus: "downloaded",
						cacheStatus: "cached",
						progress: 1,
						cacheKey: mediaId,
						error: undefined,
					},
				});
				return true;
			}
			throw new Error("Failed to add to timeline - check for overlaps");
		} catch (error) {
			updateRuntimeState({
				asset,
				patch: {
					downloadStatus: "failed",
					cacheStatus: "failed",
					progress: 0,
					error:
						error instanceof Error ? error.message : "Audio download failed",
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
					: "Failed to add sound to timeline",
				{ id: `sound-${sound.id}` }
			);
			return false;
		}
	},
}));
