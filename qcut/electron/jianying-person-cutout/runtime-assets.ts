import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const VIDEO_FUSION_LIBRARY_SHA256 =
	"b09c395d934169cb20ec865dd1d4032ca68023b287a7264e1b06ff4d71fd1be4";

export interface HashedRuntimeFile {
	name: string;
	sha256: string;
}

export async function sha256File({ filePath }: { filePath: string }) {
	try {
		return createHash("sha256")
			.update(await readFile(filePath))
			.digest("hex");
	} catch {
		return null;
	}
}

export async function directoryMatches({
	directory,
	files,
}: {
	directory: string;
	files: ReadonlyArray<HashedRuntimeFile>;
}) {
	const hashes = await Promise.all(
		files.map(({ name }) =>
			sha256File({ filePath: path.join(directory, name) })
		)
	);
	return hashes.every((hash, index) => hash === files[index].sha256);
}

export async function firstMatchingDirectory({
	candidates,
	files,
}: {
	candidates: string[];
	files: ReadonlyArray<HashedRuntimeFile>;
}) {
	for (const directory of candidates) {
		if (await directoryMatches({ directory, files })) return directory;
	}
	return null;
}

export async function firstMatchingFile({
	candidates,
	sha256,
}: {
	candidates: string[];
	sha256: string;
}) {
	for (const candidate of candidates) {
		if ((await sha256File({ filePath: candidate })) === sha256)
			return candidate;
	}
	return null;
}
