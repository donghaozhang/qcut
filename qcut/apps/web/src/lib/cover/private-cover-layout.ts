import {
	assertCoverDesign,
	assertCoverText,
	createCoverText,
	type CoverDesignV1,
	type CoverTextLayerV1,
} from "@qcut/editor-core/cover";
import { normalizeJianyingTextRuntimeReference } from "@qcut/editor-core/assets";
import {
	parseCoverTextLayout,
	type CoverTextLayout,
} from "../../../../../electron/jianying-cover-layout";
import {
	createLocalFontAssetReference,
	ensureLocalFontLoaded,
} from "@/lib/fonts/local-font-runtime";
import { privateFontAPI } from "@/lib/fonts/private-font-api";
import { canvasFontFamily } from "@/lib/text/canvas-font";
import { measureTextWithSpacing } from "@/lib/text/text-animation-canvas-layout";

export async function loadPrivateCoverTextLayout({
	packageHash,
}: {
	packageHash: string;
}): Promise<CoverTextLayout> {
	if (!/^[a-f\d]{32}$/.test(packageHash))
		throw new Error("Invalid cover template identity");
	const api = window.electronAPI?.jianyingCover;
	let layout: CoverTextLayout;
	if (api?.prepareTextLayout) {
		layout = await api.prepareTextLayout({ packageHash });
		await window.electronAPI?.jianyingFontLab?.list({ refresh: true });
	} else {
		if (!import.meta.env.DEV)
			throw new Error("Private templates require QCut desktop");
		const response = await fetch(
			`/__qcut/private-covers/layout/${packageHash}`,
			{ method: "POST", cache: "no-store" }
		);
		if (!response.ok)
			throw new Error("Template resources could not be prepared");
		layout = await response.json();
	}
	if (
		layout.packageHash !== packageHash ||
		!Array.isArray(layout.texts) ||
		layout.texts.length > 20 ||
		!layout.fonts ||
		!layout.wordArt
	)
		throw new Error("Invalid cover layout response");
	const parsed = parseCoverTextLayout({
		definition: {
			canvas_config: layout.canvas,
			cover: {
				cover_draft: {
					materials: {
						texts: [
							...new Map(
								layout.texts.map((item) => [item.text.id, item.text])
							).values(),
						],
						effects: [
							...new Map(
								layout.texts.flatMap((item) =>
									item.effect ? [[item.effect.id, item.effect] as const] : []
								)
							).values(),
						],
					},
					tracks: [
						{
							type: "text",
							segments: layout.texts.map((item) => item.segment),
						},
					],
				},
			},
		},
	});
	return { ...layout, ...parsed };
}

