/**
 * Sticker Overlay Types
 *
 * These types define the structure for overlay stickers that appear
 * on top of the video preview. Overlay stickers are separate from
 * timeline elements to maintain simplicity and avoid timeline complexity.
 */

import type {
	MediaAnimationType,
	MediaPerspective,
	StickerAnimationLoopType,
} from "./timeline";

/**
 * Represents a single sticker in the overlay system
 * Position and size are stored as percentages for responsive scaling
 */
export type OverlaySticker = {
	/** Unique identifier for the overlay sticker instance */
	id: string;

	/** Reference to the media item in the media store */
	mediaItemId: string;

	/** Position relative to canvas (0-100%) */
	position: {
		x: number; // Percentage from left (0-100)
		y: number; // Percentage from top (0-100)
	};

	/** Size relative to canvas (0-100%) */
	size: {
		width: number; // Percentage of canvas width
		height: number; // Percentage of canvas height
	};

	/** Rotation in degrees (0-360) */
	rotation: number;

	/** Opacity level (0-1) where 0 is transparent and 1 is opaque */
	opacity: number;

	/** Layer order - higher values appear on top */
	zIndex: number;

	/** Whether the sticker maintains aspect ratio when resizing */
	maintainAspectRatio: boolean;

	/** Four-corner destination coordinates normalized to the sticker bounds. */
	perspective?: MediaPerspective;

	animationInType?: MediaAnimationType;
	animationInDuration?: number;
	animationOutType?: MediaAnimationType;
	animationOutDuration?: number;
	animationLoopType?: StickerAnimationLoopType;
	animationLoopIntensity?: number;

	/** @deprecated Timing is now controlled by timeline StickerElement. This field is ignored. */
	timing?: {
		startTime?: number;
		endTime?: number;
		durationMs?: number;
	};

	/** Metadata for tracking and debugging */
	metadata?: {
		addedAt: number; // Timestamp when added
		lastModified: number; // Timestamp of last change
		source?: "library" | "upload" | "media"; // Where it came from
	};
};

/**
 * State interface for the overlay store
 */
export type StickerOverlayState = {
	/** Map of all overlay stickers by ID for efficient lookups */
	overlayStickers: Map<string, OverlaySticker>;

	/** Currently selected sticker ID for editing */
	selectedStickerId: string | null;

	/** UI state flags */
	isDragging: boolean;
	isResizing: boolean;
	isRotating: boolean;

	/** History for undo/redo functionality */
	history: {
		past: OverlaySticker[][];
		future: OverlaySticker[][];
	};
};

/**
 * Actions interface for the overlay store
 */
export type StickerOverlayActions = {
	// CRUD Operations
	addOverlaySticker: (
		mediaItemId: string,
		options?: Partial<OverlaySticker>
	) => string;
	removeOverlaySticker: (id: string) => void;
	updateOverlaySticker: (
		id: string,
		updates: Partial<OverlaySticker>,
		options?: { syncTimeline?: boolean }
	) => void;
	clearAllStickers: () => void;

	// Selection
	selectSticker: (id: string | null) => void;

	// Layering
	bringToFront: (id: string) => void;
	sendToBack: (id: string) => void;
	bringForward: (id: string) => void;
	sendBackward: (id: string) => void;

	// UI State
	setIsDragging: (isDragging: boolean) => void;
	setIsResizing: (isResizing: boolean) => void;
	setIsRotating: (isRotating: boolean) => void;

	// History
	undo: () => void;
	redo: () => void;
	saveHistorySnapshot: (options?: { syncTimelineHistory?: boolean }) => void;

	// Persistence
	saveToProject: (projectId: string) => Promise<void>;
	loadFromProject: (projectId: string) => Promise<void>;
	cleanupInvalidStickers: (availableMediaIds: string[]) => void;

	// Export
	getStickersForExport: () => OverlaySticker[];
	getVisibleStickersAtTime: (time: number) => OverlaySticker[];

	// Internal
	autoSaveSticker: (stickerId: string) => Promise<void>;
};

/**
 * Combined type for the complete store
 */
export type StickerOverlayStore = StickerOverlayState & StickerOverlayActions;

/**
 * Helper type for sticker updates with validation
 */
export type ValidatedStickerUpdate = Partial<
	Omit<OverlaySticker, "id" | "mediaItemId">
>;

/**
 * Z-index management constants
 */
export const Z_INDEX = {
	MIN: 1,
	MAX: 9999,
	INCREMENT: 10,
} as const;

/**
 * Constants for overlay stickers - matches OverlaySticker type
 */
export const STICKER_DEFAULTS = {
	position: { x: 50, y: 50 },
	size: { width: 15, height: 15 },
	rotation: 0,
	opacity: 1,
	maintainAspectRatio: true,
	perspective: {
		topLeftX: 0,
		topLeftY: 0,
		topRightX: 1,
		topRightY: 0,
		bottomRightX: 1,
		bottomRightY: 1,
		bottomLeftX: 0,
		bottomLeftY: 1,
	},
	animationInType: "none",
	animationInDuration: 0.5,
	animationOutType: "none",
	animationOutDuration: 0.5,
	animationLoopType: "none",
	animationLoopIntensity: 0.5,
	zIndex: Z_INDEX.MIN,
} as const;

/**
 * Constraints for sticker sizing and validation
 */
export const STICKER_CONSTRAINTS = {
	minSize: { width: 5, height: 5 },
	maxSize: { width: 100, height: 100 },
} as const;
