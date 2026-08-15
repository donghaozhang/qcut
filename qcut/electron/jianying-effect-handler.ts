import { ipcMain } from "electron";
import {
	JIANYING_EFFECT_PREVIEW_CHANNEL,
	JIANYING_EFFECT_RENDER_CHANNEL,
	JIANYING_EFFECT_STATUS_CHANNEL,
	type JianyingEffectPreviewRequest,
	type JianyingEffectRenderRequest,
	type JianyingEffectRenderResult,
} from "./jianying-effect-contract.js";
import { getJianyingEffectPreview } from "./jianying-effect/preview-cache.js";
import { renderJianyingEffectClip } from "./jianying-effect/render.js";
import { inspectJianyingEffectRuntime } from "./jianying-effect/runtime-discovery.js";

const PREVIEW_ERROR_MESSAGE =
	"本机剪映特效预览生成失败，请检查本机运行时与素材包。";

export function setupJianyingEffectIPC(): void {
	ipcMain.handle(JIANYING_EFFECT_STATUS_CHANNEL, async () => {
		const inspection = await inspectJianyingEffectRuntime();
		return inspection.status;
	});

	ipcMain.handle(
		JIANYING_EFFECT_PREVIEW_CHANNEL,
		async (_event, request: JianyingEffectPreviewRequest) => {
			try {
				return await getJianyingEffectPreview({ request });
			} catch {
				throw new Error(PREVIEW_ERROR_MESSAGE);
			}
		}
	);

	ipcMain.handle(
		JIANYING_EFFECT_RENDER_CHANNEL,
		async (
			_event,
			request: JianyingEffectRenderRequest
		): Promise<JianyingEffectRenderResult> => {
			const inspection = await inspectJianyingEffectRuntime();
			const definition = inspection.effects.find(
				(effect) => effect.id === request.effectId
			);
			if (!definition) {
				throw new Error(`未找到本机剪映特效：${request.effectId}`);
			}
			if (!definition.supported) {
				throw new Error(
					definition.unsupportedReason ?? "该特效暂不支持本机渲染。"
				);
			}

			const counts = await renderJianyingEffectClip({
				inspection,
				definition,
				inputPath: request.inputPath,
				outputPath: request.outputPath,
				width: request.width,
				height: request.height,
				frameRate: request.frameRate,
				startSeconds: request.startSeconds,
				durationSeconds: request.durationSeconds,
				adjustValues: request.adjustValues,
			});

			return {
				effectId: request.effectId,
				outputPath: request.outputPath,
				...counts,
			};
		}
	);
}
