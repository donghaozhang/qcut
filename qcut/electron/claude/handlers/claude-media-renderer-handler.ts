import type { BrowserWindow } from "electron";
import type {
	ClaudeMediaDeletedEvent,
	ClaudeMediaImportedEvent,
} from "../../types/claude-media-bridge-api.js";
import { requestRendererMutation } from "./claude-renderer-mutation-handler.js";

const MEDIA_IMPORT_CHANNEL = "claude:media:imported" as const;
const MEDIA_IMPORT_RESPONSE_CHANNEL = "claude:media:imported:response" as const;
const MEDIA_DELETE_CHANNEL = "claude:media:deleted" as const;
const MEDIA_DELETE_RESPONSE_CHANNEL = "claude:media:deleted:response" as const;
const MEDIA_RENDERER_TIMEOUT_MS = 30_000;

export async function requestMediaImportFromRenderer({
	payload,
	win,
}: {
	payload: Omit<ClaudeMediaImportedEvent, "requestId">;
	win: BrowserWindow;
}): Promise<void> {
	await requestRendererMutation({
		channel: MEDIA_IMPORT_CHANNEL,
		payload,
		requestIdPrefix: "media",
		responseChannel: MEDIA_IMPORT_RESPONSE_CHANNEL,
		timeoutMessage: "Renderer media mutation timed out.",
		timeoutMs: MEDIA_RENDERER_TIMEOUT_MS,
		win,
	});
}

export async function requestMediaDeleteFromRenderer({
	payload,
	win,
}: {
	payload: Omit<ClaudeMediaDeletedEvent, "requestId">;
	win: BrowserWindow;
}): Promise<void> {
	await requestRendererMutation({
		channel: MEDIA_DELETE_CHANNEL,
		payload,
		requestIdPrefix: "media",
		responseChannel: MEDIA_DELETE_RESPONSE_CHANNEL,
		timeoutMessage: "Renderer media mutation timed out.",
		timeoutMs: MEDIA_RENDERER_TIMEOUT_MS,
		win,
	});
}
