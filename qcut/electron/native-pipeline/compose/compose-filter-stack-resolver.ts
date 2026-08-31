/**
 * Resolves compose filter steps into editor `MediaFilterEffect` payloads.
 *
 * Each step's Filter Lab resource is resolved through the same catalog +
 * render-plan machinery the headless renderer uses, locking resource id,
 * version (package hash), implementation, and fidelity. The returned
 * `color` payload matches the editor's `MediaColorSettings` lut/multiPass
 * shapes structurally; no package paths or binaries cross this boundary.
 *
 * `safe-passthrough` resolutions are surfaced as warnings — they must never
 * be reported as applied filters. Identical resource+intensity pairs
 * resolve once, and resolution concurrency is bounded so native runtime
 * initialization is never raced.
 */

import type { JianyingFilterCatalogExport } from "../../jianying-filter-catalog-export.js";
import { exportCatalogDefault } from "../cli/cli-handlers-filter-lab-catalog.js";
import {
	resolveFilterLabRenderPlan,
	type FilterLabRenderPlan,
} from "../filters/filter-lab-render-plan.js";
import type { ComposeFilterStep } from "./compose-protocol.js";

type JsonRecord = Record<string, unknown>;

export type ComposeFilterStackIssueCode =
	| "filter-not-catalogued"
	| "filter-package-missing"
	| "filter-version-changed"
	| "filter-runtime-unavailable"
	| "filter-resolve-failed";

export class ComposeFilterStackError extends Error {
	readonly code: ComposeFilterStackIssueCode;
	readonly resourceId: string;

	constructor({
		code,
		resourceId,
		message,
	}: {
		code: ComposeFilterStackIssueCode;
		resourceId: string;
		message: string;
	}) {
		super(message);
		this.name = "ComposeFilterStackError";
		this.code = code;
		this.resourceId = resourceId;
	}
}

export interface ResolvedComposeFilterEffect {
	id: string;
	enabled: boolean;
	resourceId: string;
	version: string;
	intensity: number;
	implementation: string;
	fidelity: "lut" | "structural" | "native-local" | "safe-passthrough";
	color: { lut?: JsonRecord; multiPass?: JsonRecord };
}

export interface ResolvedComposeFilterStack {
	effects: ResolvedComposeFilterEffect[];
	warnings: string[];
}

export interface ComposeFilterStackResolverDependencies {
	exportCatalog: () => Promise<JianyingFilterCatalogExport>;
	resolvePlan: typeof resolveFilterLabRenderPlan;
}

// The catalog export statically reaches `node:sqlite`
// (jianying-filter-metadata), which bun cannot import inside the CLI's
// entry graph — `exportCatalogDefault` falls back to the bun-child shim.
// The default is memoized process-wide: CONCURRENT failed dynamic imports
// of the same module hang bun's module registry (the second import never
// settles, the event loop drains, and the CLI dies silently with exit 0),
// so the failing import must run exactly once.
let defaultCatalogPromise: Promise<JianyingFilterCatalogExport> | undefined;
function exportCatalogOnce(): Promise<JianyingFilterCatalogExport> {
	if (!defaultCatalogPromise) {
		defaultCatalogPromise = exportCatalogDefault();
	}
	return defaultCatalogPromise;
}

const DEFAULT_DEPENDENCIES: ComposeFilterStackResolverDependencies = {
	exportCatalog: exportCatalogOnce,
	resolvePlan: resolveFilterLabRenderPlan,
};

const RESOLVE_CONCURRENCY = 4;

function classifyResolveError({
	resourceId,
	error,
}: {
	resourceId: string;
	error: unknown;
}): ComposeFilterStackError {
	const message = error instanceof Error ? error.message : String(error);
	let code: ComposeFilterStackIssueCode = "filter-resolve-failed";
	if (message.includes("runtime is not ready")) {
		code = "filter-runtime-unavailable";
	} else if (message.includes("changed or is no longer loadable")) {
		code = "filter-version-changed";
	} else if (
		message.includes("no supported native") ||
		message.includes("No supported single LUT") ||
		message.includes("could not be decoded") ||
		message.includes("not available in Filter Lab")
	) {
		code = "filter-package-missing";
	}
	return new ComposeFilterStackError({ code, resourceId, message });
}

