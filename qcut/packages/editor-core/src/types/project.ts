/**
 * Project domain types.
 * Extracted from apps/web/src/types/project.ts
 *
 * @module @qcut/editor-core/types/project
 */

import type { CanvasSize } from "./editor.js";
import type { ProjectAudioMixSettings } from "./timeline.js";

export type BlurIntensity = 4 | 8 | 18;

/** A timeline scene within a project. */
export interface Scene {
	id: string;
	/** User-defined name for this scene. */
	name: string;
	/** Whether this is the main/default scene (cannot be deleted). */
	isMain: boolean;
	createdAt: Date;
	updatedAt: Date;
}

/** A user-created folder for grouping projects in the studio page. */
export interface ProjectFolder {
	id: string;
	name: string;
	createdAt: Date;
}

/** Draggable alignment guides shown over the editor preview. */
export interface ProjectGuides {
	/** Y positions of horizontal guides, in canvas pixels. */
	horizontal: number[];
	/** X positions of vertical guides, in canvas pixels. */
	vertical: number[];
	/** Locked guides cannot be dragged or removed individually. */
	locked: boolean;
	/** Hidden guides stay stored but are not rendered. */
	hidden: boolean;
}

export interface TProject {
	id: string;
	name: string;
	thumbnail: string;
	createdAt: Date;
	updatedAt: Date;
	/** Folder this project lives in on the studio page (null/undefined = root). */
	folderId?: string | null;
	/** All scenes in this project (first/main scene created by default). */
	scenes: Scene[];
	/** The scene currently selected in the editor. */
	currentSceneId: string;
	mediaItems?: string[];
	backgroundColor?: string;
	backgroundType?: "color" | "blur";
	blurIntensity?: BlurIntensity;
	fps?: number;
	bookmarks?: number[];
	/** Output canvas width/height used by renderer and preview. */
	canvasSize: CanvasSize;
	/** How the canvas size was decided. */
	canvasMode: "preset" | "original" | "custom";
	/** Persistent master and submix bus state for preview and export. */
	audioMix?: ProjectAudioMixSettings;
	/** Alignment guides drawn over the preview (editing aid only, never exported). */
	guides?: ProjectGuides;
}
