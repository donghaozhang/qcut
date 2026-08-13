import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const MAX_PROJECT_DEPTH = 16;
const MAX_PROJECT_ENTRIES = 20_000;
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
const ACTIVE_SUBDRAFT_CONTENT_PATH = "subdraft/draft_content.json";
const ID_NAMED_SUBDRAFT_CONTENT_PATTERN =
	/^subdraft\/([^/]+)\/draft_content\.json$/u;

export interface Jianying113ProjectSource {
	contentByteLength: number;
	contentRelativePath: string;
	contentSha256: string;
	fileRelativePaths: string[];
	projectRootRealPath: string;
	subdraftId: string;
}

interface ProjectTreeEntry {
	relativePath: string;
	type: "directory" | "file";
}

function toPortableRelativePath({
	absolutePath,
	rootPath,
}: {
	absolutePath: string;
	rootPath: string;
}): string {
	return relative(rootPath, absolutePath).split(sep).join("/");
}

async function collectProjectTree({
	depth,
	entries,
	projectRootRealPath,
	currentDirectory,
}: {
	depth: number;
	entries: ProjectTreeEntry[];
	projectRootRealPath: string;
	currentDirectory: string;
}): Promise<void> {
	if (depth > MAX_PROJECT_DEPTH) {
		throw new Error(
			`Jianying project exceeds ${MAX_PROJECT_DEPTH} directories.`
		);
	}
	const children = await readdir(currentDirectory, { withFileTypes: true });
	children.sort((left, right) => left.name.localeCompare(right.name));
	for (const child of children) {
		if (entries.length >= MAX_PROJECT_ENTRIES) {
			throw new Error(
				`Jianying project exceeds ${MAX_PROJECT_ENTRIES} filesystem entries.`
			);
		}
		if (child.name.endsWith(".locked")) {
			throw new Error("Jianying project is locked and cannot be exported.");
		}
		const absolutePath = join(currentDirectory, child.name);
		const metadata = await lstat(absolutePath);
		if (metadata.isSymbolicLink()) {
			throw new Error(
				"Jianying project contains an unsupported symbolic link."
			);
		}
		const relativePath = toPortableRelativePath({
			absolutePath,
			rootPath: projectRootRealPath,
		});
		if (metadata.isDirectory()) {
			entries.push({ relativePath, type: "directory" });
			await collectProjectTree({
				currentDirectory: absolutePath,
				depth: depth + 1,
				entries,
				projectRootRealPath,
			});
			continue;
		}
		if (!metadata.isFile()) {
			throw new Error(
				"Jianying project contains an unsupported filesystem entry."
			);
		}
		entries.push({ relativePath, type: "file" });
	}
}

async function hashRegularFile({
	absolutePath,
}: {
	absolutePath: string;
}): Promise<{ byteLength: number; sha256: string }> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	const handle = await open(absolutePath, constants.O_RDONLY | noFollowFlag);
	try {
		const before = await handle.stat({ bigint: true });
		if (!before.isFile() || before.size > BigInt(MAX_CONTENT_BYTES)) {
			throw new Error(
				"Jianying subdraft content is not a bounded regular file."
			);
		}
		const hash = createHash("sha256");
		const stream = handle.createReadStream({ autoClose: false });
		for await (const chunk of stream) hash.update(chunk);
		const after = await handle.stat({ bigint: true });
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs
		) {
			throw new Error("Jianying subdraft changed while it was inspected.");
		}
		return {
			byteLength: Number(before.size),
			sha256: hash.digest("hex"),
		};
	} finally {
		await handle.close().catch(() => undefined);
	}
}

function resolveSubdraftId({
	fileRelativePaths,
	relativePath,
}: {
	fileRelativePaths: string[];
	relativePath: string;
}): string {
	const idNamedMatch = relativePath.match(ID_NAMED_SUBDRAFT_CONTENT_PATTERN);
	if (idNamedMatch !== null) return idNamedMatch[1] ?? "";
	const idNamedSubdraftIds = [
		...new Set(
			fileRelativePaths.flatMap((candidatePath) => {
				const match = candidatePath.match(ID_NAMED_SUBDRAFT_CONTENT_PATTERN);
				return match?.[1] === undefined ? [] : [match[1]];
			})
		),
	];
	if (idNamedSubdraftIds.length !== 1) {
		throw new Error(
			`Active Jianying content requires exactly one id-named subdraft, found ${idNamedSubdraftIds.length}.`
		);
	}
	return idNamedSubdraftIds[0] ?? "";
}

export async function inspectJianying113ProjectSource({
	expectedContentSha256,
	projectDirectory,
}: {
	expectedContentSha256: string;
	projectDirectory: string;
}): Promise<Jianying113ProjectSource> {
	if (!/^[0-9a-f]{64}$/u.test(expectedContentSha256)) {
		throw new Error("Expected Jianying content SHA-256 is invalid.");
	}
	const projectRootRealPath = await realpath(projectDirectory);
	const rootMetadata = await lstat(projectRootRealPath);
	if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
		throw new Error("Jianying project source must be a regular directory.");
	}
	const entries: ProjectTreeEntry[] = [];
	await collectProjectTree({
		currentDirectory: projectRootRealPath,
		depth: 0,
		entries,
		projectRootRealPath,
	});
	const fileRelativePaths = entries
		.filter(({ type }) => type === "file")
		.map(({ relativePath }) => relativePath);
	const matchingCandidates: Array<{
		byteLength: number;
		relativePath: string;
		sha256: string;
		subdraftId: string;
	}> = [];
	for (const relativePath of fileRelativePaths) {
		const isActiveContent = relativePath === ACTIVE_SUBDRAFT_CONTENT_PATH;
		const isIdNamedContent =
			ID_NAMED_SUBDRAFT_CONTENT_PATTERN.test(relativePath);
		if (!isActiveContent && !isIdNamedContent) continue;
		const identity = await hashRegularFile({
			absolutePath: join(projectRootRealPath, ...relativePath.split("/")),
		});
		if (identity.sha256 !== expectedContentSha256) continue;
		matchingCandidates.push({
			...identity,
			relativePath,
			subdraftId: resolveSubdraftId({ fileRelativePaths, relativePath }),
		});
	}
	if (matchingCandidates.length !== 1) {
		throw new Error(
			`Expected exactly one matching Jianying subdraft, found ${matchingCandidates.length}.`
		);
	}
	const [candidate] = matchingCandidates;
	if (candidate === undefined || candidate.subdraftId.length === 0) {
		throw new Error("Matching Jianying subdraft has an invalid identifier.");
	}
	return {
		contentByteLength: candidate.byteLength,
		contentRelativePath: candidate.relativePath,
		contentSha256: candidate.sha256,
		fileRelativePaths,
		projectRootRealPath,
		subdraftId: candidate.subdraftId,
	};
}