function effectColor({
	plan,
	intensity,
}: {
	plan: FilterLabRenderPlan;
	intensity: number;
}): { color: ResolvedComposeFilterEffect["color"]; warning?: string } {
	const { evidence } = plan;
	if (evidence.fidelity === "safe-passthrough") {
		return {
			color: {},
			warning: `Filter ${evidence.resourceId} resolves to a safe passthrough on this machine; it applies NO visual effect.`,
		};
	}
	if (plan.editorColor?.lutCube) {
		return {
			color: {
				lut: {
					enabled: true,
					presetId: `filter-lab:${evidence.resourceId}:${evidence.version}`,
					name: evidence.title,
					intensity,
					skinProtection: 0,
					cube: plan.editorColor.lutCube,
				},
			},
		};
	}
	if (plan.editorColor?.multiPass) {
		const settings = plan.editorColor.multiPass;
		return {
			color: {
				multiPass: {
					enabled: true,
					presetId: settings.presetId,
					name: settings.name,
					intensity,
					fidelity: settings.fidelity,
					...(settings.nativeEffect
						? { nativeEffect: settings.nativeEffect }
						: {}),
					passes: settings.passes,
				},
			},
		};
	}
	// Native portrait / face-region / swing plans carry no baked payload;
	// the editor renders them through the local-effect provider directly.
	return {
		color: {
			multiPass: {
				enabled: true,
				presetId: `jianying:${evidence.resourceId}:${evidence.version}`,
				name: evidence.title,
				intensity,
				fidelity: "native-local",
				nativeEffect: {
					provider: "jianying-local-effect-v1",
					resourceId: evidence.resourceId,
					version: evidence.version,
				},
				passes: [],
			},
		},
	};
}

export async function resolveComposeFilterStack({
	steps,
	dependencies,
}: {
	steps: readonly ComposeFilterStep[];
	dependencies?: ComposeFilterStackResolverDependencies;
}): Promise<ResolvedComposeFilterStack> {
	if (steps.length === 0) return { effects: [], warnings: [] };
	const resolvedDependencies = dependencies ?? DEFAULT_DEPENDENCIES;
	const catalog = await resolvedDependencies.exportCatalog();
	const cardsById = new Map(
		catalog.cards.map((card) => [card.resourceId, card])
	);

	const cache = new Map<
		string,
		Promise<{ plan: FilterLabRenderPlan; warning?: string }>
	>();
	let active = 0;
	const waiters: Array<() => void> = [];
	const acquire = async () => {
		while (active >= RESOLVE_CONCURRENCY) {
			await new Promise<void>((resolveWaiter) => waiters.push(resolveWaiter));
		}
		active += 1;
	};
	const release = () => {
		active -= 1;
		waiters.shift()?.();
	};

	const resolveStep = (step: ComposeFilterStep) => {
		const resourceId = step.asset.assetId;
		const key = `${resourceId}:${step.intensity}`;
		const cached = cache.get(key);
		if (cached) return cached;
		const pending = (async () => {
			const card = cardsById.get(resourceId);
			if (!card) {
				throw new ComposeFilterStackError({
					code: "filter-not-catalogued",
					resourceId,
					message: `Filter ${resourceId} is not in the local catalog.`,
				});
			}
			await acquire();
			try {
				const plan = await resolvedDependencies.resolvePlan({
					card,
					intensity: step.intensity,
				});
				return { plan };
			} catch (error) {
				if (error instanceof ComposeFilterStackError) throw error;
				throw classifyResolveError({ resourceId, error });
			} finally {
				release();
			}
		})();
		cache.set(key, pending);
		return pending;
	};

	const warnings: string[] = [];
	const effects: ResolvedComposeFilterEffect[] = [];
	const resolved = await Promise.all(
		steps.map(async (step) => ({ step, resolution: await resolveStep(step) }))
	);
	for (const { step, resolution } of resolved) {
		const { plan } = resolution;
		const { color, warning } = effectColor({
			plan,
			intensity: step.intensity,
		});
		if (warning) warnings.push(warning);
		effects.push({
			id: step.id,
			enabled: step.enabled,
			resourceId: plan.evidence.resourceId,
			version: plan.evidence.version,
			intensity: step.intensity,
			implementation: plan.evidence.implementation,
			fidelity: plan.evidence.fidelity,
			color,
		});
	}
	return { effects, warnings };
}
