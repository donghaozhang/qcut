/**
 * Alibaba Happy Horse validators.
 *
 * Covers three sibling endpoints:
 *  - alibaba/happy-horse/text-to-video       (key: happy_horse_t2v)
 *  - alibaba/happy-horse/reference-to-video  (key: happy_horse_ref2v)
 *  - alibaba/happy-horse/video-edit          (key: happy_horse_video_edit)
 *
 * Spec source:
 *   docs/task/fal_model/happy-horse-integration.md
 */

// ============================================
// Constants — match the FAL spec verbatim
// ============================================

export const HAPPY_HORSE_DURATIONS_SECONDS = [
	3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
] as const;

export const HAPPY_HORSE_RESOLUTIONS = ["720p", "1080p"] as const;

export const HAPPY_HORSE_ASPECT_RATIOS = [
	"16:9",
	"9:16",
	"1:1",
	"4:3",
	"3:4",
] as const;

export const HAPPY_HORSE_AUDIO_SETTINGS = ["auto", "origin"] as const;

export const HAPPY_HORSE_REF2V_MIN_IMAGES = 1;
export const HAPPY_HORSE_REF2V_MAX_IMAGES = 9;

export const HAPPY_HORSE_EDIT_MAX_REFERENCE_IMAGES = 5;
export const HAPPY_HORSE_EDIT_MIN_INPUT_SECONDS = 3;
export const HAPPY_HORSE_EDIT_MAX_INPUT_SECONDS = 60;
export const HAPPY_HORSE_EDIT_MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const HAPPY_HORSE_EDIT_OUTPUT_CAP_SECONDS = 15;

export const HAPPY_HORSE_PROMPT_MAX_CHARS = 2500;
export const HAPPY_HORSE_SEED_MAX = 2_147_483_647;

const VIDEO_EDIT_ALLOWED_EXTS = [".mp4", ".mov"] as const;

// ============================================
// Model detection
// ============================================

const HAPPY_HORSE_MODEL_IDS = new Set([
	"happy_horse_t2v",
	"happy_horse_ref2v",
	"happy_horse_video_edit",
]);

export function isHappyHorseModel(modelId: string): boolean {
	return HAPPY_HORSE_MODEL_IDS.has(modelId);
}

export function isHappyHorseT2VModel(modelId: string): boolean {
	return modelId === "happy_horse_t2v";
}

export function isHappyHorseRef2VModel(modelId: string): boolean {
	return modelId === "happy_horse_ref2v";
}

export function isHappyHorseVideoEditModel(modelId: string): boolean {
	return modelId === "happy_horse_video_edit";
}

// ============================================
// Validators — throw on invalid input
// ============================================

export function validateHappyHorseDuration(duration: number | string): void {
	const n = typeof duration === "string" ? Number(duration) : duration;
	if (!Number.isFinite(n) || !Number.isInteger(n)) {
		throw new Error(
			`Happy Horse duration must be an integer (3–15 s). Got: ${duration}`
		);
	}
	if (
		!HAPPY_HORSE_DURATIONS_SECONDS.includes(
			n as (typeof HAPPY_HORSE_DURATIONS_SECONDS)[number]
		)
	) {
		throw new Error(
			`Happy Horse duration must be 3–15 s (inclusive). Got: ${n}`
		);
	}
}

export function validateHappyHorseResolution(resolution: string): void {
	if (
		!HAPPY_HORSE_RESOLUTIONS.includes(
			resolution as (typeof HAPPY_HORSE_RESOLUTIONS)[number]
		)
	) {
		throw new Error(
			`Happy Horse resolution must be 720p or 1080p. Got: ${resolution}`
		);
	}
}

export function validateHappyHorseAspectRatio(aspectRatio: string): void {
	if (
		!HAPPY_HORSE_ASPECT_RATIOS.includes(
			aspectRatio as (typeof HAPPY_HORSE_ASPECT_RATIOS)[number]
		)
	) {
		throw new Error(
			`Happy Horse aspect ratio must be one of ${HAPPY_HORSE_ASPECT_RATIOS.join(", ")}. Got: ${aspectRatio}`
		);
	}
}

export function validateHappyHorsePrompt(prompt: string): void {
	const trimmed = prompt?.trim() ?? "";
	if (!trimmed) {
		throw new Error("Happy Horse: prompt is required.");
	}
	if (trimmed.length > HAPPY_HORSE_PROMPT_MAX_CHARS) {
		throw new Error(
			`Happy Horse: prompt exceeds ${HAPPY_HORSE_PROMPT_MAX_CHARS} characters (got ${trimmed.length}).`
		);
	}
}

export function validateHappyHorseSeed(seed: number): void {
	if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
		throw new Error(`Happy Horse seed must be an integer. Got: ${seed}`);
	}
	if (seed < 0 || seed > HAPPY_HORSE_SEED_MAX) {
		throw new Error(
			`Happy Horse seed must be in [0, ${HAPPY_HORSE_SEED_MAX}]. Got: ${seed}`
		);
	}
}

