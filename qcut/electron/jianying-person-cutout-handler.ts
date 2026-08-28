import { ipcMain } from "electron";
import {
	JIANYING_PERSON_CUTOUT_CANCEL_CHANNEL,
	JIANYING_PERSON_CUTOUT_INSPECT_CHANNEL,
	JIANYING_PERSON_CUTOUT_PROGRESS_CHANNEL,
	JIANYING_PERSON_CUTOUT_RELEASE_CHANNEL,
	JIANYING_PERSON_CUTOUT_RENDER_CHANNEL,
	type JianyingPersonCutoutCancelRequest,
	type JianyingPersonCutoutReleaseRequest,
	type JianyingPersonCutoutRenderRequest,
} from "./jianying-person-cutout-contract.js";
import {
	inspectJianyingPersonCutout,
	releaseJianyingPersonCutout,
	renderJianyingPersonCutout,
} from "./jianying-person-cutout/runtime.js";

export function setupJianyingPersonCutoutIPC() {
	const activeTasks = new Map<string, AbortController>();
	ipcMain.handle(JIANYING_PERSON_CUTOUT_INSPECT_CHANNEL, () =>
		inspectJianyingPersonCutout()
	);
	ipcMain.handle(
		JIANYING_PERSON_CUTOUT_RENDER_CHANNEL,
		async (event, request: JianyingPersonCutoutRenderRequest) => {
			if (!request.taskId || activeTasks.has(request.taskId)) {
				throw new Error("人物抠像任务无效或已在运行");
			}
			const controller = new AbortController();
			activeTasks.set(request.taskId, controller);
			try {
				return await renderJianyingPersonCutout({
					...request,
					signal: controller.signal,
					onProgress: ({ progress, status }) => {
						if (event.sender.isDestroyed()) return;
						event.sender.send(JIANYING_PERSON_CUTOUT_PROGRESS_CHANNEL, {
							progress,
							status,
							taskId: request.taskId,
						});
					},
				});
			} finally {
				activeTasks.delete(request.taskId);
			}
		}
	);
	ipcMain.handle(
		JIANYING_PERSON_CUTOUT_CANCEL_CHANNEL,
		(_event, request: JianyingPersonCutoutCancelRequest) => {
			activeTasks.get(request.taskId)?.abort();
		}
	);
	ipcMain.handle(
		JIANYING_PERSON_CUTOUT_RELEASE_CHANNEL,
		(_event, request: JianyingPersonCutoutReleaseRequest) =>
			releaseJianyingPersonCutout(request)
	);
}
