import type { TrackType } from "@/types/timeline";

// Track color definitions
export const TRACK_COLORS: Record<
	TrackType,
	{ solid: string; background: string; border: string }
> = {
	media: {
		solid: "bg-blue-500",
		background: "bg-blue-500/20",
		border: "border-white/80",
	},
	text: {
		solid: "bg-[#9C4937]",
		background: "bg-[#9C4937]",
		border: "border-white/80",
	},
	audio: {
		solid: "bg-green-500",
		background: "bg-green-500/20",
		border: "border-white/80",
	},
	sticker: {
		solid: "bg-purple-500",
		background: "bg-purple-500/20",
		border: "border-white/80",
	},
	adjustment: {
		solid: "bg-cyan-600",
		background: "bg-cyan-500/20",
		border: "border-white/80",
	},
	captions: {
		solid: "bg-yellow-500",
		background: "bg-yellow-500/20",
		border: "border-white/80",
	},
	remotion: {
		solid: "bg-violet-500",
		background: "bg-violet-500/20",
		border: "border-white/80",
	},
	markdown: {
		solid: "bg-sky-600",
		background: "bg-sky-500/20",
		border: "border-white/80",
	},
} as const;

// Utility functions
/**
 * Centralized color theming to ensure visual consistency across track types.
 * Each track type has distinct colors to help users quickly identify content types
 * when working with complex timelines containing multiple media elements.
 */
export function getTrackColors(type: TrackType) {
	return TRACK_COLORS[type];
}

/**
 * Pre-computed class combinations for performance - avoids string concatenation
 * in render loops. The background/border combination creates the visual "lane"
 * effect that users expect from professional video editing software.
 */
export function getTrackElementClasses(type: TrackType) {
	const colors = getTrackColors(type);
	return `${colors.background} ${colors.border}`;
}

// Track height definitions
export const TRACK_HEIGHTS: Record<TrackType, number> = {
	media: 65,
	text: 25,
	audio: 50,
	sticker: 40,
	adjustment: 32,
	captions: 30,
	remotion: 55,
	markdown: 55,
} as const;

export const COMPACT_TRACK_HEIGHTS: Record<TrackType, number> = {
	media: 40,
	text: 24,
	audio: 32,
	sticker: 28,
	adjustment: 24,
	captions: 24,
	remotion: 36,
	markdown: 36,
} as const;

/**
 * Different track types need different heights based on their content density:
 * - Media tracks (65px) need space for thumbnails and waveform previews
 * - Text tracks (25px) are compact since they just show text snippets
 * - Audio tracks (50px) need space for waveform visualization
 * These heights are carefully tuned for readability without wasting screen space.
 */
export const TRACK_HEIGHT_LIMITS = { min: 24, max: 140 } as const;

export function getTrackHeight(type: TrackType, customHeight?: number): number {
	if (!Number.isFinite(customHeight)) return TRACK_HEIGHTS[type];
	return Math.min(
		TRACK_HEIGHT_LIMITS.max,
		Math.max(TRACK_HEIGHT_LIMITS.min, customHeight ?? TRACK_HEIGHTS[type])
	);
}

/**
 * Critical for drag-drop positioning - calculates exact Y coordinate where a dragged
 * element should land. The gap handling ensures dropped items appear in the correct
 * track even when users don't drop precisely in the center of the track.
 * Note: trackIndex is exclusive - we calculate height BEFORE that track.
 */
export function getCumulativeHeightBefore(
	tracks: Array<{ type: TrackType; height?: number }>,
	trackIndex: number
): number {
	const GAP = 4; // 4px gap between tracks (equivalent to Tailwind's gap-1)
	return tracks
		.slice(0, trackIndex)
		.reduce(
			(sum, track) => sum + getTrackHeight(track.type, track.height) + GAP,
			0
		);
}

/**
 * Used to size the scrollable timeline container. The gap calculation is tricky:
 * - 0 tracks = 0 gaps
 * - 1 track = 0 gaps
 * - 2 tracks = 1 gap
 * - N tracks = N-1 gaps
 * Getting this wrong causes timeline scrolling issues and misaligned drop zones.
 */
