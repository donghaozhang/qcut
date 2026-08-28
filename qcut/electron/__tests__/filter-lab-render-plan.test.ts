// @vitest-environment node
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";
import { inspectJianyingFilterPackages } from "../jianying-filter-package-inspector.js";
import { inspectJianyingFilterLocalRuntime } from "../jianying-filter-local-runtime/runtime-discovery.js";
import { loadJianyingFilterLabRenderer } from "../jianying-filter-multi-pass-loader.js";
import { materializeVideoCubeLut } from "../ffmpeg/color-lut-file.js";
import {
	listJianyingLutReferences,
	loadJianyingLut,
} from "../native-pipeline/filters/filter-lab-lut.js";
import { loadTiledLutCube } from "../native-pipeline/filters/filter-lab-tiled-lut.js";
import { resolveFilterLabRenderPlan } from "../native-pipeline/filters/filter-lab-render-plan.js";

vi.mock("../jianying-filter-package-inspector.js", () => ({
	inspectJianyingFilterPackages: vi.fn(),
}));
vi.mock("../jianying-filter-local-runtime/runtime-discovery.js", () => ({
	inspectJianyingFilterLocalRuntime: vi.fn(),
}));
vi.mock("../jianying-filter-multi-pass-loader.js", () => ({
	loadJianyingFilterLabRenderer: vi.fn(),
}));
vi.mock("../ffmpeg/color-lut-file.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../ffmpeg/color-lut-file.js")>()),
	materializeVideoCubeLut: vi.fn(() => "/tmp/synthetic.cube"),
}));
vi.mock(
	"../native-pipeline/filters/filter-lab-lut.js",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("../native-pipeline/filters/filter-lab-lut.js")
		>()),
		jianyingFilterCacheRoots: () => ["/private/Cache/artistEffect"],
		listJianyingLutReferences: vi.fn(),
		loadJianyingLut: vi.fn(),
	})
);
vi.mock(
	"../native-pipeline/filters/filter-lab-tiled-lut.js",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("../native-pipeline/filters/filter-lab-tiled-lut.js")
		>()),
		loadTiledLutCube: vi.fn(),
	})
);

const card: JianyingFilterCatalogCard = {
	resourceId: "123",
	title: "Test",
	version: "v1",
	categories: [],
	available: true,
	cacheStatus: "cached",
	implementation: "single-lut",
	verification: "unverified",
	lutCount: 1,
};
const reference = {
	resourceId: "123",
	version: "v1",
	role: "single" as const,
	lutId: "123/v1/filter.cube.vf",
	fileName: "filter.cube.vf",
	filePath: "/private/Cache/artistEffect/123/v1/filter.cube.vf",
	size: 2,
};
const cube = { size: 2, values: new Float64Array(24) };
const packageSummary = {
	cacheStatus: "cached" as const,
	implementation: "single-lut" as const,
	versions: ["v1"],
	hasThumbnail: false,
	issues: [],
};
const tiled = {
	kind: "tiled-lut-8x8" as const,
	container: "artistEffect" as const,
	packageIdentifier: "123",
	version: "v1",
	relativePath: "filter.png",
	cubeSize: 64 as const,
};
const runtime = {
	status: {
		state: "ready" as const,
		message: "ready",
		provider: "jianying-local-effect-v1" as const,
		platform: "darwin",
		bridgeReady: true,
		runtimeReady: true,
		modelReady: true,
		offlineReady: true,
		runtimeSource: "qcut-private" as const,
		modelSource: "qcut-private" as const,
	},
	bridgePath: "/private/bridge",
	effectLibraryPath: "/private/lib",
	frameworkDirectory: "/private/framework",
	modelDirectory: "/private/model",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(listJianyingLutReferences).mockResolvedValue([reference]);
	vi.mocked(loadJianyingLut).mockResolvedValue({
		...reference,
		cube,
		chroma: 1,
	});
	vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
		new Map([["123", packageSummary]])
	);
	vi.mocked(inspectJianyingFilterLocalRuntime).mockResolvedValue(runtime);
	vi.mocked(loadTiledLutCube).mockResolvedValue(cube);
});

