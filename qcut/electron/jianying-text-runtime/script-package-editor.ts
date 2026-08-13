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
import {
	asJianyingRecord,
	DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION,
} from "../jianying-text-package-metadata.js";
import { injectJianyingCaptionTiming } from "./script-caption-timing.js";
import { hydrateJianyingScriptContent } from "./script-content-hydrator.js";
import { splitJianyingTextGraphemes } from "./graphemes.js";
import { fitJianyingScriptTextWidget } from "./script-text-fit.js";

export const JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION = 11;
const packageCopies = new Map<string, Promise<string>>();
const RICH_TEXT_SLOT_PATTERN = /\[[^\]]*\]/g;

function sanitizeSlotText({ text }: { text: string }) {
	return text.replace(/\[/g, "［").replace(/\]/g, "］");
}

function distributeGraphemesAcrossSlots({
	graphemes,
	slotWeights,
}: {
	graphemes: string[];
	slotWeights: number[];
}) {
	const allocations = slotWeights.map(() => 0);
	if (graphemes.length <= slotWeights.length) {
		for (let index = 0; index < graphemes.length; index += 1) {
			allocations[index] = 1;
		}
		return allocations;
	}
	allocations.fill(1);
	const remaining = graphemes.length - slotWeights.length;
	const normalizedWeights = slotWeights.map((weight) => Math.max(1, weight));
	const totalWeight = normalizedWeights.reduce(
		(sum, weight) => sum + weight,
		0
	);
	let distributedExtras = 0;
	const weightedExtras = normalizedWeights.map((weight, index) => {
		const exact = (remaining * weight) / totalWeight;
		const whole = Math.floor(exact);
		allocations[index] += whole;
		distributedExtras += whole;
		return { fraction: exact - whole, index };
	});
	let undistributed = remaining - distributedExtras;
	weightedExtras.sort(
		(left, right) => right.fraction - left.fraction || right.index - left.index
	);
	for (const { index } of weightedExtras) {
		if (undistributed === 0) break;
		allocations[index] += 1;
		undistributed -= 1;
	}
	return allocations;
}

export function replaceJianyingRichTextSlots({
	richText,
	text,
}: {
	richText: string;
	text: string;
}) {
	const matches = Array.from(richText.matchAll(RICH_TEXT_SLOT_PATTERN));
	if (matches.length === 0) return richText;
	const characters = splitJianyingTextGraphemes({
		text: sanitizeSlotText({ text }),
	});
	const allocations = distributeGraphemesAcrossSlots({
		graphemes: characters,
		slotWeights: matches.map(
			(match) =>
				splitJianyingTextGraphemes({
					text: match[0].slice(1, -1),
				}).length
		),
	});
	let cursor = 0;
	let characterIndex = 0;
	let output = "";
	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		const matchIndex = match.index ?? cursor;
		output += richText.slice(cursor, matchIndex);
		const nextCharacterIndex = characterIndex + allocations[index];
		const replacement =
			characters.slice(characterIndex, nextCharacterIndex).join("") || " ";
		output += `[${replacement}]`;
		characterIndex = nextCharacterIndex;
		cursor = matchIndex + match[0].length;
	}
	return output + richText.slice(cursor);
}

interface EditableScriptTextWidget {
	slotCount: number;
	textParams: Record<string, unknown>;
	widget: Record<string, unknown>;
}

