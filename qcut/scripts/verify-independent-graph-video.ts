import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../electron/ffmpeg/paths.js";
import { mapWithConcurrency } from "../electron/lib/map-with-concurrency.js";
import { INDEPENDENT_GRAPH_PROFILES } from "../electron/qcut-independent-filter/graph-profiles.js";

const { values } = parseArgs({
	options: {
		source: { type: "string" },
		output: { type: "string" },
		ids: { type: "string" },
	},
});
if (!values.source || !values.output || !values.ids)
	throw new Error("--source, --output and explicit --ids are required.");
const source = resolve(values.source);
const output = resolve(values.output);
const ids = values.ids.split(",");
const profiles = INDEPENDENT_GRAPH_PROFILES.filter((profile) =>
	ids.includes(profile.resourceId)
);
if (new Set(ids).size !== ids.length || profiles.length !== ids.length)
	throw new Error("Unknown or repeated graph identity.");
await mkdir(output, { recursive: true });
const exec = promisify(execFile);
const ffmpeg = getFFmpegPath();
const ffprobe = await getFFprobePath();
const env = { ...process.env, QCUT_JIANYING_DISABLE_USER_CACHE: "1" };

interface Stream {
	codec_type: string;
	width?: number;
	height?: number;
	nb_read_frames?: string;
}
async function probe({ path }: { path: string }) {
	const { stdout } = await exec(
		ffprobe,
		["-v", "error", "-count_frames", "-show_streams", "-of", "json", path],
		{ timeout: 120_000 }
	);
	const report = JSON.parse(stdout) as { streams: Stream[] };
	const video = report.streams.find((stream) => stream.codec_type === "video");
	if (!video || !Number(video.nb_read_frames))
		throw new Error("No decoded video frames.");
	return {
		width: video.width,
		height: video.height,
		frames: Number(video.nb_read_frames),
		audio: report.streams.some((stream) => stream.codec_type === "audio"),
	};
}
const input = await probe({ path: source });
const started = Date.now();
const results = await mapWithConcurrency({
	items: profiles,
	limit: 1,
	task: async ({ item: profile }) => {
		const start = Date.now();
		const path = join(output, `${profile.resourceId}.mp4`);
		const args = [
			"electron/native-pipeline/cli/cli.ts",
			"filter-lab",
			"render-independent",
			"--resource-id",
			profile.resourceId,
			"--filter-version",
			profile.version,
			"-i",
			source,
			"--output",
			path,
			"--filter-intensity",
			"100",
			"--json",
		];
		try {
			const { stdout, stderr } = await exec(process.execPath, args, {
				env,
				timeout: 180_000,
				maxBuffer: 8 * 1024 * 1024,
			});
			await writeFile(`${path}.json`, stdout);
			await writeFile(`${path}.log`, stderr);
			const result = JSON.parse(stdout) as {
				status?: string;
				data?: {
					outputPath?: string;
					data?: { filter?: { backend?: string; resourceId?: string } };
				};
			};
			if (result.status !== "ok")
				throw new Error("CLI did not report success.");
			const filter = result.data?.data?.filter;
			if (
				result.data?.outputPath !== path ||
				filter?.backend !== "qcut-metal" ||
				filter?.resourceId !== profile.resourceId
			)
				throw new Error("CLI used an unexpected output, backend or filter.");
			const actual = await probe({ path });
			if (JSON.stringify(actual) !== JSON.stringify(input))
				throw new Error("Video dimensions, frames or audio changed.");
			await exec(
				ffmpeg,
				["-v", "error", "-xerror", "-i", path, "-f", "null", "-"],
				{ timeout: 120_000 }
			);
			const entry = {
				resourceId: profile.resourceId,
				title: profile.title,
				path,
				success: true,
				...actual,
				seconds: (Date.now() - start) / 1000,
				sha256: createHash("sha256")
					.update(await readFile(path))
					.digest("hex"),
			};
			console.log(JSON.stringify(entry));
			return entry;
		} catch (error) {
			const entry = {
				resourceId: profile.resourceId,
				title: profile.title,
				path,
				success: false,
				error: String(error),
				seconds: (Date.now() - start) / 1000,
			};
			console.error(JSON.stringify(entry));
			return entry;
		}
	},
});
await writeFile(
	join(output, "video-evidence.json"),
	JSON.stringify(
		{
			source,
			input,
			elapsedSeconds: (Date.now() - started) / 1000,
			sequential: true,
			results,
		},
		null,
		2
	)
);
if (results.some((result) => !result.success)) process.exitCode = 1;