describe("Filter Lab render plan", () => {
	it("uses the shared LUT materializer and export interpolation", async () => {
		const result = await resolveFilterLabRenderPlan({ card, intensity: 35 });
		expect(result).toMatchObject({
			kind: "ffmpeg",
			evidence: {
				backend: "ffmpeg-lut",
				intensity: 35,
				verification: "unverified",
			},
		});
		if (result.kind === "ffmpeg")
			expect(result.filterGraph).toContain("interp=tetrahedral");
		expect(materializeVideoCubeLut).toHaveBeenCalledWith(
			expect.objectContaining({ intensity: 35, skinProtection: 0 })
		);
		expect(inspectJianyingFilterLocalRuntime).not.toHaveBeenCalled();
	});

	it("bypasses LUT interpolation at zero strength after validating its bytes", async () => {
		const result = await resolveFilterLabRenderPlan({ card, intensity: 0 });
		expect(result).toMatchObject({
			kind: "ffmpeg",
			filterGraph: "[0:v:0]null[filter_output]",
			evidence: { backend: "ffmpeg-lut", intensity: 0 },
		});
		expect(loadJianyingLut).toHaveBeenCalled();
		expect(materializeVideoCubeLut).not.toHaveBeenCalled();
	});

	it("does not execute unavailable or stale-version cards", async () => {
		await expect(
			resolveFilterLabRenderPlan({
				card: { ...card, available: false },
				intensity: 100,
			})
		).rejects.toThrow("not available");
		vi.mocked(listJianyingLutReferences).mockResolvedValue([
			{ ...reference, version: "old" },
		]);
		await expect(
			resolveFilterLabRenderPlan({ card, intensity: 100 })
		).rejects.toThrow("no longer loadable");
		expect(loadJianyingLut).not.toHaveBeenCalled();
	});

	it("loads shader-backed tiled LUTs instead of treating all shader cards as native graphs", async () => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{ ...packageSummary, implementation: "shader", renderer: tiled },
				],
			])
		);
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "shader" },
			intensity: 100,
		});
		expect(result.evidence.backend).toBe("ffmpeg-lut");
		expect(loadTiledLutCube).toHaveBeenCalledWith({
			filePath: join("/private/Cache/artistEffect", "123", "v1", "filter.png"),
		});
		expect(loadJianyingLut).not.toHaveBeenCalled();
	});

	it("rejects unreadable LUT bytes", async () => {
		vi.mocked(loadJianyingLut).mockResolvedValue(null);
		await expect(
			resolveFilterLabRenderPlan({ card, intensity: 100 })
		).rejects.toThrow("could not be decoded");
	});

	it("routes face-region LUTs through the engine GL round-trip host", async () => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{
						...packageSummary,
						implementation: "face-region-lut",
						nativeFaceRegionRenderer: {
							kind: "native-face-region-effect",
							container: "artistEffect",
							packageIdentifier: "123",
							version: "v1",
							region: "lips",
							backgroundLutRelativePath: "texture/filter_bg.3dl.vf",
							regionLutRelativePath: "texture/filter_lips.3dl.vf",
							maskRelativePath: "texture/lipsMask.png",
							requiresFlippedInputRoundTrip: true,
						},
					},
				],
			])
		);
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "face-region-lut", lutCount: 0 },
			intensity: 65,
		});
		expect(result).toMatchObject({
			kind: "native",
			mode: "face-region",
			captureFace: false,
			packagePath: join("/private/Cache/artistEffect", "123", "v1"),
			evidence: {
				backend: "jianying-native-face-region",
				fidelity: "native-local",
				intensity: 65,
			},
		});
	});

	it("routes a complex dual LUT through the native Swing host", async () => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{
						...packageSummary,
						implementation: "dual-lut",
						nativeSwingRenderer: {
							kind: "native-swing-dual-lut",
							container: "artistEffect",
							packageIdentifier: "123",
							version: "v1",
							passCount: 38,
							algorithmTypes: ["blit", "skin_seg"],
						},
					},
				],
			])
		);
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "dual-lut", lutCount: 0 },
			intensity: 80,
		});
		expect(result).toMatchObject({
			kind: "native",
			mode: "swing",
			captureFace: false,
			packagePath: join("/private/Cache/artistEffect", "123", "v1"),
			evidence: {
				backend: "jianying-native-swing",
				fidelity: "native-local",
				intensity: 80,
			},
		});
	});

	it("routes a complete Shader graph through the native Swing host", async () => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{
						...packageSummary,
						implementation: "shader",
						nativeSwingRenderer: {
							kind: "native-swing-shader",
							container: "artistEffect",
							packageIdentifier: "123",
							version: "v1",
							passCount: 30,
							algorithmTypes: ["blit", "face", "kira"],
						},
					},
				],
			])
		);
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "shader", lutCount: 0 },
			intensity: 65,
		});
		expect(result).toMatchObject({
			kind: "native",
			mode: "swing",
			captureFace: false,
			packagePath: join("/private/Cache/artistEffect", "123", "v1"),
			evidence: {
				backend: "jianying-native-swing",
				fidelity: "native-local",
				implementation: "shader",
				intensity: 65,
			},
		});
	});

	it("routes an available Face AI graph through the native Swing host", async () => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{
						...packageSummary,
						implementation: "face-ai",
						nativeSwingRenderer: {
							kind: "native-swing-shader",
							container: "artistEffect",
							packageIdentifier: "123",
							version: "v1",
							passCount: 7,
							algorithmTypes: ["blit", "face", "skin_seg", "structxt"],
						},
					},
				],
			])
		);
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "face-ai", lutCount: 0 },
			intensity: 75,
		});
		expect(result).toMatchObject({
			kind: "native",
			mode: "swing",
			captureFace: false,
			packagePath: join("/private/Cache/artistEffect", "123", "v1"),
			evidence: {
				backend: "jianying-native-swing",
				fidelity: "native-local",
				implementation: "face-ai",
				intensity: 75,
			},
		});
	});

	it("requires real native skin segmentation for a dual LUT", async () => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{
						...packageSummary,
						implementation: "dual-lut",
						dualRenderer: {
							kind: "dual-tiled-lut-8x8",
							background: { ...tiled, relativePath: "filter_bg.png" },
							skin: { ...tiled, relativePath: "filter_skin.png" },
						},
					},
				],
			])
		);
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "dual-lut" },
			intensity: 50,
		});
		expect(result).toMatchObject({
			kind: "native",
			mode: "portrait",
			packagePath: join("/private/Cache/artistEffect", "123", "v1"),
			evidence: { backend: "jianying-native-portrait", intensity: 50 },
		});
		vi.mocked(inspectJianyingFilterLocalRuntime).mockResolvedValue({
			...runtime,
			status: {
				...runtime.status,
				state: "model-missing",
				message: "missing model",
			},
		});
		await expect(
			resolveFilterLabRenderPlan({ card, intensity: 100 })
		).rejects.toThrow("missing model");
		expect(materializeVideoCubeLut).not.toHaveBeenCalled();
	});

	it.each([
		false,
		true,
	])("preserves multi-pass routing (native=%s)", async (native) => {
		vi.mocked(listJianyingLutReferences).mockResolvedValue([]);
		vi.mocked(inspectJianyingFilterPackages).mockResolvedValue(
			new Map([
				[
					"123",
					{
						...packageSummary,
						implementation: "shader",
						multiPassRenderer: {
							kind: "fog-lut",
							container: "artistEffect",
							packageIdentifier: "123",
							version: "v1",
							lutRelativePath: "filter.png",
							passCount: 2,
							fidelity: "structural",
						},
					},
				],
			])
		);
		vi.mocked(loadJianyingFilterLabRenderer).mockResolvedValue({
			resourceId: "123",
			version: "v1",
			name: "Test",
			enabled: true,
			presetId: "test",
			intensity: 100,
			fidelity: native ? "native-local" : "structural",
			...(native
				? {
						nativeEffect: {
							provider: "jianying-local-effect-v1",
							resourceId: "123",
							version: "v1",
						} as const,
					}
				: {}),
			passes: [{ kind: "sharpen", amount: 20 }],
		});
		const result = await resolveFilterLabRenderPlan({
			card: { ...card, implementation: "shader" },
			intensity: 50,
		});
		expect(result.kind).toBe(native ? "native" : "ffmpeg");
		expect(result.evidence).toMatchObject({
			backend: native ? "jianying-native-multi-pass" : "ffmpeg-multi-pass",
			fidelity: native ? "native-local" : "structural",
		});
	});
});
