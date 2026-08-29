import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";

const BATCH_ID = "jianying-2026-08-26-batch-99";

interface FixtureAsset {
	byteSize: number;
	fileName: string;
	filePath: string;
	sha256: string;
}

interface FixtureRuntimeResource extends FixtureAsset {
	codec: "png" | "vp9";
	durationSeconds: number | null;
	frameCount: number;
	frameRate: number | null;
	height: number;
	mimeType: "image/png" | "video/webm";
	resourceName: string;
	width: number;
}

export interface StickerLabRuntimeFixtureCase {
	categoryId: string;
	displayName: string;
	kind: StickerRuntimeDescriptor["kind"];
	previewHeight: number;
	previewWidth: number;
	primaryFileName: string;
	resourceNames: string[];
	runtimeDescriptor: StickerRuntimeDescriptor;
	stickerId: string;
}

export interface OriginalStickerLabFixture {
	batchId: string;
	cases: {
		alphaVideo: StickerLabRuntimeFixtureCase;
		atlas: StickerLabRuntimeFixtureCase;
		directGif: StickerLabRuntimeFixtureCase;
		pngSequence: StickerLabRuntimeFixtureCase;
	};
	cleanupRoot: string;
	videosDirectory: string;
}

interface FixtureDefinition extends StickerLabRuntimeFixtureCase {
	categoryLabel: string;
	playbackFrameCount: number;
	playbackFrameRate: number;
	primary: FixtureAsset;
	primaryCodec: "gif" | "png";
	primaryDurationSeconds: number | null;
	primaryFrameCount: number;
	primaryFrameRate: number | null;
	primaryMimeType: "image/gif" | "image/png";
	resources: FixtureRuntimeResource[];
}

function runProcess({
	args,
	binaryPath,
}: {
	args: string[];
	binaryPath: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(binaryPath, args, {
			stdio: ["ignore", "ignore", "pipe"],
		});
		const stderr: Buffer[] = [];
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", reject);
		child.on("close", (exitCode) => {
			if (exitCode === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`Fixture generator exited with ${exitCode ?? -1}: ${Buffer.concat(stderr).toString("utf8")}`
				)
			);
		});
	});
}

async function resolveFixtureFfmpegPath(): Promise<string> {
	const ffmpegBinaryName =
		process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	return realpath(
		path.join(
			process.cwd(),
			"electron",
			"resources",
			"ffmpeg",
			`${process.platform}-${process.arch}`,
			ffmpegBinaryName
		)
	);
}

export async function createStickerLabExportBaseVideo({
	filePath,
}: {
	filePath: string;
}): Promise<void> {
	await runProcess({
		binaryPath: await resolveFixtureFfmpegPath(),
		args: [
			"-y",
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=c=black:s=360x640:r=30:d=5",
			"-f",
			"lavfi",
			"-i",
			"anullsrc=channel_layout=stereo:sample_rate=48000",
			"-t",
			"5",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-shortest",
			filePath,
		],
	});
}

