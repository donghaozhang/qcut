import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	createCanvas,
	GlobalFonts,
	ImageData,
	loadImage,
	type SKRSContext2D,
} from "@napi-rs/canvas";
import type {
	JianyingPortraitAdjustmentControl,
	MediaPortraitAdjustments,
} from "../electron/jianying-portrait-adjustment-contract.js";
import {
	JIANYING_PORTRAIT_ADJUSTMENT_CATALOG,
	jianyingPortraitRuntimePackageForControl,
} from "../electron/jianying-portrait-adjustment-runtime/catalog.js";
import { JIANYING_PORTRAIT_MAKEUP_CARDS } from "../electron/jianying-portrait-adjustment-runtime/makeup-catalog.js";
import { createJianyingPortraitAdjustmentProvider } from "../electron/jianying-portrait-adjustment-runtime/provider.js";

type FixtureName = "front" | "mature" | "body";
type AuditStatus = "functional" | "weak" | "no-effect";

interface Fixture {
	name: FixtureName;
	width: number;
	height: number;
	rgba: Uint8Array;
	filePath: string;
}

interface PixelMetrics {
	changedPixels: number;
	changedRatio: number;
	absoluteDifference: number;
	meanAbsoluteError: number;
	maximumChannelDifference: number;
	boundingBox: { x: number; y: number; width: number; height: number } | null;
}

interface NumericTask {
	id: string;
	attempt: number;
	kind: "numeric";
	titleZh: string;
	titleEn: string;
	key: string;
	section: string;
	runtimePackage: string;
	fixture: FixtureName;
	value: number;
	adjustments: MediaPortraitAdjustments;
}

interface MakeupTask {
	id: string;
	attempt: number;
	kind: "makeup";
	titleZh: string;
	titleEn: string;
	key: string;
	section: "makeup";
	runtimePackage: "makeup";
	fixture: FixtureName;
	value: number;
	adjustments: MediaPortraitAdjustments;
}

type AuditTask = NumericTask | MakeupTask;

interface RenderedVariant {
	task: AuditTask;
	metrics: PixelMetrics;
	status: AuditStatus;
	outputRgba: Uint8Array;
	outputFile: string;
}

interface AuditItem {
	id: string;
	kind: AuditTask["kind"];
	titleZh: string;
	titleEn: string;
	key: string;
	section: string;
	runtimePackage: string;
	status: AuditStatus;
	best: RenderedVariant;
	variants: RenderedVariant[];
	comparisonFile: string;
}

const outputDirectory = path.resolve(
	process.env.QCUT_PORTRAIT_AUDIT_OUTPUT ??
		"output/playwright/jianying-portrait-control-audit"
);
const fixtureDirectory = path.join(outputDirectory, "fixtures");
const renderDirectory = path.join(outputDirectory, "renders");
const comparisonDirectory = path.join(outputDirectory, "comparisons");
const auditFontFamily = "QCut Portrait Audit CJK";
GlobalFonts.registerFromPath(
	"/System/Library/Fonts/STHeiti Medium.ttc",
	auditFontFamily
);

const frontSource =
	process.env.QCUT_PORTRAIT_AUDIT_FRONT_SOURCE ??
	"/tmp/qcut-portrait-real-two-face/input-1024x512.png";
const matureSource =
	process.env.QCUT_PORTRAIT_AUDIT_MATURE_SOURCE ??
	"/Users/peter/Library/Application Support/QCut/Research/JianyingFilter/beauty-gap-cards-2026-08-24/source-frame-display.png";
const bodySource =
	process.env.QCUT_PORTRAIT_AUDIT_BODY_SOURCE ??
	"/Users/peter/Library/Application Support/QCut/Research/JianyingFilter/body-multiface-2026-08-25/body-frame.png";
