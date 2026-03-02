/**
 * Debug utilities for sticker overlay investigation
 * These functions help diagnose mediaItemId mismatch issues
 *
 * Usage: These are meant to be run in the browser console
 * The global window object will have access to stores
 */

/**
 * Console commands for debugging sticker overlay issues
 * Run these directly in browser developer console
 */
export const debugStickerOverlay = {
	/**
	 * Instructions for using debug commands
	 */
	help: () => {
		console.log(`
=== STICKER OVERLAY DEBUG HELP ===

To debug sticker overlay issues, copy and paste these commands directly into the browser console:

1. Check current state:
   console.log('Media Store:', useAsyncMediaStore.getState?.() || 'Hook only - inspect in React DevTools');
   console.log('Sticker Store:', useStickersOverlayStore.getState?.());

2. Find orphaned stickers:
   const stickers = Array.from(useStickersOverlayStore.getState().overlayStickers.values());
   const mediaItems = useAsyncMediaStore.getState?.()?.store?.mediaItems || [];
   const orphaned = stickers.filter(s => !mediaItems.find(m => m.id === s.mediaItemId));
   console.log('Orphaned stickers:', orphaned);

3. Check visibility:
   const currentTime = usePlaybackStore.getState().currentTime;
   const visible = useStickersOverlayStore.getState().getVisibleStickersAtTime(currentTime);
   console.log('Visible stickers:', visible);

4. Performance monitoring:
   console.time('overlay-creation');
   // ... perform action
   console.timeEnd('overlay-creation');

5. Emergency reset (careful!):
   useStickersOverlayStore.getState().overlayStickers.clear();

=====================================
    `);
	},

	/**
	 * Console command strings - copy these to console
	 */
	commands: {
		stateSnapshot: `
// === STATE SNAPSHOT ===
console.log('=== STICKER DEBUG STATE SNAPSHOT ===');
try {
  const mediaStore = window.useAsyncMediaStore?.getState?.() || {};
  const stickerStore = window.useStickersOverlayStore?.getState?.() || {};
  const playbackStore = window.usePlaybackStore?.getState?.() || {};
  
  console.log('Media Store:', {
    loading: mediaStore.loading,
    itemCount: mediaStore.store?.mediaItems?.length || 0,
    items: mediaStore.store?.mediaItems?.map?.(m => ({id: m.id, name: m.name})) || []
  });
  
  console.log('Sticker Store:', {
    stickerCount: stickerStore.overlayStickers?.size || 0,
    stickers: Array.from(stickerStore.overlayStickers?.values?.() || []).map(s => ({
      id: s.id, 
      mediaItemId: s.mediaItemId,
      timing: s.timing
    }))
  });
  
  console.log('Current Time:', playbackStore.currentTime || 0);
  console.log('Timestamp:', new Date().toISOString());
  
} catch (error) {
  console.error('Error accessing stores:', error);
  console.log('Try opening React DevTools to inspect component state');
}
console.log('=====================================');
`,

		findOrphans: `
// === FIND ORPHANED STICKERS ===
console.log('=== ORPHANED STICKERS ANALYSIS ===');
try {
  const stickerStore = window.useStickersOverlayStore?.getState?.() || {};
  const mediaStore = window.useAsyncMediaStore?.getState?.() || {};
  
  const stickers = Array.from(stickerStore.overlayStickers?.values?.() || []);
  const mediaItems = mediaStore.store?.mediaItems || [];
  
  const orphaned = stickers.filter(sticker => 
    !mediaItems.find(media => media.id === sticker.mediaItemId)
  );
  
  console.log('Total Stickers:', stickers.length);
  console.log('Total Media:', mediaItems.length); 
  console.log('Orphaned Count:', orphaned.length);
  
  if (orphaned.length > 0) {
    console.log('Orphaned Details:', orphaned);
    console.log('Available Media IDs:', mediaItems.map(m => m.id));
  } else {
    console.log('✅ All stickers have matching media!');
  }
} catch (error) {
  console.error('Error finding orphaned stickers:', error);
}
console.log('==================================');
`,
	},
};

// Make debug functions globally available in development
if (typeof window !== "undefined" && import.meta.env.DEV) {
	(window as any).debugStickerOverlay = debugStickerOverlay;
	console.log("🐛 Sticker overlay debug utilities loaded");
	console.log("📖 Run debugStickerOverlay.help() for instructions");
}
