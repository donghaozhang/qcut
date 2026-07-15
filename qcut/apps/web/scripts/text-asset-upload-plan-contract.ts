import { basename } from "node:path";
import type { TextAssetUploadPlanItem } from "./upload-text-assets-cdn";

export type TextAssetUploadPlanItemContractIssue = {
	detail: string;
	key: string;
};

export function verifyTextAssetUploadPlanItemContract({
	item,
}: {
	item: TextAssetUploadPlanItem;
}): TextAssetUploadPlanItemContractIssue[] {
	const expected = expectedUploadPlanItemContract({ role: item.role });
	const mismatches = [
		item.contentType === expected.contentType
			? null
			: `contentType expected ${expected.contentType}`,
		expected.basename && basename(item.key) !== expected.basename
			? `file name expected ${expected.basename}`
			: null,
		expected.extension && !item.key.endsWith(expected.extension)
			? `extension expected ${expected.extension}`
			: null,
	].filter((mismatch): mismatch is string => Boolean(mismatch));
	if (mismatches.length === 0) return [];
	return [
		{
			detail: `${item.role} upload item contract mismatch: ${mismatches.join(", ")}`,
			key: item.key,
		},
	];
}

function expectedUploadPlanItemContract({
	role,
}: {
	role: TextAssetUploadPlanItem["role"];
}): {
	basename?: string;
	contentType: string;
	extension?: string;
} {
	if (role === "thumbnail") {
		return {
			basename: "thumbnail.webp",
			contentType: "image/webp",
		};
	}
	if (role === "package") {
		return {
			basename: "template.qctext",
			contentType: "application/vnd.qcut.text-template+json",
		};
	}
	if (role === "metadata") {
		return {
			contentType: "application/json",
			extension: ".json",
		};
	}
	return {
		basename: "template.json",
		contentType: "application/json",
	};
}
