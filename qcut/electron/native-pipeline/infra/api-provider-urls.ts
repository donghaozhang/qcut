/**
 * Shared provider URL constants and URL builder.
 * Extracted to avoid circular dependencies between api-caller and proxy-client.
 */

export type ProviderName =
	| "fal"
	| "elevenlabs"
	| "google"
	| "openrouter"
	| "volcengine"
	| "gmi"
	| "gmi-llm"
	| "runway"
	| "imarouter";

export const FAL_BASE = "https://queue.fal.run";
export const FAL_STATUS_BASE = "https://queue.fal.run";
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const VOLCENGINE_BASE = "https://ark.cn-beijing.volces.com/api/v3";
const GMI_BASE = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";
const GMI_LLM_BASE = "https://api.gmi-serving.com/v1";
const RUNWAY_BASE = "https://api.runwayml.com/v1";
export const IMAROUTER_BASE = "https://api.imarouter.com";

/** Build a fully qualified provider URL from a logical endpoint path. */
export function buildProviderUrl(
	provider: ProviderName,
	endpoint: string
): string {
	switch (provider) {
		case "fal":
			return `${FAL_BASE}/${endpoint}`;
		case "elevenlabs":
			return `${ELEVENLABS_BASE}/${endpoint}`;
		case "google":
			return `${GEMINI_BASE}/${endpoint}`;
		case "openrouter":
			return `${OPENROUTER_BASE}/${endpoint}`;
		case "volcengine":
			return `${VOLCENGINE_BASE}/${endpoint.replace(/^volcengine\//, "")}`;
		case "gmi":
			return `${GMI_BASE}/requests`;
		case "gmi-llm":
			return `${GMI_LLM_BASE}/${endpoint}`;
		case "runway":
			return `${RUNWAY_BASE}/${endpoint}`;
		case "imarouter":
			return `${IMAROUTER_BASE}/${endpoint.replace(/^\/+/, "")}`;
	}
}

/** Extract the first output URL from a provider response (video, image, audio). */
export function extractOutputUrl(data: unknown): string | undefined {
	if (!data || typeof data !== "object") return;
	const obj = data as Record<string, unknown>;

	if (typeof obj.video === "object" && obj.video !== null) {
		const video = obj.video as Record<string, unknown>;
		if (typeof video.url === "string") return video.url;
	}
	if (typeof obj.image === "object" && obj.image !== null) {
		const image = obj.image as Record<string, unknown>;
		if (typeof image.url === "string") return image.url;
	}
	if (typeof obj.audio === "object" && obj.audio !== null) {
		const audio = obj.audio as Record<string, unknown>;
		if (typeof audio.url === "string") return audio.url;
	}
	if (Array.isArray(obj.images) && obj.images.length > 0) {
		const first = obj.images[0] as Record<string, unknown>;
		if (typeof first?.url === "string") return first.url;
	}
	if (Array.isArray(obj.videos) && obj.videos.length > 0) {
		const first = obj.videos[0] as Record<string, unknown>;
		if (typeof first?.url === "string") return first.url;
	}
	if (Array.isArray(obj.media_urls) && obj.media_urls.length > 0) {
		const first = obj.media_urls[0] as Record<string, unknown>;
		if (typeof first?.url === "string") return first.url;
	}
	// IMA Router shape: `{ status: "completed", results: [{ url: "..." }] }`
	if (Array.isArray(obj.results) && obj.results.length > 0) {
		const first = obj.results[0] as Record<string, unknown>;
		if (typeof first?.url === "string") return first.url;
	}
	if (typeof obj.data === "object" && obj.data !== null) {
		const data = obj.data as Record<string, unknown>;
		if (typeof data.url === "string") return data.url;
	}
	// GMI outcome shape: `{ outcome: { video_url: "..." } }` for Seedance 2.0 and
	// Veo-family models. Proxy-mode responses go through this function, so
	// missing the bare snake_case string here means the video URL is dropped
	// and the CLI silently returns without downloading the result.
	if (typeof obj.video_url === "string") return obj.video_url;
	if (typeof obj.image_url === "string") return obj.image_url;
	if (typeof obj.audio_url === "string") return obj.audio_url;
	if (typeof obj.output_url === "string") return obj.output_url;
	if (typeof obj.url === "string") return obj.url;

	return;
}

/**
 * Adaptive polling interval based on elapsed time.
 * - 0–10s: 500ms, 10–30s: 2s, 30s+: 4s
 */
export function getAdaptivePollInterval(elapsedMs: number): number {
	if (elapsedMs < 10_000) return 500;
	if (elapsedMs < 30_000) return 2_000;
	return 4_000;
}
