import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingEffectAdjustValue,
	JianyingEffectCategory,
	JianyingEffectDefinition,
	JianyingEffectPanel,
} from "../../jianying-effect-contract.js";
import { discoverJianyingEffectLibrary } from "../../jianying-effect/catalog.js";
import { ensureQCutManagedEffectPackage } from "../../jianying-effect/download.js";
import { renderJianyingEffectClip } from "../../jianying-effect/render.js";
import {
	inspectJianyingEffectRuntime,
	type JianyingEffectRuntimeInspection,
} from "../../jianying-effect/runtime-discovery.js";
import { probeVideoInfo } from "../subtitle/probe-video.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

interface EffectLabLibrary {
	effects: JianyingEffectDefinition[];
	categories: JianyingEffectCategory[];
}

interface EffectVideoProbe {
	width: number;
	height: number;
	duration: number;
}

export interface EffectLabHandlerDependencies {
	loadLibrary: () => Promise<EffectLabLibrary>;
	inspectRuntime: () => Promise<JianyingEffectRuntimeInspection>;
	ensurePackage: typeof ensureQCutManagedEffectPackage;
	renderEffect: typeof renderJianyingEffectClip;
	probeVideo: (videoPath: string) => Promise<EffectVideoProbe>;
}

const DEFAULT_DEPENDENCIES: EffectLabHandlerDependencies = {
	loadLibrary: discoverJianyingEffectLibrary,
	inspectRuntime: inspectJianyingEffectRuntime,
	ensurePackage: ensureQCutManagedEffectPackage,
	renderEffect: renderJianyingEffectClip,
	probeVideo: probeVideoInfo,
};

const MAX_DIMENSION = 16_384;
const MAX_FRAME_RATE = 240;
const MAX_TIMELINE_SECONDS = 24 * 60 * 60;
const MAX_LIST_RESULTS = 10_000;

function normalized({ value }: { value: string }): string {
	return value.trim().toLocaleLowerCase();
}

function resolvePanel({
	value,
}: {
	value?: string;
}): JianyingEffectPanel | undefined {
	if (!value) return;
	if (value === "effects2" || value === "face-prop") return value;
	throw new Error("--panel must be effects2 or face-prop.");
}

function categoryNamesById({
	categories,
}: {
	categories: JianyingEffectCategory[];
}): Map<string, string[]> {
	const names = new Map<string, string[]>();
	for (const category of categories) {
		for (const categoryId of category.categoryIds) {
			const current = names.get(categoryId) ?? [];
			if (!current.includes(category.name)) current.push(category.name);
			names.set(categoryId, current);
		}
	}
	return names;
}

function categoryFilterIds({
	category,
	categories,
}: {
	category?: string;
	categories: JianyingEffectCategory[];
}): Set<string> | undefined {
	if (!category?.trim()) return;
	const needle = normalized({ value: category });
	const matches = categories.filter(
		(entry) =>
			normalized({ value: entry.id }) === needle ||
			normalized({ value: entry.name }) === needle
	);
	if (matches.length === 0) {
		throw new Error(`Unknown Effect Lab category: ${category}`);
	}
	return new Set(matches.flatMap((entry) => entry.categoryIds));
}

function searchableText({
	effect,
	categoryNames,
}: {
	effect: JianyingEffectDefinition;
	categoryNames: Map<string, string[]>;
}): string {
	return normalized({
		value: [
			effect.id,
			effect.effectId,
			effect.resourceId,
			effect.packageHash,
			effect.name,
			effect.panel,
			...effect.categoryIds,
			...effect.categoryIds.flatMap((id) => categoryNames.get(id) ?? []),
		].join(" "),
	});
}

function effectRow({
	effect,
	categoryNames,
}: {
	effect: JianyingEffectDefinition;
	categoryNames: Map<string, string[]>;
}) {
	return {
		id: effect.id,
		effectId: effect.effectId,
		resourceId: effect.resourceId,
		packageHash: effect.packageHash,
		name: effect.name,
		panel: effect.panel,
		categoryIds: effect.categoryIds,
		categories: [
			...new Set(
				effect.categoryIds.flatMap((id) => categoryNames.get(id) ?? [])
			),
		],
		defaultDurationMs: effect.defaultDurationMs,
		access: effect.access,
		supported: effect.supported,
		unsupportedReason: effect.unsupportedReason,
		requiresAlgorithm: effect.requiresAlgorithm,
		installed: effect.installed,
		downloadable: effect.downloadable,
		adjustParameters: effect.adjustParameters,
	};
}

function positiveInteger({
	value,
	defaultValue,
	label,
	maximum,
}: {
	value: number | undefined;
	defaultValue: number;
	label: string;
	maximum: number;
}): number {
	const candidate = value ?? defaultValue;
	if (
		!Number.isSafeInteger(candidate) ||
		candidate <= 0 ||
		candidate > maximum
	) {
		throw new Error(`${label} must be an integer from 1 to ${maximum}.`);
	}
	return candidate;
}

