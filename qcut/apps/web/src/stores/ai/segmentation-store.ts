/**
 * Segmentation Store
 *
 * Manages state for SAM-3 image and video segmentation.
 * Follows pattern from adjustment-store.ts.
 *
 * @module SegmentationStore
 */

import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import type {
	Sam3PointPrompt,
	Sam3BoxPrompt,
	Sam3ImageOutput,
	Sam3SegmentationMode,
} from "@/types/sam3";
import type { PersonCutoutMaskOptions } from "@/lib/segmentation/person-cutout-mask";
import type { MediaMaskTrackingDirection } from "@/types/timeline";

// ============================================
// Object Colors for Multi-Object Segmentation
// ============================================

export const OBJECT_COLORS = [
	{ name: "Cyan", hex: "#00CED1", rgb: "0, 206, 209" },
	{ name: "Pink", hex: "#FF69B4", rgb: "255, 105, 180" },
	{ name: "Blue", hex: "#4169E1", rgb: "65, 105, 225" },
	{ name: "Orange", hex: "#FFA500", rgb: "255, 165, 0" },
	{ name: "Green", hex: "#32CD32", rgb: "50, 205, 50" },
	{ name: "Purple", hex: "#9370DB", rgb: "147, 112, 219" },
	{ name: "Yellow", hex: "#FFD700", rgb: "255, 215, 0" },
	{ name: "Lime", hex: "#7FFF00", rgb: "127, 255, 0" },
	{ name: "Red", hex: "#FF6347", rgb: "255, 99, 71" },
] as const;

// ============================================
// Types
// ============================================

export interface SegmentedObject {
	/** Unique object ID */
	id: string;
	/** Display name (e.g., "Object 1", "Dog") */
	name: string;
	/** Color index from OBJECT_COLORS */
	colorIndex: number;
	/** Mask image URL */
	maskUrl?: string;
	/** Local blob URL for mask drawing (COEP-safe) */
	maskBlobUrl?: string;
	/** Visibility flag for mask rendering */
	visible?: boolean;
	/** Thumbnail crop URL */
	thumbnailUrl?: string;
	/** Confidence score (0-1) */
	score?: number;
	/** Bounding box [cx, cy, w, h] normalized */
	boundingBox?: number[];
	/** Point prompts used to define this object */
	pointPrompts: Sam3PointPrompt[];
	/** Box prompts used to define this object */
	boxPrompts: Sam3BoxPrompt[];
	/** Text prompt used to detect this object */
	textPrompt?: string;
}

export interface SegmentationState {
	// Mode
	mode: "image" | "video";
	promptMode: Sam3SegmentationMode;

	// Source media
	sourceImageUrl: string | null;
	sourceImageFile: File | null;
	sourceVideoUrl: string | null;
	sourceVideoFile: File | null;

	// Image dimensions (for coordinate mapping)
	imageWidth: number;
	imageHeight: number;

	// Segmented objects
	objects: SegmentedObject[];
	selectedObjectId: string | null;
	nextObjectId: number;

	// Current prompts (before submission)
	currentPointPrompts: Sam3PointPrompt[];
	currentBoxPrompts: Sam3BoxPrompt[];
	currentTextPrompt: string;

	// Composite result
	compositeImageUrl: string | null;
	masks: Sam3ImageOutput[];

	// Processing state
	isProcessing: boolean;
	progress: number;
	statusMessage: string;
	elapsedTime: number;

	// UI state
	showObjectList: boolean;
	maskOpacity: number;
	showBoundingBoxes: boolean;

	// Video-specific state
	videoBackend: "local-person" | "sam3";
	personCutoutSettings: PersonCutoutMaskOptions;
	currentFrame: number;
	totalFrames: number;
	segmentedVideoUrl: string | null;
	trackingRequest: {
		requestId: string;
		elementId: string;
		maskId: string;
		direction: MediaMaskTrackingDirection;
		anchorFrame: number;
	} | null;
}

export interface SegmentationActions {
	// Mode
	setMode: (mode: "image" | "video") => void;
	setPromptMode: (mode: Sam3SegmentationMode) => void;

	// Source media
	setSourceImage: (file: File, url: string) => void;
	setSourceVideo: (file: File, url: string) => void;
	clearSource: () => void;
	setImageDimensions: (width: number, height: number) => void;

	// Object management
	addObject: (object: Omit<SegmentedObject, "id" | "colorIndex">) => string;
	updateObject: (id: string, updates: Partial<SegmentedObject>) => void;
	toggleObjectVisibility: (id: string) => void;
	removeObject: (id: string) => void;
	selectObject: (id: string | null) => void;
	renameObject: (id: string, name: string) => void;
	clearObjects: () => void;

	// Prompt management
	addPointPrompt: (prompt: Sam3PointPrompt) => void;
	removePointPrompt: (index: number) => void;
	addBoxPrompt: (prompt: Sam3BoxPrompt) => void;
	removeBoxPrompt: (index: number) => void;
	setTextPrompt: (prompt: string) => void;
	clearCurrentPrompts: () => void;

