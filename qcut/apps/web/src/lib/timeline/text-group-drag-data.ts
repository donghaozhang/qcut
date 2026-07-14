import type { CreateTextElement } from "@/types/timeline";

function isRecord({ value }: { value: unknown }): boolean {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber({ value }: { value: unknown }): boolean {
	return typeof value === "number" && Number.isFinite(value);
}

function isTextAlign({ value }: { value: unknown }): boolean {
	return value === "left" || value === "center" || value === "right";
}

function isFontWeight({ value }: { value: unknown }): boolean {
	return value === "normal" || value === "bold";
}

function isFontStyle({ value }: { value: unknown }): boolean {
	return value === "normal" || value === "italic";
}

function isTextDecoration({ value }: { value: unknown }): boolean {
	return value === "none" || value === "underline" || value === "line-through";
}

function normalizeTextGroupElement({
	value,
}: {
	value: unknown;
}): CreateTextElement | null {
	if (!isRecord({ value })) return null;
	const record = value as Record<string, unknown>;
	if (record.type !== "text") return null;
	if (typeof record.name !== "string" || record.name.length === 0) return null;
	if (typeof record.content !== "string" || !record.content.trim()) return null;
	if (typeof record.fontFamily !== "string" || record.fontFamily.length === 0) {
		return null;
	}
	if (typeof record.color !== "string") return null;
	if (typeof record.backgroundColor !== "string") return null;
	if (!isTextAlign({ value: record.textAlign })) return null;
	if (!isFontWeight({ value: record.fontWeight })) return null;
	if (!isFontStyle({ value: record.fontStyle })) return null;
	if (!isTextDecoration({ value: record.textDecoration })) return null;
	const numericFields = [
		record.duration,
		record.startTime,
		record.trimStart,
		record.trimEnd,
		record.fontSize,
		record.x,
		record.y,
		record.rotation,
		record.opacity,
	];
	if (!numericFields.every((field) => isFiniteNumber({ value: field }))) {
		return null;
	}
	return record as unknown as CreateTextElement;
}

export function isValidTextGroupElement({
	value,
}: {
	value: unknown;
}): boolean {
	return normalizeTextGroupElement({ value }) !== null;
}

export function getValidTextGroupElements({
	value,
}: {
	value: unknown;
}): CreateTextElement[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((element) => {
		const normalized = normalizeTextGroupElement({ value: element });
		return normalized ? [normalized] : [];
	});
}
