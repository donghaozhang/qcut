import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { loadImage } from "@napi-rs/canvas";
import { resolveIndependentFilterHost } from "../electron/qcut-independent-filter/bridge.js";
import { resolveIndependentFogLut } from "../electron/qcut-independent-filter/assets.js";
import {
	createIndependentFilterSession,
	createIndependentFrameRequest,
} from "../electron/qcut-independent-filter/session.js";
import { QCUT_FOG_RESOURCE } from "../electron/qcut-independent-filter/contract.js";
import { getFFmpegPath, getFFprobePath } from "../electron/ffmpeg/paths.js";

const exec = promisify(execFile);
const { values } = parseArgs({
	options: {
		source: { type: "string" },
		reference: { type: "string" },
		output: { type: "string" },
	},
});
if (!values.source || !values.reference || !values.output)
	throw new Error(
		"--source PNG --reference PNG --output directory are required"
	);
const directory = resolve(values.output);
await mkdir(directory, { recursive: true });
const ffmpeg = getFFmpegPath();
const ffprobe = await getFFprobePath();
const source = resolve(values.source);
const reference = resolve(values.reference);
const hash = ({ bytes }: { bytes: Uint8Array }) =>
	createHash("sha256").update(bytes).digest("hex");
async function pixels({ filePath }: { filePath: string }) {
	const image = await loadImage(await readFile(filePath));
	// Match the CLI decoder; canvas may apply the source PNG's embedded profile.
	const { stdout } = await exec(
		ffmpeg,
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 40 * 1024 * 1024 }
	);
	return {
		width: image.width,
		height: image.height,
		rgba: new Uint8Array(stdout),
	};
}
async function cli({
	input,
	output,
	intensity,
	native = false,
}: {
	input: string;
	output: string;
	intensity: number;
	native?: boolean;
}) {
	const started = performance.now();
	const { stdout, stderr } = await exec(
		process.execPath,
		[
			"electron/native-pipeline/cli/cli.ts",
			"filter-lab",
			native ? "render" : "render-independent",
			"--resource-id",
			QCUT_FOG_RESOURCE,
			"-i",
			input,
			"--output",
			output,
			"--filter-intensity",
			String(intensity),
			"--json",
			"--force",
		],
		{ timeout: 180_000, maxBuffer: 8 * 1024 * 1024 }
	);
	await writeFile(`${output}.cli.json`, stdout);
	await writeFile(`${output}.stderr.log`, stderr);
	return {
		seconds: (performance.now() - started) / 1000,
		result: JSON.parse(stdout) as unknown,
	};
}
const results: unknown[] = [];
const input = await pixels({ filePath: source });
const session = await createIndependentFilterSession({
	lutPath: await resolveIndependentFogLut(),
});
try {
	// Sequential probes exercise intensity changes on the same persistent host.
	await [0, 50, 100].reduce(async (previous, intensity) => {
		await previous;
		const output = join(directory, `cli-fog-${intensity}.png`);
		const cliResult = await cli({ input: source, output, intensity });
		const actual = await pixels({ filePath: output });
		const direct = await session.render(
			createIndependentFrameRequest({ ...input, intensity })
		);
		if (hash({ bytes: actual.rgba }) !== hash({ bytes: direct.rgba }))
			throw new Error(`CLI and direct Metal differ at ${intensity}`);
		if (
			intensity === 0 &&
			hash({ bytes: actual.rgba }) !== hash({ bytes: input.rgba })
		)
			throw new Error("Intensity zero changed source");
		if (
			intensity === 100 &&
			hash({ bytes: actual.rgba }) !==
				hash({ bytes: (await pixels({ filePath: reference })).rgba })
		)
			throw new Error("Saved Jianying UI reference differs");
		results.push({
			intensity,
			...cliResult,
			rgbaSha256: hash({ bytes: actual.rgba }),
			directEqual: true,
			uiEqual: intensity === 100 ? true : undefined,
		});
	}, Promise.resolve());
	const tiny = new Uint8Array([
		11, 42, 99, 0, 120, 75, 98, 128, 9, 128, 255, 255,
	]);
	const identity = await session.render(
		createIndependentFrameRequest({
			rgba: tiny,
			width: 3,
			height: 1,
			intensity: 0,
		})
	);
	if (hash({ bytes: tiny }) !== hash({ bytes: identity.rgba }))
		throw new Error("Transparent identity / dimension switch failed");
	const again = await session.render(
		createIndependentFrameRequest({ ...input, intensity: 100 })
	);
	if (
		hash({ bytes: again.rgba }) !==
		hash({ bytes: (await pixels({ filePath: reference })).rgba })
	)
		throw new Error("A-B-A frame state leaked");
} finally {
	await session.dispose();
}
const video = join(directory, "source-moving.mp4");
await exec(
	ffmpeg,
	[
		"-v",
		"error",
		"-y",
		"-loop",
		"1",
		"-framerate",
		"30",
		"-i",
		source,
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:sample_rate=48000",
		"-vf",
		"pad=iw+60:ih+30,crop=1280:720:x='min(n*2,60)':y='min(n,30)'",
		"-t",
		"1",
		"-c:v",
		"libx264",
		"-crf",
		"12",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		video,
	],
	{ timeout: 60_000 }
);
const ownVideo = join(directory, "qcut-metal-video.mp4");
const oldVideo = join(directory, "jianying-native-video.mp4");
results.push({
	video: "independent",
	...(await cli({ input: video, output: ownVideo, intensity: 100 })),
});
results.push({
	video: "existing-native",
	...(await cli({
		input: video,
		output: oldVideo,
		intensity: 100,
		native: true,
	})),
});
const decoded = await Promise.all(
	[ownVideo, oldVideo].map(async (filePath) => {
		const { stdout } = await exec(
			ffmpeg,
			[
				"-v",
				"error",
				"-i",
				filePath,
				"-an",
				"-pix_fmt",
				"rgba",
				"-f",
				"rawvideo",
				"-",
			],
			{ encoding: "buffer", maxBuffer: 150 * 1024 * 1024 }
		);
		return { hash: hash({ bytes: stdout }), bytes: stdout.length };
	})
);
if (decoded[0].hash !== decoded[1].hash)
	throw new Error("Independent/native video frames differ");
const { stdout: probe } = await exec(ffprobe, [
	"-v",
	"error",
	"-count_frames",
	"-show_streams",
	"-of",
	"json",
	ownVideo,
]);
const host = await resolveIndependentFilterHost();
const { stdout: libraries } = await exec("otool", ["-L", host]);
const evidence = {
	source,
	reference,
	results,
	video: {
		...decoded[0],
		nativeEqual: true,
		probe: JSON.parse(probe) as unknown,
	},
	host,
	libraries,
	sourceSwitchIdentity: true,
};
await writeFile(
	join(directory, "verification.json"),
	JSON.stringify(evidence, null, 2)
);
console.log(
	JSON.stringify(
		{ status: "passed", directory, videoEqual: true, results: results.length },
		null,
		2
	)
);