function positiveNumber({
	value,
	defaultValue,
	label,
	maximum,
}: {
	value: number | string | undefined;
	defaultValue: number;
	label: string;
	maximum: number;
}): number {
	const candidate = value === undefined ? defaultValue : Number(value);
	if (!Number.isFinite(candidate) || candidate <= 0 || candidate > maximum) {
		throw new Error(`${label} must be greater than 0 and at most ${maximum}.`);
	}
	return candidate;
}

function nonNegativeNumber({
	value,
	label,
	maximum,
}: {
	value: number | undefined;
	label: string;
	maximum: number;
}): number {
	const candidate = value ?? 0;
	if (!Number.isFinite(candidate) || candidate < 0 || candidate > maximum) {
		throw new Error(`${label} must be from 0 to ${maximum}.`);
	}
	return candidate;
}

function evenDimension({ value }: { value: number }): number {
	return value % 2 === 0 ? value : value - 1;
}

function parseAdjustments({
	values,
	definition,
}: {
	values: string[];
	definition: JianyingEffectDefinition;
}): JianyingEffectAdjustValue[] {
	const allowedKeys = new Set(
		definition.adjustParameters.map((parameter) => parameter.key)
	);
	return values.map((assignment) => {
		const separator = assignment.indexOf("=");
		const key = assignment.slice(0, separator).trim();
		const value = Number(assignment.slice(separator + 1));
		if (separator <= 0 || !allowedKeys.has(key)) {
			throw new Error(
				`Unknown adjustment for ${definition.name}: ${key || assignment}`
			);
		}
		if (!Number.isFinite(value) || value < 0 || value > 1) {
			throw new Error(`Adjustment ${key} must be between 0 and 1.`);
		}
		return { key, value };
	});
}

function resolveEffect({
	selector,
	effects,
}: {
	selector: string;
	effects: JianyingEffectDefinition[];
}): JianyingEffectDefinition {
	const needle = normalized({ value: selector });
	if (!needle) throw new Error("--effect is required.");
	const exact = effects.filter((effect) =>
		[
			effect.id,
			effect.effectId,
			effect.resourceId,
			effect.packageHash,
			effect.name,
		].some((value) => normalized({ value }) === needle)
	);
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) {
		throw new Error(
			`Effect selector is ambiguous: ${selector}. Use the QCut effect ID instead.`
		);
	}
	const partial = effects.filter((effect) =>
		normalized({ value: effect.name }).includes(needle)
	);
	if (partial.length === 1) return partial[0];
	if (partial.length === 0) {
		throw new Error(`No Effect Lab effect matches: ${selector}`);
	}
	throw new Error(
		`Effect selector matches ${partial.length} effects: ${partial
			.slice(0, 5)
			.map((effect) => `${effect.name} (${effect.id})`)
			.join(", ")}`
	);
}

async function browseEffects({
	options,
	requireQuery,
	dependencies,
}: {
	options: CLIRunOptions;
	requireQuery: boolean;
	dependencies: EffectLabHandlerDependencies;
}): Promise<CLIResult> {
	const query = options.query?.trim() ?? "";
	if (requireQuery && !query) throw new Error("--query is required.");
	const library = await dependencies.loadLibrary();
	const panel = resolvePanel({ value: options.panel });
	const categoryIds = categoryFilterIds({
		category: options.category,
		categories: library.categories,
	});
	const categoryNames = categoryNamesById({ categories: library.categories });
	const queryNeedle = normalized({ value: query });
	const matching = library.effects.filter((effect) => {
		if (panel && effect.panel !== panel) return false;
		if (
			categoryIds &&
			!effect.categoryIds.some((categoryId) => categoryIds.has(categoryId))
		) {
			return false;
		}
		if (options.installedOnly && !effect.installed) return false;
		if (options.supportedOnly && !effect.supported) return false;
		return (
			queryNeedle.length === 0 ||
			searchableText({ effect, categoryNames }).includes(queryNeedle)
		);
	});
	const limit = positiveInteger({
		value: options.limit,
		defaultValue: matching.length || 1,
		label: "--limit",
		maximum: MAX_LIST_RESULTS,
	});
	const returned = matching
		.slice(0, limit)
		.map((effect) => effectRow({ effect, categoryNames }));

	return {
		success: true,
		data: {
			total: library.effects.length,
			matching: matching.length,
			returned: returned.length,
			query: query || undefined,
			filters: {
				panel,
				category: options.category,
				installedOnly: Boolean(options.installedOnly),
				supportedOnly: Boolean(options.supportedOnly),
			},
			effects: returned,
		},
	};
}

export function handleEffectLabList(
	options: CLIRunOptions,
	dependencies: EffectLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	return browseEffects({ options, requireQuery: false, dependencies });
}

