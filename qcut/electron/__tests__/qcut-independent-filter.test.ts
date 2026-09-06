// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	loadIndependentFogLut,
	validateIndependentFilterIdentity,
} from "../qcut-independent-filter/assets.js";
import {
	independentFogSettings,
	QCUT_FOG_RESOURCE,
	QCUT_FOG_VERSION,
} from "../qcut-independent-filter/contract.js";
import {
	independentFilterCatalog,
	resolveIndependentFilterPlan,
} from "../native-pipeline/cli/cli-handlers-filter-lab-independent.js";
import { resolveCommandGroup } from "../native-pipeline/cli/command-groups.js";

const temporary: string[] = [];
vi.mock("../native-pipeline/cli/cli-handlers-filter-lab-catalog.js", () => ({
	exportCatalogDefault: vi.fn(async () => ({ count: 0, cards: [] })),
}));
afterEach(async () => {
	await Promise.all(
		temporary
			.splice(0)
			.map((path) => rm(path, { recursive: true, force: true }))
	);
});

describe("independent local filter contract", () => {
	it("adds a CLI command while retaining render and apply aliases", () => {
		expect(
			resolveCommandGroup(["filter-lab", "render-independent"])?.command
		).toBe("filter-lab-render-independent");
		expect(resolveCommandGroup(["filter-lab", "render"])?.command).toBe(
			"filter-lab-render"
		);
		expect(resolveCommandGroup(["filter-lab", "apply"])?.command).toBe(
			"filter-lab-render"
		);
	});
	it("stores a new provider without overwriting the old filter identity", () => {
		const settings = independentFogSettings();
		expect(settings.nativeEffect).toEqual({
			provider: "qcut-metal-fog-v1",
			resourceId: QCUT_FOG_RESOURCE,
			version: QCUT_FOG_VERSION,
		});
		expect(settings.passes).toEqual([]);
		expect(settings.presetId).not.toContain("jianying:");
	});
	it.each([
		{ resourceId: "123", version: QCUT_FOG_VERSION },
		{ resourceId: QCUT_FOG_RESOURCE, version: "latest" },
		{ resourceId: "../filter", version: "" },
	])("rejects an unverified identity: %o", (identity) => {
		expect(() => validateIndependentFilterIdentity(identity)).toThrow(
			"verified Fog"
		);
	});
	it("accepts only the pinned identity", () => {
		expect(() =>
			validateIndependentFilterIdentity({
				resourceId: QCUT_FOG_RESOURCE,
				version: QCUT_FOG_VERSION,
			})
		).not.toThrow();
	});
	it("rejects an altered local LUT before decoding it", async () => {
		const folder = await mkdtemp(join(tmpdir(), "qcut-own-lut-"));
		temporary.push(folder);
		const filePath = join(folder, "filter.png");
		await writeFile(filePath, "not the verified LUT");
		await expect(loadIndependentFogLut({ filePath })).rejects.toThrow("hash");
	});
	it("reports a missing local LUT instead of fetching or falling back", async () => {
		await expect(
			loadIndependentFogLut({
				filePath: join(tmpdir(), "absent-qcut-lut", "filter.png"),
			})
		).rejects.toThrow();
	});
	it("keeps independent catalog and plan selection separate from the native catalog", async () => {
		const catalog = await independentFilterCatalog();
		expect(catalog.count).toBe(1);
		await expect(
			resolveIndependentFilterPlan({
				card: { ...catalog.cards[0], version: "different" },
				intensity: 50,
			})
		).rejects.toThrow("verified Fog");
	});
});
