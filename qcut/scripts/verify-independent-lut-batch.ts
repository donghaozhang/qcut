import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { createCanvas } from "@napi-rs/canvas";
import {
	listIndependentFilters,
	loadIndependentCube,
} from "../electron/qcut-independent-filter/lut-catalog.js";
import { createIndependentFilterSession } from "../electron/qcut-independent-filter/session.js";
import { sampleCube } from "../electron/native-pipeline/filters/filter-lab-lut.js";
import { exportCatalogDefault } from "../electron/native-pipeline/cli/cli-handlers-filter-lab-catalog.js";
import { mapWithConcurrency } from "../electron/lib/map-with-concurrency.js";
import { getFFmpegPath, getFFprobePath } from "../electron/ffmpeg/paths.js";

const { values } = parseArgs({
	options: {
		output: { type: "string" },
		limit: { type: "string" },
		source: { type: "string" },
		video: { type: "string" },
		"cli-only": { type: "boolean" },
	},
});
if (!values.output) throw new Error("--output evidence directory is required");
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const started = Date.now();
const catalog = await listIndependentFilters({
	exporter: exportCatalogDefault,
});
const cards = catalog.cards
	.filter((card) => card.resourceId !== "7160594413847203085")
	.slice(0, Number(values.limit) || undefined);
const width = 289,
	height = 17;
const rgba = new Uint8Array(width * height * 4);
for (let b = 0; b < 17; b++)
	for (let g = 0; g < 17; g++)
		for (let r = 0; r < 17; r++) {
			rgba.set(
				[
					Math.round((r / 16) * 255),
					Math.round((g / 16) * 255),
					Math.round((b / 16) * 255),
					255,
				],
				((b * 17 + g) * 17 + r) * 4
			);
		}
const results: Array<Record<string, unknown>> = [];
const hash = ({ data }: { data: Uint8Array }) =>
	createHash("sha256").update(data).digest("hex");
if (values["cli-only"])
	results.push(
		...JSON.parse(await readFile(join(output, "batch.json"), "utf8")).results
	);
