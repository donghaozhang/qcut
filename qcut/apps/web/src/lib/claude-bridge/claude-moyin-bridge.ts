/**
 * Claude Moyin (Director) Bridge
 *
 * Handles CLI/API requests for moyin script workflow:
 * set script text, trigger parse, and report status.
 *
 * @module lib/claude-bridge/claude-moyin-bridge
 */

import { useMoyinStore } from "@/stores/moyin/moyin-store";
import { platform } from "@qcut/platform-core";
import { toast } from "sonner";

/**
 * Registers Moyin bridge handlers on the platform integration to wire CLI/API requests to the Moyin store and workflows.
 *
 * When a platform Moyin instance is available, this function sets up listeners that:
 * - update the store's raw script from incoming script text,
 * - trigger script parsing and generation using the store's APIs,
 * - respond to status requests with current pipeline/status counts,
 * - respond to export requests with current script metadata and content.
 *
 * The function is a no-op if no platform Moyin integration is present.
 */
export function setupClaudeMoyinBridge(): void {
	const moyin = platform().moyin;
	if (!moyin) return;

	moyin.onSetScript((data) => {
		if (!data.text) return;
		useMoyinStore.getState().setRawScript(data.text);
		toast.info("Script updated via CLI");
	});

	moyin.onTriggerParse(() => {
		const state = useMoyinStore.getState();
		if (!state.rawScript.trim()) {
			toast.error("Cannot parse: no script text");
			return;
		}
		if (state.parseStatus === "parsing") {
			toast.warning("Parse already in progress");
			return;
		}
		toast.info("Parse Script triggered via CLI");
		state.parseScript().catch((err: unknown) => {
			const message =
				err instanceof Error ? err.message : "Unknown parse error";
			toast.error(`Parse failed: ${message}`);
		});
	});

	moyin.onGenerateScript((data) => {
		if (!data.idea?.trim()) {
			toast.error("Cannot generate: no idea/description provided");
			return;
		}
		toast.info("Generate Script triggered via CLI");
		useMoyinStore
			.getState()
			.generateScript(data.idea, {
				genre: data.genre,
				targetDuration: data.targetDuration,
			})
			.catch((err: unknown) => {
				const message =
					err instanceof Error ? err.message : "Unknown generate error";
				toast.error(`Generate failed: ${message}`);
			});
	});

	moyin.onStatusRequest((data) => {
		const requestId = typeof data?.requestId === "string" ? data.requestId : "";
		try {
			if (!requestId) {
				throw new Error("Invalid status request: missing requestId");
			}
			const state = useMoyinStore.getState();
			moyin.sendStatusResponse(requestId, {
				parseStatus: state.parseStatus,
				createStatus: state.createStatus,
				createError: state.createError,
				activeStep: state.activeStep,
				pipelineProgress: state.pipelineProgress,
				characters: state.characters.length,
				scenes: state.scenes.length,
				episodes: state.episodes.length,
				shots: state.shots.length,
			});
		} catch (err) {
			if (requestId) {
				moyin.sendStatusResponse(
					requestId,
					undefined,
					err instanceof Error ? err.message : String(err)
				);
			}
		}
	});

	moyin.onExportRequest((data) => {
		const requestId = typeof data?.requestId === "string" ? data.requestId : "";
		try {
			if (!requestId) {
				throw new Error("Invalid export request: missing requestId");
			}
			const state = useMoyinStore.getState();
			moyin.sendExportResponse(requestId, {
				title: state.scriptData?.title ?? "Untitled",
				genre: state.scriptData?.genre,
				logline: state.scriptData?.logline,
				language: state.scriptData?.language ?? "auto",
				targetDuration: state.scriptData?.targetDuration,
				characters: state.characters,
				scenes: state.scenes,
				episodes: state.episodes,
				shots: state.shots,
			});
		} catch (err) {
			if (requestId) {
				moyin.sendExportResponse(
					requestId,
					undefined,
					err instanceof Error ? err.message : String(err)
				);
			}
		}
	});
}

/**
 * Removes any registered Claude–Moyin bridge listeners from the platform Moyin integration.
 *
 * Ensures the Moyin bridge no longer receives CLI/API requests by calling the platform's
 * removal helper when a Moyin instance is present.
 */
export function cleanupClaudeMoyinBridge(): void {
	platform().moyin?.removeMoyinBridgeListeners();
}