const bodyWidth = Number(process.env.QCUT_PORTRAIT_AUDIT_BODY_WIDTH ?? 1280);
const bodyHeight = Number(process.env.QCUT_PORTRAIT_AUDIT_BODY_HEIGHT ?? 720);
const taskFilter = process.env.QCUT_PORTRAIT_AUDIT_FILTER?.toLowerCase();
const repetitionCount = Math.max(
	1,
	Number(process.env.QCUT_PORTRAIT_AUDIT_REPETITIONS ?? 1)
);
const useColdHostPerVariant =
	process.env.QCUT_PORTRAIT_AUDIT_COLD_START === "1";

function pngBuffer({
	width,
	height,
	rgba,
}: {
	width: number;
	height: number;
	rgba: Uint8Array;
}) {
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	context.putImageData(
		new ImageData(new Uint8ClampedArray(rgba), width, height),
		0,
		0
	);
	return canvas.toBuffer("image/png");
}

async function writePng({
	filePath,
	width,
	height,
	rgba,
}: {
	filePath: string;
	width: number;
	height: number;
	rgba: Uint8Array;
}) {
	await writeFile(filePath, pngBuffer({ width, height, rgba }));
}

async function createFixture({
	name,
	sourcePath,
	width,
	height,
	crop,
}: {
	name: FixtureName;
	sourcePath: string;
	width: number;
	height: number;
	crop?: { x: number; y: number; width: number; height: number };
}): Promise<Fixture> {
	const image = await loadImage(sourcePath);
	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	if (crop) {
		context.drawImage(
			image,
			crop.x,
			crop.y,
			crop.width,
			crop.height,
			0,
			0,
			width,
			height
		);
	} else {
		const scale = Math.max(width / image.width, height / image.height);
		const drawWidth = image.width * scale;
		const drawHeight = image.height * scale;
		context.drawImage(
			image,
			(width - drawWidth) / 2,
			(height - drawHeight) / 2,
			drawWidth,
			drawHeight
		);
	}
	const rgba = new Uint8Array(context.getImageData(0, 0, width, height).data);
	const filePath = path.join(fixtureDirectory, `${name}-original.png`);
	await writeFile(filePath, canvas.toBuffer("image/png"));
	return { name, width, height, rgba, filePath };
}

function comparePixels({
	baseline,
	output,
	width,
	height,
}: {
	baseline: Uint8Array;
	output: Uint8Array;
	width: number;
	height: number;
}): PixelMetrics {
	let changedPixels = 0;
	let absoluteDifference = 0;
	let maximumChannelDifference = 0;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let pixel = 0; pixel < width * height; pixel += 1) {
		const offset = pixel * 4;
		let pixelChanged = false;
		for (let channel = 0; channel < 3; channel += 1) {
			const difference = Math.abs(
				output[offset + channel] - baseline[offset + channel]
			);
			absoluteDifference += difference;
			maximumChannelDifference = Math.max(maximumChannelDifference, difference);
			if (difference > 0) pixelChanged = true;
		}
		if (!pixelChanged) continue;
		changedPixels += 1;
		const x = pixel % width;
		const y = Math.floor(pixel / width);
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	return {
		changedPixels,
		changedRatio: changedPixels / (width * height),
		absoluteDifference,
		meanAbsoluteError: absoluteDifference / (width * height * 3),
		maximumChannelDifference,
		boundingBox:
			maxX < 0
				? null
				: {
						x: minX,
						y: minY,
						width: maxX - minX + 1,
						height: maxY - minY + 1,
					},
	};
}

function statusForMetrics({ metrics }: { metrics: PixelMetrics }): AuditStatus {
	if (metrics.changedPixels === 0) return "no-effect";
	if (metrics.changedPixels < 16 || metrics.absoluteDifference < 256) {
		return "weak";
	}
	return "functional";
}

function valuesForControl({
	control,
}: {
	control: JianyingPortraitAdjustmentControl;
}) {
	if (control.min < 0 && control.max > 0) return [control.min, control.max];
	return [control.max !== 0 ? control.max : control.min];
}

