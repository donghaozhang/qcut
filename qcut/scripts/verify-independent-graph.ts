import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { loadImage } from "@napi-rs/canvas";
import { getFFmpegPath } from "../electron/ffmpeg/paths.js";
import { INDEPENDENT_GRAPH_PROFILES } from "../electron/qcut-independent-filter/graph-profiles.js";
import {
	loadIndependentGraph,
	independentGraphPackageRoot,
} from "../electron/qcut-independent-filter/graph-data.js";
import { createIndependentFilterSession } from "../electron/qcut-independent-filter/session.js";
import { inspectJianyingFilterLocalRuntime } from "../electron/jianying-filter-local-runtime/runtime-discovery.js";
import { createJianyingFilterSwingRenderSession } from "../electron/jianying-filter-swing-runtime/render.js";
import { createJianyingFilterLocalRenderSession } from "../electron/jianying-filter-local-runtime/render.js";

const { values } = parseArgs({
	options: {
		source: { type: "string" },
		output: { type: "string" },
		ids: { type: "string" },
	},
});
if (!values.source || !values.output)
	throw new Error("--source and --output are required.");
const output = resolve(values.output);
const source = resolve(values.source);
await mkdir(output, { recursive: true });
const ffmpeg = getFFmpegPath();
const exec = promisify(execFile);
const image = await loadImage(await readFile(source));
const { width, height } = image;
const decode = async ({ path }: { path: string }) =>
	(
		await exec(
			ffmpeg,
			[
				"-v",
				"error",
				"-i",
				path,
				"-frames:v",
				"1",
				"-f",
				"rawvideo",
				"-pix_fmt",
				"rgba",
				"-",
			],
			{ encoding: "buffer", maxBuffer: 40 * 1024 * 1024 }
		)
	).stdout;
const input = new Uint8Array(await decode({ path: source }));
const runtime = await inspectJianyingFilterLocalRuntime();
const encode = async ({ rgba, path }: { rgba: Uint8Array; path: string }) => {
	const raw = `${path}.rgba`;
	await writeFile(raw, rgba);
	await exec(ffmpeg, [
		"-v",
		"error",
		"-y",
		"-f",
		"rawvideo",
		"-pixel_format",
		"rgba",
		"-video_size",
		`${width}x${height}`,
		"-i",
		raw,
		"-frames:v",
		"1",
		path,
	]);
};
const hash = ({ bytes }: { bytes: Uint8Array }) =>
	createHash("sha256").update(bytes).digest("hex");
const results: Array<Record<string, unknown>> = [];
const started = Date.now();
const selected = INDEPENDENT_GRAPH_PROFILES.filter(
	(profile) => !values.ids || values.ids.split(",").includes(profile.resourceId)
);
if (
	!selected.length ||
	values.ids
		?.split(",")
		.some((id) => !selected.some((profile) => profile.resourceId === id))
)
	throw new Error("--ids includes an unknown independent graph.");
for (const profile of selected) {
	let session:
		| Awaited<ReturnType<typeof createIndependentFilterSession>>
		| undefined;
	const start = Date.now();
	try {
		const graph = await loadIndependentGraph({
			card: {
				...profile,
				available: true,
				cacheStatus: "cached",
				categories: [],
				implementation: "shader",
				verification: "unverified",
				lutCount: 0,
			},
		});
		session = await createIndependentFilterSession({
			graph,
			identity: profile,
		});
		const base = { ...profile, rgba: input, width, height, intensity: 0 };
		const zero = await session.render(base);
		if (hash({ bytes: zero.rgba }) !== hash({ bytes: input }))
			throw new Error("Zero intensity changed pixels.");
		const metrics = [];
		for (const intensity of [37, 100]) {
			const actual = await session.render({ ...base, intensity });
			const ownPath = join(
				output,
				`${profile.resourceId}-${intensity}-metal.png`
			);
			await encode({ rgba: actual.rgba, path: ownPath });
			const reference = join(
				output,
				`${profile.resourceId}-${intensity}-native.png`
			);
			// Direct Swing avoids the old CLI's structural FFmpeg fallback.
			const oracleOptions = {
				resourceId: profile.resourceId,
				packagePath: await independentGraphPackageRoot({ profile }),
				width,
				height,
				runtime,
				intensity,
			};
			// This package needs its verified bootstrap; Swing ignores its intensity event.
			const bootstrap = profile.resourceId === "7647099764940557618";
			const oracle = bootstrap
				? await createJianyingFilterLocalRenderSession({
						...oracleOptions,
						bootstrapRgba: input,
						mode: "multi-pass",
					})
				: await createJianyingFilterSwingRenderSession(oracleOptions);
			let expected: Uint8Array;
			try {
				if (!oracle.processId)
					throw new Error("Oracle returned a passthrough session.");
				expected = (await oracle.render({ rgba: input })).rgba;
				await encode({ rgba: expected, path: reference });
			} finally {
				await oracle.dispose();
			}
			if (expected.length !== actual.rgba.length)
				throw new Error("Reference dimensions differ.");
			let sum = 0,
				squares = 0,
				max = 0,
				changed = 0,
				alphaMax = 0;
			for (let offset = 0; offset < expected.length; offset++) {
				const difference = Math.abs(expected[offset] - actual.rgba[offset]);
				if (offset % 4 === 3) {
					alphaMax = Math.max(alphaMax, difference);
					continue;
				}
				sum += difference;
				squares += difference * difference;
				max = Math.max(max, difference);
				if (difference) changed++;
			}
			const mae = sum / (width * height * 3);
			const rmse = Math.sqrt(squares / (width * height * 3));
			metrics.push({
				intensity,
				oracle: bootstrap
					? "jianying-native-cgl-bootstrap"
					: "jianying-native-swing-effect",
				mae,
				rmse,
				max,
				changed,
				alphaMax,
				ownPath,
				reference,
				rgbaSha256: hash({ bytes: actual.rgba }),
			});
		}
		const repeated = await session.render({ ...base, intensity: 100 });
		if (hash({ bytes: repeated.rgba }) !== metrics[1].rgbaSha256)
			throw new Error("Repeated frame changed.");
		const success = metrics.every(
			(metric) => metric.mae <= 0.25 && metric.max <= 4 && metric.alphaMax === 0
		);
		results.push({
			...profile,
			success,
			zeroEqual: true,
			repeatEqual: true,
			metrics,
			seconds: (Date.now() - start) / 1000,
		});
	} catch (error) {
		results.push({
			...profile,
			success: false,
			error: String(error),
			seconds: (Date.now() - start) / 1000,
		});
	} finally {
		await session?.dispose();
	}
	console.log(JSON.stringify(results.at(-1)));
	await writeFile(
		join(output, "graph-parity.json"),
		JSON.stringify(
			{
				source,
				width,
				height,
				tested: results.length,
				gate: {
					maxRgbMae: 0.25,
					maxChannelDifference: 4,
					maxAlphaDifference: 0,
					zeroEqual: true,
					repeatEqual: true,
				},
				elapsedSeconds: (Date.now() - started) / 1000,
				results,
			},
			null,
			2
		)
	);
}
if (results.some((result) => !result.success)) process.exitCode = 1;
