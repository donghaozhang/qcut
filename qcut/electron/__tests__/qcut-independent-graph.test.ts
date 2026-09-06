// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAdobeThreeDl } from "../qcut-independent-filter/adobe-three-dl.js";
import {
	encodeIndependentGraph,
	supportsIndependentGraph,
	hashIndependentGraphControls,
	hashIndependentGraphAssets,
} from "../qcut-independent-filter/graph-data.js";
import {
	INDEPENDENT_GRAPH_PROFILES,
	findIndependentGraphProfile,
} from "../qcut-independent-filter/graph-profiles.js";
import { selectIndependentCatalog } from "../qcut-independent-filter/lut-catalog.js";
import { independentLutSettings } from "../qcut-independent-filter/contract.js";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import { createIndependentFilterSession } from "../qcut-independent-filter/session.js";

const identityText = [
	"# synthetic 3DL",
	"0 1023",
	...Array.from({ length: 8 }, (_, i) =>
		[i >> 2, (i >> 1) & 1, i & 1].map((n) => n * 4095).join(" ")
	),
].join("\n");
const profile = INDEPENDENT_GRAPH_PROFILES[0];
const card: JianyingFilterCatalogCard = {
	...profile,
	available: true,
	cacheStatus: "cached",
	requirements: ["blit"],
	categories: [],
	implementation: "shader",
	verification: "verified",
	lutCount: 0,
};

