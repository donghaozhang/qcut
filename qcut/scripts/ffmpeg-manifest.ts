import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type FFmpegTool = "ffmpeg" | "ffprobe";

export interface FFmpegArtifact {
	id: string;
	url: string;
	sha256: string;
	archiveFormat: "zip" | "tar.xz";
	files: Partial<Record<FFmpegTool, string>>;
}

export interface FFmpegTarget {
	platform: string;
	arch: string;
	versionToken: string;
	hardwareAccelerators: string[];
	artifacts: FFmpegArtifact[];
}

export interface FFmpegManifest {
	schemaVersion: number;
	nativeVersion: string;
	requiredBuildFlags: string[];
	forbiddenBuildFlags: string[];
	wasm: {
		packageVersion: string;
		nativeVersion: string;
		policy: string;
	};
	targets: Record<string, FFmpegTarget>;
}

const MANIFEST_PATH = join(process.cwd(), "scripts", "ffmpeg-binaries.json");

function assertSha256({
	value,
	label,
}: {
	value: string;
	label: string;
}): void {
	if (!/^[a-f0-9]{64}$/.test(value)) {
		throw new Error(`${label} must be a lowercase SHA256 digest`);
	}
}

function assertTarget({
	key,
	target,
}: {
	key: string;
	target: FFmpegTarget;
}): void {
	if (`${target.platform}-${target.arch}` !== key) {
		throw new Error(`FFmpeg target key does not match platform/arch: ${key}`);
	}
	if (!target.versionToken || target.artifacts.length === 0) {
		throw new Error(`FFmpeg target is incomplete: ${key}`);
	}

	const providedTools = new Set<FFmpegTool>();
	for (const artifact of target.artifacts) {
		assertSha256({ value: artifact.sha256, label: artifact.id });
		if (!artifact.url.startsWith("https://")) {
			throw new Error(`FFmpeg artifact must use HTTPS: ${artifact.id}`);
		}
		for (const tool of Object.keys(artifact.files) as FFmpegTool[]) {
			providedTools.add(tool);
		}
	}

	for (const tool of ["ffmpeg", "ffprobe"] as const) {
		if (!providedTools.has(tool)) {
			throw new Error(`FFmpeg target ${key} does not provide ${tool}`);
		}
	}
}

export async function loadFFmpegManifest(): Promise<FFmpegManifest> {
	const raw = await readFile(MANIFEST_PATH, "utf8");
	const manifest = JSON.parse(raw) as FFmpegManifest;
	if (manifest.schemaVersion !== 1 || !manifest.nativeVersion) {
		throw new Error("Unsupported or incomplete FFmpeg manifest");
	}
	if (manifest.requiredBuildFlags.length === 0) {
		throw new Error("FFmpeg manifest must declare required build flags");
	}
	if (manifest.forbiddenBuildFlags.length === 0) {
		throw new Error("FFmpeg manifest must declare forbidden build flags");
	}
	for (const [key, target] of Object.entries(manifest.targets)) {
		assertTarget({ key, target });
	}
	return manifest;
}

export function getTargetKeys({
	manifest,
}: {
	manifest: FFmpegManifest;
}): string[] {
	return Object.keys(manifest.targets);
}

export function getBinaryName({
	target,
	tool,
}: {
	target: FFmpegTarget;
	tool: FFmpegTool;
}): string {
	return target.platform === "win32" ? `${tool}.exe` : tool;
}

export function manifestFingerprint({
	target,
	requiredBuildFlags,
	forbiddenBuildFlags,
}: {
	target: FFmpegTarget;
	requiredBuildFlags: string[];
	forbiddenBuildFlags: string[];
}): string {
	return createHash("sha256")
		.update(JSON.stringify({ target, requiredBuildFlags, forbiddenBuildFlags }))
		.digest("hex");
}
