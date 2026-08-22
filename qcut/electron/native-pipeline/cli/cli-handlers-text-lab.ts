import { randomUUID } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingTextAnimationLabSummary,
	JianyingTextStyleLabStyleSummary,
} from "../../jianying-text-style-lab-contract.js";
import type {
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
} from "../../jianying-text-runtime-contract.js";
import { resolveJianyingTextPreviewFilename } from "../../jianying-text-runtime/cache-path.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import {
	loadTextLabCatalogDefault,
	renderTextLabDefault,
	type TextLabCatalog,
	type TextLabRenderer,
} from "./text-lab-cli-process.js";

export interface TextLabHandlerDependencies {
	loadCatalog: () => Promise<TextLabCatalog>;
	renderText: TextLabRenderer;
}

function parseLimit({ value }: { value: number | undefined }) {
	if (value === undefined) return undefined;
	if (!(Number.isSafeInteger(value) && value > 0)) {
		throw new Error("--limit must be a positive integer.");
	}
	return value;
}

function matchesQuery({ query, values }: { query: string; values: string[] }) {
	if (!query) return true;
	return values.join(" ").toLocaleLowerCase().includes(query);
}

export async function handleTextLabList(
	options: CLIRunOptions,
	dependencies: Partial<TextLabHandlerDependencies> = {}
): Promise<CLIResult> {
	const catalog = await (
		dependencies.loadCatalog ?? loadTextLabCatalogDefault
	)();
	const query = (options.query ?? "").trim().toLocaleLowerCase();
	const limit = parseLimit({ value: options.limit });
	const matching = catalog.styles.styles.filter((style) =>
		matchesQuery({
			query,
			values: [
				style.styleId,
				style.resourceId,
				style.title ?? "",
				style.packageKind,
				...style.categoryIds,
			],
		})
	);
	return {
		success: true,
		data: {
			total: catalog.styles.count,
			matching: matching.length,
			styles: limit === undefined ? matching : matching.slice(0, limit),
		},
	};
}

export async function handleTextLabAnimations(
	options: CLIRunOptions,
	dependencies: Partial<TextLabHandlerDependencies> = {}
): Promise<CLIResult> {
	const catalog = await (
		dependencies.loadCatalog ?? loadTextLabCatalogDefault
	)();
	const query = (options.query ?? "").trim().toLocaleLowerCase();
	const limit = parseLimit({ value: options.limit });
	const requestedSlot = options.animationSlot;
	if (
		requestedSlot !== undefined &&
		requestedSlot !== "entrance" &&
		requestedSlot !== "exit" &&
		requestedSlot !== "loop"
	) {
		throw new Error("--slot must be entrance, exit, or loop.");
	}
	const matching = catalog.animations.animations.filter(
		(animation) =>
			(!requestedSlot || animation.slot === requestedSlot) &&
			matchesQuery({
				query,
				values: [
					animation.animationId,
					animation.resourceId,
					animation.title ?? "",
					animation.slot,
				],
			})
	);
	return {
		success: true,
		data: {
			catalogCount: catalog.animations.catalogCount,
			usableCount: catalog.animations.count,
			invalidPackageCount: catalog.animations.invalidPackageCount,
			matching: matching.length,
			animations: limit === undefined ? matching : matching.slice(0, limit),
		},
	};
}

function requireTextOption({
	value,
	flag,
}: {
	value: string | undefined;
	flag: string;
}) {
	const normalized = value?.trim();
	if (!normalized) throw new Error(`${flag} is required.`);
	return normalized;
}

function positiveNumber({
	value,
	fallback,
	flag,
}: {
	value: number | string | undefined;
	fallback: number;
	flag: string;
}) {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	if (!(Number.isFinite(parsed) && parsed > 0)) {
		throw new Error(`${flag} must be a positive number.`);
	}
	return parsed;
}

function selectUnique<T>({
	items,
	selector,
	exactId,
	resourceId,
	title,
	label,
}: {
	items: T[];
	selector: string;
	exactId: ({ item }: { item: T }) => string;
	resourceId: ({ item }: { item: T }) => string;
	title: ({ item }: { item: T }) => string | undefined;
	label: string;
}) {
	const exact = items.find((item) => exactId({ item }) === selector);
	if (exact) return exact;
	const normalized = selector.toLocaleLowerCase();
	const matches = items.filter(
		(item) =>
			resourceId({ item }) === selector ||
			title({ item })?.toLocaleLowerCase() === normalized
	);
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		throw new Error(`${label} selector is ambiguous: ${selector}`);
	}
	throw new Error(`Unknown ${label}: ${selector}`);
}

function selectStyle({
	selector,
	styles,
}: {
	selector: string;
	styles: JianyingTextStyleLabStyleSummary[];
}) {
	return selectUnique({
		items: styles,
		selector,
		exactId: ({ item }) => item.styleId,
		resourceId: ({ item }) => item.resourceId,
		title: ({ item }) => item.title,
		label: "Text Lab style",
	});
}

