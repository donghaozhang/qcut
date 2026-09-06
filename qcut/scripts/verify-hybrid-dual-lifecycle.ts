import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { HYBRID_DUAL_PROFILES } from "../electron/qcut-independent-filter/graph-profiles-dual.js";
import { loadIndependentGraph } from "../electron/qcut-independent-filter/graph-data.js";
import { createIndependentFilterSession } from "../electron/qcut-independent-filter/session.js";
import { createHybridNativeReference } from "./jianying-filter-parity/hybrid-reference.js";
import { loadHybridMotionFixture } from "./jianying-filter-parity/hybrid-motion-fixture.js";
import { inspectJianyingFilterLocalRuntime } from "../electron/jianying-filter-local-runtime/runtime-discovery.js";

const { values } = parseArgs({
	options: {
		source: { type: "string" },
		output: { type: "string" },
		ids: { type: "string" },
		video: { type: "string" },
		"start-frame": { type: "string" },
	},
});
if (
	(!values.source && !values.video) ||
	(values.source && values.video) ||
	!values.output ||
	!values.ids
)
	throw new Error(
		"Exactly one --source/--video, plus --output and --ids required."
	);
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const motion = values.video
	? await loadHybridMotionFixture({
			source: values.video,
			startFrame: Number(values["start-frame"] ?? 60),
		})
	: undefined;
const image = values.source
	? await loadImage(await readFile(values.source))
	: undefined;
const { width, height } = motion ?? image!;
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
if (image) context.drawImage(image, 0, 0);
const portrait =
	motion?.frames[0].rgba ??
	new Uint8Array(context.getImageData(0, 0, width, height).data);
const gray = Uint8Array.from(portrait, (_, i) => (i % 4 === 3 ? 255 : 128));
async function saveFrame({ rgba, name }: { rgba: Uint8Array; name: string }) {
	const data = context.createImageData(width, height);
	data.data.set(rgba);
	context.putImageData(data, 0, 0);
	await writeFile(join(output, name), canvas.toBuffer("image/png"));
}
if (motion) {
	await saveFrame({ rgba: motion.frames[0].rgba, name: "motion-first.png" });
	await saveFrame({
		rgba: motion.frames.at(-1)!.rgba,
		name: "motion-last.png",
	});
}
const frames = motion
	? [
			...motion.frames,
			{ key: "gray", time: motion.frames.at(-1)!.time + 1, rgba: gray },
			motion.frames[0],
		]
	: [
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
		| Awaited<ReturnType<typeof createHybridNativeReference>>
		| undefined;
	let previousKey = "";
	const metrics = [];
	try {
		for (const frame of frames) {
			if (previousKey !== frame.key) {
				await oracle?.dispose();
				oracle = await createHybridNativeReference({
					profile,
					width,
					height,
					bootstrapRgba: frame.rgba,
					runtime,
					intensity: 100,
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
			if (motion && frame === motion.frames.at(-1)) {
				await saveFrame({
					rgba: actual.rgba,
					name: `${profile.resourceId}-metal.png`,
				});
				await saveFrame({
					rgba: expected.rgba,
					name: `${profile.resourceId}-native.png`,
				});
			}
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
		const resetEqual = metrics[0].sha256 === metrics.at(-1)!.sha256;
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
	source: values.video ?? values.source,
	...(motion
		? {
				sourceSha256: motion.sourceSha256,
				width,
				height,
				fps: motion.fps,
				startFrame: motion.startFrame,
				motionMae: motion.motionMae,
				motionFrames: motion.frames.length,
			}
		: {}),
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
