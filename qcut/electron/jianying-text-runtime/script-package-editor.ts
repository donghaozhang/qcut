import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	cp,
	copyFile,
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
import type { ResolvedJianyingScriptHost } from "./script-host-resolver.js";

export const JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION = 15;
const packageCopies = new Map<string, Promise<string>>();
const RICH_TEXT_SLOT_PATTERN = /\[[^\]]*\]/g;
const PRIMARY_SCRIPT_TEXT_WIDGET_AREA_RATIO = 0.35;

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

function scriptTextWidgetVisualArea({
	widget,
}: {
	widget: Record<string, unknown>;
}) {
	const originalSize = widget.original_size;
	const scale = widget.scale;
	if (
		!Array.isArray(originalSize) ||
		!Array.isArray(scale) ||
		typeof originalSize[0] !== "number" ||
		!Number.isFinite(originalSize[0]) ||
		typeof originalSize[1] !== "number" ||
		!Number.isFinite(originalSize[1]) ||
		typeof scale[0] !== "number" ||
		!Number.isFinite(scale[0]) ||
		typeof scale[1] !== "number" ||
		!Number.isFinite(scale[1])
	) {
		return null;
	}
	const width = Math.abs(originalSize[0] * scale[0]);
	const height = Math.abs(originalSize[1] * scale[1]);
	const area = width * height;
	return area > 0 ? area : null;
}

function primaryScriptTextWidgets({
	widgets,
}: {
	widgets: EditableScriptTextWidget[];
}) {
	if (widgets.length <= 1) return widgets;
	const measured = widgets.flatMap((widget) => {
		const area = scriptTextWidgetVisualArea({ widget: widget.widget });
		return area === null ? [] : [{ area, widget }];
	});
	if (measured.length !== widgets.length) return widgets;
	const maximumArea = Math.max(...measured.map(({ area }) => area));
	const primary = measured
		.filter(
			({ area }) => area >= maximumArea * PRIMARY_SCRIPT_TEXT_WIDGET_AREA_RATIO
		)
		.map(({ widget }) => widget);
	return primary.length > 0 ? primary : widgets;
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
	const editableWidgets = primaryScriptTextWidgets({ widgets });
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	const templateDuration =
		asJianyingRecord(root.root)?.duration ??
		DEFAULT_JIANYING_TEXT_TEMPLATE_DURATION;
	let slotCount = 0;
	for (let index = 0; index < editableWidgets.length; index += 1) {
		const richText = editableWidgets[index].textParams.richText as string;
		const widgetText = sanitizeSlotText({
			text: textForWidget({
				lines,
				index,
				widgetCount: editableWidgets.length,
			}),
		});
		slotCount += editableWidgets[index].slotCount;
		const editedRichText = replaceJianyingRichTextSlots({
			richText,
			text: widgetText,
		});
		fitJianyingScriptTextWidget({
			widget: editableWidgets[index].widget,
			originalRichText: richText,
			editedRichText,
		});
		editableWidgets[index].textParams.richText = editedRichText;
		injectJianyingCaptionTiming({
			widget: editableWidgets[index].widget,
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
		textWidgetCount: editableWidgets.length,
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
	supportsCustomContourShapes = false,
}: {
	value: unknown;
	content?: string;
	resourcePaths: Readonly<Record<string, string>>;
	templateFontPaths?: Readonly<Record<string, string>>;
	fallbackFontPath?: string;
	fontOverridePath?: string;
	degradedResourceIds?: ReadonlySet<string>;
	supportsCustomContourShapes?: boolean;
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
		supportsCustomContourShapes,
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

function localizedDependencyPath({
	destination,
	resourceId,
}: {
	destination: string;
	resourceId: string;
}) {
	const dependencyHash = createHash("sha256").update(resourceId).digest("hex");
	return path.join(destination, "dependencies", dependencyHash);
}

async function localizeJianyingScriptResourcePaths({
	destination,
	resourcePaths,
	temporary,
}: {
	destination: string;
	resourcePaths: Readonly<Record<string, string>>;
	temporary: string;
}) {
	const localized = await Promise.all(
		Object.entries(resourcePaths).map(async ([resourceId, sourcePath]) => {
			const finalPath = localizedDependencyPath({ destination, resourceId });
			const temporaryPath = localizedDependencyPath({
				destination: temporary,
				resourceId,
			});
			await mkdir(path.dirname(temporaryPath), { recursive: true });
			await cp(sourcePath, temporaryPath, {
				recursive: true,
				errorOnExist: true,
				force: false,
				mode: constants.COPYFILE_FICLONE,
			});
			return [resourceId, finalPath] as const;
		})
	);
	return Object.fromEntries(localized);
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
	scriptHost,
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
	scriptHost?: ResolvedJianyingScriptHost;
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
				scriptHostFingerprint: scriptHost?.fingerprint ?? null,
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
		if (scriptHost) {
			// The donor host layout is validated, but the package being edited may
			// not ship a js/template tree of its own — create it so the copies
			// cannot fail with ENOENT.
			await mkdir(path.join(temporary, "js", "template"), {
				recursive: true,
			});
			await Promise.all([
				copyFile(
					scriptHost.mainScriptPath,
					path.join(temporary, "js", "main.js"),
					constants.COPYFILE_FICLONE
				),
				copyFile(
					scriptHost.templateScriptPath,
					path.join(temporary, "js", "template", "template.js"),
					constants.COPYFILE_FICLONE
				),
			]);
		}
		const localizedResourcePaths = await localizeJianyingScriptResourcePaths({
			destination,
			resourcePaths,
			temporary,
		});
		const contentPath = path.join(temporary, "content.json");
		const source = JSON.parse(await readFile(contentPath, "utf8")) as unknown;
		const prepared = prepareJianyingScriptContent({
			value: source,
			content,
			resourcePaths: localizedResourcePaths,
			templateFontPaths,
			fallbackFontPath,
			fontOverridePath,
			degradedResourceIds,
			supportsCustomContourShapes: Boolean(scriptHost),
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
	scriptHost,
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
	scriptHost?: ResolvedJianyingScriptHost;
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
		.update(scriptHost?.fingerprint ?? "source-script-host")
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
		scriptHost,
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
	scriptHost,
}: {
	packagePath: string;
	packageHash: string;
	resourcePaths: Readonly<Record<string, string>>;
	resourceFingerprint: string;
	templateFontPaths: Readonly<Record<string, string>>;
	fallbackFontPath: string;
	fontOverridePath?: string;
	degradedResourceIds?: ReadonlySet<string>;
	scriptHost?: ResolvedJianyingScriptHost;
}) {
	const key = createHash("sha256")
		.update(String(JIANYING_SCRIPT_PACKAGE_COPY_SCHEMA_VERSION))
		.update(packageHash)
		.update(resourceFingerprint)
		.update(JSON.stringify(templateFontPaths))
		.update(fallbackFontPath)
		.update(fontOverridePath ?? "template-fonts")
		.update([...degradedResourceIds].sort().join("\0"))
		.update(scriptHost?.fingerprint ?? "source-script-host")
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
		scriptHost,
	}).finally(() => packageCopies.delete(key));
	packageCopies.set(key, created);
	return created;
}
