import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
	copyFile,
	lstat,
	mkdir,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LOCAL_VIDEO_CAPABILITIES } from "./capabilities";

interface ModelFileEvidence {
	relativePath: string;
	bytes: number;
	sha256: string;
}

function parseArguments({ args }: { args: string[] }): {
	sourceModels: string;
	version: string;
} {
	let sourceModels =
		"/Applications/VideoFusion-macOS.app/Contents/Resources/models";
	let version = "unknown";
	for (let index = 0; index < args.length; index += 1) {
		const value = args[index];
		const next = args[index + 1];
		if (!(value && next)) continue;
		if (value === "--source-models") sourceModels = next;
		if (value === "--version") version = next;
		if (value === "--source-models" || value === "--version") index += 1;
	}
	if (!/^[A-Za-z0-9._-]+$/.test(version)) {
		throw new Error(
			"version may contain only letters, numbers, dots, underscores, and hyphens"
		);
	}
	return { sourceModels, version };
}

function requiredModelArtifacts(): {
	relativePath: string;
	required: boolean;
}[] {
	const artifacts = LOCAL_VIDEO_CAPABILITIES.flatMap(({ artifacts }) =>
		artifacts.filter(({ root }) => root === "models")
	);
	const byPath = new Map<string, boolean>();
	for (const { relativePath, required } of artifacts) {
		byPath.set(relativePath, (byPath.get(relativePath) ?? false) || required);
	}
	return [...byPath].map(([relativePath, required]) => ({
		relativePath,
		required,
	}));
}

async function sha256File({ filePath }: { filePath: string }): Promise<string> {
	const bytes = await Bun.file(filePath).arrayBuffer();
	return createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
}

async function collectSourceEvidence({
	sourceModels,
}: {
	sourceModels: string;
}): Promise<ModelFileEvidence[]> {
	const canonicalRoot = await realpath(sourceModels);
	const evidence: ModelFileEvidence[] = [];
	for (const { relativePath, required } of requiredModelArtifacts()) {
		const sourcePath = path.join(canonicalRoot, relativePath);
		const metadata = await lstat(sourcePath).catch(() => null);
		if (!metadata) {
			if (required)
				throw new Error(`required local model is missing: ${relativePath}`);
			continue;
		}
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error(`local model must be a regular file: ${relativePath}`);
		}
		const canonicalFile = await realpath(sourcePath);
		if (!canonicalFile.startsWith(`${canonicalRoot}${path.sep}`)) {
			throw new Error(`local model escapes its source root: ${relativePath}`);
		}
		evidence.push({
			relativePath,
			bytes: metadata.size,
			sha256: await sha256File({ filePath: canonicalFile }),
		});
	}
	return evidence.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath)
	);
}

function snapshotName({
	version,
	files,
}: {
	version: string;
	files: ModelFileEvidence[];
}): string {
	const digest = createHash("sha256")
		.update(JSON.stringify(files))
		.digest("hex")
		.slice(0, 16);
	return `${version}-${digest}`;
}

async function pointCurrentAt({
	root,
	name,
}: {
	root: string;
	name: string;
}): Promise<void> {
	const temporaryLink = path.join(
		root,
		`.current-${process.pid}-${Date.now()}`
	);
	const currentLink = path.join(root, "current");
	await symlink(name, temporaryLink, "dir");
	try {
		await rename(temporaryLink, currentLink);
	} catch (cause) {
		const current = await lstat(currentLink).catch(() => null);
		if (!current?.isSymbolicLink()) throw cause;
		await rm(currentLink);
		await rename(temporaryLink, currentLink);
	}
}

async function verifySnapshot({
	destination,
	files,
}: {
	destination: string;
	files: ModelFileEvidence[];
}): Promise<void> {
	for (const expected of files) {
		const filePath = path.join(destination, "Models", expected.relativePath);
		const metadata = await lstat(filePath).catch(() => null);
		if (!metadata?.isFile() || metadata.isSymbolicLink()) {
			throw new Error(
				`private model is missing or unsafe: ${expected.relativePath}`
			);
		}
		if (metadata.size !== expected.bytes) {
			throw new Error(`private model size mismatch: ${expected.relativePath}`);
		}
		if ((await sha256File({ filePath })) !== expected.sha256) {
			throw new Error(
				`private model checksum mismatch: ${expected.relativePath}`
			);
		}
	}
}

async function main({ args }: { args: string[] }): Promise<void> {
	const { sourceModels, version } = parseArguments({ args });
	const privateRoot = path.join(
		os.homedir(),
		"Library",
		"Application Support",
		"QCut",
		"PrivateRuntimes",
		"JianyingBasicVideo"
	);
	const files = await collectSourceEvidence({ sourceModels });
	const name = snapshotName({ version, files });
	const destination = path.join(privateRoot, name);
	const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
	await mkdir(privateRoot, { recursive: true });
	if (!(await lstat(destination).catch(() => null))) {
		try {
			for (const file of files) {
				const sourcePath = path.join(sourceModels, file.relativePath);
				const destinationPath = path.join(
					temporary,
					"Models",
					file.relativePath
				);
				await mkdir(path.dirname(destinationPath), { recursive: true });
				await copyFile(sourcePath, destinationPath, constants.COPYFILE_FICLONE);
			}
			await writeFile(
				path.join(temporary, "manifest.json"),
				`${JSON.stringify({ version, files }, null, 2)}\n`
			);
			await rename(temporary, destination);
		} catch (cause) {
			await rm(temporary, { recursive: true, force: true });
			throw cause;
		}
	}
	await verifySnapshot({ destination, files });
	await pointCurrentAt({ root: privateRoot, name });
	console.log(path.join(privateRoot, "current"));
}

await main({ args: Bun.argv.slice(2) });
