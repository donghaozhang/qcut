import {
	assertCoverText,
	resolveCoverTextStyle,
	type CoverTextLayerV1,
	type CoverTextStyleV1,
} from "@qcut/editor-core/cover";
import type { TextStylePreset } from "@/lib/text/text-presets";
import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";

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
	};
	assertCoverText({ layer: { ...layer, ...changes } });
	return changes;
}
