import { readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { IMAGE_EXTENSIONS, type ImageCandidate } from "./types.js";

function isRemoteUrl({ input }: { input: string }): boolean {
	return /^https?:\/\//i.test(input);
}

function hasImageExtension({ input }: { input: string }): boolean {
	return (IMAGE_EXTENSIONS as readonly string[]).includes(
		extname(input).toLowerCase()
	);
}

function readImageDir({ dir }: { dir: string }): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				hasImageExtension({
					input: entry.name,
				})
		)
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right))
		.map((name) => join(dir, name));
}

/**
 * Resolve candidate images from repeatable `--image`/`--candidate` paths and
 * an optional `--dir`. Remote URLs pass through untouched; local paths are
 * filtered by extension. The result is de-duplicated and re-indexed from 0.
 */
export function collectCandidates({
	images = [],
	dir,
}: {
	images?: string[];
	dir?: string;
}): ImageCandidate[] {
	const ordered: string[] = [...images];
	if (dir) ordered.push(...readImageDir({ dir }));

	const seen = new Set<string>();
	const candidates: ImageCandidate[] = [];
	for (const entry of ordered) {
		const path = entry.trim();
		if (!path || seen.has(path)) continue;
		if (!isRemoteUrl({ input: path }) && !hasImageExtension({ input: path })) {
			continue;
		}
		seen.add(path);
		candidates.push({ index: candidates.length, path });
	}

	if (candidates.length === 0) {
		throw new Error("No candidate images found");
	}
	return candidates;
}