describe("independent graph asset contracts", () => {
	it("rejects graph data bound to a different identity before starting a host", async () => {
		await expect(
			createIndependentFilterSession({
				graph: { profile, cube: parseAdobeThreeDl({ text: identityText }) },
				identity: { resourceId: "different", version: profile.version },
			})
		).rejects.toThrow("does not match");
	});
	it("detects changed controls and LUT bytes, and rejects symbolic links", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-graph-digest-"));
		try {
			await mkdir(join(root, "AmazingFeature", "texture"), { recursive: true });
			const control = join(root, "config.json");
			const asset = join(root, "AmazingFeature", "texture", "filter.3dl");
			await writeFile(control, "{}");
			await writeFile(asset, identityText);
			const controls = await hashIndependentGraphControls({ root });
			const options = {
				root,
				profile: { kind: "direct" as const, alphaWeighted: false },
			};
			const assets = await hashIndependentGraphAssets(options);
			await writeFile(control, '{"enabled":true}');
			await writeFile(asset, identityText.replaceAll("4095", "2048"));
			expect(await hashIndependentGraphControls({ root })).not.toBe(controls);
			expect(await hashIndependentGraphAssets(options)).not.toBe(assets);
			await symlink(control, join(root, "linked.json"));
			await expect(hashIndependentGraphControls({ root })).rejects.toThrow(
				"Unsafe"
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	it("reorders Adobe blue-fastest input into a red-fastest cube", () => {
		const cube = parseAdobeThreeDl({ text: identityText });
		expect(cube.size).toBe(2);
		expect(Array.from(cube.values).slice(3, 6)).toEqual([1, 0, 0]);
		expect(Array.from(cube.values).slice(12, 15)).toEqual([0, 0, 1]);
	});
	it("uses 12-bit output scale even when the grade never reaches white", () => {
		const text = identityText.replaceAll("4095", "2048");
		expect(parseAdobeThreeDl({ text }).values[3]).toBeCloseTo(2048 / 4095);
	});
	it("reads explicit 10-bit 3DMESH instead of normalizing by the observed maximum", () => {
		const text = [
			"3DMESH",
			"Mesh 4 10",
			Array.from({ length: 17 }, (_, i) => Math.min(1023, i * 64)).join(" "),
			...Array.from({ length: 17 ** 3 }, () => "512 256 128"),
		].join("\n");
		expect(parseAdobeThreeDl({ text }).size).toBe(17);
		expect(parseAdobeThreeDl({ text }).values[0]).toBeCloseTo(512 / 1023);
		for (const invalid of [
			text.replace("Mesh 4 10", "Mesh 9 10"),
			text.replace("0 64", "0 65"),
			text.replace("512 256", "1024 256"),
		])
			expect(() => parseAdobeThreeDl({ text: invalid })).toThrow();
	});
	it.each([
		identityText.replace("0 1023", "0 512"),
		identityText.split("\n").slice(0, -1).join("\n"),
		identityText.replace("4095", "NaN"),
		identityText.replace("4095", "4096"),
		identityText.replace("4095", "-1"),
		identityText.replace("4095", "0.5"),
	])("rejects malformed or unsupported 3DL data", (text) => {
		expect(() => parseAdobeThreeDl({ text })).toThrow();
	});
	it("pins 45 independent and 117 hybrid graph identities without importing old parity labels", () => {
		expect(INDEPENDENT_GRAPH_PROFILES).toHaveLength(162);
		expect(INDEPENDENT_GRAPH_PROFILES.filter((p) => !p.dualLut)).toHaveLength(
			45
		);
		expect(
			new Set(INDEPENDENT_GRAPH_PROFILES.map((p) => p.resourceId)).size
		).toBe(162);
		for (const p of INDEPENDENT_GRAPH_PROFILES) {
			expect(p.controlHash).toMatch(/^[a-f0-9]{64}$/);
			expect(p.assetHash).toMatch(/^[a-f0-9]{64}$/);
			expect(p.version).toMatch(/^[a-f0-9]{32}$/);
		}
		const selected = selectIndependentCatalog({
			catalog: { count: 1, cards: [card] },
		});
		expect(
			selected.cards.find((c) => c.resourceId === profile.resourceId)
		).toMatchObject({ independentKind: "sharpen", verification: "unverified" });
	});
	it("encodes new topologies and rejects variants on unrelated graphs", () => {
		const cube = parseAdobeThreeDl({ text: identityText });
		for (const [kind, code] of [
			["detail-chain", 4],
			["tiled-alpha", 5],
			["spring", 6],
			["edge-camera", 7],
			["edge-glow", 8],
			["mask-invariant", 9],
			["mask-invariant-sharpen", 10],
		] as const) {
			const encoded = encodeIndependentGraph({
				graph: { profile: { ...profile, kind }, cube },
			});
			expect(encoded.readUInt32LE(0)).toBe(code);
			expect(encoded.readUInt32LE(20)).toBe(0);
		}
		const sanyo = INDEPENDENT_GRAPH_PROFILES.find(
			(p) => p.detailVariant === "sanyo"
		)!;
		expect(
			encodeIndependentGraph({ graph: { profile: sanyo, cube } }).readUInt32LE(
				20
			)
		).toBe(1);
		expect(() =>
			encodeIndependentGraph({
				graph: { profile: { ...sanyo, kind: "direct" }, cube },
			})
		).toThrow("variant");
	});
	it("fails closed on unavailable, changed, or AI-dependent cards", () => {
		expect(supportsIndependentGraph({ card })).toBe(true);
		for (const changed of [
			{ ...card, available: false },
			{ ...card, cacheStatus: "missing" as const },
			{ ...card, version: "0".repeat(32) },
			{ ...card, sdkModel: "skin" },
			{ ...card, requirements: ["blit", "face"] },
		])
			expect(supportsIndependentGraph({ card: changed })).toBe(false);
		expect(
			findIndependentGraphProfile({
				identity: { resourceId: "1", version: profile.version },
			})
		).toBeUndefined();
	});
	it("encodes a bounded configuration and snapshots cube pixels", () => {
		const cube = parseAdobeThreeDl({ text: identityText });
		const encoded = encodeIndependentGraph({ graph: { profile, cube } });
		expect(encoded.readUInt32LE(0)).toBe(1);
		expect(encoded.length).toBe(24 + 8 * 16);
		expect(() =>
			encodeIndependentGraph({
				graph: { profile: { ...profile, kind: "vignette" }, cube },
			})
		).toThrow("overlay");
		expect(() =>
			encodeIndependentGraph({
				graph: { profile: { ...profile, corner: NaN }, cube },
			})
		).toThrow();
	});
	it("persists a distinct graph provider so old LUT semantics stay unchanged", () => {
		expect(
			independentLutSettings({ ...profile, graph: true }).nativeEffect?.provider
		).toBe("qcut-metal-graph-v1");
		expect(independentLutSettings(profile).nativeEffect?.provider).toBe(
			"qcut-metal-lut-v1"
		);
	});
});