export function applyPrivateCoverTextLayout({
	design,
	layout,
	ctx,
}: {
	design: CoverDesignV1;
	layout: CoverTextLayout;
	ctx: CanvasRenderingContext2D;
}): CoverDesignV1 {
	const templateId = `jianying:${layout.packageHash}`;
	const fit =
		Math.min(design.canvas.width, design.canvas.height) /
		Math.min(layout.canvas.width, layout.canvas.height);
	const manual = design.layers
		.slice(1)
		.filter(
			(layer): layer is CoverTextLayerV1 =>
				layer.kind === "text" && !layer.templateId
		);
	if (manual.length + layout.texts.length > 20)
		throw new Error("A cover supports at most 20 text layers");
	const layers = layout.texts.map(({ text, segment, effect }) => {
		const font = layout.fonts[text.font_path];
		if (!font) throw new Error(`Cover font unavailable: ${text.font_title}`);
		const fontAsset = createLocalFontAssetReference({ font });
		const scale = segment.clip.scale.x * fit;
		const fontSize = ((text.font_size * layout.canvas.height) / 135) * scale;
		const letterSpacing = (text.letter_spacing / 0.05) * scale;
		const lineHeight = 1.1 + text.line_spacing;
		ctx.font = `${text.italic_degree ? "italic" : "normal"} ${text.bold_width ? "bold" : "normal"} ${fontSize}px ${canvasFontFamily(fontAsset.cssFamily)}`;
		const lines = text.content.split("\n");
		const padding = text.background_color ? fontSize * 0.12 : 0;
		const width =
			Math.max(
				...lines.map((value) =>
					measureTextWithSpacing({ ctx, text: value, letterSpacing })
				)
			) +
			2 * padding +
			fontSize * 0.1;
		const height =
			lines.length * fontSize * lineHeight + 2 * padding + fontSize * 0.1;
		const native = effect
			? normalizeJianyingTextRuntimeReference({
					value: layout.wordArt[effect.path],
				})
			: undefined;
		if (effect && !native)
			throw new Error(`Cover word-art unavailable: ${effect.name}`);
		// Latin-only vertical runs use the same glyph layout, turned clockwise.
		const rotation = segment.clip.rotation + (text.typesetting === 1 ? 90 : 0);
		const layer: CoverTextLayerV1 = {
			...createCoverText({
				canvas: design.canvas,
				content: text.content,
				id: `${templateId}:${segment.id}`,
			}),
			templateId,
			fontAsset,
			fontSize,
			color: text.text_color || "#ffffff",
			x: (1 + segment.clip.transform.x) / 2,
			y: (1 - segment.clip.transform.y) / 2,
			width: Math.min(1, Math.max(0.05, width / design.canvas.width)),
			height: Math.min(1, Math.max(0.05, height / design.canvas.height)),
			rotation: rotation > 180 ? rotation - 360 : rotation,
			opacity: text.text_alpha * segment.clip.alpha,
			bold: text.bold_width > 0,
			italic: text.italic_degree !== 0,
			underline: text.underline,
			align:
				text.alignment === 0
					? "left"
					: text.alignment === 2
						? "right"
						: "center",
			stroke: Boolean(text.border_color && text.border_width),
			shadow: text.has_shadow,
			background: Boolean(text.background_color),
			jianyingTextStyle: native ?? undefined,
			nativeUseEffectDefaultColor: native
				? text.use_effect_default_color
				: undefined,
			textStyle: {
				letterSpacing,
				lineHeight,
				backgroundPadding: padding,
				backgroundRadius: 0,
				backgroundColor: text.background_color || "#000000",
				backgroundOpacity: text.background_alpha,
				strokeColor: text.border_color || "#000000",
				strokeWidth: text.border_color ? text.border_width * fontSize : 0,
				shadowColor: text.shadow_color || "#000000",
				shadowOpacity: text.shadow_alpha,
				shadowBlur: text.shadow_smoothing * fontSize,
				shadowOffsetX: text.shadow_point.x * fontSize * 0.1,
				shadowOffsetY: -text.shadow_point.y * fontSize * 0.1,
			},
		};
		assertCoverText({ layer });
		return layer;
	});
	const next: CoverDesignV1 = {
		...design,
		templateId,
		layers: [design.layers[0], ...manual, ...layers],
	};
	assertCoverDesign({ design: next });
	return next;
}

export async function loadCoverLayoutFonts({
	layout,
	signal,
}: {
	layout: CoverTextLayout;
	signal: AbortSignal;
}) {
	const api = privateFontAPI();
	if (!api) throw new Error("QCut font runtime unavailable");
	await layout.texts.reduce(async (previous, { text }) => {
		await previous;
		signal.throwIfAborted();
		const font = layout.fonts[text.font_path];
		if (!font) throw new Error(`Cover font unavailable: ${text.font_title}`);
		const coverage = await api.inspect({
			fontId: font.fontId,
			text: text.content,
		});
		if (coverage.fontId !== font.fontId || !coverage.covered)
			throw new Error(`Cover font lacks required glyphs: ${text.font_title}`);
		await ensureLocalFontLoaded({
			asset: createLocalFontAssetReference({ font }),
		});
	}, Promise.resolve());
	signal.throwIfAborted();
}
