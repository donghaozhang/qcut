import { ipcMain } from "electron";
import {
	JIANYING_TRANSITION_INSPECT_CHANNEL,
	JIANYING_TRANSITION_PREVIEW_CHANNEL,
	JIANYING_TRANSITION_REGISTER_PREVIEW_SOURCE_CHANNEL,
	JIANYING_TRANSITION_RENDER_CHANNEL,
	JIANYING_TRANSITION_RENDER_TIMELINE_CHANNEL,
	JIANYING_TRANSITION_TIMELINE_PREVIEW_CHANNEL,
	type JianyingTimelineRenderRequest,
	type JianyingTimelinePreviewRequest,
	type JianyingTransitionPreviewRequest,
	type JianyingTransitionRenderRequest,
} from "./jianying-transition-contract.js";
import {
	renderJianyingTimelineTransitions,
	renderJianyingTransition,
} from "./jianying-transition/render.js";
import { inspectJianyingTransitionRuntime } from "./jianying-transition/runtime-discovery.js";
import { getJianyingTransitionPreview } from "./jianying-transition/preview-cache.js";
import { getJianyingTimelineTransitionPreview } from "./jianying-transition/timeline-preview-cache.js";
import {
	authorizeJianyingTimelinePreviewRequest,
	registerJianyingTimelinePreviewSource,
} from "./jianying-transition/preview-source-authorization.js";

const PREVIEW_ERROR_MESSAGE =
	"本机剪映转场预览生成失败，请检查本机运行时与资源包。";

export function setupJianyingTransitionIPC(): void {
	ipcMain.on(
		JIANYING_TRANSITION_REGISTER_PREVIEW_SOURCE_CHANNEL,
		(_event, inputPath: unknown) => {
			if (typeof inputPath !== "string") return;
			try {
				registerJianyingTimelinePreviewSource({ inputPath });
			} catch {
				return;
			}
		}
	);
	ipcMain.handle(JIANYING_TRANSITION_INSPECT_CHANNEL, async () => {
		const inspection = await inspectJianyingTransitionRuntime();
		return inspection.status;
	});
	ipcMain.handle(
		JIANYING_TRANSITION_PREVIEW_CHANNEL,
		async (_event, request: JianyingTransitionPreviewRequest) => {
			try {
				return await getJianyingTransitionPreview({ request });
			} catch {
				throw new Error(PREVIEW_ERROR_MESSAGE);
			}
		}
	);
	ipcMain.handle(
		JIANYING_TRANSITION_TIMELINE_PREVIEW_CHANNEL,
		async (_event, request: JianyingTimelinePreviewRequest) => {
			try {
				const authorizedRequest = await authorizeJianyingTimelinePreviewRequest(
					{
						request,
					}
				);
				return await getJianyingTimelineTransitionPreview({
					request: authorizedRequest,
				});
			} catch {
				throw new Error(PREVIEW_ERROR_MESSAGE);
			}
		}
	);
	ipcMain.handle(
		JIANYING_TRANSITION_RENDER_CHANNEL,
		async (_event, request: JianyingTransitionRenderRequest) =>
			renderJianyingTransition({ request })
	);
	ipcMain.handle(
		JIANYING_TRANSITION_RENDER_TIMELINE_CHANNEL,
		async (_event, request: JianyingTimelineRenderRequest) =>
			renderJianyingTimelineTransitions({ request })
	);
}