function collectEditableScriptTextWidgets({
	children,
	widgets,
}: {
	children: unknown[];
	widgets: EditableScriptTextWidget[];
}) {
	for (const child of children) {
		const widget = asJianyingRecord(child);
		if (!widget) continue;
		const textParams = asJianyingRecord(widget.text_params);
		const richText = textParams?.richText;
		const slotCount =
			typeof richText === "string"
				? Array.from(richText.matchAll(RICH_TEXT_SLOT_PATTERN)).length
				: 0;
		if (widget.type === "text" && textParams && slotCount > 0) {
			widgets.push({ slotCount, textParams, widget });
		}
		if (Array.isArray(widget.children)) {
			collectEditableScriptTextWidgets({
				children: widget.children,
				widgets,
			});
		}
	}
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
	if (lines.length === 1) return lines[0] || " ";
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
	const widgets: EditableScriptTextWidget[] = [];
	collectEditableScriptTextWidgets({
		children: root.children,
		widgets,
	});
	if (widgets.length === 0) {
		throw new Error("ScriptInfoSticker has no editable rich-text slots");
	}
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	const templateDuration =
		asJianyingRecord(root.root)?.duration ??
		DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION;
	let slotCount = 0;
	for (let index = 0; index < widgets.length; index += 1) {
		const richText = widgets[index].textParams.richText as string;
		const widgetText = sanitizeSlotText({
			text: textForWidget({ lines, index, widgetCount: widgets.length }),
		});
		slotCount += widgets[index].slotCount;
		const editedRichText = replaceJianyingRichTextSlots({
			richText,
			text: widgetText,
		});
		fitJianyingScriptTextWidget({
			widget: widgets[index].widget,
			originalRichText: richText,
			editedRichText,
		});
		widgets[index].textParams.richText = editedRichText;
		injectJianyingCaptionTiming({
			widget: widgets[index].widget,
			text: widgetText,
			templateDuration:
				typeof templateDuration === "number" &&
				Number.isFinite(templateDuration) &&
				templateDuration > 0
					? templateDuration
					: DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION,
		});
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
	templateFontPaths,
	fallbackFontPath,
	fontOverridePath,
	degradedResourceIds,
}: {
	value: unknown;
	content?: string;
	resourcePaths: Readonly<Record<string, string>>;
	templateFontPaths?: Readonly<Record<string, string>>;
	fallbackFontPath?: string;
	fontOverridePath?: string;
	degradedResourceIds?: ReadonlySet<string>;
}) {
	const editable =
		content === undefined
			? value
			: editJianyingScriptContent({ value, content }).value;
	return hydrateJianyingScriptContent({
		value: editable,
		resourcePaths,
		fontPaths: templateFontPaths,
		fallbackFontPath,
		fontOverridePath,
		degradedResourceIds,
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
	templateFontPaths,
	fallbackFontPath,
	fontOverridePath,
	degradedResourceIds,
}: {
	packagePath: string;
	packageHash: string;
	content?: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	templateFontPaths: Readonly<Record<string, string>>;
	fallbackFontPath: string;
	fontOverridePath?: string;
	degradedResourceIds: ReadonlySet<string>;
}) {
	const copyHash = createHash("sha256")
		.update(
			JSON.stringify({
				schemaVersion: JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION,
				content: content ?? null,
				resourceFingerprint,
				templateFontPaths,
				fallbackFontPath,
				fontOverridePath: fontOverridePath ?? null,
				degradedResourceIds: [...degradedResourceIds].sort(),
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
			templateFontPaths,
			fallbackFontPath,
			fontOverridePath,
			degradedResourceIds,
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
	templateFontPaths,
	fallbackFontPath,
	fontOverridePath,
	degradedResourceIds = new Set<string>(),
}: {
	packagePath: string;
	packageHash: string;
	content: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	templateFontPaths: Readonly<Record<string, string>>;
	fallbackFontPath: string;
	fontOverridePath?: string;
	degradedResourceIds?: ReadonlySet<string>;
}) {
	const key = createHash("sha256")
		.update(String(JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION))
		.update(packageHash)
		.update(content)
		.update(resourceFingerprint)
		.update(JSON.stringify(templateFontPaths))
		.update(fallbackFontPath)
		.update(fontOverridePath ?? "template-fonts")
		.update([...degradedResourceIds].sort().join("\0"))
		.digest("hex");
	const pending = packageCopies.get(key);
	if (pending) return pending;
	const created = createScriptPackageCopy({
		packagePath,
		packageHash,
		content,
		resourcePaths,
		resourceFingerprint,
		templateFontPaths,
		fallbackFontPath,
		fontOverridePath,
		degradedResourceIds,
	}).finally(() => packageCopies.delete(key));
	packageCopies.set(key, created);
	return created;
}

export function getHydratedJianyingScriptPackage({
	packagePath,
	packageHash,
	resourcePaths,
	resourceFingerprint,
	templateFontPaths,
	fallbackFontPath,
	fontOverridePath,
	degradedResourceIds = new Set<string>(),
}: {
	packagePath: string;
	packageHash: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	templateFontPaths: Readonly<Record<string, string>>;
	fallbackFontPath: string;
	fontOverridePath?: string;
	degradedResourceIds?: ReadonlySet<string>;
}) {
	const key = createHash("sha256")
		.update(String(JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION))
		.update(packageHash)
		.update(resourceFingerprint)
		.update(JSON.stringify(templateFontPaths))
		.update(fallbackFontPath)
		.update(fontOverridePath ?? "template-fonts")
		.update([...degradedResourceIds].sort().join("\0"))
		.update("hydrated")
		.digest("hex");
	const pending = packageCopies.get(key);
	if (pending) return pending;
	const created = createScriptPackageCopy({
		packagePath,
		packageHash,
		resourcePaths,
		resourceFingerprint,
		templateFontPaths,
		fallbackFontPath,
		fontOverridePath,
		degradedResourceIds,
	}).finally(() => packageCopies.delete(key));
	packageCopies.set(key, created);
	return created;
}
