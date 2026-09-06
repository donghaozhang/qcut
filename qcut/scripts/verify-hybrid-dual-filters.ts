import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { HYBRID_DUAL_PROFILES } from "../electron/qcut-independent-filter/graph-profiles-dual.js";
import { loadIndependentGraph } from "../electron/qcut-independent-filter/graph-data.js";
import { createIndependentFilterSession } from "../electron/qcut-independent-filter/session.js";
import { createHybridNativeReference } from "./jianying-filter-parity/hybrid-reference.js";
import { inspectJianyingFilterLocalRuntime } from "../electron/jianying-filter-local-runtime/runtime-discovery.js";
import type { SkinMaskFrame } from "../electron/qcut-independent-filter/skin-mask-source.js";

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
await mkdir(output, { recursive: true });
const image = await loadImage(await readFile(values.source));
const { width, height } = image;
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
context.drawImage(image, 0, 0);
const rgba = new Uint8Array(context.getImageData(0, 0, width, height).data);
if (rgba.some((value, index) => index % 4 === 3 && value !== 255))
	throw new Error(
		"Native RGB oracle requires an opaque input; alpha is covered separately."
	);
const runtime = await inspectJianyingFilterLocalRuntime();
if (!runtime.status.offlineReady)
	throw new Error(
		"This verification requires the QCut private model and runtime snapshot."
	);
const selected = HYBRID_DUAL_PROFILES.filter(
	(profile) => !values.ids || values.ids.split(",").includes(profile.resourceId)
);
if (
	!selected.length ||
	values.ids
		?.split(",")
		.some((id) => !selected.some((p) => p.resourceId === id))
)
	throw new Error("Unknown hybrid filter IDs.");
const hash = ({ bytes }: { bytes: Uint8Array }) =>
	createHash("sha256").update(bytes).digest("hex");
const save = async ({ bytes, name }: { bytes: Uint8Array; name: string }) => {
	const pixels = context.createImageData(width, height);
	pixels.data.set(bytes);
	context.putImageData(pixels, 0, 0);
	await writeFile(join(output, name), canvas.toBuffer("image/png"));
};
const results: Array<Record<string, unknown>> = [];
const started = Date.now();
// A serialized frame sequence preserves the model's history for both renderers.
for (const profile of selected) {
	const begin = Date.now();
	let oracle:
		| Awaited<ReturnType<typeof createHybridNativeReference>>
		| undefined;
	let partialOracle: typeof oracle;
	let metal:
		| Awaited<ReturnType<typeof createIndependentFilterSession>>
		| undefined;
	try {
		const graph = await loadIndependentGraph({
			card: {
				...profile,
				available: true,
				cacheStatus: "cached",
				categories: [],
				implementation: "dual-lut",
				verification: "unverified",
				lutCount: 2,
			},
		});
		oracle = await createHybridNativeReference({
			profile,
			width,
			height,
			bootstrapRgba: rgba,
			runtime,
			intensity: 100,
		});
		if (profile.dualLut?.sharpen) {
			partialOracle = await createHybridNativeReference({
				profile,
				runtime,
				width,
				height,
				bootstrapRgba: rgba,
				intensity: 37,
			});
		}
		let currentMask: SkinMaskFrame | undefined;
		metal = await createIndependentFilterSession({
			graph,
			identity: profile,
			maskSource: {
				render: async () => {
					if (!currentMask) throw new Error("Oracle has not provided a mask.");
					return currentMask;
				},
				dispose: async () => {},
			},
		});
		const metrics = [];
		for (const frame of [0, 1, 2]) {
			const source = new Uint8Array(rgba);
			if (frame) {
				for (let y = 0; y < height; y++) {
					const row = rgba.subarray(y * width * 4, (y + 1) * width * 4);
					for (let x = 0; x < width; x++)
						source.set(
							row.subarray(
								Math.max(0, x - frame * 4) * 4,
								Math.max(0, x - frame * 4) * 4 + 4
							),
							(y * width + x) * 4
						);
				}
			}
			const expected = await oracle.render({
				rgba: source,
				timestampSeconds: frame / 30,
			});
			if (!expected.mask)
				throw new Error("Native oracle did not return a mask.");
			currentMask = expected.mask;
			for (const intensity of [0, 37, 100]) {
				const reference =
					intensity === 37 && partialOracle
						? await partialOracle.render({
								rgba: source,
								timestampSeconds: frame / 30,
							})
						: expected;
				if (!reference.mask) throw new Error("Missing reference mask.");
				currentMask = reference.mask;
				let maskMax = 0,
					maskSum = 0;
				for (const value of currentMask.bytes) {
					maskMax = Math.max(maskMax, value);
					maskSum += value;
				}
				if (!maskMax)
					throw new Error("Portrait verification received an empty skin mask.");
				const request = {
					...profile,
					width,
					height,
					rgba: source,
					intensity,
					timestampSeconds: frame / 30,
				};
				const actual = await metal.render(request);
				let sum = 0,
					max = 0,
					alphaMax = 0;
				for (let i = 0; i < source.length; i++) {
					const target =
						i % 4 === 3
							? source[i]
							: Math.round(
									intensity === 37 && partialOracle
										? reference.rgba[i]
										: source[i] +
												((reference.rgba[i] - source[i]) * intensity) / 100
								);
					const difference = Math.abs(target - actual.rgba[i]);
					if (i % 4 === 3) alphaMax = Math.max(alphaMax, difference);
					else {
						sum += difference;
						max = Math.max(max, difference);
					}
				}
				const mae = sum / (width * height * 3);
				const repeated = await metal.render(request);
				const repeatEqual =
					hash({ bytes: actual.rgba }) === hash({ bytes: repeated.rgba });
				const passed = mae <= 0.25 && max <= 4 && alphaMax === 0 && repeatEqual;
				metrics.push({
					frame,
					intensity,
					mae,
					max,
					alphaMax,
					repeatEqual,
					passed,
					maskMax,
					maskMean: maskSum / currentMask.bytes.length,
				});
				if (frame === 0 && intensity === 100) {
					await save({
						bytes: actual.rgba,
						name: `${profile.resourceId}-metal.png`,
					});
					await save({
						bytes: expected.rgba,
						name: `${profile.resourceId}-native.png`,
					});
					await writeFile(
						join(output, `${profile.resourceId}-mask.bin`),
						currentMask.bytes
					);
				}
			}
		}
		results.push({
			resourceId: profile.resourceId,
			title: profile.title,
			format: profile.dualLut!.format,
			intensityMode: oracle.intensityMode,
			passed: metrics.every((m) => m.passed),
			seconds: (Date.now() - begin) / 1000,
			metrics,
		});
	} catch (error) {
		results.push({
			resourceId: profile.resourceId,
			title: profile.title,
			passed: false,
			error: error instanceof Error ? error.message : String(error),
		});
	} finally {
		await Promise.allSettled([
			oracle?.dispose(),
			partialOracle?.dispose(),
			metal?.dispose(),
		]);
	}
	console.log(JSON.stringify(results.at(-1)));
	await writeFile(
		join(output, "parity.json"),
		JSON.stringify(
			{
				source: values.source,
				width,
				height,
				runtime: runtime.status,
				sharedNativeMask: true,
				seconds: (Date.now() - started) / 1000,
				results,
			},
			null,
			2
		)
	);
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