function fixturesForControl({
	control,
}: {
	control: JianyingPortraitAdjustmentControl;
}): FixtureName[] {
	if (control.group === "body") return ["body"];
	if (
		control.section === "skin" ||
		[
			"face_adjust_BrightEye",
			"face_adjust_Pouch",
			"face_adjust_NasolabialFolds",
			"face_adjust_WhiteTeeth",
		].includes(control.key)
	) {
		return ["front", "mature"];
	}
	return ["front"];
}

function numericTasks() {
	return JIANYING_PORTRAIT_ADJUSTMENT_CATALOG.flatMap((control) =>
		fixturesForControl({ control }).flatMap((fixture) =>
			valuesForControl({ control }).map((value) => ({
				id: `numeric:${control.key}`,
				attempt: 1,
				kind: "numeric" as const,
				titleZh: control.titleZh,
				titleEn: control.titleEn,
				key: control.key,
				section: control.section,
				runtimePackage: jianyingPortraitRuntimePackageForControl({ control }),
				fixture,
				value,
				adjustments: {
					enabled: true,
					values: { [control.key]: value },
				},
			}))
		)
	);
}

function makeupTasks(): MakeupTask[] {
	return JIANYING_PORTRAIT_MAKEUP_CARDS.map((card) => ({
		id: `makeup:${card.id}`,
		attempt: 1,
		kind: "makeup",
		titleZh: card.titleZh,
		titleEn: card.titleEn,
		key: `${card.category}:${card.id}`,
		section: "makeup",
		runtimePackage: "makeup",
		fixture: "front",
		value: 100,
		adjustments: {
			enabled: true,
			values: {},
			makeup: {
				[card.category]: { cardId: card.id, intensity: 100 },
			},
		},
	}));
}

function taskOrder({ task }: { task: AuditTask }) {
	const fixtureOrder: Record<FixtureName, number> = {
		front: 0,
		mature: 1,
		body: 2,
	};
	return `${fixtureOrder[task.fixture]}:${task.runtimePackage}:${task.key}:${String(task.value).padStart(4, "0")}:${String(task.attempt).padStart(3, "0")}`;
}

function repeatedTasks({ tasks }: { tasks: AuditTask[] }) {
	return tasks.flatMap((task) =>
		Array.from({ length: repetitionCount }, (_, index) => ({
			...task,
			attempt: index + 1,
		}))
	);
}

function matchesTaskFilter({ task }: { task: AuditTask }) {
	if (!taskFilter) return true;
	return [task.id, task.key, task.titleZh, task.titleEn, task.runtimePackage]
		.join(" ")
		.toLowerCase()
		.includes(taskFilter);
}

function safeName({ value }: { value: string }) {
	return value.replaceAll(/[^a-zA-Z0-9_-]+/g, "-").replaceAll(/-+/g, "-");
}

async function runSequentially<T, R>({
	items,
	run,
	index = 0,
	results = [],
}: {
	items: T[];
	run: ({ item, index }: { item: T; index: number }) => Promise<R>;
	index?: number;
	results?: R[];
}): Promise<R[]> {
	if (index >= items.length) return results;
	const result = await run({ item: items[index], index });
	return runSequentially({
		items,
		run,
		index: index + 1,
		results: [...results, result],
	});
}

function differencePixels({
	baseline,
	output,
}: {
	baseline: Uint8Array;
	output: Uint8Array;
}) {
	const difference = new Uint8Array(baseline.length);
	for (let offset = 0; offset < baseline.length; offset += 4) {
		for (let channel = 0; channel < 3; channel += 1) {
			difference[offset + channel] = Math.min(
				255,
				Math.abs(output[offset + channel] - baseline[offset + channel]) * 6
			);
		}
		difference[offset + 3] = 255;
	}
	return difference;
}

function drawPanel({
	context,
	rgba,
	width,
	height,
	x,
	y,
	drawWidth,
	drawHeight,
}: {
	context: SKRSContext2D;
	rgba: Uint8Array;
	width: number;
	height: number;
	x: number;
	y: number;
	drawWidth: number;
	drawHeight: number;
}) {
	const source = createCanvas(width, height);
	source
		.getContext("2d")
		.putImageData(
			new ImageData(new Uint8ClampedArray(rgba), width, height),
			0,
			0
		);
	context.drawImage(source, x, y, drawWidth, drawHeight);
}

