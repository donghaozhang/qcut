/**
 * CLI Handlers for Phota commands: edit, enhance, create-profile.
 *
 * Uses Photalabs via FAL for AI photo editing, enhancement,
 * and identity profile creation.
 *
 * @module electron/native-pipeline/cli/cli-handlers-phota
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import {
	callModelApi,
	uploadToFalStorage,
	downloadOutput,
} from "../infra/api-caller.js";
import { resolveOutputDir } from "../output/output-utils.js";

function isUrl(input: string): boolean {
	return /^https?:\/\//i.test(input);
}

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

/**
 * Upload a local file to FAL CDN, or return the URL as-is if already a URL.
 */
async function resolveImageUrl(
	input: string,
	onProgress: ProgressFn,
	model: string,
	label: string
): Promise<{ url?: string; error?: string }> {
	if (isUrl(input)) return { url: input };

	if (!existsSync(input)) {
		return { error: `File not found: ${input}` };
	}

	onProgress({
		stage: "uploading",
		percent: 5,
		message: `Uploading ${label}...`,
		model,
	});

	const result = await uploadToFalStorage(input);
	if (!result.success || !result.url) {
		return { error: `Upload failed: ${result.error || "Unknown error"}` };
	}
	return { url: result.url };
}

/**
 * Download images from API result and return paths.
 */
async function downloadImages(
	images: Array<{ url: string }>,
	outputDir: string,
	baseName: string,
	suffix: string
): Promise<string[]> {
	const paths: string[] = [];
	for (let i = 0; i < images.length; i++) {
		const ext = images[i].url.includes(".png") ? "png" : "jpeg";
		const filename =
			images.length === 1
				? `${baseName}_${suffix}.${ext}`
				: `${baseName}_${suffix}_${i + 1}.${ext}`;
		const destPath = join(outputDir, filename);
		try {
			const downloaded = await downloadOutput(images[i].url, destPath);
			paths.push(downloaded);
		} catch {
			paths.push(images[i].url);
		}
	}
	return paths;
}

/**
 * Handle `phota:edit` command.
 */
