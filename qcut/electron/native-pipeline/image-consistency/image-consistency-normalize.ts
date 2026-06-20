import { consistencyNormalizeInternals } from "../character-consistency/consistency-normalize.js";
import type { ImageCandidate, ImageFinding, Severity } from "./types.js";

const { parseJsonArray, normalizeSeverity } = consistencyNormalizeInternals;

const MAX_CATEGORY_LENGTH = 40;

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

function imageIndexFromValue({ value }: { value: unknown }): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.round(value);
	}
	const text = stringifyValue({ value });
	if (!text) return null;
	const number = Number.parseFloat(text);
	return Number.isFinite(number) ? Math.round(number) : null;
}

function normalizeCategory({ value }: { value: unknown }): string {
	const text = stringifyValue({ value })
		.toLowerCase()
		.replace(/[^a-z0-9_/+\- ]/g, "")
		.trim()
		.slice(0, MAX_CATEGORY_LENGTH)
		.trim();
	return text || "other";
}

function candidateForIndex({
	imageIndex,
	batchCandidates,
}: {
	imageIndex: number;
	batchCandidates: ImageCandidate[];
}): ImageCandidate | null {
	return (
		batchCandidates.find((candidate) => candidate.index === imageIndex) ?? null
	);
}

function normalizeItem({
	value,
	batchCandidates,
}: {
	value: unknown;
	batchCandidates: ImageCandidate[];
}): ImageFinding | null {
	const record = asRecord({ value });
	if (!record) return null;

	const imageIndex = imageIndexFromValue({
		value:
			record.imageIndex ??
			record.index ??
			record.image_index ??
			valueForKey({ record, key: "图序号" }) ??
			valueForKey({ record, key: "序号" }),
	});
	if (imageIndex === null) return null;

	const candidate = candidateForIndex({ imageIndex, batchCandidates });
	if (!candidate) return null;

	const severity = normalizeSeverity({
		value: record.severity ?? valueForKey({ record, key: "严重程度" }),
	}) as Severity | null;
	const comment = firstString({
		record,
		keys: ["comment", "说明", "问题", "issue", "description", "text"],
	});
	if (!severity || !comment) return null;

	return {
		imageIndex,
		imagePath: candidate.path,
		category: normalizeCategory({
			value: record.category ?? valueForKey({ record, key: "分类" }),
		}),
		severity,
		comment,
		fix: firstString({
			record,
			keys: ["fix", "建议", "recommendation", "action", "solution"],
		}),
	};
}

export function parseImageConsistencyResponse({
	response,
	batchCandidates,
}: {
	response: string;
	batchCandidates: ImageCandidate[];
}): ImageFinding[] {
	const values = parseJsonArray({ text: response });
	const findings: ImageFinding[] = [];
	for (const value of values) {
		const finding = normalizeItem({ value, batchCandidates });
		if (finding) findings.push(finding);
	}
	return findings;
}
