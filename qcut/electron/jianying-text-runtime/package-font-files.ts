import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const FONT_FILE_PATTERN = /\.(?:otf|ttc|ttf)$/i;
const MAXIMUM_DIRECTORY_DEPTH = 6;
const MAXIMUM_PACKAGE_ENTRIES = 2048;
const MAXIMUM_FONT_BYTES = 128 * 1024 * 1024;
const FONT_SIGNATURES = new Set(["OTTO", "true", "ttcf"]);

interface FontCandidate {
	depth: number;
	filePath: string;
}

function isWithinRoot({
	candidate,
	root,
}: {
	candidate: string;
	root: string;
}) {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function hasSupportedFontSignature({ filePath }: { filePath: string }) {
	const handle = await open(filePath, "r");
	try {
		const signature = Buffer.alloc(4);
		const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
		if (bytesRead !== signature.length) return false;
		return (
			signature.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) ||
			FONT_SIGNATURES.has(signature.toString("ascii"))
		);
	} finally {
		await handle.close();
	}
}

async function collectPackageFontFiles({
	directory,
	depth,
	root,
	state,
}: {
	directory: string;
	depth: number;
	root: string;
	state: { entryCount: number };
}): Promise<FontCandidate[]> {
	if (depth > MAXIMUM_DIRECTORY_DEPTH) return [];
	const entries = await readdir(directory, { withFileTypes: true });
	state.entryCount += entries.length;
	if (state.entryCount > MAXIMUM_PACKAGE_ENTRIES) {
		throw new Error("Jianying font package contains too many files");
	}
	const nested = await Promise.all(
		entries.map(async (entry): Promise<FontCandidate[]> => {
			if (entry.isSymbolicLink()) return [];
			const candidate = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				return collectPackageFontFiles({
					directory: candidate,
					depth: depth + 1,
					root,
					state,
				});
			}
			if (!(entry.isFile() && FONT_FILE_PATTERN.test(entry.name))) return [];
			const resolved = await realpath(candidate);
			if (!isWithinRoot({ candidate: resolved, root })) return [];
			const metadata = await stat(resolved);
			if (
				!metadata.isFile() ||
				metadata.size <= 0 ||
				metadata.size > MAXIMUM_FONT_BYTES ||
				!(await hasSupportedFontSignature({ filePath: resolved }))
			) {
				return [];
			}
			return [{ depth, filePath: resolved }];
		})
	);
	return nested.flat();
}

export async function listJianyingPackageFontFiles({
	packagePath,
}: {
	packagePath: string;
}) {
	const root = await realpath(packagePath);
	const candidates = await collectPackageFontFiles({
		directory: root,
		depth: 0,
		root,
		state: { entryCount: 0 },
	});
	return candidates
		.sort(
			(left, right) =>
				left.depth - right.depth || left.filePath.localeCompare(right.filePath)
		)
		.map(({ filePath }) => filePath);
}

export async function findJianyingPackageFontFile({
	packagePath,
}: {
	packagePath: string;
}) {
	return (await listJianyingPackageFontFiles({ packagePath }))[0] ?? null;
}
