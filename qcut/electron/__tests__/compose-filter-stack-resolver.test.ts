// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
	ComposeFilterStackError,
	resolveComposeFilterStack,
	type ComposeFilterStackResolverDependencies,
} from "../native-pipeline/compose/compose-filter-stack-resolver.js";
import type { ComposeFilterStep } from "../native-pipeline/compose/compose-protocol.js";
import type { FilterLabRenderPlan } from "../native-pipeline/filters/filter-lab-render-plan.js";

function step({
	id = "step-1",
	resourceId = "111",
	intensity = 80,
	enabled = true,
}: {
	id?: string;
	resourceId?: string;
	intensity?: number;
	enabled?: boolean;
} = {}): ComposeFilterStep {
	return {
		id,
		asset: { provider: "local", assetType: "filter", assetId: resourceId },
		intensity,
		enabled,
	};
}

function card({ resourceId }: { resourceId: string }) {
	return {
		resourceId,
		title: `Filter ${resourceId}`,
		version: "cafe0123",
		implementation: "lut",
	} as never;
}

function lutPlan({ resourceId }: { resourceId: string }): FilterLabRenderPlan {
	return {
		kind: "ffmpeg",
		filterGraph: "[0:v:0]lut3d=file='x'[filter_output]",
		outputLabel: "filter_output",
		editorColor: {
			lutCube: {
				size: 2,
				domainMin: [0, 0, 0],
				domainMax: [1, 1, 1],
				values: [0, 0, 0, 1, 1, 1],
			},
		},
		evidence: {
			resourceId,
			title: `Filter ${resourceId}`,
			version: "cafe0123",
			implementation: "lut",
			verification: undefined as never,
			intensity: 80,
			backend: "ffmpeg-lut",
			fidelity: "lut",
		},
	};
}

function makeDependencies({
	plan,
	resolveError,
	resourceIds = ["111"],
}: {
	plan?: (resourceId: string) => FilterLabRenderPlan;
	resolveError?: Error;
	resourceIds?: string[];
} = {}) {
	const resolvePlan = vi.fn(
		async ({ card: target }: { card: { resourceId: string } }) => {
			if (resolveError) throw resolveError;
			return (plan ?? lutPlan)({ resourceId: target.resourceId });
		}
	);
	const dependencies = {
		exportCatalog: vi.fn(async () => ({
			count: resourceIds.length,
			cards: resourceIds.map((resourceId) => card({ resourceId })),
		})),
		resolvePlan,
	} as unknown as ComposeFilterStackResolverDependencies;
	return { dependencies, resolvePlan };
}

