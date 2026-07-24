import * as fs from "node:fs";
import * as path from "node:path";

export const MAX_HYPERFRAMES_HTML_BYTES = 5 * 1024 * 1024;

export interface ValidatedHyperframesSource {
	sourcePath: string;
	projectPath: string;
	html: string;
}

function isContainedPath({
	rootPath,
	candidatePath,
}: {
	rootPath: string;
	candidatePath: string;
}): boolean {
	const relative = path.relative(rootPath, candidatePath);
	return (
		relative === "" ||
		(relative !== ".." &&
			!relative.startsWith(`..${path.sep}`) &&
			!path.isAbsolute(relative))
	);
}

/** Resolve a selected HTML source to its canonical on-disk project root. */
export function validateHyperframesSource({
	sourcePath,
}: {
	sourcePath: string;
}): ValidatedHyperframesSource {
	if (!path.isAbsolute(sourcePath)) {
		throw new Error("HyperFrames source path must be absolute.");
	}
	if (!/\.html?$/i.test(sourcePath)) {
		throw new Error("HyperFrames source must be an HTML file.");
	}

	const canonicalSource = fs.realpathSync(sourcePath);
	const stats = fs.statSync(canonicalSource);
	if (!stats.isFile()) {
		throw new Error("HyperFrames source is not a file.");
	}
	if (stats.size > MAX_HYPERFRAMES_HTML_BYTES) {
		throw new Error("HyperFrames HTML exceeds the 5 MB import limit.");
	}

	return {
		sourcePath: canonicalSource,
		projectPath: fs.realpathSync(path.dirname(canonicalSource)),
		html: fs.readFileSync(canonicalSource, "utf8"),
	};
}

/** Resolve an asset while preventing traversal and symlink escape. */
export function resolveHyperframesAsset({
	projectPath,
	urlPath,
}: {
	projectPath: string;
	urlPath: string;
}): string | null {
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(urlPath);
	} catch {
		return null;
	}

	const relativePath = decodedPath.replace(/^[/\\]+/, "");
	if (!relativePath || relativePath.includes("\0")) return null;

	const candidatePath = path.resolve(projectPath, relativePath);
	if (!isContainedPath({ rootPath: projectPath, candidatePath })) return null;
	if (!fs.existsSync(candidatePath)) return null;

	try {
		const canonicalPath = fs.realpathSync(candidatePath);
		if (
			!isContainedPath({ rootPath: projectPath, candidatePath: canonicalPath })
		) {
			return null;
		}
		if (!fs.statSync(canonicalPath).isFile()) return null;
		return canonicalPath;
	} catch {
		return null;
	}
}
