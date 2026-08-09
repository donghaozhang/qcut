import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	buildCapCut81ActiveContentMirrorPaths,
	CAPCUT_8_1_SAVED_NEW_VERSION,
} from "@qcut/editor-core/jianying-draft";

export interface CapCut81SameProfileTestFixture {
	backupPaths: string[];
	draftDirectory: string;
	mirrorRelativePaths: readonly string[];
	originalBytes: Uint8Array;
	timelineId: string;
}

export function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function contentBytes({
	timelineId,
	timing = 3_000_000,
}: {
	timelineId: string;
	timing?: number;
}): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			id: timelineId,
			new_version: CAPCUT_8_1_SAVED_NEW_VERSION,
			unknownTopLevel: { sentinel: ["keep", { nested: true }] },
			tracks: [
				{
					segments: [
						{
							target_timerange: { start: 0, duration: timing },
							unknownSegment: { preserve: true },
						},
					],
				},
			],
		})
	);
}

export async function createCapCut81SameProfileTestFixture({
	rootDirectory,
}: {
	rootDirectory: string;
}): Promise<CapCut81SameProfileTestFixture> {
	const timelineId = randomUUID();
	const draftDirectory = join(rootDirectory, "draft");
	const originalBytes = contentBytes({ timelineId });
	const mirrorRelativePaths = buildCapCut81ActiveContentMirrorPaths({
		timelineId,
	});
	await Promise.all(
		mirrorRelativePaths.map(async (relativePath) => {
			const absolutePath = join(draftDirectory, ...relativePath.split("/"));
			await mkdir(dirname(absolutePath), { recursive: true });
			await writeFile(absolutePath, originalBytes);
		})
	);
	const backupPaths = [
		join(draftDirectory, "draft_info.json.bak"),
		join(draftDirectory, "Timelines", timelineId, "draft_info.json.bak"),
	];
	await Promise.all(
		backupPaths.map((backupPath) => writeFile(backupPath, originalBytes))
	);
	return {
		backupPaths,
		draftDirectory,
		mirrorRelativePaths,
		originalBytes,
		timelineId,
	};
}

export async function readMirrors({
	draftDirectory,
	mirrorRelativePaths,
}: {
	draftDirectory: string;
	mirrorRelativePaths: readonly string[];
}): Promise<Uint8Array[]> {
	return Promise.all(
		mirrorRelativePaths.map((relativePath) =>
			readFile(join(draftDirectory, ...relativePath.split("/")))
		)
	);
}

export async function listQCutArtifacts({
	directory,
}: {
	directory: string;
}): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return listQCutArtifacts({ directory: path });
			return entry.name.includes("qcut-") || entry.name.startsWith(".qcut")
				? [path]
				: [];
		})
	);
	return nested.flat();
}