async function writeComparison({
	item,
	fixture,
}: {
	item: Omit<AuditItem, "comparisonFile">;
	fixture: Fixture;
}) {
	const panelWidth = 420;
	const panelHeight = Math.round(panelWidth * (fixture.height / fixture.width));
	const headerHeight = 70;
	const footerHeight = 32;
	const canvas = createCanvas(
		panelWidth * 3,
		headerHeight + panelHeight + footerHeight
	);
	const context = canvas.getContext("2d");
	context.fillStyle = "#171717";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.fillStyle = "#ffffff";
	context.font = `bold 22px "${auditFontFamily}", sans-serif`;
	context.fillText(
		`${item.titleZh}  ${item.key}  ${item.best.task.value}`,
		16,
		28
	);
	context.font = "16px sans-serif";
	context.fillStyle = item.status === "functional" ? "#5ee38f" : "#ffb45e";
	context.fillText(
		`${item.status} | changed ${item.best.metrics.changedPixels} | MAE ${item.best.metrics.meanAbsoluteError.toFixed(4)} | ${item.best.task.fixture}`,
		16,
		54
	);
	const difference = differencePixels({
		baseline: fixture.rgba,
		output: item.best.outputRgba,
	});
	drawPanel({
		context,
		rgba: fixture.rgba,
		width: fixture.width,
		height: fixture.height,
		x: 0,
		y: headerHeight,
		drawWidth: panelWidth,
		drawHeight: panelHeight,
	});
	drawPanel({
		context,
		rgba: item.best.outputRgba,
		width: fixture.width,
		height: fixture.height,
		x: panelWidth,
		y: headerHeight,
		drawWidth: panelWidth,
		drawHeight: panelHeight,
	});
	drawPanel({
		context,
		rgba: difference,
		width: fixture.width,
		height: fixture.height,
		x: panelWidth * 2,
		y: headerHeight,
		drawWidth: panelWidth,
		drawHeight: panelHeight,
	});
	context.fillStyle = "#d7d7d7";
	context.font = `16px "${auditFontFamily}", sans-serif`;
	for (const [index, label] of ["原图", "极值效果", "差分 x6"].entries()) {
		context.fillText(
			label,
			index * panelWidth + 12,
			headerHeight + panelHeight + 22
		);
	}
	const filePath = path.join(
		comparisonDirectory,
		`${safeName({ value: item.id })}.png`
	);
	await writeFile(filePath, canvas.toBuffer("image/png"));
	return filePath;
}

async function writeContactSheet({
	name,
	items,
}: {
	name: string;
	items: AuditItem[];
}) {
	const columns = 3;
	const cellWidth = 520;
	const cellHeight = 230;
	const rows = Math.ceil(items.length / columns);
	const canvas = createCanvas(
		columns * cellWidth,
		Math.max(1, rows) * cellHeight
	);
	const context = canvas.getContext("2d");
	context.fillStyle = "#111111";
	context.fillRect(0, 0, canvas.width, canvas.height);
	const images = await Promise.all(
		items.map((item) => loadImage(item.comparisonFile))
	);
	for (const [index, item] of items.entries()) {
		const x = (index % columns) * cellWidth;
		const y = Math.floor(index / columns) * cellHeight;
		const image = images[index];
		const drawHeight = 180;
		const drawWidth = Math.min(
			cellWidth - 12,
			image.width * (drawHeight / image.height)
		);
		context.drawImage(image, x + 6, y + 6, drawWidth, drawHeight);
		context.fillStyle = item.status === "functional" ? "#5ee38f" : "#ffb45e";
		context.font = `15px "${auditFontFamily}", sans-serif`;
		context.fillText(
			`${item.titleZh} | ${item.status} | ${item.best.metrics.changedPixels}px`,
			x + 8,
			y + 208
		);
	}
	const filePath = path.join(outputDirectory, `${name}-contact-sheet.png`);
	await writeFile(filePath, canvas.toBuffer("image/png"));
	return filePath;
}

