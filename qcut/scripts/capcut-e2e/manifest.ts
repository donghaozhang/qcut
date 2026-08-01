import { stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	type SourceAudioToneEvidence,
	validateSourceAudioToneEvidence,
} from "./audio-tone-evidence.js";
import type { FontGlyphCoverageReport } from "./font-coverage-contract.js";
import type { ToolVersionReport } from "./runtime.js";
import { sha256File } from "./runtime.js";
import {
	CAPCUT_E2E_FIXTURE_SPEC,
	type CapCutE2eFixtureSpec,
	validateFixtureSpec,
} from "./spec.js";

interface FileIntegrityReport {
	bytes: number;
	sha256: string;
}

export interface CapCutE2eArtifactReport extends FileIntegrityReport {
	fileName: string;
}

export interface CapCutE2eFontFileReport extends FileIntegrityReport {
	path: string;
}

export interface CapCutE2eManifest {
	artifacts: CapCutE2eArtifactReport[];
	audioToneEvidence: SourceAudioToneEvidence;
	createdAt: string;
	ffmpeg: ToolVersionReport;
	ffprobe: ToolVersionReport & {
		sourceAudio: unknown;
		sourceVideo: unknown;
	};
	fontFiles: {
		ascii: CapCutE2eFontFileReport;
		cjk: CapCutE2eFontFileReport;
	};
	fontReports: {
		ascii: FontGlyphCoverageReport;
		cjk: FontGlyphCoverageReport;
	};
	runId: string;
	schemaVersion: 1;
	spec: CapCutE2eFixtureSpec;
	targetKey: string;
}