else
	await mapWithConcurrency({
		items: cards,
		limit: 2,
		task: async ({ item: card, index }) => {
			const start = Date.now();
			let session:
				| Awaited<ReturnType<typeof createIndependentFilterSession>>
				| undefined;
			try {
				const cube = await loadIndependentCube({ card });
				const samplingCube = {
					...cube,
					values: Float64Array.from(cube.values),
				};
				session = await createIndependentFilterSession({
					cube,
					identity: { resourceId: card.resourceId, version: card.version! },
				});
				const request = {
					resourceId: card.resourceId,
					version: card.version!,
					rgba,
					width,
					height,
					intensity: 100,
				};
				const zero = await session.render({ ...request, intensity: 0 });
				if (hash({ data: zero.rgba }) !== hash({ data: rgba }))
					throw new Error("Zero intensity changed pixels");
				const metrics = [];
				for (const intensity of [37, 100]) {
					const result = await session.render({ ...request, intensity });
					let total = 0,
						maximum = 0;
					for (let offset = 0; offset < rgba.length; offset += 4) {
						const sampled = sampleCube({
							cube: samplingCube,
							red: rgba[offset] / 255,
							green: rgba[offset + 1] / 255,
							blue: rgba[offset + 2] / 255,
						});
						for (let channel = 0; channel < 3; channel++) {
							const original = rgba[offset + channel];
							const expected = Math.round(
								Math.min(
									255,
									Math.max(
										0,
										original +
											((sampled[channel] * 255 - original) * intensity) / 100
									)
								)
							);
							const difference = Math.abs(
								expected - result.rgba[offset + channel]
							);
							total += difference;
							maximum = Math.max(maximum, difference);
						}
						if (result.rgba[offset + 3] !== 255)
							throw new Error("Alpha changed");
					}
					const mae = total / (width * height * 3);
					metrics.push({
						intensity,
						mae,
						maximum,
						sha256: hash({ data: result.rgba }),
					});
					if (maximum > 1 || mae > 0.15)
						throw new Error(`Sampling mismatch ${mae}/${maximum}`);
					if (index < 20 && intensity === 100) {
						const canvas = createCanvas(width, height);
						const context = canvas.getContext("2d");
						const image = context.createImageData(width, height);
						image.data.set(result.rgba);
						context.putImageData(image, 0, 0);
						await writeFile(
							join(output, `${card.resourceId}-chart.png`),
							canvas.toBuffer("image/png")
						);
					}
				}
				results.push({
					resourceId: card.resourceId,
					version: card.version,
					title: card.title,
					categories: card.categories,
					size: cube.size,
					implementation: card.implementation,
					success: true,
					metrics,
					seconds: (Date.now() - start) / 1000,
				});
			} catch (error) {
				results.push({
					resourceId: card.resourceId,
					title: card.title,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
			} finally {
				await session?.dispose();
			}
			if (results.length % 20 === 0 || results.length === cards.length) {
				console.log(
					`${results.length}/${cards.length}: ${results.filter((result) => !result.success).length} failed`
				);
				await writeFile(
					join(output, "batch.json"),
					JSON.stringify(
						{
							catalogCount: catalog.count,
							tested: results.length,
							seconds: (Date.now() - started) / 1000,
							results,
						},
						null,
						2
					)
				);
			}
		},
	});

if (values.source) {
	const exec = promisify(execFile);
	const ffmpeg = getFFmpegPath();
	const ffprobe = await getFFprobePath();
	const successful = new Set(
		results
			.filter((result) => result.success)
			.map((result) => result.resourceId)
	);
	const categorySelections = new Map<string, (typeof cards)[number]>();
	for (const card of cards.filter((entry) =>
		successful.has(entry.resourceId)
	)) {
		for (const category of card.categories)
			if (!categorySelections.has(category))
				categorySelections.set(category, card);
	}
	const selected = [
		...new Map(
			[
				...categorySelections.values(),
				...cards.filter((entry) => successful.has(entry.resourceId)),
			].map((card) => [card.resourceId, card])
		).values(),
	].slice(0, 20);
	const runs: Array<{ success: boolean; [key: string]: unknown }> = [];
	await mapWithConcurrency({
		items: selected,
		limit: 2,
		task: async ({ item: card, index }) => {
			const inputs = [
				{ path: values.source!, extension: "png" },
				...(values.video && index < 4
					? [{ path: values.video, extension: "mp4" }]
					: []),
			];
			for (const input of inputs) {
				const filePath = join(output, `${card.resourceId}.${input.extension}`);
				const start = Date.now();
				try {
					const { stdout, stderr } = await exec(
						"qcut",
						[
							"filter-lab",
							"render-independent",
							"--resource-id",
							card.resourceId,
							"--filter-version",
							card.version!,
							"-i",
							input.path,
							"--output",
							filePath,
							"--json",
							"--force",
						],
						{ timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }
					);
					const response = JSON.parse(stdout);
					if (
						response.status !== "ok" ||
						response.data?.outputPath !== filePath
					)
						throw new Error("Unexpected CLI response envelope");
					const file = await stat(filePath);
					if (file.size < 1000) throw new Error("Output is empty or truncated");
					const { stdout: probe } = await exec(
						ffprobe,
						[
							"-v",
							"error",
							"-count_frames",
							"-show_streams",
							"-of",
							"json",
							filePath,
						],
						{ timeout: 30_000 }
					);
					const streams = JSON.parse(probe).streams as Array<{
						codec_type: string;
						width?: number;
						height?: number;
						nb_read_frames?: string;
					}>;
					const video = streams.find((stream) => stream.codec_type === "video");
					if (video?.width !== 1280 || video.height !== 720)
						throw new Error("Unexpected output dimensions");
					if (
						input.extension === "mp4" &&
						(video.nb_read_frames !== "30" ||
							!streams.some((stream) => stream.codec_type === "audio"))
					)
						throw new Error("Video frame count or audio missing");
					const { stdout: frames } = await exec(
						ffmpeg,
						[
							"-v",
							"error",
							"-i",
							filePath,
							"-map",
							"0:v:0",
							"-f",
							"framemd5",
							"-",
						],
						{ timeout: 30_000 }
					);
					await writeFile(`${filePath}.framemd5`, frames);
					await writeFile(`${filePath}.json`, stdout);
					await writeFile(`${filePath}.log`, stderr);
					runs.push({
						resourceId: card.resourceId,
						title: card.title,
						filePath,
						success: true,
						streams,
						bytes: file.size,
						seconds: (Date.now() - start) / 1000,
					});
				} catch (error) {
					runs.push({
						resourceId: card.resourceId,
						filePath,
						success: false,
						error: String(error),
					});
				}
			}
		},
	});
	await writeFile(join(output, "cli-runs.json"), JSON.stringify(runs, null, 2));
	console.log(`CLI runs: ${runs.length}`);
	if (runs.some((run) => !run.success)) process.exitCode = 1;
}
if (results.some((result) => !result.success)) process.exitCode = 1;