	// Results
	setCompositeImage: (url: string) => void;
	setMasks: (masks: Sam3ImageOutput[]) => void;
	setSegmentedVideo: (url: string | null) => void;

	// Processing state
	setProcessingState: (state: {
		isProcessing: boolean;
		progress?: number;
		statusMessage?: string;
		elapsedTime?: number;
	}) => void;

	// UI state
	toggleObjectList: () => void;
	setMaskOpacity: (opacity: number) => void;
	toggleBoundingBoxes: () => void;

	// Video controls
	setVideoBackend: (backend: "local-person" | "sam3") => void;
	updatePersonCutoutSettings: (
		settings: Partial<SegmentationState["personCutoutSettings"]>
	) => void;
	setCurrentFrame: (frame: number) => void;
	setTotalFrames: (frames: number) => void;
	setTrackingRequest: (
		request: NonNullable<SegmentationState["trackingRequest"]>
	) => void;
	clearTrackingRequest: () => void;

	// Reset
	resetStore: () => void;
}

type SegmentationStore = SegmentationState & SegmentationActions;

// ============================================
// Initial State
// ============================================

const initialState: SegmentationState = {
	mode: "image",
	promptMode: "text",

	sourceImageUrl: null,
	sourceImageFile: null,
	sourceVideoUrl: null,
	sourceVideoFile: null,

	imageWidth: 0,
	imageHeight: 0,

	objects: [],
	selectedObjectId: null,
	nextObjectId: 1,

	currentPointPrompts: [],
	currentBoxPrompts: [],
	currentTextPrompt: "",

	compositeImageUrl: null,
	masks: [],

	isProcessing: false,
	progress: 0,
	statusMessage: "",
	elapsedTime: 0,

	showObjectList: true,
	maskOpacity: 1.0, // Full visibility of segmentation mask by default
	showBoundingBoxes: false,

	videoBackend: "local-person",
	personCutoutSettings: {
		threshold: 0.5,
		temporalSmoothing: 0.65,
		edgeShift: 0,
		feather: 2,
	},
	currentFrame: 0,
	totalFrames: 0,
	segmentedVideoUrl: null,
	trackingRequest: null,
};

// ============================================
// Store
// ============================================