describe("resolveComposeFilterStack", () => {
	it("maps single-LUT plans into editor lut settings", async () => {
		const { dependencies } = makeDependencies();
		const { effects, warnings } = await resolveComposeFilterStack({
			steps: [step()],
			dependencies,
		});
		expect(warnings).toEqual([]);
		expect(effects).toHaveLength(1);
		expect(effects[0]).toMatchObject({
			id: "step-1",
			enabled: true,
			resourceId: "111",
			version: "cafe0123",
			intensity: 80,
			fidelity: "lut",
		});
		expect(effects[0].color.lut).toMatchObject({
			enabled: true,
			presetId: "filter-lab:111:cafe0123",
			intensity: 80,
			skinProtection: 0,
			cube: { size: 2 },
		});
		expect(effects[0].color.multiPass).toBeUndefined();
	});

	it("carries multi-pass renderer results with the step intensity", async () => {
		const { dependencies } = makeDependencies({
			plan: ({ resourceId }) => ({
				kind: "ffmpeg",
				filterGraph: "g",
				outputLabel: "o",
				editorColor: {
					multiPass: {
						resourceId,
						version: "cafe0123",
						name: "MP",
						enabled: true,
						presetId: `jianying:${resourceId}:cafe0123`,
						intensity: 100,
						fidelity: "structural",
						passes: [{ kind: "sharpen", amount: 1 }],
					} as never,
				},
				evidence: {
					...lutPlan({ resourceId }).evidence,
					backend: "ffmpeg-multi-pass",
					fidelity: "structural",
				},
			}),
		});
		const { effects } = await resolveComposeFilterStack({
			steps: [step({ intensity: 55 })],
			dependencies,
		});
		expect(effects[0].color.multiPass).toMatchObject({
			enabled: true,
			intensity: 55,
			fidelity: "structural",
			passes: [{ kind: "sharpen", amount: 1 }],
		});
		expect(effects[0].color.multiPass).not.toHaveProperty("resourceId");
	});

	it("synthesizes native-local payloads for portrait-style plans", async () => {
		const { dependencies } = makeDependencies({
			plan: ({ resourceId }) => ({
				kind: "native",
				mode: "portrait",
				packagePath: "/private/pkg",
				runtime: {} as never,
				captureFace: true,
				evidence: {
					...lutPlan({ resourceId }).evidence,
					backend: "jianying-native-portrait",
					fidelity: "native-local",
				},
			}),
		});
		const { effects } = await resolveComposeFilterStack({
			steps: [step()],
			dependencies,
		});
		expect(effects[0].color.multiPass).toMatchObject({
			fidelity: "native-local",
			nativeEffect: {
				provider: "jianying-local-effect-v1",
				resourceId: "111",
				version: "cafe0123",
			},
			passes: [],
		});
		// The package path never crosses into the editor payload.
		expect(JSON.stringify(effects[0])).not.toContain("/private/pkg");
	});

	it("surfaces safe passthrough as a warning, never as an applied filter", async () => {
		const { dependencies } = makeDependencies({
			plan: ({ resourceId }) => ({
				kind: "ffmpeg",
				filterGraph: "[0:v:0]null[filter_output]",
				outputLabel: "filter_output",
				evidence: {
					...lutPlan({ resourceId }).evidence,
					backend: "qcut-safe-passthrough",
					fidelity: "safe-passthrough",
				},
			}),
		});
		const { effects, warnings } = await resolveComposeFilterStack({
			steps: [step()],
			dependencies,
		});
		expect(effects[0].fidelity).toBe("safe-passthrough");
		expect(effects[0].color).toEqual({});
		expect(warnings[0]).toMatch(/NO visual effect/);
	});

	it("classifies catalog and runtime failures", async () => {
		const { dependencies } = makeDependencies({ resourceIds: ["222"] });
		await expect(
			resolveComposeFilterStack({ steps: [step()], dependencies })
		).rejects.toMatchObject({ code: "filter-not-catalogued" });

		const runtimeDown = makeDependencies({
			resolveError: new Error(
				"Local Jianying runtime is not ready: bridge missing"
			),
		});
		await expect(
			resolveComposeFilterStack({
				steps: [step()],
				dependencies: runtimeDown.dependencies,
			})
		).rejects.toMatchObject({ code: "filter-runtime-unavailable" });

		const drifted = makeDependencies({
			resolveError: new Error(
				"The selected filter package changed or is no longer loadable. Refresh the catalog."
			),
		});
		await expect(
			resolveComposeFilterStack({
				steps: [step()],
				dependencies: drifted.dependencies,
			})
		).rejects.toBeInstanceOf(ComposeFilterStackError);
	});

	it("resolves identical resource+intensity pairs once", async () => {
		const { dependencies, resolvePlan } = makeDependencies();
		const { effects } = await resolveComposeFilterStack({
			steps: [
				step({ id: "a" }),
				step({ id: "b" }),
				step({ id: "c", intensity: 40 }),
			],
			dependencies,
		});
		expect(effects.map(({ id }) => id)).toEqual(["a", "b", "c"]);
		expect(resolvePlan).toHaveBeenCalledTimes(2);
	});
});
