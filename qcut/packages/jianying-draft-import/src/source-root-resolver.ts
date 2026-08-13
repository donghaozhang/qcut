import type { Dirent } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { InteropIssue } from "@qcut/editor-core/draft-interop";

export type DraftSourceScope = "selected-directory" | "compound-subdraft";

export interface ResolvedDraftSourceRoot {
	rootRealPath: string;
	sourceScope: DraftSourceScope;
	subdraftCandidateCount: number;
	selectedSubdraftId?: string;
	issues: InteropIssue[];
}

export class DraftSourceLockedError extends Error {
	constructor() {
		super("Close the Jianying Professional draft before importing it.");
		this.name = "DraftSourceLockedError";
	}
}

async function pathExists({
	absolutePath,
}: {
	absolutePath: string;
}): Promise<boolean> {
	try {
		await lstat(absolutePath);
		return true;
	} catch {
		return false;
	}
}

async function isRegularFile({
	absolutePath,
}: {
	absolutePath: string;
}): Promise<boolean> {
	try {
		const metadata = await lstat(absolutePath);
		return metadata.isFile() && !metadata.isSymbolicLink();
	} catch {
		return false;
	}
}

async function isDirectory({
	absolutePath,
}: {
	absolutePath: string;
}): Promise<boolean> {
	try {
		const metadata = await lstat(absolutePath);
		return metadata.isDirectory() && !metadata.isSymbolicLink();
	} catch {
		return false;
	}
}

async function assertUnlocked({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<void> {
	if (
		await pathExists({
			absolutePath: join(projectRoot, ".locked"),
		})
	) {
		throw new DraftSourceLockedError();
	}
}

async function isMultiTimelineProject({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<boolean> {
	const timelinesRoot = join(projectRoot, "Timelines");
	if (!(await isDirectory({ absolutePath: timelinesRoot }))) return false;
	return isRegularFile({ absolutePath: join(timelinesRoot, "project.json") });
}

interface SubdraftCandidate {
	id: string;
	rootRealPath: string;
}

interface SubdraftCandidateScan {
	candidates: SubdraftCandidate[];
	truncated: boolean;
}

async function hasActiveSubdraftContent({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<boolean> {
	return isRegularFile({
		absolutePath: join(projectRoot, "subdraft", "draft_content.json"),
	});
}

async function findSubdraftCandidates({
	projectRoot,
	maxEntries,
}: {
	projectRoot: string;
	maxEntries: number;
}): Promise<SubdraftCandidateScan> {
	const subdraftRoot = join(projectRoot, "subdraft");
	if (!(await isDirectory({ absolutePath: subdraftRoot }))) {
		return { candidates: [], truncated: false };
	}
	const entries: Dirent[] = [];
	const directory = await opendir(subdraftRoot);
	// Async directory iteration closes the handle on completion and early return.
	for await (const entry of directory) {
		if (entries.length === maxEntries) {
			return { candidates: [], truncated: true };
		}
		entries.push(entry);
	}
	const directories = entries.filter(
		(entry) => entry.isDirectory() && !entry.isSymbolicLink()
	);
	const candidates = await Promise.all(
		directories.map(async (entry): Promise<SubdraftCandidate | undefined> => {
			const candidateRoot = join(subdraftRoot, entry.name);
			if (!(await isDirectory({ absolutePath: candidateRoot })))
				return undefined;
			if (
				!(await isRegularFile({
					absolutePath: join(candidateRoot, "draft_content.json"),
				}))
			) {
				return undefined;
			}
			return { id: entry.name, rootRealPath: candidateRoot };
		})
	);
	return {
		candidates: candidates
			.filter(
				(candidate): candidate is SubdraftCandidate => candidate !== undefined
			)
			.sort((left, right) =>
				left.id < right.id ? -1 : left.id > right.id ? 1 : 0
			),
		truncated: false,
	};
}

async function resolveDirectSubdraftProjectRoot({
	rootRealPath,
}: {
	rootRealPath: string;
}): Promise<string | undefined> {
	const subdraftRoot = dirname(rootRealPath);
	if (basename(subdraftRoot) !== "subdraft") return undefined;
	if (
		!(await isRegularFile({
			absolutePath: join(rootRealPath, "draft_content.json"),
		}))
	) {
		return undefined;
	}
	const projectRoot = dirname(subdraftRoot);
	return (await isMultiTimelineProject({ projectRoot }))
		? projectRoot
		: undefined;
}

/**
 * Resolves a Jianying multi-timeline project to its sole plaintext compound
 * subdraft. Multiple candidates stay unresolved so callers never guess.
 */
export async function resolveDraftSourceRoot({
	rootRealPath,
	maxEntries,
}: {
	rootRealPath: string;
	maxEntries: number;
}): Promise<ResolvedDraftSourceRoot> {
	const directSubdraftProjectRoot = await resolveDirectSubdraftProjectRoot({
		rootRealPath,
	});
	if (directSubdraftProjectRoot !== undefined) {
		await assertUnlocked({ projectRoot: directSubdraftProjectRoot });
		return {
			rootRealPath,
			sourceScope: "compound-subdraft",
			subdraftCandidateCount: 1,
			selectedSubdraftId: basename(rootRealPath),
			issues: [],
		};
	}

	await assertUnlocked({ projectRoot: rootRealPath });
	if (!(await isMultiTimelineProject({ projectRoot: rootRealPath }))) {
		return {
			rootRealPath,
			sourceScope: "selected-directory",
			subdraftCandidateCount: 0,
			issues: [],
		};
	}

	const { candidates, truncated } = await findSubdraftCandidates({
		projectRoot: rootRealPath,
		maxEntries,
	});
	if (truncated || candidates.length !== 1) {
		return {
			rootRealPath,
			sourceScope: "selected-directory",
			subdraftCandidateCount: candidates.length,
			issues: truncated
				? [
						{
							code: "SOURCE_FILE_TOO_LARGE",
							severity: "warning",
							message: `The subdraft directory exceeds the ${maxEntries}-entry scan limit; importing the selected directory instead of a compound subdraft.`,
						},
					]
				: [],
		};
	}

	const [selected] = candidates;
	const activeSubdraftRoot = join(rootRealPath, "subdraft");
	// Jianying saves current compound edits here; the id-named child is a
	// creation-time copy and can remain stale after later timeline edits.
	const selectedRoot = (await hasActiveSubdraftContent({
		projectRoot: rootRealPath,
	}))
		? activeSubdraftRoot
		: selected.rootRealPath;
	return {
		rootRealPath: selectedRoot,
		sourceScope: "compound-subdraft",
		subdraftCandidateCount: 1,
		selectedSubdraftId: selected.id,
		issues: [
			{
				code: "FEATURE_OPAQUE",
				severity: "warning",
				message:
					"The Jianying root timeline is opaque; this import contains only its sole plaintext compound subdraft.",
				subjectId: selected.id,
			},
		],
	};
}