export const useSegmentationStore = create<SegmentationStore>()(
	devtools(
		subscribeWithSelector((set, get) => ({
			...initialState,

			// Mode
			setMode: (mode) => set({ mode }, false, "segmentation/setMode"),
			setPromptMode: (promptMode) =>
				set({ promptMode }, false, "segmentation/setPromptMode"),

			// Source media
			setSourceImage: (file, url) =>
				set(
					{
						sourceImageFile: file,
						sourceImageUrl: url,
						sourceVideoFile: null,
						sourceVideoUrl: null,
						mode: "image",
					},
					false,
					"segmentation/setSourceImage"
				),

			setSourceVideo: (file, url) =>
				set(
					{
						sourceVideoFile: file,
						sourceVideoUrl: url,
						sourceImageFile: null,
						sourceImageUrl: null,
						segmentedVideoUrl: null,
						mode: "video",
					},
					false,
					"segmentation/setSourceVideo"
				),

			clearSource: () =>
				set(
					{
						sourceImageFile: null,
						sourceImageUrl: null,
						sourceVideoFile: null,
						sourceVideoUrl: null,
						objects: [],
						masks: [],
						compositeImageUrl: null,
						segmentedVideoUrl: null,
					},
					false,
					"segmentation/clearSource"
				),

			setImageDimensions: (width, height) =>
				set(
					{ imageWidth: width, imageHeight: height },
					false,
					"segmentation/setImageDimensions"
				),

			// Object management
			addObject: (objectData) => {
				const state = get();
				const id = `obj-${state.nextObjectId}`;
				const colorIndex = state.objects.length % OBJECT_COLORS.length;

				const newObject: SegmentedObject = {
					...objectData,
					id,
					colorIndex,
					name: objectData.name || `Object ${state.nextObjectId}`,
					pointPrompts: objectData.pointPrompts || [],
					boxPrompts: objectData.boxPrompts || [],
					visible: objectData.visible ?? true,
				};

				set(
					{
						objects: [...state.objects, newObject],
						nextObjectId: state.nextObjectId + 1,
						selectedObjectId: id,
					},
					false,
					"segmentation/addObject"
				);

				return id;
			},

			updateObject: (id, updates) =>
				set(
					(state) => ({
						objects: state.objects.map((obj) =>
							obj.id === id ? { ...obj, ...updates } : obj
						),
					}),
					false,
					"segmentation/updateObject"
				),

			toggleObjectVisibility: (id) =>
				set(
					(state) => ({
						objects: state.objects.map((obj) =>
							obj.id === id ? { ...obj, visible: !obj.visible } : obj
						),
					}),
					false,
					"segmentation/toggleObjectVisibility"
				),

			removeObject: (id) =>
				set(
					(state) => ({
						objects: state.objects.filter((obj) => obj.id !== id),
						selectedObjectId:
							state.selectedObjectId === id ? null : state.selectedObjectId,
					}),
					false,
					"segmentation/removeObject"
				),

			selectObject: (id) =>
				set({ selectedObjectId: id }, false, "segmentation/selectObject"),

			renameObject: (id, name) =>
				set(
					(state) => ({
						objects: state.objects.map((obj) =>
							obj.id === id ? { ...obj, name } : obj
						),
					}),
					false,
					"segmentation/renameObject"
				),

			clearObjects: () =>
				set(
					{ objects: [], selectedObjectId: null, nextObjectId: 1, masks: [] },
					false,
					"segmentation/clearObjects"
				),

			// Prompt management
			addPointPrompt: (prompt) =>
				set(
					(state) => ({
						currentPointPrompts: [...state.currentPointPrompts, prompt],
					}),
					false,
					"segmentation/addPointPrompt"
				),

			removePointPrompt: (index) =>
				set(
					(state) => ({
						currentPointPrompts: state.currentPointPrompts.filter(
							(_, i) => i !== index
						),
					}),
					false,
					"segmentation/removePointPrompt"
				),

			addBoxPrompt: (prompt) =>
				set(
					(state) => ({
						currentBoxPrompts: [...state.currentBoxPrompts, prompt],
					}),
					false,
					"segmentation/addBoxPrompt"
				),

			removeBoxPrompt: (index) =>
				set(
					(state) => ({
						currentBoxPrompts: state.currentBoxPrompts.filter(
							(_, i) => i !== index
						),
					}),
					false,
					"segmentation/removeBoxPrompt"
				),

			setTextPrompt: (prompt) =>
				set({ currentTextPrompt: prompt }, false, "segmentation/setTextPrompt"),

			clearCurrentPrompts: () =>
				set(
					{
						currentPointPrompts: [],
						currentBoxPrompts: [],
						currentTextPrompt: "",
					},
					false,
					"segmentation/clearCurrentPrompts"
				),

			// Results
			setCompositeImage: (url) =>
				set(
					{ compositeImageUrl: url },
					false,
					"segmentation/setCompositeImage"
				),

			setMasks: (masks) =>
				set(
					(state) => ({ masks: [...state.masks, ...masks] }),
					false,
					"segmentation/setMasks"
				),

			setSegmentedVideo: (url) =>
				set(
					{ segmentedVideoUrl: url },
					false,
					"segmentation/setSegmentedVideo"
				),

			// Processing state
			setProcessingState: ({
				isProcessing,
				progress,
				statusMessage,
				elapsedTime,
			}) =>
				set(
					{
						isProcessing,
						...(progress !== undefined && { progress }),
						...(statusMessage !== undefined && { statusMessage }),
						...(elapsedTime !== undefined && { elapsedTime }),
					},
					false,
					"segmentation/setProcessingState"
				),

			// UI state
			toggleObjectList: () =>
				set(
					(state) => ({ showObjectList: !state.showObjectList }),
					false,
					"segmentation/toggleObjectList"
				),

			setMaskOpacity: (opacity) =>
				set({ maskOpacity: opacity }, false, "segmentation/setMaskOpacity"),

			toggleBoundingBoxes: () =>
				set(
					(state) => ({ showBoundingBoxes: !state.showBoundingBoxes }),
					false,
					"segmentation/toggleBoundingBoxes"
				),

			// Video controls
			setVideoBackend: (videoBackend) =>
				set({ videoBackend }, false, "segmentation/setVideoBackend"),

			updatePersonCutoutSettings: (settings) =>
				set(
					(state) => ({
						personCutoutSettings: {
							...state.personCutoutSettings,
							...settings,
						},
					}),
					false,
					"segmentation/updatePersonCutoutSettings"
				),

			setCurrentFrame: (frame) =>
				set({ currentFrame: frame }, false, "segmentation/setCurrentFrame"),

			setTotalFrames: (frames) =>
				set({ totalFrames: frames }, false, "segmentation/setTotalFrames"),

			setTrackingRequest: (trackingRequest) =>
				set({ trackingRequest }, false, "segmentation/setTrackingRequest"),

			clearTrackingRequest: () =>
				set(
					{ trackingRequest: null },
					false,
					"segmentation/clearTrackingRequest"
				),

			// Reset
			resetStore: () => set(initialState, false, "segmentation/reset"),
		})),
		{ name: "segmentation-store" }
	)
);

// ============================================
// Selectors
// ============================================

export const selectObjects = (state: SegmentationStore) => state.objects;
export const selectSelectedObject = (state: SegmentationStore) =>
	state.objects.find((obj) => obj.id === state.selectedObjectId);
export const selectIsProcessing = (state: SegmentationStore) =>
	state.isProcessing;
export const selectSourceUrl = (state: SegmentationStore) =>
	state.mode === "image" ? state.sourceImageUrl : state.sourceVideoUrl;
export const selectHasSource = (state: SegmentationStore) =>
	state.sourceImageUrl !== null || state.sourceVideoUrl !== null;
