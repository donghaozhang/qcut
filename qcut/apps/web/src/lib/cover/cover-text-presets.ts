import {
	assertCoverText,
	resolveCoverTextStyle,
	type CoverTextLayerV1,
	type CoverTextStyleV1,
} from "@qcut/editor-core/cover";
import type { TextStylePreset } from "@/lib/text/text-presets";
import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";
import { normalizeJianyingTextRuntimeReference } from "@qcut/editor-core/assets";
import { buildTextStyleLabUpdates } from "@/components/editor/media-panel/views/text-style-lab/text-style-lab-mapping";

export function coverLabPreset({
	style,
}: {
	style: JianyingTextStyleLabStyleSummary;
}): TextStylePreset | null {
	if (!style.approximation || style.approximation.version !== 1) return null;
	return {
		id: `lab:${style.styleId}`,
		name: style.title ?? style.resourceId,
		updates: { ...style.approximation, backgroundOpacity: 0 },
	};
}

export function coverTextPresetChanges({
	layer,
	canvas,
	preset,
}: {
	layer: CoverTextLayerV1;
	canvas: { width: number; height: number };
	preset: TextStylePreset;
}): Partial<CoverTextLayerV1> {
	const defaults = resolveCoverTextStyle({
		fontSize: layer.fontSize,
		width: layer.width * canvas.width,
		height: layer.height * canvas.height,
	});
	const updates = preset.updates;
	// Copy concrete paint parameters, never transient lab paths or native-runtime references.
	const overrides = Object.fromEntries(
		Object.entries(updates).filter(
			([key, value]) =>
				Object.hasOwn(defaults, key) &&
				value !== undefined &&
				!(key === "backgroundColor" && value === "transparent")
		)
	);
	const textStyle: CoverTextStyleV1 = {
		...defaults,
		strokeWidth: 0,
		shadowOpacity: 0,
		backgroundOpacity: 0,
		glowOpacity: 0,
		...overrides,
		glowEnabled: (updates.glowOpacity ?? 0) > 0,
	};
	const changes: Partial<CoverTextLayerV1> = {
		color: updates.color ?? layer.color,
		bold: updates.fontWeight ? updates.fontWeight === "bold" : layer.bold,
		italic: updates.fontStyle ? updates.fontStyle === "italic" : layer.italic,
		underline: updates.textDecoration
			? updates.textDecoration === "underline"
			: layer.underline,
		stroke: textStyle.strokeWidth > 0 && textStyle.strokeOpacity > 0,
		shadow: textStyle.shadowOpacity > 0,
		background:
			textStyle.backgroundOpacity > 0 &&
			updates.backgroundColor !== "transparent",
		textStyle,
		jianyingTextStyle: undefined,
		nativeFrameTime: undefined,
	};
	assertCoverText({ layer: { ...layer, ...changes } });
	return changes;
}

export function coverWordArtChanges({
	layer,
	canvas,
	style,
}: {
	layer: CoverTextLayerV1;
	canvas: { width: number; height: number };
	style: JianyingTextStyleLabStyleSummary;
}): Partial<CoverTextLayerV1> {
	const updates = buildTextStyleLabUpdates({ style });
	if (!updates) throw new Error("Word-art style is preview-only");
	const reference = style.runtimeReference
		? normalizeJianyingTextRuntimeReference({ value: style.runtimeReference })
		: undefined;
	if (style.runtimeReference && !reference)
		throw new Error("Invalid word-art runtime reference");
	const changes = {
		...coverTextPresetChanges({
			layer,
			canvas,
			preset: {
				id: style.styleId,
				name: style.title ?? style.resourceId,
				updates,
			},
		}),
		jianyingTextStyle: reference ?? undefined,
		nativeFrameTime: reference
			? Math.min(1, reference.templateDuration / 2)
			: undefined,
	};
	assertCoverText({ layer: { ...layer, ...changes } });
	return changes;
}
