/**
 * Project domain types.
 * Extracted from apps/web/src/types/project.ts
 *
 * @module @qcut/editor-core/types/project
 */

import type { CanvasSize } from "./editor.js";

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

export interface TProject {
	id: string;
	name: string;
	thumbnail: string;
	createdAt: Date;
	updatedAt: Date;
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
}
