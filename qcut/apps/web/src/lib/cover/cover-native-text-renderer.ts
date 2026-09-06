import { platform } from "@qcut/platform-core";
import type { CoverDesignV1, CoverTextLayerV1 } from "@qcut/editor-core/cover";
import {
	createJianyingTextRenderEntry,
	validateJianyingTextRenderResult,
} from "@/lib/preview/jianying-text-render-entry";
import { ensureLocalFontLoaded } from "@/lib/fonts/local-font-runtime";
import { privateFontAPI } from "@/lib/fonts/private-font-api";
import { coverTextElement, paintCoverText } from "./cover-text-renderer";

export async function paintCoverTextLayer({
	ctx,
	canvas,
	layer,
	signal,
}: {
	ctx: CanvasRenderingContext2D;
	canvas: CoverDesignV1["canvas"];
	layer: CoverTextLayerV1;
	signal?: AbortSignal;
}): Promise<void> {
	signal?.throwIfAborted();
	if (layer.fontAsset) {
		const api = privateFontAPI();
		if (!api) throw new Error("封面本机字体需要 QCut 桌面版字体实验室");
		const coverage = await api.inspect({
			fontId: layer.fontAsset.assetId,
			text: layer.content,
		});
		if (coverage.fontId !== layer.fontAsset.assetId || !coverage.covered)
			throw new Error("封面字体缺少当前文字所需字形");
		await ensureLocalFontLoaded({ asset: layer.fontAsset });
	}
	signal?.throwIfAborted();
	if (!layer.jianyingTextStyle) {
		paintCoverText({ ctx, canvas, layer });
		return;
	}
	const api = window.electronAPI?.jianyingTextRuntime;
	if (!api) throw new Error("封面原生花字需要 QCut 桌面版花字实验室");
	const requestId = `cover:${crypto.randomUUID()}`;
	const entry = createJianyingTextRenderEntry({
		element: {
			...coverTextElement({ ctx, canvas, layer }),
			fontSize: layer.fontSize,
			duration: layer.jianyingTextStyle.templateDuration,
			jianyingTextStyle: layer.jianyingTextStyle,
			fontAsset: layer.fontAsset,
		},
		requestId,
		trackOrder: 0,
		elementOrder: 0,
		canvasWidth: canvas.width,
		canvasHeight: canvas.height,
		fps: 30,
		mode: "frame",
		timelineTime:
			layer.nativeFrameTime ??
			Math.min(1, layer.jianyingTextStyle.templateDuration / 2),
	});
	if (!entry) throw new Error("Invalid cover word-art frame");
	const cancel = () => {
		void api.cancel({ requestId }).catch(() => {});
	};
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		signal?.throwIfAborted();
		const result = validateJianyingTextRenderResult({
			entry,
			result: await api.render(entry.renderRequest),
		});
		signal?.throwIfAborted();
		if (
			result.resourceId !== layer.jianyingTextStyle.resourceId ||
			result.source.kind !== "image" ||
			![result.x, result.y, result.width, result.height].every(
				Number.isFinite
			) ||
			!Number.isSafeInteger(result.width) ||
			!Number.isSafeInteger(result.height) ||
			result.width < 1 ||
			result.height < 1 ||
			result.width * result.height > 33_554_432
		)
			throw new Error("Invalid cover word-art render result");
		if (result.diagnostics?.length)
			throw new Error(
				result.diagnostics.map(({ message }) => message).join("; ")
			);
		const bytes = await platform().files.readFile(result.source.path);
		signal?.throwIfAborted();
		if (!bytes?.length || bytes.length > 32 * 1024 * 1024)
			throw new Error("Cover word-art frame is missing or oversized");
		const image = await createImageBitmap(
			new Blob([new Uint8Array(bytes)], { type: "image/png" })
		);
		try {
			signal?.throwIfAborted();
			if (image.width !== result.width || image.height !== result.height)
				throw new Error("Cover word-art frame dimensions do not match");
			// The shared runtime has already applied rotation and alpha to this local surface.
			ctx.drawImage(image, result.x, result.y, result.width, result.height);
		} finally {
			image.close();
		}
	} finally {
		signal?.removeEventListener("abort", cancel);
	}
}
