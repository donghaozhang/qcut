import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { djb2NameHash, parseSerializedContainer } from "./serialized-container";
import { parseSerializedValue, type SerializedValue } from "./serialized-value";

const SCREEN_RENDER_TEXTURE_HASH = djb2NameHash({
	name: "ScreenRenderTexture",
});
const SCENE_OUTPUT_RT_HASH = djb2NameHash({ name: "SceneOutputRT" });

const DEFAULT_CACHE_ROOTS = [
	join(homedir(), "Movies/JianyingPro/User Data/Cache/artistEffect"),
	join(homedir(), "Movies/JianyingPro/User Data/Cache/effect"),
];

const RENDER_TEXTURE_FIELD_NAMES = [
	"width",
	"height",
	"depth",
	"internalFormat",
	"dataType",
	"colorFormat",
	"filterMin",
	"filterMag",
	"wrapModeS",
	"wrapModeT",
	"pecentX",
	"pecentY",
] as const;

interface RenderTextureSummary {
	file: string;
	packageRoot: string | null;
	resourceId: string | null;
	version: string | null;
	type: "ScreenRenderTexture" | "SceneOutputRT";
	width: number | null;
	height: number | null;
	depth: number | null;
	internalFormat: number | null;
	dataType: number | null;
	colorFormat: number | null;
	filterMin: number | null;
	filterMag: number | null;
	wrapModeS: number | null;
	wrapModeT: number | null;
	pecentX: number | null;
	pecentY: number | null;
}

interface ScanReport {
	roots: string[];
	filesScanned: number;
	unsupportedFiles: number;
	renderTexturesParsed: number;
	candidateCount: number;
	candidates: RenderTextureSummary[];
	issues: Array<{ file: string; message: string }>;
}

const SERIALIZED_MAGIC = new TextEncoder().encode("%SerializedFormat%@\n");

function hasSerializedMagic({ bytes }: { bytes: Uint8Array }) {
	if (bytes.byteLength < SERIALIZED_MAGIC.byteLength) return false;
	return SERIALIZED_MAGIC.every((byte, index) => bytes[index] === byte);
}

function inferPackageIdentity({ file }: { file: string }) {
	const segments = file.split("/");
	const versionIndex = segments.findIndex((segment, index) => {
		return index > 0 && /^[a-f\d]{32}$/i.test(segment);
	});
	if (versionIndex < 1) {
		return { packageRoot: null, resourceId: null, version: null };
	}
	return {
		packageRoot: segments.slice(0, versionIndex + 1).join("/"),
		resourceId: segments[versionIndex - 1] ?? null,
		version: segments[versionIndex] ?? null,
	};
}

function readNumericValue({ value }: { value: SerializedValue }) {
	if (value.kind === "int32" || value.kind === "double") return value.value;
	if (value.kind !== "int64") return null;
	const parsed = Number(value.value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function readNumericField({
	value,
	name,
}: {
	value: SerializedValue;
	name: (typeof RENDER_TEXTURE_FIELD_NAMES)[number];
}) {
	if (value.kind !== "object") return null;
	const nameHash = djb2NameHash({ name });
	const field = value.fields.find(
		(candidate) => candidate.nameHash === nameHash
	);
	return field ? readNumericValue({ value: field.value }) : null;
}

function summarizeRenderTexture({
	file,
	value,
}: {
	file: string;
	value: SerializedValue;
}): RenderTextureSummary | null {
	if (value.kind !== "object") return null;
	if (
		value.typeHash !== SCREEN_RENDER_TEXTURE_HASH &&
		value.typeHash !== SCENE_OUTPUT_RT_HASH
	) {
		return null;
	}

	const fields = Object.fromEntries(
		RENDER_TEXTURE_FIELD_NAMES.map((name) => [
			name,
			readNumericField({ value, name }),
		])
	) as Record<(typeof RENDER_TEXTURE_FIELD_NAMES)[number], number | null>;

	return {
		file,
		...inferPackageIdentity({ file }),
		type:
			value.typeHash === SCREEN_RENDER_TEXTURE_HASH
				? "ScreenRenderTexture"
				: "SceneOutputRT",
		...fields,
	};
}

export function parseRenderTextureFile({
	bytes,
	file,
}: {
	bytes: Uint8Array;
	file: string;
}) {
	const container = parseSerializedContainer({ bytes });
	return container.records.flatMap((record) => {
		const value = parseSerializedValue({
			bytes: record.payload,
			formatVersion: container.version,
		});
		const summary = summarizeRenderTexture({ file, value });
		return summary ? [summary] : [];
	});
}

export function isNonDefaultIntermediate({
	summary,
}: {
	summary: RenderTextureSummary;
}) {
	if (summary.type !== "ScreenRenderTexture") return false;
	return (
		(summary.pecentX !== null && summary.pecentX !== 1) ||
		(summary.pecentY !== null && summary.pecentY !== 1) ||
		(summary.internalFormat !== null && summary.internalFormat !== 43) ||
		(summary.colorFormat !== null && summary.colorFormat !== 43) ||
		(summary.dataType !== null && summary.dataType !== 1)
	);
}

function collectRenderTextureFiles({ root }: { root: string }) {
	const files: string[] = [];
	const directories = [root];
	while (directories.length > 0) {
		const directory = directories.pop();
		if (!directory) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				directories.push(path);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".rt")) files.push(path);
		}
	}
	return files.sort();
}

export function scanRenderTextures({ roots }: { roots: string[] }): ScanReport {
	const files = roots.flatMap((root) => collectRenderTextureFiles({ root }));
	const summaries: RenderTextureSummary[] = [];
	const issues: ScanReport["issues"] = [];
	let unsupportedFiles = 0;

	for (const file of files) {
		try {
			const bytes = readFileSync(file);
			if (!hasSerializedMagic({ bytes })) {
				unsupportedFiles += 1;
				continue;
			}
			summaries.push(...parseRenderTextureFile({ bytes, file }));
		} catch (error) {
			issues.push({
				file,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const candidates = summaries
		.filter((summary) => isNonDefaultIntermediate({ summary }))
		.sort((left, right) => left.file.localeCompare(right.file));
	return {
		roots,
		filesScanned: files.length,
		unsupportedFiles,
		renderTexturesParsed: summaries.length,
		candidateCount: candidates.length,
		candidates,
		issues,
	};
}

function parseRoots({ args }: { args: string[] }) {
	if (args.length === 0) return DEFAULT_CACHE_ROOTS;
	return args.map((root) => resolve(root));
}

function main({ args }: { args: string[] }) {
	const report = scanRenderTextures({ roots: parseRoots({ args }) });
	console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) main({ args: process.argv.slice(2) });
