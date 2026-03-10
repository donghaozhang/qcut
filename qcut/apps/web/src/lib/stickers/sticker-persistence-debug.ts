/**
 * Debug utilities for sticker persistence issues
 */

import { platform } from "@qcut/platform-core";

/**
 * Gather debugging information about sticker persistence for the active project and print structured console output.
 *
 * This inspects persisted stickers (platform storage or localStorage), current in-memory overlay stickers, and media items,
 * cross-references sticker-to-media relationships, reports ID mismatches and orphaned IDs, and logs results in console groups.
 *
 * @returns An object with `savedStickers`, `currentStickers`, `mediaItems`, and `activeProject`,
 *  or `undefined` if no active project is found.
 */
export async function debugStickerPersistence() {
	const { useStickersOverlayStore } = await import(
		"@/stores/stickers-overlay-store"
	);
	const { useMediaStore } = await import("@/stores/media/media-store");
	const { useProjectStore } = await import("@/stores/project-store");

	const stickerStore = useStickersOverlayStore.getState();
	const mediaStore = useMediaStore.getState();
	const projectStore = useProjectStore.getState();

	const activeProject = projectStore.activeProject;

	if (!activeProject) {
		console.log("❌ No active project");
		return;
	}

	console.group("🔍 Sticker Persistence Debug");

	// Check what's in localStorage/IPC storage
	const storageKey = `overlay-stickers-${activeProject.id}`;
	let savedStickers: any[] = [];

	try {
		if (platform().storage) {
			savedStickers =
				((await platform().storage!.load(storageKey)) as any[] | null) || [];
			console.log("📦 Storage type: Electron IPC");
		} else {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				savedStickers = JSON.parse(stored);
			}
			console.log("📦 Storage type: localStorage");
		}
	} catch (error) {
		console.error("❌ Error loading saved stickers:", error);
	}

	console.log(`💾 Saved stickers (${savedStickers.length}):`, savedStickers);

	// Check current in-memory stickers
	const currentStickers = Array.from(stickerStore.overlayStickers.values());
	console.log(
		`🎯 Current stickers (${currentStickers.length}):`,
		currentStickers
	);

	// Check media items
	const mediaItems = mediaStore.mediaItems;
	console.log(
		`📹 Media items (${mediaItems.length}):`,
		mediaItems.map((m) => ({
			id: m.id,
			name: m.name,
			type: m.type,
			hasFile: !!m.file,
			hasUrl: !!m.url,
		}))
	);

	// Cross-reference stickers with media
	console.group("🔗 Sticker-Media References");

	for (const sticker of currentStickers) {
		const media = mediaItems.find((m) => m.id === sticker.mediaItemId);
		if (media) {
			console.log(
				`✅ Sticker ${sticker.id} -> Media ${media.name} (${media.id})`
			);
		} else {
			console.error(
				`❌ Sticker ${sticker.id} -> Media NOT FOUND (${sticker.mediaItemId})`
			);
		}
	}

	console.groupEnd();

	// Check for ID mismatches
	console.group("🆔 ID Analysis");

	if (savedStickers.length > 0 && currentStickers.length > 0) {
		const savedIds = savedStickers.map((s) => s.mediaItemId);
		const currentIds = currentStickers.map((s) => s.mediaItemId);
		const mediaIds = mediaItems.map((m) => m.id);

		console.log("Saved mediaItemIds:", savedIds);
		console.log("Current mediaItemIds:", currentIds);
		console.log("Available media IDs:", mediaIds);

		// Check if saved IDs match current IDs
		const mismatch = savedIds.some((id, i) => id !== currentIds[i]);
		if (mismatch) {
			console.error(
				"⚠️ ID mismatch detected between saved and current stickers!"
			);
		}

		// Check if any saved IDs are missing from media
		const orphanedIds = savedIds.filter((id) => !mediaIds.includes(id));
		if (orphanedIds.length > 0) {
			console.error("🗑️ Orphaned sticker IDs (no matching media):", orphanedIds);
		}
	}

	console.groupEnd();
	console.groupEnd();

	return {
		savedStickers,
		currentStickers,
		mediaItems,
		activeProject,
	};
}

// Helper to manually save current stickers
export async function forceSaveStickers() {
	const { useStickersOverlayStore } = await import(
		"@/stores/stickers-overlay-store"
	);
	const { useProjectStore } = await import("@/stores/project-store");

	const projectStore = useProjectStore.getState();
	const stickerStore = useStickersOverlayStore.getState();

	if (!projectStore.activeProject?.id) {
		console.error("❌ No active project to save to");
		return;
	}

	await stickerStore.saveToProject(projectStore.activeProject.id);
	console.log("✅ Stickers force-saved to project");
}

// Helper to reload stickers from storage
export async function reloadStickers() {
	const { useStickersOverlayStore } = await import(
		"@/stores/stickers-overlay-store"
	);
	const { useProjectStore } = await import("@/stores/project-store");

	const projectStore = useProjectStore.getState();
	const stickerStore = useStickersOverlayStore.getState();

	if (!projectStore.activeProject?.id) {
		console.error("❌ No active project to load from");
		return;
	}

	await stickerStore.loadFromProject(projectStore.activeProject.id);
	console.log("✅ Stickers reloaded from storage");
}

// Add to window for console access
if (typeof window !== "undefined") {
	(window as any).stickerPersistence = {
		debug: debugStickerPersistence,
		forceSave: forceSaveStickers,
		reload: reloadStickers,
	};

	console.log("🔧 Sticker persistence debug tools loaded:");
	console.log("  stickerPersistence.debug() - Show persistence state");
	console.log("  stickerPersistence.forceSave() - Force save stickers");
	console.log("  stickerPersistence.reload() - Reload from storage");
}
