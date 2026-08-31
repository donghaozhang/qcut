/**
 * Export policy for per-clip Filter Lab stacks.
 *
 * The native CLI export path cannot render `MediaElement.filterStack`; any
 * enabled stack with a renderable effect must go through the renderer's
 * canvas engine or the filters would be dropped silently.
 */

interface FilterStackTimelineElement {
	type?: string;
	filterStack?: unknown;
}

interface FilterStackTimeline {
	tracks: Array<{ elements: FilterStackTimelineElement[] }>;
}

function stackHasRenderableEffect({ stack }: { stack: unknown }): boolean {
	if (typeof stack !== "object" || stack === null) return false;
	const record = stack as Record<string, unknown>;
	if (record.enabled !== true) return false;
	const effects = record.effects;
	if (!Array.isArray(effects)) return false;
	return effects.some((effect) => {
		if (typeof effect !== "object" || effect === null) return false;
		const entry = effect as Record<string, unknown>;
		if (entry.enabled !== true) return false;
		const color = entry.color;
		if (typeof color !== "object" || color === null) return false;
		const payload = color as Record<string, unknown>;
		// Mirror the renderer's hasEnabledFilterStack: only an enabled LUT
		// with a cube, or an enabled multi-pass program, actually renders.
		const lut = payload.lut as Record<string, unknown> | undefined;
		const multiPass = payload.multiPass as Record<string, unknown> | undefined;
		return (
			Boolean(lut && lut.enabled === true && lut.cube) ||
			Boolean(multiPass && multiPass.enabled === true)
		);
	});
}

export function timelineRequiresRendererFilterStackExport({
	timeline,
}: {
	timeline: FilterStackTimeline;
}): boolean {
	for (const track of timeline.tracks) {
		for (const element of track.elements) {
			if (element.type !== "media" && element.type !== "video") continue;
			if (stackHasRenderableEffect({ stack: element.filterStack })) {
				return true;
			}
		}
	}
	return false;
}
