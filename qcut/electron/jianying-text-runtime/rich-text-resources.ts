import path from "node:path";
import { JIANYING_TEXT_RESOURCE_ID_PATTERN } from "../jianying-text-package-metadata.js";

const EFFECT_STYLE_TAG_PATTERN = /<effectStyle\b[^>]*>/g;

function richTextAttribute({
	tag,
	name,
}: {
	tag: string;
	name: "id" | "path";
}) {
	const match = new RegExp(
		`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`
	).exec(tag);
	return match?.[1] ?? match?.[2] ?? match?.[3];
}

function requireEffectStyleResourceId({ tag }: { tag: string }) {
	const resourceId = richTextAttribute({ tag, name: "id" });
	if (
		typeof resourceId !== "string" ||
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)
	) {
		throw new Error("ScriptInfoSticker effectStyle id is invalid");
	}
	return resourceId;
}

function escapeRichTextAttribute({ value }: { value: string }) {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function requireEffectStylePath({
	resourceId,
	resourcePaths,
}: {
	resourceId: string;
	resourcePaths: Readonly<Record<string, string>>;
}) {
	const resolved = resourcePaths[resourceId];
	if (!(resolved && path.isAbsolute(resolved))) {
		throw new Error(`Missing resolved Jianying resource ${resourceId}`);
	}
	return resolved;
}

function replaceEffectStylePathAttribute({
	tag,
	value,
}: {
	tag: string;
	value: string;
}) {
	const pathAttribute = /\bpath\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/;
	const replacement = `path="${escapeRichTextAttribute({ value })}"`;
	if (richTextAttribute({ tag, name: "path" }) !== undefined) {
		return tag.replace(pathAttribute, replacement);
	}
	return `${tag.slice(0, -1)} ${replacement}>`;
}

export function collectJianyingRichTextEffectStyleIds({
	richText,
}: {
	richText: string;
}) {
	const resourceIds = new Set<string>();
	for (const match of richText.matchAll(EFFECT_STYLE_TAG_PATTERN)) {
		resourceIds.add(requireEffectStyleResourceId({ tag: match[0] }));
	}
	return [...resourceIds].sort();
}

export function replaceJianyingRichTextEffectStylePaths({
	richText,
	resourcePaths,
	missingBehavior = "error",
}: {
	richText: string;
	resourcePaths: Readonly<Record<string, string>>;
	missingBehavior?: "clear-path" | "error";
}) {
	return richText.replace(EFFECT_STYLE_TAG_PATTERN, (tag) => {
		const resourceId = requireEffectStyleResourceId({ tag });
		try {
			const resolved = requireEffectStylePath({ resourceId, resourcePaths });
			return replaceEffectStylePathAttribute({ tag, value: resolved });
		} catch (cause) {
			if (missingBehavior === "error") throw cause;
			return replaceEffectStylePathAttribute({ tag, value: "" });
		}
	});
}