export function validateHappyHorseImageUrls(urls: string[]): void {
	if (!Array.isArray(urls) || urls.length < HAPPY_HORSE_REF2V_MIN_IMAGES) {
		throw new Error(
			`Happy Horse Ref2V requires at least ${HAPPY_HORSE_REF2V_MIN_IMAGES} reference image.`
		);
	}
	if (urls.length > HAPPY_HORSE_REF2V_MAX_IMAGES) {
		throw new Error(
			`Happy Horse Ref2V accepts at most ${HAPPY_HORSE_REF2V_MAX_IMAGES} reference images. Got: ${urls.length}`
		);
	}
	for (const url of urls) {
		if (typeof url !== "string" || url.length === 0) {
			throw new Error(
				"Happy Horse Ref2V: every image URL must be a non-empty string."
			);
		}
		if (url.startsWith("data:")) {
			throw new Error(
				"Happy Horse Ref2V: data URIs are not supported — upload to FAL storage first."
			);
		}
	}
}

export function validateHappyHorseReferenceImages(urls?: string[]): void {
	if (!urls || urls.length === 0) return; // optional
	if (urls.length > HAPPY_HORSE_EDIT_MAX_REFERENCE_IMAGES) {
		throw new Error(
			`Happy Horse Video Edit accepts at most ${HAPPY_HORSE_EDIT_MAX_REFERENCE_IMAGES} reference images. Got: ${urls.length}`
		);
	}
	for (const url of urls) {
		if (typeof url !== "string" || url.length === 0) {
			throw new Error(
				"Happy Horse Video Edit: every reference image URL must be a non-empty string."
			);
		}
		if (url.startsWith("data:")) {
			throw new Error(
				"Happy Horse Video Edit: data URIs are not supported — upload to FAL storage first."
			);
		}
	}
}

export interface HappyHorseVideoEditUrlMeta {
	contentType?: string;
	sizeBytes?: number;
	durationSeconds?: number;
}

export function validateHappyHorseVideoEditUrl(
	url: string,
	meta: HappyHorseVideoEditUrlMeta = {}
): void {
	if (typeof url !== "string" || url.length === 0) {
		throw new Error("Happy Horse Video Edit: video URL is required.");
	}
	if (url.startsWith("data:")) {
		throw new Error(
			"Happy Horse Video Edit: data URIs are not supported — upload to FAL storage first."
		);
	}

	// Best-effort extension check — only triggers when the URL has a path
	// that looks like a filename. Defers to MIME if extension is unknown.
	const lower = url.toLowerCase();
	const looksLikeFilename = /\.[a-z0-9]{2,4}(\?|#|$)/.test(lower);
	if (looksLikeFilename) {
		const matched = VIDEO_EDIT_ALLOWED_EXTS.some((ext) => lower.includes(ext));
		if (!matched && !meta.contentType) {
			throw new Error(
				`Happy Horse Video Edit: input must be MP4 or MOV (H.264 recommended). Got: ${url}`
			);
		}
	}

	if (meta.contentType) {
		const ct = meta.contentType.toLowerCase();
		const mp4Ok = ct.includes("mp4");
		const movOk = ct.includes("quicktime") || ct.includes("mov");
		if (!mp4Ok && !movOk) {
			throw new Error(
				`Happy Horse Video Edit: content-type must be video/mp4 or video/quicktime. Got: ${meta.contentType}`
			);
		}
	}

	if (
		typeof meta.sizeBytes === "number" &&
		meta.sizeBytes > HAPPY_HORSE_EDIT_MAX_INPUT_BYTES
	) {
		throw new Error(
			`Happy Horse Video Edit: input must be ≤ 100 MB. Got: ${(meta.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
		);
	}

	if (typeof meta.durationSeconds === "number") {
		if (
			meta.durationSeconds < HAPPY_HORSE_EDIT_MIN_INPUT_SECONDS ||
			meta.durationSeconds > HAPPY_HORSE_EDIT_MAX_INPUT_SECONDS
		) {
			throw new Error(
				`Happy Horse Video Edit: input duration must be between ${HAPPY_HORSE_EDIT_MIN_INPUT_SECONDS}s and ${HAPPY_HORSE_EDIT_MAX_INPUT_SECONDS}s. Got: ${meta.durationSeconds}s`
			);
		}
	}
}

export function validateHappyHorseAudioSetting(audioSetting: string): void {
	if (
		!HAPPY_HORSE_AUDIO_SETTINGS.includes(
			audioSetting as (typeof HAPPY_HORSE_AUDIO_SETTINGS)[number]
		)
	) {
		throw new Error(
			`Happy Horse Video Edit: audio_setting must be 'auto' or 'origin'. Got: ${audioSetting}`
		);
	}
}