export async function handlePhotaEdit(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const prompt = options.text;
	if (!prompt) {
		return { success: false, error: "Missing --text/-t (edit prompt)" };
	}

	const imageInputs: string[] = Array.isArray(options.input)
		? options.input
		: options.input
			? [options.input]
			: [];

	if (imageInputs.length === 0) {
		return {
			success: false,
			error: "Missing --input/-i (image path or URL)",
		};
	}

	if (imageInputs.length > 10) {
		return {
			success: false,
			error: "Maximum 10 input images supported",
		};
	}

	const model = "phota_edit";
	const startTime = Date.now();

	// Upload all local images
	const imageUrls: string[] = [];
	for (const input of imageInputs) {
		const result = await resolveImageUrl(
			input,
			onProgress,
			model,
			basename(input)
		);
		if (result.error) {
			return { success: false, error: result.error };
		}
		imageUrls.push(result.url!);
	}

	onProgress({
		stage: "editing",
		percent: 20,
		message: "Editing image with Phota...",
		model,
	});

	const profileIds: string[] = Array.isArray(options.profile)
		? options.profile
		: options.profile
			? [options.profile]
			: [];

	const payload: Record<string, unknown> = {
		prompt,
		image_urls: imageUrls,
		num_images: options.count || 1,
		resolution: options.resolution || "1K",
		aspect_ratio: options.aspectRatio || "auto",
		output_format: options.format || "jpeg",
	};

	if (profileIds.length > 0) {
		payload.profile_ids = profileIds;
	}

	const result = await callModelApi({
		endpoint: "fal-ai/phota/edit",
		payload,
		provider: "fal",
		signal,
		onProgress: (percent, message) => {
			onProgress({
				stage: "editing",
				percent: Math.min(90, 20 + percent * 0.7),
				message: message || "Processing edit...",
				model,
			});
		},
	});

	if (!result.success) {
		return {
			success: false,
			error: `Phota edit failed: ${result.error}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	const images = (result.data as { images?: Array<{ url: string }> })?.images;
	if (!images || images.length === 0) {
		return {
			success: false,
			error: "Phota edit returned no images",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// Download results
	const sessionId = `phota-edit-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);
	mkdirSync(outputDir, { recursive: true });

	const inputBasename = basename(imageInputs[0]).replace(/\.[^.]+$/, "");
	const paths = await downloadImages(
		images,
		outputDir,
		inputBasename,
		"edited"
	);

	onProgress({ stage: "done", percent: 100, message: "Done", model });

	return {
		success: true,
		outputPath: paths[0],
		data: {
			source: imageInputs,
			prompt,
			profile_ids: profileIds.length > 0 ? profileIds : undefined,
			image_count: images.length,
			image_paths: paths,
			model,
			duration: (Date.now() - startTime) / 1000,
		},
		duration: (Date.now() - startTime) / 1000,
	};
}

/**
 * Handle `phota:enhance` command.
 */
export async function handlePhotaEnhance(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const imageInput = Array.isArray(options.input)
		? options.input[0]
		: options.input;
	if (!imageInput) {
		return {
			success: false,
			error: "Missing --input/-i (image path or URL)",
		};
	}

	const model = "phota_enhance";
	const startTime = Date.now();

	const upload = await resolveImageUrl(
		imageInput,
		onProgress,
		model,
		basename(imageInput)
	);
	if (upload.error) {
		return { success: false, error: upload.error };
	}

	onProgress({
		stage: "enhancing",
		percent: 20,
		message: "Enhancing image with Phota...",
		model,
	});

	const profileIds: string[] = Array.isArray(options.profile)
		? options.profile
		: options.profile
			? [options.profile]
			: [];

	const payload: Record<string, unknown> = {
		image_url: upload.url,
		num_images: options.count || 1,
		output_format: options.format || "jpeg",
	};

	if (profileIds.length > 0) {
		payload.profile_ids = profileIds;
	}

	const result = await callModelApi({
		endpoint: "fal-ai/phota/enhance",
		payload,
		provider: "fal",
		signal,
		onProgress: (percent, message) => {
			onProgress({
				stage: "enhancing",
				percent: Math.min(90, 20 + percent * 0.7),
				message: message || "Enhancing...",
				model,
			});
		},
	});

	if (!result.success) {
		return {
			success: false,
			error: `Phota enhance failed: ${result.error}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	const images = (result.data as { images?: Array<{ url: string }> })?.images;
	if (!images || images.length === 0) {
		return {
			success: false,
			error: "Phota enhance returned no images",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	const sessionId = `phota-enhance-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);
	mkdirSync(outputDir, { recursive: true });

	const inputBasename = basename(imageInput).replace(/\.[^.]+$/, "");
	const paths = await downloadImages(
		images,
		outputDir,
		inputBasename,
		"enhanced"
	);

	onProgress({ stage: "done", percent: 100, message: "Done", model });

	return {
		success: true,
		outputPath: paths[0],
		data: {
			source: imageInput,
			profile_ids: profileIds.length > 0 ? profileIds : undefined,
			image_count: images.length,
			image_paths: paths,
			model,
			duration: (Date.now() - startTime) / 1000,
		},
		duration: (Date.now() - startTime) / 1000,
	};
}

/**
 * Handle `phota:profile` command.
 */
export async function handlePhotaCreateProfile(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const zipInput = Array.isArray(options.input)
		? options.input[0]
		: options.input;
	if (!zipInput) {
		return {
			success: false,
			error: "Missing --input/-i (path to ZIP of reference images)",
		};
	}

	const model = "phota_create_profile";
	const startTime = Date.now();

	const upload = await resolveImageUrl(
		zipInput,
		onProgress,
		model,
		basename(zipInput)
	);
	if (upload.error) {
		return { success: false, error: upload.error };
	}

	onProgress({
		stage: "creating",
		percent: 20,
		message: "Creating Phota profile...",
		model,
	});

	const result = await callModelApi({
		endpoint: "fal-ai/phota/create-profile",
		payload: { image_data_url: upload.url },
		provider: "fal",
		signal,
		onProgress: (percent, message) => {
			onProgress({
				stage: "creating",
				percent: Math.min(90, 20 + percent * 0.7),
				message: message || "Training profile...",
				model,
			});
		},
	});

	if (!result.success) {
		return {
			success: false,
			error: `Profile creation failed: ${result.error}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	const profileId = (result.data as { profile_id?: string })?.profile_id;
	if (!profileId) {
		return {
			success: false,
			error: "Profile creation returned no profile ID",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// Save profile JSON
	const sessionId = `phota-profile-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);
	mkdirSync(outputDir, { recursive: true });

	const profileData = {
		profile_id: profileId,
		source: zipInput,
		model,
		created_at: new Date().toISOString(),
	};

	const jsonPath = join(outputDir, "phota-profile.json");
	writeFileSync(jsonPath, JSON.stringify(profileData, null, 2));

	onProgress({ stage: "done", percent: 100, message: "Done", model });

	return {
		success: true,
		outputPath: jsonPath,
		data: profileData,
		duration: (Date.now() - startTime) / 1000,
	};
}
