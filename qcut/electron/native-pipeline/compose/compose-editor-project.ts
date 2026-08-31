/**
 * Editor-project build step: turns a compose manifest into an
 * editor-applicable ComposePatch for a concrete project and snapshot.
 *
 * This module stays pure orchestration-input: it probes local sources,
 * compiles the manifest deterministically, and attaches the absolute local
 * paths the asset preparer needs. It never talks to the running editor —
 * that belongs to the CLI handler that owns the transaction.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { extname, resolve } from "node:path";
import {
	loadComposeManifest,
	type ComposeManifest,
} from "./compose-manifest.js";
import {
	compileComposeManifestToPatch,
	type ComposeManifestSourceInfo,
} from "./compose-manifest-to-patch.js";
import type {
	ComposePatch,
	ComposePatchOperation,
	ComposeSnapshot,
} from "./compose-protocol.js";
import { probeComposeMedia } from "./compose-resolver.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);

export type ComposeMediaProbeFn = typeof probeComposeMedia;

export interface ComposeEditorProjectBuild {
	manifest: ComposeManifest;
	manifestSha256: string;
	configDirectory: string;
	patch: ComposePatch;
	timelineDuration: number;
	warnings: string[];
}

function manifestSourceOf({
	operation,
}: {
	operation: ComposePatchOperation;
}): string | undefined {
	if (
		operation.kind !== "insert-media-clip" &&
		operation.kind !== "add-sound-effect" &&
		operation.kind !== "add-sticker"
	) {
		return;
	}
	const source = operation.asset.provenance?.manifestSource;
	return typeof source === "string" ? source : undefined;
}

async function probeManifestSources({
	manifest,
	configDirectory,
	probe,
	signal,
}: {
	manifest: ComposeManifest;
	configDirectory: string;
	probe: ComposeMediaProbeFn;
	signal: AbortSignal;
}): Promise<Record<string, ComposeManifestSourceInfo>> {
	const sources = new Set<string>([
		...manifest.clips.map((clip) => clip.source),
		...manifest.audio.map((audio) => audio.source),
	]);
	const entries = await Promise.all(
		[...sources].map(async (source) => {
			const absolutePath = resolve(configDirectory, source);
			if (IMAGE_EXTENSIONS.has(extname(source).toLowerCase())) {
				return [source, { mediaKind: "image" }] as const;
			}
			const probed = await probe({ filePath: absolutePath, signal });
			const info: ComposeManifestSourceInfo = {
				durationSeconds: probed.duration,
				mediaKind: probed.hasVideo ? "video" : "audio",
			};
			return [source, info] as const;
		})
	);
	return Object.fromEntries(entries);
}

function attachLocalPaths({
	patch,
	configDirectory,
}: {
	patch: ComposePatch;
	configDirectory: string;
}): ComposePatch {
	return {
		...patch,
		operations: patch.operations.map((operation) => {
			if (
				operation.kind !== "insert-media-clip" &&
				operation.kind !== "add-sound-effect"
			) {
				return operation;
			}
			const source = operation.asset.provenance?.manifestSource;
			if (typeof source !== "string") return operation;
			return {
				...operation,
				asset: {
					...operation.asset,
					localPath: resolve(configDirectory, source),
				},
			};
		}),
	};
}

function assertNoManifestOverlays({ patch }: { patch: ComposePatch }): void {
	const unsupported = patch.operations.filter(
		(operation) =>
			operation.kind === "add-sticker" &&
			manifestSourceOf({ operation }) !== undefined
	);
	if (unsupported.length > 0) {
		throw new Error(
			`Manifest file overlays are not supported by the editor target yet: ${unsupported
				.map((operation) => operation.id)
				.join(", ")}. Use Sticker Lab asset ids instead.`
		);
	}
}

export async function buildComposeEditorProjectPatch({
	configPath,
	projectId,
	snapshot,
	signal,
	createdAt,
	probe = probeComposeMedia,
}: {
	configPath: string;
	projectId: string;
	snapshot: ComposeSnapshot;
	signal: AbortSignal;
	createdAt?: string;
	probe?: ComposeMediaProbeFn;
}): Promise<ComposeEditorProjectBuild> {
	const loaded = await loadComposeManifest({ configPath });
	const manifestSha256 = createHash("sha256")
		.update(await fs.readFile(loaded.configPath))
		.digest("hex");
	const sources = await probeManifestSources({
		manifest: loaded.manifest,
		configDirectory: loaded.configDirectory,
		probe,
		signal,
	});
	const compiled = compileComposeManifestToPatch({
		manifest: loaded.manifest,
		manifestSha256,
		projectId,
		snapshot,
		sources,
		createdAt,
	});
	const patch = attachLocalPaths({
		patch: compiled.patch,
		configDirectory: loaded.configDirectory,
	});
	assertNoManifestOverlays({ patch });
	return {
		manifest: loaded.manifest,
		manifestSha256,
		configDirectory: loaded.configDirectory,
		patch,
		timelineDuration: compiled.timelineDuration,
		warnings: compiled.warnings,
	};
}