export function handleEffectLabSearch(
	options: CLIRunOptions,
	dependencies: EffectLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	return browseEffects({ options, requireQuery: true, dependencies });
}

export async function handleEffectLabDoctor(
	_options: CLIRunOptions,
	dependencies: EffectLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const inspection = await dependencies.inspectRuntime();
	const installedCount = inspection.effects.filter(
		(effect) => effect.installed
	).length;
	const supportedCount = inspection.effects.filter(
		(effect) => effect.supported
	).length;
	return {
		success: inspection.status.state === "ready",
		data: {
			state: inspection.status.state,
			platform: inspection.status.platform,
			bridgeReady: inspection.status.bridgeReady,
			availableCount: inspection.status.availableCount,
			totalCount: inspection.effects.length,
			installedCount,
			supportedCount,
			lockedCount: inspection.effects.length - supportedCount,
			categoryCount: inspection.status.categories.length,
			message: inspection.status.message,
		},
		...(inspection.status.state === "ready"
			? {}
			: { error: inspection.status.message }),
	};
}

export async function handleEffectLabRender(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	dependencies: EffectLabHandlerDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const selector = options.effect?.trim();
	if (!selector) throw new Error("--effect is required.");
	const input = path.resolve(options.input?.trim() || "");
	if (!options.input?.trim()) throw new Error("--input is required.");
	await access(input).catch(() => {
		throw new Error(`Input video is not readable: ${input}`);
	});

	onProgress({
		stage: "discover",
		percent: 5,
		message: "Reading Effect Lab cache",
	});
	const inspection = await dependencies.inspectRuntime();
	if (inspection.status.state !== "ready") {
		throw new Error(inspection.status.message);
	}
	const definition = resolveEffect({
		selector,
		effects: inspection.effects,
	});
	if (!definition.supported) {
		throw new Error(
			definition.unsupportedReason ?? `${definition.name} is not renderable.`
		);
	}
	const adjustValues = parseAdjustments({
		values: options.effectAdjustments ?? [],
		definition,
	});
	const outputPath = path.resolve(
		options.output ??
			path.join(
				options.outputDir,
				`${path.parse(input).name}-${definition.effectId}.mp4`
			)
	);
	if (outputPath === input)
		throw new Error("Output cannot overwrite the input video.");
	const outputExists = await stat(outputPath)
		.then(() => true)
		.catch(() => false);
	if (outputExists && !options.force) {
		throw new Error(
			`Output already exists: ${outputPath}. Pass --force to replace it.`
		);
	}

	onProgress({
		stage: "prepare",
		percent: 15,
		message: "Preparing local effect package",
	});
	const probe = await dependencies.probeVideo(input);
	const width = evenDimension({
		value: positiveInteger({
			value: options.width,
			defaultValue: probe.width,
			label: "--width",
			maximum: MAX_DIMENSION,
		}),
	});
	const height = evenDimension({
		value: positiveInteger({
			value: options.height,
			defaultValue: probe.height,
			label: "--height",
			maximum: MAX_DIMENSION,
		}),
	});
	if (width < 2 || height < 2) {
		throw new Error("Output dimensions must be at least 2x2.");
	}
	const frameRate = positiveNumber({
		value: options.fps,
		defaultValue: 30,
		label: "--fps",
		maximum: MAX_FRAME_RATE,
	});
	const startSeconds = nonNegativeNumber({
		value: options.startTime,
		label: "--start-time",
		maximum: MAX_TIMELINE_SECONDS,
	});
	const durationSeconds =
		options.duration === undefined
			? undefined
			: positiveNumber({
					value: options.duration,
					defaultValue: definition.defaultDurationMs / 1000,
					label: "--duration",
					maximum: MAX_TIMELINE_SECONDS,
				});
	const cachedPackage = await dependencies.ensurePackage({
		effectId: definition.effectId,
	});
	await mkdir(path.dirname(outputPath), { recursive: true });

	onProgress({
		stage: "render",
		percent: 25,
		message: `Rendering ${definition.name}`,
	});
	const counts = await dependencies.renderEffect({
		inspection,
		definition: { ...definition, packagePath: cachedPackage.packagePath },
		inputPath: input,
		outputPath,
		width,
		height,
		frameRate,
		startSeconds,
		durationSeconds,
		adjustValues,
	});
	onProgress({
		stage: "complete",
		percent: 100,
		message: "Effect render complete",
	});

	return {
		success: true,
		outputPath,
		duration: probe.duration,
		data: {
			effect: effectRow({
				effect: definition,
				categoryNames: categoryNamesById({
					categories: inspection.status.categories,
				}),
			}),
			inputPath: input,
			outputPath,
			width,
			height,
			frameRate,
			startSeconds,
			durationSeconds: durationSeconds ?? definition.defaultDurationMs / 1000,
			adjustValues,
			...counts,
		},
	};
}