export function getTotalTracksHeight(
	tracks: Array<{ type: TrackType; height?: number }>
): number {
	const GAP = 4; // 4px gap between tracks (equivalent to Tailwind's gap-1)
	const tracksHeight = tracks.reduce(
		(sum, track) => sum + getTrackHeight(track.type, track.height),
		0
	);
	const gapsHeight = Math.max(0, tracks.length - 1) * GAP; // n-1 gaps for n tracks
	return tracksHeight + gapsHeight;
}

/** Sentinel mediaId used for placeholder/test clips that have no real media backing */
export const TEST_MEDIA_ID = "test";

// Other timeline constants
export const TIMELINE_CONSTANTS = {
	ELEMENT_MIN_WIDTH: 2,
	PIXELS_PER_SECOND: 50,
	TRACK_HEIGHT: 60, // Default fallback
	DEFAULT_TEXT_DURATION: 5,
	MARKDOWN_MIN_DURATION: 0.5,
	MARKDOWN_MAX_DURATION: 7200,
	MARKDOWN_DEFAULT_DURATION: 300,
	DEFAULT_IMAGE_DURATION: 5,
	DEFAULT_EMPTY_TIMELINE_DURATION: 7200, // Default duration for empty timeline (2 hours)
	MAX_EXPORT_DURATION: 7200, // 2 hours
	ZOOM_LEVELS: [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 4],
} as const;

// FPS presets for project settings
export const FPS_PRESETS = [
	{ value: "24", label: "24 fps" },
	{ value: "25", label: "25 fps" },
	{ value: "30", label: "30 fps" },
	{ value: "60", label: "60 fps" },
	{ value: "120", label: "120 fps" },
] as const;

// Frame snapping utilities
/**
 * Essential for frame-accurate editing. Rounding to nearest frame prevents
 * sub-frame positioning that would cause playback stuttering or export issues.
 * Professional video editors always work in frame boundaries, not arbitrary decimals.
 */
export function timeToFrame(time: number, fps: number): number {
	return Math.round(time * fps);
}

/**
 * Reverse conversion for display purposes. This is pure math without rounding
 * since we're going from discrete frame numbers back to time representation.
 */
export function frameToTime(frame: number, fps: number): number {
	return frame / fps;
}

/**
 * Critical for precise editing - ensures cuts, transitions, and effects align
 * to frame boundaries. Without this, users get frustrating "almost but not quite"
 * positioning that looks sloppy in final exports.
 * WARNING: Invalid FPS (≤0) returns unmodified time to prevent crashes.
 */
export function snapTimeToFrame(time: number, fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return time; // Fallback for invalid FPS
	const frame = timeToFrame(time, fps);
	return frameToTime(frame, fps);
}

/**
 * Used for fine-grained timeline navigation (frame-by-frame stepping).
 * Higher FPS = smaller time increments = more precise control but higher CPU usage
 * for timeline rendering.
 */
export function getFrameDuration(fps: number): number {
	if (!Number.isFinite(fps) || fps <= 0) return 0;
	return 1 / fps;
}

// Timeline duration utility functions
/**
 * Provides breathing room for editing. Empty timelines with 5 minutes give users
 * space to drag content without immediately hitting the end. This prevents
 * the frustrating "timeline too small" experience that plagues amateur editors.
 * Business rule: Never make timeline smaller than content, but always give workspace.
 */
export function calculateMinimumTimelineDuration(
	contentDuration: number
): number {
	// Always return at least default minimum for empty timeline, but don't limit longer content
	if (!Number.isFinite(contentDuration) || contentDuration <= 0) {
		return TIMELINE_CONSTANTS.DEFAULT_EMPTY_TIMELINE_DURATION;
	}
	return Math.max(
		contentDuration,
		TIMELINE_CONSTANTS.DEFAULT_EMPTY_TIMELINE_DURATION
	);
}

/**
 * Prevents "cliff edge" effect where timeline ends abruptly at content boundary.
 * The 5s minimum handles short clips, 10% scales with longer content.
 * UX insight: Users often need to see "what comes after" when making precise cuts.
 */
export function calculateTimelineBuffer(duration: number): number {
	// Flexible buffer: 5s minimum or 10% of duration, whichever is greater
	const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
	return Math.max(5, safeDuration * 0.1);
}
