import type { JianyingFilterVerificationReferenceKind } from "../../jianying-filter-lab-contract.js";

export const FILTER_LAB_REFERENCE_KINDS = [
	"jianying-ui",
	"native-oracle",
	"unknown",
] as const satisfies readonly JianyingFilterVerificationReferenceKind[];

const FILTER_LAB_REFERENCE_KIND_SET = new Set<string>(
	FILTER_LAB_REFERENCE_KINDS
);

export function isFilterLabReferenceKind({
	value,
}: {
	value: unknown;
}): boolean {
	return typeof value === "string" && FILTER_LAB_REFERENCE_KIND_SET.has(value);
}

export function parseFilterLabReferenceKind({
	value,
}: {
	value: unknown;
}): JianyingFilterVerificationReferenceKind | undefined {
	return isFilterLabReferenceKind({ value })
		? (value as JianyingFilterVerificationReferenceKind)
		: undefined;
}

export function normalizeFilterLabReferenceKind({
	value,
}: {
	value?: JianyingFilterVerificationReferenceKind;
}): JianyingFilterVerificationReferenceKind {
	return value ?? "unknown";
}
