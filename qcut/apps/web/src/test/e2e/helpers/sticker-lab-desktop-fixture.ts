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

const BATCH_ID = "jianying-2026-08-26-batch-99";
const CATEGORY_ID = "99001";
const STICKER_ID = "990001";

export interface OriginalGifLabFixture {
	batchId: string;
	categoryId: string;
	checksumSha256: string;
	cleanupRoot: string;
	stickerId: string;
	videosDirectory: string;
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

export async function createOriginalGifLabFixture(): Promise<OriginalGifLabFixture> {
	const ffmpegBinaryName =
		process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	const ffmpegPath = await realpath(
		path.join(
			process.cwd(),
			"electron",
			"resources",
			"ffmpeg",
			`${process.platform}-${process.arch}`,
			ffmpegBinaryName
		)
	);
	const cleanupRoot = await realpath(
		await mkdtemp(path.join(tmpdir(), "qcut-sticker-lab-desktop-e2e-"))
	);
	const videosDirectory = path.join(cleanupRoot, "Videos");
	const labRoot = path.join(videosDirectory, "QCut Sticker Lab");
	const batchRoot = path.join(labRoot, BATCH_ID);
	const assetDirectory = path.join(batchRoot, "assets");
	const assetPath = path.join(assetDirectory, `${STICKER_ID}.gif`);
	await mkdir(assetDirectory, { recursive: true });

	await runProcess({
		binaryPath: ffmpegPath,
		args: [
			"-y",
			"-hide_banner",
			"-loglevel",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=c=0xE24A3B:s=64x64:r=10:d=0.2,drawbox=x=8:y=8:w=20:h=20:color=0xFFD166:t=fill",
			"-f",
			"lavfi",
			"-i",
			"color=c=0x3568D4:s=64x64:r=10:d=0.8,drawbox=x=36:y=36:w=20:h=20:color=0x70D6A8:t=fill",
			"-filter_complex",
			"[0:v][1:v]concat=n=2:v=1:a=0,mpdecimate,split[frames][palette-input];[palette-input]palettegen[palette];[frames][palette]paletteuse",
			"-loop",
			"0",
			"-final_delay",
			"80",
			assetPath,
		],
	});

	const bytes = await readFile(assetPath);
	const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
	const manifest = {
		version: 1,
		referenceOnly: true,
		categories: [
			{
				id: CATEGORY_ID,
				label: "QCut E2E 原创动态",
				sourcePanel: "QCut deterministic test fixture",
				items: [
					{
						id: STICKER_ID,
						displayName: "QCut E2E Original Pulse",
						fileName: `${STICKER_ID}.gif`,
						filePath: assetPath,
						mimeType: "image/gif",
						sourceKind: "direct-gif",
						playback: {
							kind: "animated",
							frameCount: 2,
							cycleDuration: 1,
							loop: true,
						},
					},
				],
			},
		],
	};
	const report = {
		version: 2,
		referenceOnly: true,
		success: [
			{
				categoryId: CATEGORY_ID,
				category: "QCut E2E 原创动态",
				endpointRow: null,
				position: 0,
				id: STICKER_ID,
				title: "QCut E2E Original Pulse",
				sourceKind: "direct-gif",
				mimeType: "image/gif",
				filePath: assetPath,
				codec: "gif",
				width: 64,
				height: 64,
				frameCount: 2,
				frameRate: 2,
				durationSeconds: 1,
				byteSize: bytes.byteLength,
				sha256: checksumSha256,
			},
		],
	};
	await Promise.all([
		writeFile(path.join(batchRoot, "manifest.json"), JSON.stringify(manifest)),
		writeFile(path.join(batchRoot, "report.json"), JSON.stringify(report)),
	]);
	return {
		batchId: BATCH_ID,
		categoryId: CATEGORY_ID,
		checksumSha256,
		cleanupRoot,
		stickerId: STICKER_ID,
		videosDirectory,
	};
}
