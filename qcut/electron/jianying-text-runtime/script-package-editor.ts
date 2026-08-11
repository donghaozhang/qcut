import { createHash, randomUUID } from "node:crypto";
import {
	cp,
	mkdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { asJianyingRecord } from "../jianying-text-package-metadata.js";
import { hydrateJianyingScriptContent } from "./script-content-hydrator.js";

const packageCopies = new Map<string, Promise<string>>();

function sanitizeSlotText({ text }: { text: string }) {
	return text.replace(/\[/g, "［").replace(/\]/g, "］");
}

export function replaceJianyingRichTextSlots({
	richText,
	text,
}: {
	richText: string;
	text: string;
}) {
	const matches = Array.from(richText.matchAll(/\[[^\]]*\]/g));
	if (matches.length === 0) return richText;
	const characters = Array.from(sanitizeSlotText({ text }));
	let cursor = 0;
	let output = "";
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		const matchIndex = match.index ?? cursor;
		output += richText.slice(cursor, matchIndex);
		const replacement =
			index === matches.length - 1
				? characters.slice(index).join("") || " "
				: characters[index] || " ";
		output += `[${replacement}]`;
		cursor = matchIndex + match[0].length;
	}
	return output + richText.slice(cursor);
}

function textForWidget({
	lines,
	index,
	widgetCount,
}: {
	lines: string[];
	index: number;
	widgetCount: number;
}) {
	if (index === widgetCount - 1 && lines.length > widgetCount) {
		return lines.slice(index).join("\n") || " ";
	}
	return lines[index] || " ";
}

export function editJianyingScriptContent({
	value,
	content,
}: {
	value: unknown;
	content: string;
}) {
	const root = asJianyingRecord(structuredClone(value));
	if (!root || !Array.isArray(root.children)) {
		throw new Error("ScriptInfoSticker content.json has no children array");
	}
	const widgets = root.children.flatMap((child) => {
		const record = asJianyingRecord(child);
		const textParams = asJianyingRecord(record?.text_params);
		return record?.type === "text" && typeof textParams?.richText === "string"
			? [{ textParams }]
			: [];
	});
	if (widgets.length === 0) {
		throw new Error("ScriptInfoSticker has no editable rich-text widgets");
	}
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	let slotCount = 0;
	for (let index = 0; index < widgets.length; index += 1) {
		const richText = widgets[index].textParams.richText as string;
		slotCount += Array.from(richText.matchAll(/\[[^\]]*\]/g)).length;
		widgets[index].textParams.richText = replaceJianyingRichTextSlots({
			richText,
			text: textForWidget({ lines, index, widgetCount: widgets.length }),
		});
	}
	if (slotCount === 0) {
		throw new Error("ScriptInfoSticker has no editable rich-text slots");
	}
	return {
		value: root,
		textWidgetCount: widgets.length,
		slotCount,
	};
}

export function prepareJianyingScriptContent({
	value,
	content,
	resourcePaths,
	fontPath,
}: {
	value: unknown;
	content?: string;
	resourcePaths: Readonly<Record<string, string>>;
	fontPath: string;
}) {
	const editable =
		content === undefined
			? value
			: editJianyingScriptContent({ value, content }).value;
	return hydrateJianyingScriptContent({
		value: editable,
		resourcePaths,
		fontPath,
	});
}

async function isDirectory({ directory }: { directory: string }) {
	try {
		return (await stat(directory)).isDirectory();
	} catch {
		return false;
	}
}

function copyCacheRoot() {
	return path.join(
		os.homedir(),
		"Library",
		"Caches",
		"QCut",
		"jianying-text-runtime",
		"package-copies"
	);
}

async function createScriptPackageCopy({
	packagePath,
	packageHash,
	content,
	resourcePaths,
	resourceFingerprint,
	fontPath,
}: {
	packagePath: string;
	packageHash: string;
	content?: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	fontPath: string;
}) {
	const copyHash = createHash("sha256")
		.update(
			JSON.stringify({
				content: content ?? null,
				resourceFingerprint,
				fontPath,
			})
		)
		.digest("hex");
	const destination = path.join(copyCacheRoot(), packageHash, copyHash);
	if (await isDirectory({ directory: destination })) return destination;
	const temporary = `${destination}.tmp-${randomUUID()}`;
	await mkdir(path.dirname(destination), { recursive: true });
	try {
		await cp(packagePath, temporary, {
			recursive: true,
			errorOnExist: true,
			force: false,
		});
		const contentPath = path.join(temporary, "content.json");
		const source = JSON.parse(await readFile(contentPath, "utf8")) as unknown;
		const prepared = prepareJianyingScriptContent({
			value: source,
			content,
			resourcePaths,
			fontPath,
		});
		const temporaryContentPath = `${contentPath}.tmp`;
		await writeFile(
			temporaryContentPath,
			`${JSON.stringify(prepared)}\n`,
			"utf8"
		);
		await rename(temporaryContentPath, contentPath);
		await rename(temporary, destination).catch(async (cause) => {
			if (await isDirectory({ directory: destination })) return;
			throw cause;
		});
		return destination;
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

export function getEditedJianyingScriptPackage({
	packagePath,
	packageHash,
	content,
	resourcePaths,
	resourceFingerprint,
	fontPath,
}: {
	packagePath: string;
	packageHash: string;
	content: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	fontPath: string;
}) {
	const key = createHash("sha256")
		.update(packageHash)
		.update(content)
		.update(resourceFingerprint)
		.update(fontPath)
		.digest("hex");
	const pending = packageCopies.get(key);
	if (pending) return pending;
	const created = createScriptPackageCopy({
		packagePath,
		packageHash,
		content,
		resourcePaths,
		resourceFingerprint,
		fontPath,
	}).finally(() => packageCopies.delete(key));
	packageCopies.set(key, created);
	return created;
}

export function getHydratedJianyingScriptPackage({
	packagePath,
	packageHash,
	resourcePaths,
	resourceFingerprint,
	fontPath,
}: {
	packagePath: string;
	packageHash: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	fontPath: string;
}) {
	const key = createHash("sha256")
		.update(packageHash)
		.update(resourceFingerprint)
		.update(fontPath)
		.update("hydrated")
		.digest("hex");
	const pending = packageCopies.get(key);
	if (pending) return pending;
	const created = createScriptPackageCopy({
		packagePath,
		packageHash,
		resourcePaths,
		resourceFingerprint,
		fontPath,
	}).finally(() => packageCopies.delete(key));
	packageCopies.set(key, created);
	return created;
}
