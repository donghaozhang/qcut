/**
 * Lazy import utilities for stores to optimize bundle splitting
 * 
 * These wrappers allow dynamic imports to work properly without
 * conflicting with static imports in other parts of the application.
 */

// Cache for loaded stores to avoid repeated imports
const storeCache = new Map<string, any>();

/**
 * Lazily loads the media store when needed
 * @returns Promise<useMediaStore> The media store hook
 */
export async function getMediaStore() {
  const cacheKey = 'media-store';
  
  if (storeCache.has(cacheKey)) {
    return storeCache.get(cacheKey);
  }
  
  try {
    const { useMediaStore } = await import('@/stores/media-store');
    storeCache.set(cacheKey, useMediaStore);
    return useMediaStore;
  } catch (error) {
    console.error('Failed to lazy load media store:', error);
    // Fallback to direct import if dynamic import fails
    const { useMediaStore } = await import('@/stores/media-store');
    return useMediaStore;
  }
}

/**
 * Lazily loads the timeline store when needed
 * @returns Promise<useTimelineStore> The timeline store hook
 */
export async function getTimelineStore() {
  const cacheKey = 'timeline-store';
  
  if (storeCache.has(cacheKey)) {
    return storeCache.get(cacheKey);
  }
  
  try {
    const { useTimelineStore } = await import('@/stores/timeline-store');
    storeCache.set(cacheKey, useTimelineStore);
    return useTimelineStore;
  } catch (error) {
    console.error('Failed to lazy load timeline store:', error);
    // Fallback to direct import if dynamic import fails
    const { useTimelineStore } = await import('@/stores/timeline-store');
    return useTimelineStore;
  }
}

/**
 * Lazily loads the project store when needed
 * @returns Promise<useProjectStore> The project store hook
 */
export async function getProjectStore() {
  const cacheKey = 'project-store';
  
  if (storeCache.has(cacheKey)) {
    return storeCache.get(cacheKey);
  }
  
  try {
    const { useProjectStore } = await import('@/stores/project-store');
    storeCache.set(cacheKey, useProjectStore);
    return useProjectStore;
  } catch (error) {
    console.error('Failed to lazy load project store:', error);
    // Fallback to direct import if dynamic import fails
    const { useProjectStore } = await import('@/stores/project-store');
    return useProjectStore;
  }
}

/**
 * Preloads critical stores for better performance
 * Call this early in the application lifecycle
 */
export async function preloadCriticalStores() {
  try {
    // Preload the most commonly used stores
    await Promise.all([
      getMediaStore(),
      getTimelineStore(),
      getProjectStore(),
    ]);
  } catch (error) {
    console.error('Failed to preload stores:', error);
  }
}

/**
 * Clears the store cache (useful for testing or memory management)
 */
export function clearStoreCache() {
  storeCache.clear();
}