interface ParsedProbe {
	root: Record<string, unknown>;
	streams: Array<Record<string, unknown>>;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function requireNumber({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	const number = typeof value === "string" ? Number(value) : value;
	if (typeof number !== "number" || !Number.isFinite(number)) {
		throw new Error(`${label} must be a finite number.`);
	}
	return number;
}

function parseProbe({
	label,
	probe,
}: {
	label: string;
	probe: unknown;
}): ParsedProbe {
	const root = requireRecord({
		label: `FFprobe ${label} report`,
		value: probe,
	});
	if (!Array.isArray(root.streams)) {
		throw new Error(`FFprobe ${label} report is missing streams.`);
	}
	return {
		root,
		streams: root.streams.map((stream, index) =>
			requireRecord({
				label: `FFprobe ${label} stream ${index}`,
				value: stream,
			})
		),
	};
}

function validateProbeDuration({
	expectedDuration,
	label,
	root,
}: {
	expectedDuration: number;
	label: string;
	root: Record<string, unknown>;
}): void {
	if (root.format === undefined) {
		throw new Error(`FFprobe ${label} report is missing format metadata.`);
	}
	const format = requireRecord({
		label: `FFprobe ${label} format`,
		value: root.format,
	});
	const duration = requireNumber({
		label: `${label} duration`,
		value: format.duration,
	});
	if (Math.abs(duration - expectedDuration) > 0.02) {
		throw new Error(
			`${label} duration must be ${expectedDuration} seconds; received ${duration}.`
		);
	}
}

export function validateSourceVideoProbe({
	probe,
	spec,
}: {
	probe: unknown;
	spec: CapCutE2eFixtureSpec;
}): void {
	const { root, streams } = parseProbe({ label: "source-video", probe });
	const videoStreams = streams.filter(
		(stream) => stream.codec_type === "video"
	);
	const audioStreams = streams.filter(
		(stream) => stream.codec_type === "audio"
	);
	if (videoStreams.length !== 1 || audioStreams.length !== 0) {
		throw new Error(
			"Source video must contain exactly one video stream and no audio stream."
		);
	}
	const video = videoStreams[0];
	if (
		requireString({ label: "Video codec", value: video.codec_name }) !==
			"h264" ||
		requireNumber({ label: "Video width", value: video.width }) !==
			spec.width ||
		requireNumber({ label: "Video height", value: video.height }) !==
			spec.height ||
		requireString({ label: "Video pixel format", value: video.pix_fmt }) !==
			"yuv420p"
	) {
		throw new Error(
			"Source video does not match the H.264 yuv420p geometry profile."
		);
	}
	const frameRate = requireString({
		label: "Video frame rate",
		value: video.avg_frame_rate,
	});
	const [rawNumerator, rawDenominator] = frameRate.split("/");
	const numerator = Number(rawNumerator);
	const denominator = Number(rawDenominator);
	if (!denominator || numerator / denominator !== spec.fps) {
		throw new Error(`Source video frame rate must be ${spec.fps} fps.`);
	}
	validateProbeDuration({
		expectedDuration: spec.clipDurationSeconds * 2,
		label: "Source video",
		root,
	});
}

export function validateSourceAudioProbe({
	probe,
	spec,
}: {
	probe: unknown;
	spec: CapCutE2eFixtureSpec;
}): void {
	const { root, streams } = parseProbe({ label: "source-audio", probe });
	const videoStreams = streams.filter(
		(stream) => stream.codec_type === "video"
	);
	const audioStreams = streams.filter(
		(stream) => stream.codec_type === "audio"
	);
	if (audioStreams.length !== 1 || videoStreams.length !== 0) {
		throw new Error(
			"Source audio must contain exactly one audio stream and no video stream."
		);
	}
	const audio = audioStreams[0];
	if (
		requireString({ label: "Audio codec", value: audio.codec_name }) !==
			"pcm_s16le" ||
		requireString({ label: "Audio sample format", value: audio.sample_fmt }) !==
			"s16" ||
		requireNumber({ label: "Audio sample rate", value: audio.sample_rate }) !==
			spec.audio.sampleRateHz ||
		requireNumber({ label: "Audio channel count", value: audio.channels }) !==
			spec.audio.channels
	) {
		throw new Error(
			"Source audio does not match the mono 48 kHz PCM s16le profile."
		);
	}
	validateProbeDuration({
		expectedDuration: spec.clipDurationSeconds * 2,
		label: "Source audio",
		root,
	});
}

async function describeFileIntegrity({
	filePath,
}: {
	filePath: string;
}): Promise<FileIntegrityReport> {
	const [fileStats, sha256] = await Promise.all([
		stat(filePath),
		sha256File({ filePath }),
	]);
	if (!fileStats.isFile()) {
		throw new Error(`Integrity target is not a regular file: ${filePath}`);
	}
	return { bytes: fileStats.size, sha256 };
}

export async function describeArtifacts({
	filePaths,
}: {
	filePaths: string[];
}): Promise<CapCutE2eArtifactReport[]> {
	const reports = await Promise.all(
		filePaths.map(async (filePath) => ({
			...(await describeFileIntegrity({ filePath })),
			fileName: basename(filePath),
		}))
	);
	return reports.sort((left, right) =>
		left.fileName.localeCompare(right.fileName)
	);
}

export async function describeFontFiles({
	fontPaths,
}: {
	fontPaths: { ascii: string; cjk: string };
}): Promise<CapCutE2eManifest["fontFiles"]> {
	const [ascii, cjk] = await Promise.all([
		describeFileIntegrity({ filePath: fontPaths.ascii }),
		describeFileIntegrity({ filePath: fontPaths.cjk }),
	]);
	return {
		ascii: { ...ascii, path: fontPaths.ascii },
		cjk: { ...cjk, path: fontPaths.cjk },
	};
}

function validateIntegrityReport({
	label,
	report,
}: {
	label: string;
	report: FileIntegrityReport;
}): void {
	if (report.bytes <= 0 || !/^[a-f0-9]{64}$/.test(report.sha256)) {
		throw new Error(`${label} integrity evidence is invalid.`);
	}
}

export function validateManifest({
	manifest,
}: {
	manifest: CapCutE2eManifest;
}): void {
	if (manifest.schemaVersion !== 1) {
		throw new Error(
			`Unsupported CapCut E2E manifest ${manifest.schemaVersion}.`
		);
	}
	validateFixtureSpec({ spec: manifest.spec });
	if (!isDeepStrictEqual(manifest.spec, CAPCUT_E2E_FIXTURE_SPEC)) {
		throw new Error(
			"Manifest fixture spec must exactly match the locked CapCut E2E fixture spec."
		);
	}
	if (
		manifest.ffmpeg.version !== "8.1.2" ||
		manifest.ffprobe.version !== "8.1.2"
	) {
		throw new Error("Manifest tools must both be QCut's bundled FFmpeg 8.1.2.");
	}
	if (
		manifest.fontReports.ascii.missing.length > 0 ||
		manifest.fontReports.cjk.missing.length > 0
	) {
		throw new Error("Manifest font reports must not contain missing glyphs.");
	}
	if (
		manifest.fontFiles.ascii.path !== manifest.fontReports.ascii.fontPath ||
		manifest.fontFiles.cjk.path !== manifest.fontReports.cjk.fontPath
	) {
		throw new Error("Manifest font integrity paths must match coverage paths.");
	}
	validateIntegrityReport({
		label: "ASCII font",
		report: manifest.fontFiles.ascii,
	});
	validateIntegrityReport({
		label: "CJK font",
		report: manifest.fontFiles.cjk,
	});
	const fileNames = new Set(manifest.artifacts.map(({ fileName }) => fileName));
	if (fileNames.size !== manifest.artifacts.length) {
		throw new Error("Manifest artifact file names must be unique.");
	}
	const expectedArtifactNames = Object.values(manifest.spec.fileNames).filter(
		(fileName) => fileName !== manifest.spec.fileNames.manifest
	);
	if (manifest.artifacts.length !== expectedArtifactNames.length) {
		throw new Error(
			"Manifest artifact file set must exactly match the fixture spec."
		);
	}
	for (const expected of expectedArtifactNames) {
		if (!fileNames.has(expected)) {
			throw new Error(`Manifest is missing artifact ${expected}.`);
		}
	}
	for (const artifact of manifest.artifacts) {
		validateIntegrityReport({
			label: `Manifest artifact ${artifact.fileName}`,
			report: artifact,
		});
	}
	validateSourceVideoProbe({
		probe: manifest.ffprobe.sourceVideo,
		spec: manifest.spec,
	});
	validateSourceAudioProbe({
		probe: manifest.ffprobe.sourceAudio,
		spec: manifest.spec,
	});
	validateSourceAudioToneEvidence({
		evidence: manifest.audioToneEvidence,
		spec: manifest.spec,
	});
}

export async function writeManifest({
	manifest,
	manifestPath,
}: {
	manifest: CapCutE2eManifest;
	manifestPath: string;
}): Promise<void> {
	validateManifest({ manifest });
	await writeFile(
		manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`,
		"utf8"
	);
}
