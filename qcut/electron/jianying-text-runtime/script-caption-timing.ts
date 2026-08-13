import { asJianyingRecord } from "../jianying-text-package-metadata.js";
import { splitJianyingTextGraphemes } from "./graphemes.js";

export interface JianyingCaptionWordTiming {
	start_time: number;
	end_time: number;
	text: string;
}

export interface JianyingCaptionDurationInfo {
	text: string;
	words: JianyingCaptionWordTiming[];
}

export function createJianyingCaptionDurationInfo({
	text,
	durationSeconds,
}: {
	text: string;
	durationSeconds: number;
}): JianyingCaptionDurationInfo {
	if (!(Number.isFinite(durationSeconds) && durationSeconds > 0)) {
		throw new Error("Jianying caption duration must be positive");
	}
	const graphemes = splitJianyingTextGraphemes({ text });
	const timedGraphemeCount = graphemes.filter(
		(grapheme) => !/^\s+$/u.test(grapheme)
	).length;
	const durationMilliseconds = Math.round(durationSeconds * 1000);
	let completedTimedGraphemes = 0;
	let cursor = 0;
	const words = graphemes.map((grapheme): JianyingCaptionWordTiming => {
		if (/^\s+$/u.test(grapheme) || timedGraphemeCount === 0) {
			return { start_time: cursor, end_time: cursor, text: grapheme };
		}
		const startTime = cursor;
		completedTimedGraphemes += 1;
		cursor = Math.round(
			(durationMilliseconds * completedTimedGraphemes) / timedGraphemeCount
		);
		return { start_time: startTime, end_time: cursor, text: grapheme };
	});
	return { text, words };
}

function hasCaptionAnimation({ widget }: { widget: Record<string, unknown> }) {
	return Array.isArray(widget.anims)
		? widget.anims.some(
				(animation) => asJianyingRecord(animation)?.anim_type === "caption"
			)
		: false;
}

function positiveDuration({ value }: { value: unknown }) {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: null;
}

function captionWidgetDuration({
	widget,
	templateDuration,
}: {
	widget: Record<string, unknown>;
	templateDuration: number;
}) {
	const startTime = Math.max(
		0,
		positiveDuration({ value: widget.start_time }) ?? 0
	);
	const remainingTemplateDuration = Math.max(
		1 / 1000,
		templateDuration - startTime
	);
	return Math.min(
		positiveDuration({ value: widget.duration }) ?? remainingTemplateDuration,
		remainingTemplateDuration
	);
}

export function injectJianyingCaptionTiming({
	widget,
	text,
	templateDuration,
}: {
	widget: Record<string, unknown>;
	text: string;
	templateDuration: number;
}) {
	if (!hasCaptionAnimation({ widget })) return false;
	const textParams = asJianyingRecord(widget.text_params);
	if (!textParams) {
		throw new Error("Jianying caption animation has no text_params object");
	}
	textParams.caption_duration_info = createJianyingCaptionDurationInfo({
		text,
		durationSeconds: captionWidgetDuration({ widget, templateDuration }),
	});
	return true;
}
