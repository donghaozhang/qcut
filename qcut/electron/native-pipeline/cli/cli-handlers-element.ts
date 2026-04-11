/**
 * CLI Element Command Handlers
 *
 * Handles create-element, list-elements, delete-element commands
 * for Kling V3 Omni element-driven video generation via GMI Cloud.
 *
 * @module electron/native-pipeline/cli-handlers-element
 */

import fs from "node:fs";
import path from "node:path";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import { callModelApi } from "../infra/api-caller.js";
import {
	saveElement,
	listElements,
	deleteElement,
} from "../infra/element-store.js";

/** Convert a local file path to a base64 string; pass through URLs as-is. */
function toBase64(filePath: string): string {
	if (
		filePath.startsWith("http://") ||
		filePath.startsWith("https://") ||
		filePath.startsWith("data:")
	) {
		return filePath;
	}
	const buf = fs.readFileSync(filePath);
	return buf.toString("base64");
}

/** Create a reusable element via kling-create-element on GMI. */
export async function handleCreateElement(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const name = options.keyName?.trim(); // --name maps to keyName
	if (!name || name.length > 20) {
		return {
			success: false,
			error: "Element name is required (max 20 characters)",
		};
	}

	const description = options.elementDescription?.trim();
	if (!description || description.length > 100) {
		return {
			success: false,
			error: "Element description is required (max 100 characters)",
		};
	}

	const frontalImage = options.frontalImage;
	const referVideo = options.referVideo;

	if (!frontalImage && !referVideo) {
		return {
			success: false,
			error:
				"Provide --frontal-image (image element) or --refer-video (video element)",
		};
	}

	const isVideoRefer = !!referVideo && !frontalImage;
	const referenceType = isVideoRefer ? "video_refer" : "image_refer";

	const payload: Record<string, unknown> = {
		element_name: name,
		element_description: description,
		reference_type: referenceType,
	};

	if (isVideoRefer) {
		payload.refer_video = referVideo;
	} else {
		const frontalB64 = toBase64(frontalImage!);
		payload.frontal_image = frontalB64;
		// GMI requires 1-3 refer_images; use frontal as fallback if none provided
		payload.refer_images =
			options.referImages && options.referImages.length > 0
				? options.referImages.map(toBase64)
				: [frontalB64];
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: `Creating ${referenceType} element "${name}"...`,
		model: "kling-create-element",
	});

	const result = await callModelApi({
		endpoint: "kling-create-element",
		payload,
		provider: "gmi",
		onProgress: (percent, message) => {
			onProgress({
				stage: "processing",
				percent,
				message,
				model: "kling-create-element",
			});
		},
	});

	if (!result.success) {
		return { success: false, error: result.error ?? "Element creation failed" };
	}

	const data = result.data as Record<string, unknown>;
	// GMI queue wraps result in outcome; unwrap if present
	const outcome = (data.outcome as Record<string, unknown>) ?? data;
	const elementId =
		(outcome.element_id as string) ||
		(outcome.id as string) ||
		(data.element_id as string) ||
		(data.id as string);

	if (!elementId) {
		return {
			success: false,
			error: "Element created but no element_id returned",
		};
	}

	saveElement({
		elementId,
		name,
		description,
		referenceType: referenceType as "image_refer" | "video_refer",
		createdAt: new Date().toISOString(),
		sourceImages: frontalImage
			? [frontalImage, ...(options.referImages ?? [])]
			: undefined,
		sourceVideo: referVideo,
	});

	return {
		success: true,
		data: {
			message: `Element created: ${name} (${elementId})`,
			elementId,
			name,
			referenceType,
		},
	};
}

/** List all stored elements. */
export function handleListElements(): CLIResult {
	const elements = listElements();
	return {
		success: true,
		data: { elements, count: elements.length },
	};
}

/** Delete a stored element by ID. */
export function handleDeleteElement(options: CLIRunOptions): CLIResult {
	const id = options.elementId;
	if (!id) {
		return { success: false, error: "Missing --element-id" };
	}
	const deleted = deleteElement(id);
	return {
		success: true,
		data: {
			message: deleted
				? `Element ${id} deleted`
				: `Element ${id} not found in local store`,
		},
	};
}