async function inspectFixtureAsset({
	filePath,
}: {
	filePath: string;
}): Promise<FixtureAsset> {
	const bytes = await readFile(filePath);
	return {
		byteSize: bytes.byteLength,
		fileName: path.basename(filePath),
		filePath,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

function pngArgs({
	filter,
	outputPath,
}: {
	filter: string;
	outputPath: string;
}): string[] {
	return [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		filter,
		"-frames:v",
		"1",
		outputPath,
	];
}

function animatedItem({
	definition,
}: {
	definition: FixtureDefinition;
}): Record<string, unknown> {
	return {
		id: definition.stickerId,
		displayName: definition.displayName,
		fileName: definition.primary.fileName,
		filePath: definition.primary.filePath,
		mimeType: definition.primaryMimeType,
		sourceKind: definition.kind,
		playback: {
			kind: "animated",
			frameCount: definition.playbackFrameCount,
			frameRate: definition.playbackFrameRate,
			cycleDuration: 1,
			loop: true,
		},
		...(definition.resources.length > 0
			? {
					runtimePackage: {
						descriptor: definition.runtimeDescriptor,
						resources: definition.resources.map((resource) => ({
							resourceName: resource.resourceName,
							fileName: resource.fileName,
							filePath: resource.filePath,
							mimeType: resource.mimeType,
						})),
					},
				}
			: {}),
	};
}

function reportItem({
	definition,
}: {
	definition: FixtureDefinition;
}): Record<string, unknown> {
	return {
		categoryId: definition.categoryId,
		category: definition.categoryLabel,
		endpointRow: null,
		position: 0,
		id: definition.stickerId,
		title: definition.displayName,
		sourceKind: definition.kind,
		mimeType: definition.primaryMimeType,
		filePath: definition.primary.filePath,
		codec: definition.primaryCodec,
		width: definition.previewWidth,
		height: definition.previewHeight,
		frameCount: definition.primaryFrameCount,
		frameRate: definition.primaryFrameRate,
		durationSeconds: definition.primaryDurationSeconds,
		byteSize: definition.primary.byteSize,
		sha256: definition.primary.sha256,
		...(definition.resources.length > 0
			? {
					runtimeResources: definition.resources.map((resource) => ({
						resourceName: resource.resourceName,
						fileName: resource.fileName,
						filePath: resource.filePath,
						mimeType: resource.mimeType,
						codec: resource.codec,
						width: resource.width,
						height: resource.height,
						frameCount: resource.frameCount,
						frameRate: resource.frameRate,
						durationSeconds: resource.durationSeconds,
						byteSize: resource.byteSize,
						sha256: resource.sha256,
					})),
				}
			: {}),
	};
}

export async function createOriginalStickerLabFixture(): Promise<OriginalStickerLabFixture> {
	const ffmpegPath = await resolveFixtureFfmpegPath();
	const cleanupRoot = await realpath(
		await mkdtemp(path.join(tmpdir(), "qcut-sticker-lab-desktop-e2e-"))
	);
	const videosDirectory = path.join(cleanupRoot, "Videos");
	const batchRoot = path.join(videosDirectory, "QCut Sticker Lab", BATCH_ID);
	const assetDirectory = path.join(batchRoot, "assets");
	const runtimeDirectory = path.join(batchRoot, "runtime");
	await Promise.all([
		mkdir(assetDirectory, { recursive: true }),
		mkdir(runtimeDirectory, { recursive: true }),
	]);

	const paths = {
		alphaPreview: path.join(assetDirectory, "990004-alpha-preview.png"),
		alphaVideo: path.join(runtimeDirectory, "990004-side-by-side.webm"),
		atlasPreview: path.join(assetDirectory, "990002-atlas-preview.png"),
		atlasSheet: path.join(runtimeDirectory, "990002-atlas-sheet.png"),
		directGif: path.join(assetDirectory, "990001-direct.gif"),
		sequenceBlue: path.join(runtimeDirectory, "990003-blue.png"),
		sequencePreview: path.join(assetDirectory, "990003-sequence-preview.png"),
		sequenceRed: path.join(runtimeDirectory, "990003-red.png"),
	};

	await Promise.all([
		runProcess({
			binaryPath: ffmpegPath,
			args: [
				"-y",
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"lavfi",
				"-i",
				"color=c=0xE24A3B:s=64x64:r=10:d=0.2,drawbox=x=20:y=20:w=24:h=24:color=0xFFD166:t=fill",
				"-f",
				"lavfi",
				"-i",
				"color=c=0x3568D4:s=64x64:r=10:d=0.8,drawbox=x=20:y=20:w=24:h=24:color=0x70D6A8:t=fill",
				"-filter_complex",
				"[0:v][1:v]concat=n=2:v=1:a=0,mpdecimate,split[frames][palette-input];[palette-input]palettegen[palette];[frames][palette]paletteuse",
				"-loop",
				"0",
				"-final_delay",
				"80",
				paths.directGif,
			],
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: pngArgs({
				filter:
					"color=c=0xE24A3B:s=64x64:r=1:d=1,drawbox=x=22:y=22:w=20:h=20:color=white:t=fill",
				outputPath: paths.atlasPreview,
			}),
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: pngArgs({
				filter:
					"color=c=black:s=128x64:r=1:d=1,drawbox=x=0:y=0:w=64:h=64:color=0xE24A3B:t=fill,drawbox=x=20:y=20:w=24:h=24:color=0xFFD166:t=fill,drawbox=x=64:y=0:w=64:h=64:color=0x3568D4:t=fill,drawbox=x=84:y=20:w=24:h=24:color=0x70D6A8:t=fill",
				outputPath: paths.atlasSheet,
			}),
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: pngArgs({
				filter:
					"color=c=0xE24A3B:s=64x64:r=1:d=1,drawbox=x=24:y=8:w=16:h=48:color=0xFFD166:t=fill",
				outputPath: paths.sequencePreview,
			}),
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: pngArgs({
				filter:
					"color=c=0xE24A3B:s=64x64:r=1:d=1,drawbox=x=20:y=20:w=24:h=24:color=0xFFD166:t=fill",
				outputPath: paths.sequenceRed,
			}),
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: pngArgs({
				filter:
					"color=c=0x3568D4:s=64x64:r=1:d=1,drawbox=x=20:y=20:w=24:h=24:color=0x70D6A8:t=fill",
				outputPath: paths.sequenceBlue,
			}),
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: pngArgs({
				filter:
					"color=c=0xE24A3B:s=64x64:r=1:d=1,drawbox=x=8:y=8:w=16:h=16:color=0x59E1E6:t=fill",
				outputPath: paths.alphaPreview,
			}),
		}),
		runProcess({
			binaryPath: ffmpegPath,
			args: [
				"-y",
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"lavfi",
				"-i",
				"color=c=0xE24A3B:s=64x64:r=10:d=0.5,drawbox=x=20:y=20:w=24:h=24:color=0xFFD166:t=fill",
				"-f",
				"lavfi",
				"-i",
				"color=c=0x3568D4:s=64x64:r=10:d=0.5,drawbox=x=20:y=20:w=24:h=24:color=0x70D6A8:t=fill",
				"-filter_complex",
				"[0:v][1:v]concat=n=2:v=1:a=0[color];color=c=black:s=64x64:r=10:d=1,drawbox=x=0:y=0:w=64:h=32:color=white:t=fill[mask];[color][mask]hstack=inputs=2,format=yuv420p[output]",
				"-map",
				"[output]",
				"-an",
				"-c:v",
				"libvpx-vp9",
				"-lossless",
				"1",
				"-g",
				"1",
				"-deadline",
				"good",
				"-cpu-used",
				"4",
				"-t",
				"1",
				paths.alphaVideo,
			],
		}),
	]);

	const inspected = await Promise.all(
		Object.entries(paths).map(async ([name, filePath]) => [
			name,
			await inspectFixtureAsset({ filePath }),
		])
	);
	const assets = Object.fromEntries(inspected) as Record<
		keyof typeof paths,
		FixtureAsset
	>;
	const infiniteRepeat = { kind: "infinite" } as const;
	const atlasDescriptor: StickerRuntimeDescriptor = {
		kind: "atlas-animation",
		atlasSource: "atlas-sheet",
		atlasSize: { width: 128, height: 64 },
		cycleDurationSeconds: 1,
		frames: [
			{
				id: "red",
				startSeconds: 0,
				durationSeconds: 0.5,
				frameRect: { x: 0, y: 0, width: 64, height: 64 },
				rotated: false,
				trimmed: false,
				spriteSourceRect: { x: 0, y: 0, width: 64, height: 64 },
				sourceSize: { width: 64, height: 64 },
			},
			{
				id: "blue",
				startSeconds: 0.5,
				durationSeconds: 0.5,
				frameRect: { x: 64, y: 0, width: 64, height: 64 },
				rotated: false,
				trimmed: false,
				spriteSourceRect: { x: 0, y: 0, width: 64, height: 64 },
				sourceSize: { width: 64, height: 64 },
			},
		],
		repeat: infiniteRepeat,
		completion: "freeze-last",
	};
	const sequenceDescriptor: StickerRuntimeDescriptor = {
		kind: "png-sequence",
		cycleDurationSeconds: 1,
		frames: [
			{ source: "sequence-red", startSeconds: 0, durationSeconds: 0.5 },
			{
				source: "sequence-blue",
				startSeconds: 0.5,
				durationSeconds: 0.5,
			},
		],
		repeat: infiniteRepeat,
		completion: "freeze-last",
	};
	const alphaVideoDescriptor: StickerRuntimeDescriptor = {
		kind: "alpha-video",
		source: "alpha-video",
		sourceDurationSeconds: 1,
		cycleDurationSeconds: 1,
		layout: {
			kind: "side-by-side",
			colorRect: { x: 0, y: 0, width: 0.5, height: 1 },
			maskRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
			mask: { channel: "luma", inverted: false },
		},
		progressKeyframes: [
			{ atSeconds: 0, sourceProgress: 0, interpolation: "linear" },
			{ atSeconds: 1, sourceProgress: 1, interpolation: "hold" },
		],
		repeat: infiniteRepeat,
		completion: "freeze-last",
	};
	const directGifDescriptor: StickerRuntimeDescriptor = {
		kind: "direct-gif",
		canvasSize: { width: 64, height: 64 },
		cycleDurationSeconds: 1,
		frames: [
			{
				startSeconds: 0,
				durationSeconds: 0.2,
				delayCentiseconds: 20,
				disposalMethod: 1,
				frameRect: { x: 0, y: 0, width: 64, height: 64 },
				hasTransparency: false,
			},
			{
				startSeconds: 0.2,
				durationSeconds: 0.8,
				delayCentiseconds: 80,
				disposalMethod: 1,
				frameRect: { x: 0, y: 0, width: 64, height: 64 },
				hasTransparency: false,
			},
		],
		repeat: infiniteRepeat,
		completion: "freeze-last",
	};

	const definitions: FixtureDefinition[] = [
		{
			categoryId: "99001",
			categoryLabel: "QCut E2E Direct GIF",
			displayName: "QCut E2E Direct GIF Pulse",
			kind: "direct-gif",
			playbackFrameCount: 2,
			playbackFrameRate: 2,
			previewHeight: 64,
			previewWidth: 64,
			primary: assets.directGif,
			primaryCodec: "gif",
			primaryDurationSeconds: 1,
			primaryFileName: assets.directGif.fileName,
			primaryFrameCount: 2,
			primaryFrameRate: 2,
			primaryMimeType: "image/gif",
			resourceNames: [],
			resources: [],
			runtimeDescriptor: directGifDescriptor,
			stickerId: "990001",
		},
		{
			categoryId: "99002",
			categoryLabel: "QCut E2E Atlas",
			displayName: "QCut E2E Atlas Pulse",
			kind: "atlas-animation",
			playbackFrameCount: 2,
			playbackFrameRate: 2,
			previewHeight: 64,
			previewWidth: 64,
			primary: assets.atlasPreview,
			primaryCodec: "png",
			primaryDurationSeconds: null,
			primaryFileName: assets.atlasPreview.fileName,
			primaryFrameCount: 1,
			primaryFrameRate: null,
			primaryMimeType: "image/png",
			resourceNames: ["atlas-sheet"],
			resources: [
				{
					...assets.atlasSheet,
					codec: "png",
					durationSeconds: null,
					frameCount: 1,
					frameRate: null,
					height: 64,
					mimeType: "image/png",
					resourceName: "atlas-sheet",
					width: 128,
				},
			],
			runtimeDescriptor: atlasDescriptor,
			stickerId: "990002",
		},
		{
			categoryId: "99003",
			categoryLabel: "QCut E2E PNG Sequence",
			displayName: "QCut E2E PNG Sequence Pulse",
			kind: "png-sequence",
			playbackFrameCount: 2,
			playbackFrameRate: 2,
			previewHeight: 64,
			previewWidth: 64,
			primary: assets.sequencePreview,
			primaryCodec: "png",
			primaryDurationSeconds: null,
			primaryFileName: assets.sequencePreview.fileName,
			primaryFrameCount: 1,
			primaryFrameRate: null,
			primaryMimeType: "image/png",
			resourceNames: ["sequence-red", "sequence-blue"],
			resources: [
				{
					...assets.sequenceRed,
					codec: "png",
					durationSeconds: null,
					frameCount: 1,
					frameRate: null,
					height: 64,
					mimeType: "image/png",
					resourceName: "sequence-red",
					width: 64,
				},
				{
					...assets.sequenceBlue,
					codec: "png",
					durationSeconds: null,
					frameCount: 1,
					frameRate: null,
					height: 64,
					mimeType: "image/png",
					resourceName: "sequence-blue",
					width: 64,
				},
			],
			runtimeDescriptor: sequenceDescriptor,
			stickerId: "990003",
		},
		{
			categoryId: "99004",
			categoryLabel: "QCut E2E Alpha Video",
			displayName: "QCut E2E Alpha Video Pulse",
			kind: "alpha-video",
			playbackFrameCount: 10,
			playbackFrameRate: 10,
			previewHeight: 64,
			previewWidth: 64,
			primary: assets.alphaPreview,
			primaryCodec: "png",
			primaryDurationSeconds: null,
			primaryFileName: assets.alphaPreview.fileName,
			primaryFrameCount: 1,
			primaryFrameRate: null,
			primaryMimeType: "image/png",
			resourceNames: ["alpha-video"],
			resources: [
				{
					...assets.alphaVideo,
					codec: "vp9",
					durationSeconds: 1,
					frameCount: 10,
					frameRate: 10,
					height: 64,
					mimeType: "video/webm",
					resourceName: "alpha-video",
					width: 128,
				},
			],
			runtimeDescriptor: alphaVideoDescriptor,
			stickerId: "990004",
		},
	];

	const manifest = {
		version: 1,
		referenceOnly: true,
		categories: definitions.map((definition) => ({
			id: definition.categoryId,
			label: definition.categoryLabel,
			sourcePanel: "QCut deterministic authorized E2E fixture",
			items: [animatedItem({ definition })],
		})),
	};
	const report = {
		version: 2,
		referenceOnly: true,
		success: definitions.map((definition) => reportItem({ definition })),
	};
	await Promise.all([
		writeFile(path.join(batchRoot, "manifest.json"), JSON.stringify(manifest)),
		writeFile(path.join(batchRoot, "report.json"), JSON.stringify(report)),
	]);

	const byKind = new Map(
		definitions.map((definition) => [definition.kind, definition])
	);
	const fixtureCase = ({
		kind,
	}: {
		kind: StickerRuntimeDescriptor["kind"];
	}): StickerLabRuntimeFixtureCase => {
		const definition = byKind.get(kind);
		if (!definition) throw new Error(`Missing Sticker Lab fixture: ${kind}`);
		return {
			categoryId: definition.categoryId,
			displayName: definition.displayName,
			kind: definition.kind,
			previewHeight: definition.previewHeight,
			previewWidth: definition.previewWidth,
			primaryFileName: definition.primaryFileName,
			resourceNames: [...definition.resourceNames],
			runtimeDescriptor: definition.runtimeDescriptor,
			stickerId: definition.stickerId,
		};
	};

	return {
		batchId: BATCH_ID,
		cases: {
			alphaVideo: fixtureCase({ kind: "alpha-video" }),
			atlas: fixtureCase({ kind: "atlas-animation" }),
			directGif: fixtureCase({ kind: "direct-gif" }),
			pngSequence: fixtureCase({ kind: "png-sequence" }),
		},
		cleanupRoot,
		videosDirectory,
	};
}
