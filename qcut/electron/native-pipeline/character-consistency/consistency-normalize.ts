import {
	CONSISTENCY_CATEGORIES,
	CONSISTENCY_SEVERITIES,
	type ConsistencyCategory,
	type ConsistencyFinding,
	type Keyframe,
	type Severity,
} from "./types.js";

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function stringifyValue({ value }: { value: unknown }): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
}

export function secondsToTimestamp({ seconds }: { seconds: number }): string {
	const safeSeconds = Math.max(0, seconds);
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const wholeSeconds = Math.floor(safeSeconds % 60);
	const millis = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
		2,
		"0"
	)}:${String(wholeSeconds).padStart(2, "0")}.${String(millis).padStart(
		3,
		"0"
	)}`;
}

function normalizeSeverity({ value }: { value: unknown }): Severity | null {
	const text = stringifyValue({ value }).toLowerCase();
	if ((CONSISTENCY_SEVERITIES as string[]).includes(text)) {
		return text as Severity;
	}
	if (text.includes("严重") || text.includes("高")) return "high";
	if (text.includes("中")) return "medium";
	if (text.includes("低") || text.includes("轻")) return "low";
	return null;
}

function normalizeCategory({
	value,
}: {
	value: unknown;
}): ConsistencyCategory | null {
	const text = stringifyValue({ value }).toLowerCase();
	if ((CONSISTENCY_CATEGORIES as string[]).includes(text)) {
		return text as ConsistencyCategory;
	}
	if (
		text.includes("height") ||
		text.includes("比例") ||
		text.includes("身高")
	) {
		return "proportion/height";
	}
	if (
		text.includes("face") ||
		text.includes("identity") ||
		text.includes("脸")
	) {
		return "identity/face";
	}
	if (
		text.includes("clothing") ||
		text.includes("appearance") ||
		text.includes("服装") ||
		text.includes("外观")
	) {
		return "clothing/appearance";
	}
	if (text.includes("limb") || text.includes("body") || text.includes("肢体")) {
		return "body/limb";
	}
	if (text.includes("other") || text.includes("其他")) return "other";
	return null;
}

function firstString({
	record,
	keys,
}: {
	record: Record<string, unknown>;
	keys: string[];
}): string {
	for (const key of keys) {
		const value = stringifyValue({ value: record[key] });
		if (value) return value;
	}
	return "";
}

function valueForKey({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): unknown {
	return record[key];
}

function cleanJsonText({ text }: { text: string }): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	if (fenced?.[1]) return fenced[1].trim();
	if (!trimmed.startsWith("```")) return trimmed;
	const firstLineEnd = trimmed.indexOf("\n");
	return firstLineEnd >= 0 ? trimmed.slice(firstLineEnd + 1).trim() : trimmed;
}

function parseCompleteObjectSlice({
	text,
	start,
	end,
}: {
	text: string;
	start: number;
	end: number;
}): unknown | null {
	try {
		return JSON.parse(text.slice(start, end + 1));
	} catch {
		return null;
	}
}

function extractCompleteArrayObjects({ text }: { text: string }): unknown[] {
	const arrayStart = text.indexOf("[");
	if (arrayStart < 0) return [];

	const objects: unknown[] = [];
	let objectStart = -1;
	let objectDepth = 0;
	let inString = false;
	let escaping = false;

	for (let index = arrayStart + 1; index < text.length; index += 1) {
		const char = text[index];
		if (escaping) {
			escaping = false;
			continue;
		}
		if (char === "\\") {
			escaping = inString;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === "{") {
			if (objectDepth === 0) objectStart = index;
			objectDepth += 1;
			continue;
		}
		if (char !== "}") continue;

		objectDepth -= 1;
		if (objectDepth !== 0 || objectStart < 0) continue;

		const parsed = parseCompleteObjectSlice({
			text,
			start: objectStart,
			end: index,
		});
		if (parsed) objects.push(parsed);
		objectStart = -1;
	}

	return objects;
}

function parseJsonArray({ text }: { text: string }): unknown[] {
	const cleaned = cleanJsonText({ text });
	try {
		const parsed = JSON.parse(cleaned);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return extractCompleteArrayObjects({ text: cleaned });
	}
}

function frameNumberFromValue({ value }: { value: unknown }): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.round(value);
	}
	const text = stringifyValue({ value });
	if (!text) return null;
	const number = Number.parseFloat(text);
	return Number.isFinite(number) ? Math.round(number) : null;
}

function keyframeForFrame({
	frameNumber,
	batchKeyframes,
}: {
	frameNumber: number;
	batchKeyframes: Keyframe[];
}): Keyframe | null {
	let nearest: Keyframe | null = null;
	for (const keyframe of batchKeyframes) {
		if (keyframe.frameNumber === frameNumber) return keyframe;
		if (!nearest) {
			nearest = keyframe;
			continue;
		}
		const currentDistance = Math.abs(keyframe.frameNumber - frameNumber);
		const nearestDistance = Math.abs(nearest.frameNumber - frameNumber);
		if (currentDistance < nearestDistance) nearest = keyframe;
	}
	return nearest;
}

function normalizeItem({
	value,
	batchKeyframes,
	samplingFps,
	videoFps,
}: {
	value: unknown;
	batchKeyframes: Keyframe[];
	samplingFps: number;
	videoFps: number;
}): ConsistencyFinding | null {
	const record = asRecord({ value });
	if (!record) return null;

	const frameNumber = frameNumberFromValue({
		value:
			record.frameNumber ??
			record.frame ??
			record.frame_number ??
			valueForKey({ record, key: "帧号" }) ??
			valueForKey({ record, key: "帧" }),
	});
	if (frameNumber === null) return null;

	const keyframe = keyframeForFrame({ frameNumber, batchKeyframes });
	if (!keyframe) return null;

	const category = normalizeCategory({
		value: record.category ?? valueForKey({ record, key: "分类" }),
	});
	const severity = normalizeSeverity({
		value: record.severity ?? valueForKey({ record, key: "严重程度" }),
	});
	const comment = firstString({
		record,
		keys: ["comment", "说明", "问题", "issue", "description", "text"],
	});
	if (!category || !severity || !comment) return null;

	const startFrame = Math.round(keyframe.timeSeconds * videoFps);
	const endFrame =
		Math.round((keyframe.timeSeconds + 1 / samplingFps) * videoFps) - 1;
	return {
		startFrame,
		endFrame: Math.max(startFrame, endFrame),
		startTime: secondsToTimestamp({ seconds: startFrame / videoFps }),
		endTime: secondsToTimestamp({
			seconds: Math.max(startFrame, endFrame) / videoFps,
		}),
		category,
		severity,
		comment,
		fix: firstString({
			record,
			keys: ["fix", "建议", "recommendation", "action", "solution"],
		}),
	};
}

export function parseConsistencyResponse({
	response,
	batchKeyframes,
	samplingFps,
	videoFps,
}: {
	response: string;
	batchKeyframes: Keyframe[];
	samplingFps: number;
	videoFps: number;
}): ConsistencyFinding[] {
	const values = parseJsonArray({ text: response });
	const findings: ConsistencyFinding[] = [];
	for (const value of values) {
		const finding = normalizeItem({
			value,
			batchKeyframes,
			samplingFps,
			videoFps,
		});
		if (finding) findings.push(finding);
	}
	return findings;
}

export const consistencyNormalizeInternals = {
	cleanJsonText,
	parseJsonArray,
	normalizeCategory,
	normalizeSeverity,
};
