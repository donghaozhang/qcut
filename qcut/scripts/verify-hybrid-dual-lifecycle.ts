import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { HYBRID_DUAL_PROFILES } from "../electron/qcut-independent-filter/graph-profiles-dual.js";
import {
	independentGraphPackageRoot,
	loadIndependentGraph,
} from "../electron/qcut-independent-filter/graph-data.js";
import { createIndependentFilterSession } from "../electron/qcut-independent-filter/session.js";
import { createJianyingFilterLocalRenderSession } from "../electron/jianying-filter-local-runtime/render.js";
import { inspectJianyingFilterLocalRuntime } from "../electron/jianying-filter-local-runtime/runtime-discovery.js";

const { values } = parseArgs({
	options: {
		source: { type: "string" },
		output: { type: "string" },
		ids: { type: "string" },
	},
});
if (!values.source || !values.output || !values.ids)
	throw new Error("--source, --output, --ids required.");
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const image = await loadImage(await readFile(values.source));
const { width, height } = image;
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
context.drawImage(image, 0, 0);
const portrait = new Uint8Array(context.getImageData(0, 0, width, height).data);
const gray = Uint8Array.from(portrait, (_, i) => (i % 4 === 3 ? 255 : 128));
const frames = [
	{ key: "portrait", time: 1, rgba: portrait },
	{ key: "portrait", time: 1 + 1 / 30, rgba: portrait },
	{ key: "gray", time: 2, rgba: gray },
	{ key: "portrait", time: 1, rgba: portrait },
];
const selected = HYBRID_DUAL_PROFILES.filter((p) =>
	values.ids!.split(",").includes(p.resourceId)
);
if (selected.length !== new Set(values.ids.split(",")).size)
	throw new Error("Unknown profile.");
const runtime = await inspectJianyingFilterLocalRuntime();
if (!runtime.status.offlineReady)
	throw new Error("Expected private offline runtime.");
const hash = ({ bytes }: { bytes: Uint8Array }) =>
	createHash("sha256").update(bytes).digest("hex");
const results = [];
const started = Date.now();
for (const profile of selected) {
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
	const session = await createIndependentFilterSession({
		graph,
		identity: profile,
	});
	let oracle:
		| Awaited<ReturnType<typeof createJianyingFilterLocalRenderSession>>
		| undefined;
	let previousKey = "";
	const metrics = [];
	try {
		for (const frame of frames) {
			if (previousKey !== frame.key) {
				await oracle?.dispose();
				oracle = await createJianyingFilterLocalRenderSession({
					resourceId: profile.resourceId,
					packagePath: await independentGraphPackageRoot({ profile }),
					width,
					height,
					bootstrapRgba: frame.rgba,
					runtime,
					mode: "portrait",
				});
			}
			previousKey = frame.key;
			const expected = await oracle!.render({
				rgba: frame.rgba,
				timestampSeconds: frame.time,
			});
			const actual = await session.render({
				...profile,
				width,
				height,
				rgba: frame.rgba,
				intensity: 100,
				timestampSeconds: frame.time,
				sourceKey: frame.key,
			});
			let sum = 0,
				max = 0;
			for (let i = 0; i < actual.rgba.length; i++) {
				if (i % 4 === 3) continue;
				const difference = Math.abs(expected.rgba[i] - actual.rgba[i]);
				sum += difference;
				max = Math.max(max, difference);
			}
			const mae = sum / (width * height * 3);
			metrics.push({
				key: frame.key,
				time: frame.time,
				mae,
				max,
				sha256: hash({ bytes: actual.rgba }),
				maskProvider: actual.maskProvider,
				passed:
					mae <= 0.25 &&
					max <= 4 &&
					actual.maskProvider === "jianying-local-skin-v1",
			});
		}
		const resetEqual = metrics[0].sha256 === metrics[3].sha256;
		results.push({
			resourceId: profile.resourceId,
			title: profile.title,
			resetEqual,
			passed: resetEqual && metrics.every((m) => m.passed),
			metrics,
		});
	} finally {
		await Promise.allSettled([session.dispose(), oracle?.dispose()]);
	}
}
const result = {
	source: values.source,
	modelReplacement: false,
	sharedMask: false,
	seconds: (Date.now() - started) / 1000,
	results,
};
await writeFile(
	join(output, "lifecycle.json"),
	JSON.stringify(result, null, 2)
);
console.log(JSON.stringify(result));
if (results.some((r) => !r.passed)) process.exitCode = 1;
