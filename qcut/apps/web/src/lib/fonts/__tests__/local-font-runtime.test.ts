import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingFontLabFontSummary } from "@/types/electron";
import {
	createLocalFontAssetReference,
	ensureLocalFontLoaded,
	ensureTimelineLocalFontsLoaded,
	loadTransientLocalFontFace,
	resetLocalFontRuntimeForTests,
} from "../local-font-runtime";

const FONT_ID = `sha256:${"a".repeat(64)}`;

function createFontSummary(): JianyingFontLabFontSummary {
	return {
		fontId: FONT_ID,
		cssFamily: "QCutLocal_aaaaaaaaaaaaaaaaaaaa",
		familyName: "文悦新青年体",
		fullName: "文悦新青年体 W8",
		postscriptName: "WenYue-XinQingNianTi-W8",
		subfamilyName: "Regular",
		format: "ttf",
		size: 4,
		sourceKinds: ["effect"],
	};
}

function installFontEnvironment({
	load,
	fontFaceLoad = async () => undefined,
}: {
	load: ReturnType<typeof vi.fn>;
	fontFaceLoad?: () => Promise<void>;
}) {
	const add = vi.fn();
	const remove = vi.fn(() => true);
	const instances: Array<{
		family: string;
		source: ArrayBuffer;
		load: () => Promise<void>;
	}> = [];
	class FakeFontFace {
		family: string;
		source: ArrayBuffer;
		load = vi.fn(fontFaceLoad);

		constructor(family: string, source: ArrayBuffer) {
			this.family = family;
			this.source = source;
			instances.push(this);
		}
	}
	vi.stubGlobal("FontFace", FakeFontFace);
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: { add, delete: remove, ready: Promise.resolve(), load: vi.fn() },
	});
	window.electronAPI = {
		jianyingFontLab: {
			list: vi.fn(),
			inspect: vi.fn(),
			load,
		},
	} as never;
	return { add, remove, instances };
}

describe("local font runtime", () => {
	beforeEach(() => {
		resetLocalFontRuntimeForTests();
		vi.unstubAllGlobals();
		window.electronAPI = undefined;
	});

	it("loads exact bytes once and reuses the registered FontFace", async () => {
		const font = createFontSummary();
		const load = vi.fn(async () => ({
			font,
			bytes: new Uint8Array([0, 1, 2, 3]),
		}));
		const environment = installFontEnvironment({ load });
		const asset = createLocalFontAssetReference({ font });

		const [first, second] = await Promise.all([
			ensureLocalFontLoaded({ asset }),
			ensureLocalFontLoaded({ asset }),
		]);

		expect(first).toBe(second);
		expect(load).toHaveBeenCalledTimes(1);
		expect(load).toHaveBeenCalledWith({ fontId: FONT_ID });
		expect(environment.add).toHaveBeenCalledTimes(1);
		expect(environment.instances[0]).toMatchObject({
			family: font.cssFamily,
		});
		expect(Array.from(new Uint8Array(environment.instances[0].source))).toEqual(
			[0, 1, 2, 3]
		);
	});

	it("rejects metadata drift instead of silently loading another font", async () => {
		const font = createFontSummary();
		const load = vi.fn(async () => ({
			font: { ...font, cssFamily: "QCutLocal_other" },
			bytes: new Uint8Array([1]),
		}));
		installFontEnvironment({ load });

		await expect(
			ensureLocalFontLoaded({
				asset: createLocalFontAssetReference({ font }),
			})
		).rejects.toThrow("引用不一致");
	});

	it("does not let a cached font hide a mismatched CSS family", async () => {
		const font = createFontSummary();
		const load = vi.fn(async () => ({
			font,
			bytes: new Uint8Array([1]),
		}));
		installFontEnvironment({ load });
		const asset = createLocalFontAssetReference({ font });
		await ensureLocalFontLoaded({ asset });

		await expect(
			ensureLocalFontLoaded({
				asset: { ...asset, cssFamily: "QCutLocal_wrong" },
			})
		).rejects.toThrow("引用不一致");
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("removes failed faces and permits a clean retry", async () => {
		const font = createFontSummary();
		const load = vi.fn(async () => ({
			font,
			bytes: new Uint8Array([1]),
		}));
		const environment = installFontEnvironment({
			load,
			fontFaceLoad: async () => {
				throw new Error("invalid font");
			},
		});
		const asset = createLocalFontAssetReference({ font });

		await expect(ensureLocalFontLoaded({ asset })).rejects.toThrow(
			"invalid font"
		);
		await expect(ensureLocalFontLoaded({ asset })).rejects.toThrow(
			"invalid font"
		);

		expect(load).toHaveBeenCalledTimes(2);
		expect(environment.remove).toHaveBeenCalledTimes(2);
	});

	it("releases transient preview faces and deduplicates timeline assets", async () => {
		const font = createFontSummary();
		const load = vi.fn(async () => ({
			font,
			bytes: new Uint8Array([1, 2]),
		}));
		const environment = installFontEnvironment({ load });
		const asset = createLocalFontAssetReference({ font });
		const transient = await loadTransientLocalFontFace({ asset });
		expect(transient.release()).toBe(true);
		expect(environment.remove).toHaveBeenCalledWith(transient.face);

		await ensureTimelineLocalFontsLoaded({
			tracks: [
				{
					id: "text-track",
					type: "text",
					elements: [
						{ type: "text", fontAsset: asset },
						{ type: "text", fontAsset: asset },
					] as never,
				},
			] as never,
		});
		expect(load).toHaveBeenCalledTimes(2);
	});
});