function reportVariant({ variant }: { variant: RenderedVariant }) {
	return {
		attempt: variant.task.attempt,
		fixture: variant.task.fixture,
		value: variant.task.value,
		status: variant.status,
		metrics: variant.metrics,
		outputFile: path.relative(outputDirectory, variant.outputFile),
	};
}

function reportMarkdown({
	items,
	summary,
	contactSheets,
}: {
	items: AuditItem[];
	summary: Record<AuditStatus, number>;
	contactSheets: Record<string, string>;
}) {
	const lines = [
		"# QCut 剪映美颜美体逐项极值审计",
		"",
		`生成时间：${new Date().toISOString()}`,
		"",
		`共 ${items.length} 项：functional ${summary.functional}，weak ${summary.weak}，no-effect ${summary["no-effect"]}。`,
		"",
		"`functional` 只表示当前素材上极值参数产生真实像素变化，不代表与剪映 UI 像素平价。",
		"",
		"## Contact sheets",
		"",
		...Object.entries(contactSheets).map(
			([name, filePath]) =>
				`- ${name}: \`${path.relative(outputDirectory, filePath)}\``
		),
		"",
		"## Results",
		"",
		"| 项目 | Key | 区域 | 极值 | 素材 | 状态 | Changed pixels | MAE | 对比图 |",
		"| --- | --- | --- | ---: | --- | --- | ---: | ---: | --- |",
		...items.map(
			(item) =>
				`| ${item.titleZh} | \`${item.key}\` | ${item.section} | ${item.best.task.value} | ${item.best.task.fixture} | ${item.status} | ${item.best.metrics.changedPixels} | ${item.best.metrics.meanAbsoluteError.toFixed(6)} | \`${path.relative(outputDirectory, item.comparisonFile)}\` |`
		),
		"",
	];
	return lines.join("\n");
}

