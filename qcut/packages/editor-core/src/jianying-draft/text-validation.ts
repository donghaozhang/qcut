import { resolveSubtitleStyle } from "../captions/subtitle-style.js";
import type {
	CaptionElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";
import { parseJianyingTextColor } from "./text-color.js";
import { secondsToMicroseconds } from "./time.js";
import type { JianyingDraftIssue } from "./types.js";

type JianyingTextElement = CaptionElement | TextElement;

function canRepresentSeconds({ value }: { value: number }): boolean {
	try {
		secondsToMicroseconds({ seconds: value });
		return true;
	} catch {
		return false;
	}
}

function hasValidTiming({
	element,
}: {
	element: JianyingTextElement;
}): boolean {
	const effectiveDuration =
		element.duration - element.trimStart - element.trimEnd;
	return (
		[
			element.duration,
			element.startTime,
			element.trimStart,
			element.trimEnd,
		].every((value) => Number.isFinite(value) && value >= 0) &&
		effectiveDuration > 0 &&
		canRepresentSeconds({ value: element.startTime }) &&
		canRepresentSeconds({ value: effectiveDuration })
	);
}

function areValidNumbers({
	element,
}: {
	element: JianyingTextElement;
}): boolean {
	if (element.type === "text") {
		const finiteValues = [
			element.x,
			element.y,
			element.rotation,
			element.opacity,
			element.fontSize,
			element.letterSpacing ?? 0,
			element.lineHeight ?? 1,
			element.strokeWidth ?? 0,
			element.strokeOpacity ?? 1,
			element.backgroundOpacity ?? 0,
			element.backgroundRadius ?? 0,
			element.backgroundPadding ?? 0,
			element.shadowOpacity ?? 0,
			element.shadowOffsetX ?? 0,
			element.shadowOffsetY ?? 0,
			element.shadowBlur ?? 0,
		];
		return (
			finiteValues.every(Number.isFinite) &&
			element.fontSize > 0 &&
			element.opacity >= 0 &&
			element.opacity <= 1 &&
			(element.width === undefined ||
				(Number.isFinite(element.width) && element.width > 0)) &&
			(element.height === undefined ||
				(Number.isFinite(element.height) && element.height > 0)) &&
			(element.strokeWidth ?? 0) >= 0 &&
			(element.strokeOpacity ?? 1) >= 0 &&
			(element.strokeOpacity ?? 1) <= 1 &&
			(element.backgroundOpacity ?? 0) >= 0 &&
			(element.backgroundOpacity ?? 0) <= 1 &&
			(element.shadowOpacity ?? 0) >= 0 &&
			(element.shadowOpacity ?? 0) <= 1
		);
	}

	const style = resolveSubtitleStyle(element.style);
	return (
		[
			element.rotation ?? 0,
			style.fontSize,
			style.letterSpacing,
			style.fontOpacity,
			style.outlineWidth,
			style.shadowOffset.x,
			style.shadowOffset.y,
			style.bgOpacity,
			style.position.x,
			style.position.y,
			style.lineSpacing,
			style.animationDuration,
			style.animationDelay,
		].every(Number.isFinite) &&
		style.fontSize > 0 &&
		style.fontOpacity >= 0 &&
		style.fontOpacity <= 1 &&
		style.outlineWidth >= 0 &&
		style.bgOpacity >= 0 &&
		style.bgOpacity <= 1 &&
		style.lineSpacing > 0 &&
		style.animationDuration >= 0 &&
		style.animationDelay >= 0
	);
}

function getActiveColors({
	element,
}: {
	element: JianyingTextElement;
}): Array<{ label: string; value: string }> {
	if (element.type === "captions") {
		const style = resolveSubtitleStyle(element.style);
		const colors = [{ label: "font", value: style.fontColor }];
		if (style.outlineWidth > 0) {
			colors.push({ label: "outline", value: style.outlineColor });
		}
		if (style.bgOpacity > 0) {
			colors.push({ label: "background", value: style.backgroundColor });
		}
		if (
			Math.hypot(style.shadowOffset.x, style.shadowOffset.y) > Number.EPSILON
		) {
			colors.push({ label: "shadow", value: style.shadowColor });
		}
		return colors;
	}

	const colors = [
		{ label: "font", value: element.color },
		{ label: "background", value: element.backgroundColor },
	];
	if ((element.strokeWidth ?? 0) > 0 && (element.strokeOpacity ?? 1) > 0) {
		colors.push({
			label: "stroke",
			value: element.strokeColor ?? "#000000",
		});
	}
	if ((element.shadowOpacity ?? 0) > 0) {
		colors.push({
			label: "shadow",
			value: element.shadowColor ?? "#000000",
		});
	}
	return colors;
}

export function validateJianyingTextElement({
	element,
	track,
}: {
	element: JianyingTextElement;
	track: TimelineTrack;
}): JianyingDraftIssue[] {
	const issues: JianyingDraftIssue[] = [];
	const content = element.type === "text" ? element.content : element.text;
	if (content.trim().length === 0) {
		issues.push({
			code: "EMPTY_TEXT_CONTENT",
			severity: "error",
			message: `Text element ${element.id} cannot export empty content.`,
			elementId: element.id,
			trackId: track.id,
		});
	}
	if (!hasValidTiming({ element }) || !areValidNumbers({ element })) {
		issues.push({
			code: "INVALID_TEXT_VALUE",
			severity: "error",
			message: `Text element ${element.id} has an invalid time, transform, or style value.`,
			elementId: element.id,
			trackId: track.id,
		});
	}
	for (const color of getActiveColors({ element })) {
		if (parseJianyingTextColor({ value: color.value })) continue;
		issues.push({
			code: "INVALID_TEXT_COLOR",
			severity: "error",
			message: `Text element ${element.id} has an unsupported ${color.label} color: ${color.value}.`,
			elementId: element.id,
			trackId: track.id,
		});
	}
	return issues;
}
