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

/**
 * Narrow an unknown value to a plain object record, returning `null` for
 * `null`, non-objects, and arrays so callers can safely index string keys.
 */
function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/**
 * Coerce a primitive value to a trimmed string. Strings are trimmed, numbers
 * and booleans are stringified, and any other type yields an empty string.
 */
function stringifyValue({ value }: { value: unknown }): string {
	if (typeof value === "string") return value.trim();
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
}

/** Convert a (clamped, floored) number of seconds to an `HH:MM:SS` timestamp. */
function secondsToTimestamp({ seconds }: { seconds: number }): string {
	const safeSeconds = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const secs = safeSeconds % 60;
	return [hours, minutes, secs]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

/**
 * Normalize a timestamp from arbitrary model output into `HH:MM:SS`. Handles
 * numeric seconds, `MM:SS`/`HH:MM:SS` strings, and numeric-seconds strings
 * (e.g. `"12.5s"`); unrecognized text is returned as-is, empty input as
 * `"00:00:00"`.
 */
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

/**
 * Map arbitrary severity input to `"high"`, `"medium"`, or `"low"`, accepting
 * the English words and Chinese severity terms; defaults to `"low"`.
 */
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

/**
 * Return a recognized review category unchanged; otherwise pass through the
 * provided text, falling back to `"其他"` (other) when empty.
 */
function normalizeCategory({ value }: { value: unknown }): string {
	const category = stringifyValue({ value });
	if (REVIEW_CATEGORIES.has(category)) return category;
	return category || "其他";
}

/**
 * Return the first non-empty stringified value found across `keys` in `record`,
 * or an empty string when none of the keys hold usable text.
 */
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

/**
 * Normalize a single raw review item into a {@link ReviewComment}, accepting
 * English and Chinese field aliases for each property. Returns `null` when the
 * item is not an object or has no usable comment text.
 */
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

/** Strip a surrounding Markdown code fence (```json) from model output, if present. */
function cleanJsonText({ text }: { text: string }): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	if (fenced?.[1]) return fenced[1].trim();
	if (trimmed.startsWith("```")) {
		const firstLineEnd = trimmed.indexOf("\n");
		if (firstLineEnd >= 0) return trimmed.slice(firstLineEnd + 1).trim();
	}
	return trimmed;
}

/**
 * Attempts to parse a `[start, end]` slice of text as a complete JSON object.
 *
 * @param text - The full text containing the candidate object.
 * @param start - Index of the object's opening brace.
 * @param end - Index of the object's closing brace.
 * @returns The parsed object, or `null` if the slice is not valid JSON.
 */
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

/**
 * Extracts every complete top-level object from the first JSON array in the text.
 *
 * Scans brace depth while respecting strings/escapes so that partial or truncated
 * model output still yields the objects that were fully emitted.
 *
 * @param text - Text expected to contain a JSON array of objects.
 * @returns The successfully parsed objects (empty if no array is present).
 */
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

/**
 * Parse model output into JSON, first trying a direct parse and then falling
 * back to extracting the outermost `[...]` array slice. Throws when no valid
 * JSON can be recovered.
 */
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
		const completeObjects = extractCompleteArrayObjects({ text: cleaned });
		if (completeObjects.length > 0) return completeObjects;
		throw new Error("Review response did not contain valid JSON");
	}
}

/**
 * Extract the array of raw comment items from parsed output, accepting either a
 * top-level array or an object wrapping one under a known key
 * (`comments`, `items`, `issues`, `review`, `data`). Returns `[]` otherwise.
 */
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

/**
 * Serialize an arbitrary value to text for the raw-response record without ever
 * throwing: tries `JSON.stringify`, then `String(value)`, then an empty string,
 * so circular references or `BigInt` values cannot crash review parsing.
 */
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

/**
 * Parse a raw review-model response into normalized comments. Accepts either a
 * JSON string or an already-parsed value, tolerates malformed input (recording
 * a parse error rather than throwing), and returns the normalized comments
 * alongside the parsed object and the raw text.
 */
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