async function main() {
	await rm(outputDirectory, { recursive: true, force: true });
	await Promise.all(
		[fixtureDirectory, renderDirectory, comparisonDirectory].map((directory) =>
			mkdir(directory, { recursive: true })
		)
	);
	const fixtures = await Promise.all([
		createFixture({
			name: "front",
			sourcePath: frontSource,
			width: 512,
			height: 512,
			crop: { x: 0, y: 0, width: 512, height: 512 },
		}),
		createFixture({
			name: "mature",
			sourcePath: matureSource,
			width: 512,
			height: 512,
		}),
		createFixture({
			name: "body",
			sourcePath: bodySource,
			width: bodyWidth,
			height: bodyHeight,
		}),
	]);
	const fixtureByName = new Map(
		fixtures.map((fixture) => [fixture.name, fixture])
	);
	const provider = createJianyingPortraitAdjustmentProvider();
	try {
		const status = await provider.inspect({ refresh: true });
		if (!status.available) throw new Error(status.message);
		const tasks = repeatedTasks({
			tasks: [...numericTasks(), ...makeupTasks()].filter((task) =>
				matchesTaskFilter({ task })
			),
		}).sort((left, right) =>
			taskOrder({ task: left }).localeCompare(taskOrder({ task: right }))
		);
		if (tasks.length === 0) throw new Error("No portrait audit tasks matched");
		const variants = await runSequentially({
			items: tasks,
			run: async ({ item: task, index }) => {
				if (useColdHostPerVariant) await provider.clear();
				const fixture = fixtureByName.get(task.fixture);
				if (!fixture) throw new Error(`Missing fixture: ${task.fixture}`);
				process.stdout.write(
					`[${index + 1}/${tasks.length}] ${task.titleZh} ${task.value} ${task.fixture} attempt ${task.attempt}\n`
				);
				const output = await provider.render({
					width: fixture.width,
					height: fixture.height,
					rgba: fixture.rgba,
					adjustments: task.adjustments,
					sourceKey: `portrait-control-audit:${fixture.name}`,
					timestampSeconds: (task.attempt - 1) / 30,
				});
				const metrics = comparePixels({
					baseline: fixture.rgba,
					output: output.rgba,
					width: fixture.width,
					height: fixture.height,
				});
				const outputFile = path.join(
					renderDirectory,
					`${safeName({ value: `${task.id}-${task.fixture}-${task.value}-attempt-${task.attempt}` })}.png`
				);
				await writePng({
					filePath: outputFile,
					width: fixture.width,
					height: fixture.height,
					rgba: output.rgba,
				});
				return {
					task,
					metrics,
					status: statusForMetrics({ metrics }),
					outputRgba: output.rgba,
					outputFile,
				};
			},
		});
		const grouped = Map.groupBy(variants, (variant) => variant.task.id);
		const itemBases = [...grouped.entries()].map(([id, itemVariants]) => {
			const best = [...itemVariants].sort(
				(left, right) =>
					right.metrics.absoluteDifference - left.metrics.absoluteDifference
			)[0];
			if (!best) throw new Error(`No variants for ${id}`);
			return {
				id,
				kind: best.task.kind,
				titleZh: best.task.titleZh,
				titleEn: best.task.titleEn,
				key: best.task.key,
				section: best.task.section,
				runtimePackage: best.task.runtimePackage,
				status: best.status,
				best,
				variants: itemVariants,
			};
		});
		const items = await Promise.all(
			itemBases.map(async (item) => {
				const fixture = fixtureByName.get(item.best.task.fixture);
				if (!fixture)
					throw new Error(`Missing fixture: ${item.best.task.fixture}`);
				return {
					...item,
					comparisonFile: await writeComparison({ item, fixture }),
				};
			})
		);
		items.sort((left, right) => left.id.localeCompare(right.id));
		const sections = ["skin", "face-shape", "features", "body", "makeup"];
		const contactSheetEntries = await Promise.all(
			sections.map(
				async (section) =>
					[
						section,
						await writeContactSheet({
							name: section,
							items: items.filter((item) => item.section === section),
						}),
					] as const
			)
		);
		const contactSheets = Object.fromEntries(contactSheetEntries);
		const summary: Record<AuditStatus, number> = {
			functional: items.filter((item) => item.status === "functional").length,
			weak: items.filter((item) => item.status === "weak").length,
			"no-effect": items.filter((item) => item.status === "no-effect").length,
		};
		const serializableItems = items.map((item) => ({
			id: item.id,
			kind: item.kind,
			titleZh: item.titleZh,
			titleEn: item.titleEn,
			key: item.key,
			section: item.section,
			runtimePackage: item.runtimePackage,
			status: item.status,
			best: reportVariant({ variant: item.best }),
			variants: item.variants.map((variant) => reportVariant({ variant })),
			comparisonFile: path.relative(outputDirectory, item.comparisonFile),
		}));
		await Promise.all([
			writeFile(
				path.join(outputDirectory, "report.json"),
				JSON.stringify(
					{
						generatedAt: new Date().toISOString(),
						provider: {
							state: status.state,
							available: status.available,
							offlineReady: status.offlineReady,
							packages: status.packages,
							makeupReady: status.makeupCards.filter((card) => card.ready)
								.length,
						},
						sources: { frontSource, matureSource, bodySource },
						summary,
						contactSheets: Object.fromEntries(
							Object.entries(contactSheets).map(([name, filePath]) => [
								name,
								path.relative(outputDirectory, filePath),
							])
						),
						items: serializableItems,
					},
					null,
					2
				)
			),
			writeFile(
				path.join(outputDirectory, "report.md"),
				reportMarkdown({ items, summary, contactSheets })
			),
		]);
		const digest = createHash("sha256")
			.update(JSON.stringify(serializableItems))
			.digest("hex");
		console.log(JSON.stringify({ outputDirectory, summary, digest }, null, 2));
	} finally {
		await provider.clear();
	}
}

await main();
