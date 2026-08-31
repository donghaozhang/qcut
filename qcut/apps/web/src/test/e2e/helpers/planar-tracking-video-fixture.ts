import { execFile } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

export const PLANAR_FIXTURE_DURATION_SECONDS = 2;
export const PLANAR_FIXTURE_HEIGHT = 240;
export const PLANAR_FIXTURE_WIDTH = 320;

export interface PlanarTrackingWorkspace {
	documentsDirectory: string;
	profileDirectory: string;
	rootDirectory: string;
	videoPath: string;
}

function resolveFfmpegPath(): string {
	const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	const configuredPaths = [
		process.env.QCUT_FFMPEG_PATH,
		path.resolve(
			`electron/resources/ffmpeg/${process.platform}-${process.arch}/${binaryName}`
		),
		ffmpegStaticPath ?? undefined,
	];
	for (const candidate of configuredPaths) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
		const candidate = path.join(directory, binaryName);
		if (existsSync(candidate)) return candidate;
	}
	throw new Error("No executable FFmpeg was found for planar tracking E2E");
}

function createTexturePpm({
	height,
	width,
}: {
	height: number;
	width: number;
}) {
	const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
	const pixels = Buffer.alloc(width * height * 3);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const cellX = Math.floor(x / 8);
			const cellY = Math.floor(y / 8);
			const hash =
				((cellX * 73_856_093) ^ (cellY * 19_349_663) ^ 0x5bd1e995) >>> 0;
			const interior = 35 + (hash % 185);
			const border = x % 8 < 2 || y % 8 < 2;
			const value = border ? (interior > 127 ? 12 : 244) : interior;
			const offset = (y * width + x) * 3;
			pixels[offset] = value;
			pixels[offset + 1] = value;
			pixels[offset + 2] = value;
		}
	}
	return Buffer.concat([header, pixels]);
}

async function generateTrackingVideo({
	rootDirectory,
}: {
	rootDirectory: string;
}): Promise<string> {
	const ffmpegPath = resolveFfmpegPath();
	await access(ffmpegPath, fsConstants.X_OK);
	await execFileAsync(ffmpegPath, ["-version"]);
	const texturePath = path.join(rootDirectory, "planar-texture.ppm");
	const videoPath = path.join(rootDirectory, "planar-translation.mp4");
	await writeFile(texturePath, createTexturePpm({ height: 280, width: 400 }));
	await execFileAsync(ffmpegPath, [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-loop",
		"1",
		"-framerate",
		"12",
		"-i",
		texturePath,
		"-vf",
		"crop=320:240:x='16+20*t':y='16+10*t',format=yuv420p",
		"-t",
		String(PLANAR_FIXTURE_DURATION_SECONDS),
		"-c:v",
		"libx264",
		"-crf",
		"8",
		"-preset",
		"veryfast",
		"-movflags",
		"+faststart",
		videoPath,
	]);
	return videoPath;
}

export async function createPlanarTrackingWorkspace(): Promise<PlanarTrackingWorkspace> {
	const rootDirectory = await mkdtemp(
		path.join(tmpdir(), "qcut-planar-tracking-e2e-")
	);
	const documentsDirectory = path.join(rootDirectory, "Documents");
	const profileDirectory = path.join(rootDirectory, "profile");
	await Promise.all([
		mkdir(documentsDirectory, { recursive: true }),
		mkdir(profileDirectory, { recursive: true }),
	]);
	return {
		documentsDirectory,
		profileDirectory,
		rootDirectory,
		videoPath: await generateTrackingVideo({ rootDirectory }),
	};
}
