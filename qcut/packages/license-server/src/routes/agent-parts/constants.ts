export const MAX_COMMAND_LENGTH = 2000;
export const MAX_CODEX_PROMPT_LENGTH = 12_000;
export const MAX_AGENT_SOURCE_LENGTH = 120;
export const MAX_TEXT_ARTIFACT_BYTES = 256_000;
export const MAX_TERMINAL_ARTIFACTS = 80;
export const MAX_SESSION_UPLOAD_BYTES = 25 * 1024 * 1024;
export const AGENT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const AGENT_SESSION_SANDBOX_AUTO_STOP_MINUTES = 120;
export const DAYTONA_CREATE_REQUEST_TIMEOUT_MS = 45_000;
export const AGENT_TERMINAL_RETRY_AFTER_MS = 3_000;
export const TERMINAL_INPUT_DIR = "/tmp/qcut-input";
export const TERMINAL_OUTPUT_DIR = "/tmp/qcut-output";
export const SAFE_COMMAND_TOKEN = /^[A-Za-z0-9_\-./:=,@+]+$/;
export const CODEX_AGENT_COMMAND = "codex exec --skip-git-repo-check --json -";

// Pinned to an immutable manifest digest so the default agent image cannot
// drift if the upstream tag is republished. Human-readable tag for this
// digest: `imarouter-gpt-image-20260519061748`.
export const DEFAULT_DAYTONA_IMAGE =
	"ghcr.io/quriosity-agent/qcut-cli@sha256:c266afcb3a0da99ef0ff191bb4f929ada47f4a7f25b118228cfb6acc0ce575ca";

export const TEXT_ARTIFACT_KINDS = new Set(["json", "log"]);

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".json": "application/json",
	".log": "text/plain; charset=utf-8",
	".m4a": "audio/mp4",
	".mov": "video/quicktime",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".ogg": "audio/ogg",
	".png": "image/png",
	".srt": "text/plain; charset=utf-8",
	".tar": "application/x-tar",
	".txt": "text/plain; charset=utf-8",
	".wav": "audio/wav",
	".webm": "video/webm",
	".webp": "image/webp",
};

export function getDefaultAgentUserId(): string {
	const value = process.env.QCUT_AGENT_DEFAULT_USER_ID;
	return typeof value === "string" ? value.trim() : "";
}

/**
 * The unauthenticated default-user fallback is an auth bypass and must be opted
 * into explicitly. It is only honored in local development or when
 * QCUT_AGENT_ALLOW_DEFAULT_USER is set, never implicitly in production.
 */
export function isDefaultAgentUserAllowed(): boolean {
	return (
		process.env.QCUT_AGENT_ALLOW_DEFAULT_USER === "true" ||
		process.env.NODE_ENV === "development"
	);
}

export function getDaytonaApiKey(): string {
	const value = process.env.DAYTONA_API_KEY;
	return typeof value === "string" ? value.trim() : "";
}

export function getRelaySigningSecret(): string {
	const value = process.env.RELAY_SIGNING_SECRET;
	return typeof value === "string" ? value.trim() : "";
}

export function getRelayHost(): string {
	const value = process.env.RELAY_HOST;
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: "qcut-relay.zdhpeter.workers.dev";
}

export function getAgentImageTag(): string {
	const value = process.env.QCUT_IMAGE_TAG;
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: DEFAULT_DAYTONA_IMAGE;
}
