import type {
	ClaudeElement,
	ClaudeTimeline,
} from "../../../types/claude-api.js";
import { normalizeJianyingTextRuntimeReference } from "../../../jianying-text-runtime/reference.js";
import type { JianyingTextOverlay } from "./types.js";

const BLEND_MODES = new Set<JianyingTextOverlay["blendMode"]>([
	"normal",
	"multiply",
	"screen",
	"overlay",
	"darken",
	"lighten",
]);

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function numberValue({
	element,
	style,
	key,
	fallback,
}: {
	element: ClaudeElement;
	style: Record<string, unknown>;
	key: string;
	fallback: number;
}): number {
	const elementRecord = element as unknown as Record<string, unknown>;
	const value = elementRecord[key] ?? style[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function referenceCandidate({ source }: { source: ClaudeElement }): unknown {
	if (source.jianyingTextStyle !== undefined) return source.jianyingTextStyle;
	return asRecord(source.style).jianyingTextStyle;
}

export function hasJianyingTextStyleCandidate({
	source,
}: {
	source: ClaudeElement;
}): boolean {
	return referenceCandidate({ source }) !== undefined;
}

function blendModeValue({
	element,
	style,
}: {
	element: ClaudeElement;
	style: Record<string, unknown>;
}): JianyingTextOverlay["blendMode"] {
	const value = element.blendMode ?? style.blendMode;
	return typeof value === "string" &&
		BLEND_MODES.has(value as JianyingTextOverlay["blendMode"])
		? (value as JianyingTextOverlay["blendMode"])
		: "normal";
}

export function collectJianyingTextOverlays({
	timeline,
}: {
	timeline: ClaudeTimeline;
}): JianyingTextOverlay[] {
	const overlays: JianyingTextOverlay[] = [];
	for (const track of timeline.tracks) {
		if (track.hidden) continue;
		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder += 1
		) {
			const source = track.elements[elementOrder];
			if (
				source.hidden ||
				source.type !== "text" ||
				!hasJianyingTextStyleCandidate({ source })
			) {
				continue;
			}
			const reference = normalizeJianyingTextRuntimeReference({
				value: referenceCandidate({ source }),
			});
			if (!reference) {
				throw new Error(
					`Jianying text element ${source.id} has an invalid stable resource reference.`
				);
			}
			const content = source.content?.trim();
			if (!content) continue;
			const elementDuration =
				Number.isFinite(source.duration) && source.duration > 0
					? source.duration
					: source.endTime - source.startTime;
			const sourceStart = Math.max(0, source.trimStart ?? 0);
			const trimEnd = Math.max(0, source.trimEnd ?? 0);
			const startTime = source.startTime + sourceStart;
			const endTime = source.startTime + elementDuration - trimEnd;
			if (!Number.isFinite(elementDuration) || !(endTime > startTime)) continue;
			const style = asRecord(source.style);
			overlays.push({
				id: source.id,
				content,
				reference,
				startTime,
				endTime,
				sourceStart,
				elementDuration,
				fontSize: numberValue({
					element: source,
					style,
					key: "fontSize",
					fallback: 48,
				}),
				x: numberValue({ element: source, style, key: "x", fallback: 0 }),
				y: numberValue({ element: source, style, key: "y", fallback: 0 }),
				width: numberValue({
					element: source,
					style,
					key: "width",
					fallback: 512,
				}),
				height: numberValue({
					element: source,
					style,
					key: "height",
					fallback: 512,
				}),
				rotation: numberValue({
					element: source,
					style,
					key: "rotation",
					fallback: 0,
				}),
				opacity: numberValue({
					element: source,
					style,
					key: "opacity",
					fallback: 1,
				}),
				blendMode: blendModeValue({ element: source, style }),
				trackOrder: track.index,
				elementOrder,
			});
		}
	}
	return overlays.sort((left, right) => {
		const timeDifference = left.startTime - right.startTime;
		if (timeDifference !== 0) return timeDifference;
		const trackDifference = left.trackOrder - right.trackOrder;
		return trackDifference !== 0
			? trackDifference
			: left.elementOrder - right.elementOrder;
	});
}
