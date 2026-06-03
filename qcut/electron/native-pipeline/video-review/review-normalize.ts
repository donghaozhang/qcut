export interface ReviewComment {
	timestamp: string;
	category: string;
	severity: "low" | "medium" | "high";
	comment: string;
	fix: string;
}

export interface ParsedReviewResponse {
	comments: ReviewComment[];
	parsed: unknown;
	rawText: string;
}

const REVIEW_CATEGORIES = new Set([
	"镜头/剪辑",
	"口型/音画",
	"表情/面部",
	"动作/肢体",
	"节奏/时长",
	"画面瑕疵",
	"视线",
	"光线/色调",
	"其他",
	"shot/editing",
	"lip-sync/audio",
	"expression/face",
	"body motion",
	"pacing/duration",
	"visual artifacts",
	"eyeline",
	"lighting/color",
	"other",
]);

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

function secondsToTimestamp({ seconds }: { seconds: number }): string {
	const safeSeconds = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const secs = safeSeconds % 60;
	return [hours, minutes, secs]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

function normalizeTimestamp({ value }: { value: unknown }): string {
	if (typeof value === "number" && Number.isFinite(value)) {
		return secondsToTimestamp({ seconds: value });
	}

	const text = stringifyValue({ value });
	if (!text) return "00:00:00";
	if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
		const parts = text.split(":");
		return parts.length === 2 ? `00:${text}` : text;
	}
	if (/^\d+(\.\d+)?s?$/.test(text)) {
		return secondsToTimestamp({ seconds: Number.parseFloat(text) });
	}
	return text;
}

function normalizeSeverity({
	value,
}: {
	value: unknown;
}): ReviewComment["severity"] {
	const text = stringifyValue({ value }).toLowerCase();
	if (text === "high" || text === "medium" || text === "low") return text;
	if (text.includes("严重") || text.includes("高")) return "high";
	if (text.includes("中")) return "medium";
	return "low";
}

function normalizeCategory({ value }: { value: unknown }): string {
	const category = stringifyValue({ value });
	if (REVIEW_CATEGORIES.has(category)) return category;
	return category || "其他";
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

function normalizeReviewItem({
	value,
}: {
	value: unknown;
}): ReviewComment | null {
	const record = asRecord({ value });
	if (!record) return null;

	const comment = firstString({
		record,
		keys: ["comment", "意见", "note", "issue", "text", "description"],
	});
	if (!comment) return null;

	const timestampSource =
		record.timestamp ?? record.time ?? record.start ?? record.startTime ?? 0;

	return {
		timestamp: normalizeTimestamp({ value: timestampSource }),
		category: normalizeCategory({ value: record.category ?? record.分类 }),
		severity: normalizeSeverity({ value: record.severity ?? record.严重程度 }),
		comment,
		fix: firstString({
			record,
			keys: ["fix", "建议", "recommendation", "action", "solution"],
		}),
	};
}

function cleanJsonText({ text }: { text: string }): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	return fenced?.[1]?.trim() ?? trimmed;
}

function parseJsonCandidate({ text }: { text: string }): unknown {
	const cleaned = cleanJsonText({ text });
	try {
		return JSON.parse(cleaned);
	} catch {
		const arrayStart = cleaned.indexOf("[");
		const arrayEnd = cleaned.lastIndexOf("]");
		if (arrayStart >= 0 && arrayEnd > arrayStart) {
			return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
		}
		throw new Error("Review response did not contain valid JSON");
	}
}

function extractCommentArray({ parsed }: { parsed: unknown }): unknown[] {
	if (Array.isArray(parsed)) return parsed;
	const record = asRecord({ value: parsed });
	if (!record) return [];
	const candidates = [
		record.comments,
		record.items,
		record.issues,
		record.review,
		record.data,
	];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) return candidate;
	}
	return [];
}

function serializeResponseText({ value }: { value: unknown }): string {
	try {
		return JSON.stringify(value ?? null) ?? String(value);
	} catch {
		try {
			return String(value);
		} catch {
			return "";
		}
	}
}

export function parseReviewModelResponse({
	response,
}: {
	response: unknown;
}): ParsedReviewResponse {
	const rawText =
		typeof response === "string"
			? response
			: serializeResponseText({ value: response });
	const parsed =
		typeof response === "string"
			? (() => {
					try {
						return parseJsonCandidate({ text: response });
					} catch (error) {
						return {
							parseError:
								error instanceof Error ? error.message : String(error),
							rawText: response,
						};
					}
				})()
			: response;
	const comments: ReviewComment[] = [];

	for (const item of extractCommentArray({ parsed })) {
		const comment = normalizeReviewItem({ value: item });
		if (comment) comments.push(comment);
	}

	return { comments, parsed, rawText };
}
