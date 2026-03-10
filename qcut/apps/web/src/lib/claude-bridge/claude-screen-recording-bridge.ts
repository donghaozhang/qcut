/**
 * Claude Screen Recording Bridge
 *
 * Handles screen recording start/stop requests from the main process.
 * Enables the HTTP API and CLI to control screen recording externally.
 *
 * @module lib/claude-bridge/claude-screen-recording-bridge
 */

import {
	startScreenRecording,
	stopScreenRecording,
} from "@/lib/project/screen-recording-controller";
import { platform } from "@qcut/platform-core";

const DEBUG = false;
const PREFIX = "[ClaudeScreenRecordingBridge]";

function debugLog(...args: unknown[]): void {
	if (DEBUG) console.log(PREFIX, ...args);
}

function debugWarn(...args: unknown[]): void {
	console.warn(PREFIX, ...args);
}

function debugError(...args: unknown[]): void {
	console.error(PREFIX, ...args);
}

/**
 * Attach handlers to Claude's screen recording bridge to handle start and stop requests from the main process.
 *
 * Registers asynchronous listeners on platform().claude?.screenRecordingBridge (if available) that:
 * - handle start requests and send a start response with the session result or an error message, and
 * - handle stop requests and send a stop response with the file result or an error message.
 *
 * If the bridge API is not available, the function logs a warning and returns without registering listeners.
 */
export function setupClaudeScreenRecordingBridge(): void {
	const srAPI = platform().claude?.screenRecordingBridge;
	if (!srAPI) {
		debugWarn("Claude Screen Recording Bridge API not available");
		return;
	}

	debugLog("Setting up bridge...");

	srAPI.onStartRequest(
		async (data: {
			requestId: string;
			options: { sourceId?: string; fileName?: string };
		}) => {
			try {
				debugLog("Received start recording request", data.options);
				const result = await startScreenRecording({
					options: {
						sourceId: data.options.sourceId,
						fileName: data.options.fileName,
					},
				});
				srAPI.sendStartResponse(data.requestId, result);
				debugLog("Recording started:", result.sessionId);
			} catch (error) {
				debugError("Failed to start recording:", error);
				srAPI.sendStartResponse(
					data.requestId,
					undefined,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	);

	srAPI.onStopRequest(
		async (data: { requestId: string; options: { discard?: boolean } }) => {
			try {
				debugLog("Received stop recording request", data.options);
				const result = await stopScreenRecording({
					options: { discard: data.options.discard },
				});
				srAPI.sendStopResponse(data.requestId, result);
				debugLog("Recording stopped:", result.filePath);
			} catch (error) {
				debugError("Failed to stop recording:", error);
				srAPI.sendStopResponse(
					data.requestId,
					undefined,
					error instanceof Error ? error.message : String(error)
				);
			}
		}
	);

	debugLog("Bridge setup complete");
}

/**
 * Remove any attached listeners from the Claude screen recording bridge, if present.
 *
 * This detaches bridge event handlers exposed by platform().claude?.screenRecordingBridge to prevent
 * further start/stop request callbacks.
 */
export function cleanupClaudeScreenRecordingBridge(): void {
	platform().claude?.screenRecordingBridge?.removeListeners?.();
	debugLog("Bridge cleanup complete");
}
