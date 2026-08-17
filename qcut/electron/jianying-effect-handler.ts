import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, ipcMain } from "electron";
import {
	JIANYING_EFFECT_COVER_CHANNEL,
	JIANYING_EFFECT_DOWNLOAD_CHANNEL,
	JIANYING_EFFECT_PREVIEW_CHANNEL,
	JIANYING_EFFECT_RENDER_CHANNEL,
	JIANYING_EFFECT_STATUS_CHANNEL,
	type JianyingEffectCoverRequest,
	type JianyingEffectCoverResult,
	type JianyingEffectDownloadRequest,
	type JianyingEffectDownloadResult,
	type JianyingEffectPreviewRequest,
	type JianyingEffectRenderRequest,
	type JianyingEffectRenderResult,
} from "./jianying-effect-contract.js";
import { getJianyingEffectCover } from "./jianying-effect/cover-cache.js";
import { downloadJianyingEffectPackage } from "./jianying-effect/download.js";
import { getJianyingEffectPreview } from "./jianying-effect/preview-cache.js";
import { renderJianyingEffectClip } from "./jianying-effect/render.js";
import { inspectJianyingEffectRuntime } from "./jianying-effect/runtime-discovery.js";

const PREVIEW_ERROR_MESSAGE =
	"本机剪映特效预览生成失败，请检查本机运行时与素材包。";
const MAX_DIMENSION = 16_384;
const MAX_FRAME_RATE = 240;
/** Long enough for any real clip, short of the range that breaks llround. */
const MAX_TIMELINE_SECONDS = 24 * 60 * 60;

/**
 * Renders are written into scratch space, so the destination is confined to
 * the directories QCut itself uses — otherwise a renderer could name any path
 * and ffmpeg's -y would overwrite it.
 */
function writableRoots(): string[] {
	const roots = [os.tmpdir()];
	try {
		roots.push(app.getPath("userData"), app.getPath("temp"));
	} catch {
		// getPath throws before the app is ready; tmpdir alone still bounds it.
	}
	return roots.map((root) => path.resolve(root));
}

function isInsideWritableRoot({ target }: { target: string }): boolean {
	const resolved = path.resolve(target);
	return writableRoots().some(
		(root) => resolved === root || resolved.startsWith(root + path.sep)
	);
}

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
	if (!isInsideWritableRoot({ target: request.outputPath })) {
		throw new Error("特效渲染输出必须位于 QCut 的临时目录内。");
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
	// Unbounded seconds reach std::llround in the native probe, where a value
	// like 1e300 is undefined behaviour.
	for (const [label, value] of [
		["起始时间", request.startSeconds ?? 0],
		["时长", request.durationSeconds ?? 1],
	] as const) {
		if (!Number.isFinite(value) || value < 0 || value > MAX_TIMELINE_SECONDS) {
			throw new Error(`特效${label}无效。`);
		}
	}
	if (request.durationSeconds !== undefined && request.durationSeconds <= 0) {
		throw new Error("特效时长必须大于 0。");
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
		JIANYING_EFFECT_COVER_CHANNEL,
		async (
			_event,
			request: JianyingEffectCoverRequest
		): Promise<JianyingEffectCoverResult> => {
			if (
				typeof request?.effectId !== "string" ||
				!/^\d{1,32}$/.test(request.effectId)
			) {
				throw new Error("特效编号无效。");
			}
			return getJianyingEffectCover({ effectId: request.effectId });
		}
	);

	ipcMain.handle(
		JIANYING_EFFECT_DOWNLOAD_CHANNEL,
		async (
			_event,
			request: JianyingEffectDownloadRequest
		): Promise<JianyingEffectDownloadResult> => {
			// The renderer only names an effect; URL, checksum and destination all
			// come from the main process's own catalog read.
			if (
				typeof request?.effectId !== "string" ||
				!/^\d{1,32}$/.test(request.effectId)
			) {
				throw new Error("特效编号无效。");
			}
			return downloadJianyingEffectPackage({ effectId: request.effectId });
		}
	);

	ipcMain.handle(
		JIANYING_EFFECT_PREVIEW_CHANNEL,
		async (_event, request: JianyingEffectPreviewRequest) => {
			try {
				return await getJianyingEffectPreview({ request });
			} catch (cause) {
				// The user-facing reasons ("needs Jianying algorithms", "package
				// missing") are written for them — only unknown failures collapse
				// into the generic message, and the cause is always logged.
				console.error("[jianying-effect] preview failed", cause);
				throw cause instanceof Error && cause.message
					? cause
					: new Error(PREVIEW_ERROR_MESSAGE);
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
			if (!definition.installed) {
				throw new Error(`该特效素材包尚未下载：${definition.name}`);
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