function selectAnimation({
	animations,
	selector,
	slot,
}: {
	animations: JianyingTextAnimationLabSummary[];
	selector: string;
	slot: JianyingTextAnimationSlot;
}) {
	return selectUnique({
		items: animations.filter((animation) => animation.slot === slot),
		selector,
		exactId: ({ item }) => item.animationId,
		resourceId: ({ item }) => item.resourceId,
		title: ({ item }) => item.title,
		label: `${slot} Text Lab animation`,
	});
}

function selectedAnimations({
	catalog,
	options,
}: {
	catalog: TextLabCatalog;
	options: CLIRunOptions;
}): JianyingTextAnimationReferences {
	const selectors = [
		["entrance", options.entranceAnimation],
		["exit", options.exitAnimation],
		["loop", options.loopAnimation],
	] as const satisfies ReadonlyArray<
		readonly [JianyingTextAnimationSlot, string | undefined]
	>;
	return Object.fromEntries(
		selectors.flatMap(([slot, selector]) => {
			if (!selector) return [];
			const animation = selectAnimation({
				animations: catalog.animations.animations,
				selector,
				slot,
			});
			return [
				[
					slot,
					{
						source: "jianying-cache",
						resourceId: animation.resourceId,
						packageHash: animation.packageHash,
						duration: animation.duration,
					},
				],
			];
		})
	) as JianyingTextAnimationReferences;
}

async function fileExists({ filePath }: { filePath: string }) {
	try {
		return (await stat(filePath)).isFile();
	} catch {
		return false;
	}
}

function previewPath({ result }: { result: JianyingTextRuntimeRenderResult }) {
	if (!result.previewUrl)
		throw new Error("Text Lab render returned no WebM preview.");
	const filename = path.basename(new URL(result.previewUrl).pathname);
	const resolved = resolveJianyingTextPreviewFilename({ filename });
	if (!resolved) throw new Error("Text Lab returned an invalid preview URL.");
	return resolved;
}

export async function handleTextLabRender(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	dependencies: Partial<TextLabHandlerDependencies> = {}
): Promise<CLIResult> {
	const catalog = await (
		dependencies.loadCatalog ?? loadTextLabCatalogDefault
	)();
	const style = selectStyle({
		selector: requireTextOption({ value: options.style, flag: "--style" }),
		styles: catalog.styles.styles,
	});
	if (!style.runtimeReference) {
		throw new Error(`Text Lab style is preview-only: ${style.styleId}`);
	}
	const animations = selectedAnimations({ catalog, options });
	const reference =
		Object.keys(animations).length > 0
			? { ...style.runtimeReference, animations }
			: style.runtimeReference;
	const content = requireTextOption({ value: options.text, flag: "--text" });
	const fps = positiveNumber({
		value: options.fps,
		fallback: 30,
		flag: "--fps",
	});
	const duration = positiveNumber({
		value: options.duration,
		fallback: 3,
		flag: "--duration",
	});
	const width = positiveNumber({
		value: options.width,
		fallback: 1024,
		flag: "--width",
	});
	const height = positiveNumber({
		value: options.height,
		fallback: 512,
		flag: "--height",
	});
	const fontSize = positiveNumber({
		value: options.fontSize,
		fallback: 96,
		flag: "--font-size",
	});
	const outputPath = path.resolve(
		options.output ??
			path.join(options.outputDir, `text-lab-${style.resourceId}.webm`)
	);
	const extension = path.extname(outputPath).toLocaleLowerCase();
	if (extension !== ".webm" && extension !== ".png") {
		throw new Error("Text Lab output must use .webm or .png.");
	}
	if (!options.force && (await fileExists({ filePath: outputPath }))) {
		throw new Error(
			`Output already exists: ${outputPath}. Use --force to replace it.`
		);
	}
	const frameCount =
		extension === ".png" ? 1 : Math.max(1, Math.round(duration * fps));
	const request = {
		requestId: `cli:${randomUUID()}`,
		reference,
		content,
		fontSize,
		canvasWidth: width,
		canvasHeight: height,
		transform: { x: 0, y: 0, width, height, rotation: 0, opacity: 1 },
		sourceStart: 0,
		elementDuration: duration,
		frameCount,
		fps,
		...(extension === ".webm" ? { previewVideo: true } : {}),
	} satisfies JianyingTextRuntimeRenderRequest;
	onProgress({
		stage: "render",
		percent: 10,
		message: "Rendering Text Lab style",
	});
	const result = await (dependencies.renderText ?? renderTextLabDefault)({
		request,
	});
	const sourcePath =
		extension === ".webm"
			? previewPath({ result })
			: result.source.kind === "image"
				? result.source.path
				: null;
	if (!sourcePath) throw new Error("Text Lab PNG render returned no image.");
	await mkdir(path.dirname(outputPath), { recursive: true });
	await copyFile(sourcePath, outputPath);
	onProgress({
		stage: "complete",
		percent: 100,
		message: "Text Lab render complete",
	});
	return {
		success: true,
		outputPath,
		duration: extension === ".png" ? 1 / fps : frameCount / fps,
		data: {
			style: {
				styleId: style.styleId,
				resourceId: style.resourceId,
				title: style.title,
			},
			animations,
			render: result,
		},
	};
}
