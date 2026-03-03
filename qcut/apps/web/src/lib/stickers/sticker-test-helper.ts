/**
 * Test helper for sticker overlay functionality
 * Run in browser console to test timeline integration
 */

import { debugLog } from "@/lib/debug/debug-config";

// Readiness promise — E2E tests wait on this to avoid the race condition
// where window.stickerTest is accessed before async setup completes.
let resolveReady: () => void;
const stickerTestReady = new Promise<void>((r) => {
	resolveReady = r;
});
(window as any).stickerTestReady = stickerTestReady;

export function setupStickerTest() {
	// Make stores available globally for testing
	const setupTestEnvironment = async () => {
		const { useStickersOverlayStore } = await import(
			"@/stores/stickers-overlay-store"
		);
		const { useTimelineStore } = await import(
			"@/stores/timeline/timeline-store"
		);
		const { useMediaStore } = await import("@/stores/media/media-store");

		// Clean up orphaned stickers
		const cleanupOrphans = () => {
			const stickerStore = useStickersOverlayStore.getState();
			const mediaStore = useMediaStore.getState();

			debugLog("🧹 Cleaning up orphaned stickers...");
			const mediaIds = mediaStore.mediaItems.map((item) => item.id);
			const cleaned = stickerStore.cleanupInvalidStickers(mediaIds);
			debugLog(`✅ Cleanup complete. Cleaned ${cleaned} orphaned stickers`);

			// Also clear if no media exists
			if (
				mediaStore.mediaItems.length === 0 &&
				stickerStore.overlayStickers.size > 0
			) {
				stickerStore.clearAllStickers();
				debugLog("✅ Cleared all stickers (no media items exist)");
			}
		};

		// Test adding sticker to timeline
		const testTimelineIntegration = async () => {
			const mediaStore = useMediaStore.getState();
			const stickerStore = useStickersOverlayStore.getState();
			const timelineStore = useTimelineStore.getState();

			if (mediaStore.mediaItems.length === 0) {
				debugLog("❌ No media items available. Please add some media first.");
				return;
			}

			// Use first image media item
			const testMedia = mediaStore.mediaItems.find(
				(item) => item.type === "image"
			);
			if (!testMedia) {
				debugLog("❌ No image media items available. Please add an image.");
				return;
			}

			debugLog(`🎯 Testing with media: ${testMedia.name} (${testMedia.id})`);

			// Add sticker overlay
			const stickerId = await stickerStore.addOverlaySticker(testMedia.id, {
				position: { x: 50, y: 50 },
				timing: { startTime: 0, endTime: 5 },
			});

			debugLog(`✅ Added sticker: ${stickerId}`);

			// Check timeline
			setTimeout(() => {
				const updatedTimeline = useTimelineStore.getState();
				const stickerTrack = updatedTimeline.tracks.find(
					(t) => t.type === "sticker"
				);

				if (stickerTrack) {
					debugLog("✅ Sticker track found:", stickerTrack);
					const hasStickerId = (el: unknown): el is { stickerId?: string } =>
						!!el && typeof (el as any).stickerId === "string";
					const stickerElement = stickerTrack.elements.find(
						(el) => hasStickerId(el) && el.stickerId === stickerId
					);
					if (stickerElement) {
						debugLog("✅ Sticker element found in timeline:", stickerElement);
					} else {
						debugLog("❌ Sticker element NOT found in timeline");
					}
				} else {
					debugLog("❌ Sticker track NOT found in timeline");
				}

				// Show current state
				debugLog("📊 Current state:", {
					stickers: Array.from(stickerStore.overlayStickers.values()),
					tracks: updatedTimeline.tracks.map((t) => ({
						id: t.id,
						type: t.type,
						elements: t.elements.length,
					})),
				});
			}, 1000);
		};

		// Export test functions globally
		(window as any).stickerTest = {
			cleanup: cleanupOrphans,
			test: testTimelineIntegration,
			getStores: () => ({
				stickers: useStickersOverlayStore.getState(),
				timeline: useTimelineStore.getState(),
				media: useMediaStore.getState(),
			}),
			clearAll: () => {
				useStickersOverlayStore.getState().clearAllStickers();
				debugLog("✅ Cleared all stickers");
			},
		};

		// Signal readiness — E2E tests wait on this promise
		resolveReady();

		debugLog("🚀 Sticker test helper loaded!");
		debugLog("Commands:");
		debugLog("  stickerTest.cleanup() - Clean orphaned stickers");
		debugLog("  stickerTest.test() - Test timeline integration");
		debugLog("  stickerTest.clearAll() - Clear all stickers");
		debugLog("  stickerTest.getStores() - Get current store states");
	};

	setupTestEnvironment().catch((err) => {
		console.error("[sticker-test-helper] setup failed:", err);
		// Still resolve so tests don't hang — they'll fail on missing stores instead
		resolveReady();
	});
}

// Always setup test helpers - needed for E2E tests which run against production builds
setupStickerTest();
