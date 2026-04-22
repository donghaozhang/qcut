/**
 * Per-shot image/video generation helpers for MoyinStore.
 * Extracted to keep moyin-store.ts under 800 lines.
 */

import type { ScriptCharacter, ScriptScene, Shot } from "@/types/moyin-script";
import { platform } from "@qcut/platform-core";
import { VISUAL_STYLE_PRESETS } from "@/lib/moyin/presets/visual-styles";

export type MoyinMediaProvider = "fal" | "gmi";

/** Build an image prompt from shot + context data. */
export function buildShotImagePrompt(
	shot: Shot,
	scene: ScriptScene | undefined,
	characters: ScriptCharacter[],
	selectedStyleId: string
): string {
	const charDescs = (shot.characterIds || [])
		.map((cid) => characters.find((c) => c.id === cid))
		.filter(Boolean)
		.map((c) => c!.visualPromptEn || c!.appearance || c!.name)
		.join(", ");

	const stylePreset = VISUAL_STYLE_PRESETS.find(
		(s) => s.id === selectedStyleId
	);
	const styleToken = stylePreset?.prompt || "";

	return [
		shot.imagePrompt || shot.visualPrompt || shot.actionSummary || "",
		charDescs && `Characters: ${charDescs}`,
		scene?.visualPrompt && `Scene: ${scene.visualPrompt}`,
		shot.shotSize && `Shot size: ${shot.shotSize}`,
		shot.cameraMovement && `Camera: ${shot.cameraMovement}`,
		styleToken,
	]
		.filter(Boolean)
		.join(". ");
}

/**
 * Generate a shot image via the main-process media IPC.
 *
 * Provider defaults to FAL (existing Director behavior). When the user
 * selects GMI in the Moyin config panel, the request is routed through
 * `callModelApi` which supports both local GMI keys and the QCut
 * license-server proxy.
 */
export async function generateShotImage(
	prompt: string,
	provider: MoyinMediaProvider = "fal",
	size: { width: number; height: number } = { width: 1920, height: 1080 }
): Promise<string> {
	const api = platform().moyin;
	if (!api?.generateImage) {
		throw new Error(
			"Moyin media API not available. Please run in Electron with a recent build."
		);
	}

	const result = await api.generateImage({ provider, prompt, size });
	if (!result.success || !result.url) {
		throw new Error(result.error ?? "Image generation failed");
	}
	return result.url;
}

/** Generate a single shot image (1920×1080, caller-provided provider). */
export async function generateShotImageRequest(
	prompt: string,
	provider: MoyinMediaProvider = "fal"
): Promise<string> {
	return generateShotImage(prompt, provider);
}

/**
 * Backward-compat: force FAL and allow a custom size.
 *
 * @deprecated Prefer `generateShotImage(prompt, provider, size)` with an
 *   explicit provider, so the Director's provider toggle applies.
 */
export async function generateFalImage(
	prompt: string,
	size: { width: number; height: number } = { width: 1920, height: 1080 }
): Promise<string> {
	return generateShotImage(prompt, "fal", size);
}

/** Generate a video from an existing shot image via the main-process IPC. */
export async function generateShotVideoRequest(
	imageUrl: string,
	prompt: string,
	provider: MoyinMediaProvider = "fal"
): Promise<string> {
	const api = platform().moyin;
	if (!api?.generateVideo) {
		throw new Error(
			"Moyin media API not available. Please run in Electron with a recent build."
		);
	}

	const result = await api.generateVideo({ provider, imageUrl, prompt });
	if (!result.success || !result.url) {
		throw new Error(result.error ?? "Video generation failed");
	}
	return result.url;
}

/**
 * Persist a remote media URL to local Electron storage.
 * Falls back to the original URL if Electron is unavailable or save fails.
 */
export async function persistShotMedia(
	url: string,
	filename: string
): Promise<string> {
	try {
		const electronAPI = (window as unknown as Record<string, unknown>)
			.electronAPI as
			| {
					saveBlob?: (data: Uint8Array, filename: string) => Promise<string>;
			  }
			| undefined;
		if (!electronAPI?.saveBlob) return url;

		const response = await fetch(url);
		if (!response.ok) return url;

		const buffer = await response.arrayBuffer();
		const localPath = await electronAPI.saveBlob(
			new Uint8Array(buffer),
			filename
		);
		return localPath || url;
	} catch {
		// Persistence failed — keep remote URL
		return url;
	}
}

/** Check if an error is a content moderation rejection. */
export function isModerationError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error ?? "");
	const patterns = [
		"content policy",
		"moderation",
		"nsfw",
		"safety",
		"banned",
		"restricted content",
		"inappropriate",
	];
	const lower = msg.toLowerCase();
	return patterns.some((p) => lower.includes(p));
}

/** Build a prompt for end frame image generation. */
export function buildEndFramePrompt(shot: Shot): string {
	return shot.endFramePrompt || shot.imagePrompt || shot.actionSummary || "";
}
