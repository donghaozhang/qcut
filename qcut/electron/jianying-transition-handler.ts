import { ipcMain } from "electron";
import {
	JIANYING_TRANSITION_INSPECT_CHANNEL,
	JIANYING_TRANSITION_RENDER_CHANNEL,
	JIANYING_TRANSITION_RENDER_TIMELINE_CHANNEL,
	type JianyingTimelineRenderRequest,
	type JianyingTransitionRenderRequest,
} from "./jianying-transition-contract.js";
import {
	renderJianyingTimelineTransitions,
	renderJianyingTransition,
} from "./jianying-transition/render.js";
import { inspectJianyingTransitionRuntime } from "./jianying-transition/runtime-discovery.js";

export function setupJianyingTransitionIPC(): void {
	ipcMain.handle(JIANYING_TRANSITION_INSPECT_CHANNEL, async () => {
		const inspection = await inspectJianyingTransitionRuntime();
		return inspection.status;
	});
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
