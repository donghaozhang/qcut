import { access, constants } from "node:fs/promises";
import path from "node:path";
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
const MAX_DIMENSION = 16_384;
const MAX_FRAME_RATE = 240;
const MAX_PREVIEW_SECONDS = 10;

/**
 * The renderer supplies these paths, so they are checked here rather than
 * handed straight to ffmpeg and the native bridge.
 */
async function validateRenderRequest({
	request,
}: {
	request: JianyingEffectRenderRequest;
}): Promise<void> {
	if (!path.isAbsolute(request.inputPath)) {
		throw new Error("特效渲染输入必须是绝对路径。");
	}
	if (!path.isAbsolute(request.outputPath)) {
		throw new Error("特效渲染输出必须是绝对路径。");
	}
	if (path.resolve(request.inputPath) === path.resolve(request.outputPath)) {
		throw new Error("特效渲染输出不能覆盖输入。");
	}
	await access(request.inputPath, constants.R_OK).catch(() => {
		throw new Error(`读取不到特效渲染输入：${request.inputPath}`);
	});

	const { width, height, frameRate } = request;
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width <= 0 ||
		height <= 0 ||
		width > MAX_DIMENSION ||
		height > MAX_DIMENSION
	) {
		throw new Error("特效渲染尺寸无效。");
	}
	if (
		!Number.isFinite(frameRate) ||
		frameRate <= 0 ||
		frameRate > MAX_FRAME_RATE
	) {
		throw new Error("特效渲染帧率无效。");
	}
	for (const entry of request.adjustValues ?? []) {
		// The bridge receives these as a "key=value,…" env string.
		if (!/^[a-z0-9_]+$/i.test(entry.key)) {
			throw new Error(`特效参数名无效：${entry.key}`);
		}
		if (!Number.isFinite(entry.value)) {
			throw new Error(`特效参数值无效：${entry.key}`);
		}
	}
}

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
			if (
				request.packageHash &&
				request.packageHash !== definition.packageHash
			) {
				throw new Error(
					`本机剪映特效素材包已变化：${definition.name}（预期 ${request.packageHash}，实际 ${definition.packageHash}）`
				);
			}
			await validateRenderRequest({ request });

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
