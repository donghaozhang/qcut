import { createHash, randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	readFile,
	readdir,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { CoverCachedEntry } from "./jianying-cover-contract.js";
import type {
	CoverLayoutText,
	CoverTextLayout,
} from "./jianying-cover-layout.js";
import { verifyCoverFile } from "./jianying-cover-private-cache.js";
import { readFontkitMetadata } from "./jianying-font-lab-catalog.js";
import {
	retainPrivateJianyingFont,
	jianyingPrivateFontRoot,
} from "./jianying-font-private-cache.js";
import { getQCutJianyingTextPrivateArchiveRoot } from "./jianying-text-private-archive.js";
import {
	detectJianyingTextPackageKind,
	readJianyingTextTemplateDuration,
} from "./jianying-text-package-metadata.js";

type Dependency = CoverCachedEntry["dependencies"][number];

async function packageFiles({
	root,
	relative = "",
	depth = 0,
}: {
	root: string;
	relative?: string;
	depth?: number;
}): Promise<string[]> {
	if (depth > 12) throw new Error("Word-art package nesting exceeds limit");
	const entries = await readdir(path.join(root, relative), {
		withFileTypes: true,
	});
	return entries.reduce(
		async (previous, entry) => {
			const files = await previous;
			if (entry.name === ".DS_Store" || entry.name.startsWith("._"))
				return files;
			const child = path.join(relative, entry.name);
			if (entry.isDirectory())
				return [
					...files,
					...(await packageFiles({ root, relative: child, depth: depth + 1 })),
				];
			if (!entry.isFile()) throw new Error("Unsafe word-art package entry");
			return [...files, child];
		},
		Promise.resolve([] as string[])
	);
}

export async function retainCoverLayoutFont({
	dependency,
	root,
	fontRoot = jianyingPrivateFontRoot(),
}: {
	dependency: Dependency;
	root: string;
	fontRoot?: string;
}) {
	const files = dependency.files.filter((file) =>
		/\.(ttf|otf)$/i.test(file.logicalPath)
	);
	if (dependency.status !== "cached" || files.length !== 1)
		throw new Error(
			`Cover font is missing or ambiguous: ${dependency.reference}`
		);
	const file = files[0];
	const bytes = await verifyCoverFile({ root, file });
	const metadata = readFontkitMetadata({ bytes });
	const format = /\.otf$/i.test(file.logicalPath) ? "otf" : "ttf";
	await retainPrivateJianyingFont({
		bytes,
		sha256: file.sha256,
		format,
		root: fontRoot,
	});
	return {
		fontId: `sha256:${file.sha256}`,
		cssFamily: `QCutLocal_${file.sha256.slice(0, 20)}`,
		...metadata,
		format,
		size: bytes.length,
		sourceKinds: ["qcut-cache"],
	} satisfies CoverTextLayout["fonts"][string];
}

export async function retainCoverLayoutWordArt({
	dependency,
	effect,
	root,
	packageRoot = path.join(
		getQCutJianyingTextPrivateArchiveRoot(),
		"Cache",
		"artistEffect"
	),
}: {
	dependency: Dependency;
	effect: NonNullable<CoverLayoutText["effect"]>;
	root: string;
	packageRoot?: string;
}) {
	const resourceId =
		dependency.resolution?.catalogResourceId ?? effect.resource_id;
	const packageHash =
		dependency.resolution?.packageHash ??
		/^textEffect\/([a-f\d]{32})$/.exec(dependency.reference)?.[1];
	if (
		dependency.status !== "cached" ||
		!dependency.files.length ||
		!/^\d{1,32}$/.test(resourceId) ||
		!packageHash ||
		!/^[a-f\d]{32}$/.test(packageHash)
	)
		throw new Error("Invalid cover word-art package");
	const files = dependency.files.map((file) => {
		const prefix = `${dependency.reference}/`;
		if (!file.logicalPath.startsWith(prefix))
			throw new Error("Cover word-art path mismatch");
		const relative = file.logicalPath.slice(prefix.length);
		if (
			!relative ||
			relative.includes("\\") ||
			relative.includes("\0") ||
			path.isAbsolute(relative) ||
			relative.split("/").some((part) => !part || part === "." || part === "..")
		)
			throw new Error("Unsafe cover word-art path");
		return { file, relative };
	});
	if (new Set(files.map((file) => file.relative)).size !== files.length)
		throw new Error("Duplicate cover word-art path");
	const configFile = files.find((file) => file.relative === "config.json");
	if (!configFile) throw new Error("Cover word-art config missing");
	const config = JSON.parse(
		(await verifyCoverFile({ root, file: configFile.file })).toString("utf8")
	);
	const packageKind = detectJianyingTextPackageKind({ config });
	if (!["TextStyle", "InfoSticker", "ScriptInfoSticker"].includes(packageKind))
		throw new Error("Unsupported cover word-art runtime");
	await mkdir(packageRoot, { recursive: true, mode: 0o700 });
	if ((await lstat(packageRoot)).isSymbolicLink())
		throw new Error("Symlinked cover word-art root");
	const parent = path.join(await realpath(packageRoot), resourceId);
	await mkdir(parent, { recursive: true, mode: 0o700 });
	if ((await realpath(parent)) !== parent)
		throw new Error("Symlinked cover word-art parent");
	const destination = path.join(parent, packageHash);
	const exists = await lstat(destination).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
			return null;
		}
	);
	if (exists) {
		if (!exists.isDirectory() || exists.isSymbolicLink())
			throw new Error("Unsafe existing word-art package");
		const expected = new Set(files.map((file) => file.relative));
		const actual = await packageFiles({ root: destination });
		if (
			actual.length !== expected.size ||
			actual.some((file) => !expected.has(file))
		)
			throw new Error("Existing word-art package file inventory mismatch");
		await files.reduce(async (previous, { file, relative }) => {
			await previous;
			const source = path.join(destination, relative);
			if ((await realpath(source)) !== source)
				throw new Error("Symlinked word-art file");
			const metadata = await lstat(source);
			if (!metadata.isFile() || metadata.size !== file.bytes)
				throw new Error("Existing word-art file size mismatch");
			if (
				createHash("sha256")
					.update(await readFile(source))
					.digest("hex") !== file.sha256
			)
				throw new Error("Existing word-art checksum mismatch");
		}, Promise.resolve());
	} else {
		const temporary = path.join(parent, `.${packageHash}-${randomUUID()}`);
		await mkdir(temporary, { mode: 0o700 });
		try {
			await files.reduce(async (previous, { file, relative }) => {
				await previous;
				const bytes = await verifyCoverFile({ root, file });
				const filename = path.join(temporary, relative);
				await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
				await writeFile(filename, bytes, { flag: "wx", mode: 0o600 });
			}, Promise.resolve());
			await rename(temporary, destination);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	}
	const templateDuration = await readJianyingTextTemplateDuration({
		packagePath: destination,
		packageKind,
	});
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		resourceId,
		packageHash,
		packageKind: packageKind as
			| "TextStyle"
			| "InfoSticker"
			| "ScriptInfoSticker",
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration,
	} satisfies CoverTextLayout["wordArt"][string];
}
