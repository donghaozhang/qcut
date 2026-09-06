import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoverText } from "@qcut/editor-core/cover";
import type { CoverTextLayerV1 } from "@qcut/editor-core/cover";
import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
} from "@/types/electron";
import { paintCoverTextLayer } from "../cover-native-text-renderer";
import { paintCoverText } from "../cover-text-renderer";

const mocks = vi.hoisted(() => ({
	readFile: vi.fn(),
	loadFont: vi.fn(),
	flatPaint: vi.fn(),
}));
vi.mock("@qcut/platform-core", () => ({
	platform: () => ({ files: { readFile: mocks.readFile } }),
}));
vi.mock("@/lib/fonts/local-font-runtime", () => ({
	ensureLocalFontLoaded: mocks.loadFont,
}));
vi.mock("@/lib/text/text-canvas-renderer", async (importOriginal) => ({
	...(await importOriginal<object>()),
	renderTextToCanvas: mocks.flatPaint,
}));
const canvas = { width: 1280, height: 720, backgroundColor: "#000000" };
const plain = createCoverText({
	id: "layer",
	content: "Editable title",
	canvas,
});
const layer: CoverTextLayerV1 = {
	...plain,
	rotation: 12,
	nativeFrameTime: 0.7,
	jianyingTextStyle: {
		schemaVersion: 1,
		source: "jianying-cache",
		resourceId: "123",
		packageHash: "a".repeat(32),
		packageKind: "InfoSticker",
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	},
};
const renderNative =
	vi.fn<
		(
			request: JianyingTextRuntimeRenderRequest
		) => Promise<JianyingTextRuntimeRenderResult>
	>();
const cancel = vi.fn().mockResolvedValue(true);
const inspect = vi.fn();
const image = { width: 600, height: 300, close: vi.fn() };
const drawImage = vi.fn();
const ctx = {
	drawImage,
	measureText: (text: string) => ({ width: text.length * 30 }),
} as unknown as CanvasRenderingContext2D;
function result({
	request,
	overrides = {},
}: {
	request: JianyingTextRuntimeRenderRequest;
	overrides?: Partial<JianyingTextRuntimeRenderResult>;
}): JianyingTextRuntimeRenderResult {
	return {
		requestId: request.requestId,
		resourceId: "123",
		packageHash: "a".repeat(32),
		templateDuration: 3,
		frameCount: 1,
		strategy: "runtime-parameters",
		cacheHit: false,
		x: 30,
		y: 50,
		width: 600,
		height: 300,
		source: { kind: "image", path: "/private/runtime/frame-000000.png" },
		...overrides,
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	renderNative.mockImplementation(async (request) => result({ request }));
	mocks.readFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
	mocks.loadFont.mockResolvedValue({});
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			jianyingTextRuntime: { render: renderNative, cancel },
			jianyingFontLab: { inspect },
		},
	});
	vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(image));
});
afterEach(() => {
	vi.unstubAllGlobals();
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: undefined,
	});
});
describe("cover native word-art paint", () => {
	it.each([
		"TextStyle",
		"InfoSticker",
		"ScriptInfoSticker",
	] as const)("uses the existing frame renderer for %s", async (packageKind) => {
		await paintCoverTextLayer({
			ctx,
			canvas,
			layer: {
				...layer,
				jianyingTextStyle: { ...layer.jianyingTextStyle!, packageKind },
			},
		});
		expect(renderNative).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "Editable title",
				sourceStart: 0.7,
				frameCount: 1,
				elementDuration: 3,
				fontSize: plain.fontSize,
				reference: expect.objectContaining({ packageKind }),
				transform: expect.objectContaining({ rotation: 12 }),
			})
		);
		expect(drawImage).toHaveBeenCalledWith(image, 30, 50, 600, 300);
		expect(image.close).toHaveBeenCalledOnce();
		expect(mocks.flatPaint).not.toHaveBeenCalled();
	});
	it("keeps the ordinary text path but refuses native text in the synchronous painter", async () => {
		await paintCoverTextLayer({ ctx, canvas, layer: plain });
		expect(mocks.flatPaint).toHaveBeenCalledOnce();
		expect(renderNative).not.toHaveBeenCalled();
		expect(() => paintCoverText({ ctx, canvas, layer })).toThrow(
			"Native cover text"
		);
	});
	it("does not fall back when the desktop runtime or resource is missing", async () => {
		renderNative.mockRejectedValueOnce(new Error("package missing"));
		await expect(paintCoverTextLayer({ ctx, canvas, layer })).rejects.toThrow(
			"package missing"
		);
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: undefined,
		});
		await expect(paintCoverTextLayer({ ctx, canvas, layer })).rejects.toThrow(
			"桌面版"
		);
		expect(mocks.flatPaint).not.toHaveBeenCalled();
	});
	it.each([
		{ requestId: "stale" },
		{ packageHash: "b".repeat(32) },
		{ resourceId: "456" },
		{ frameCount: 2 },
		{ x: NaN },
		{ width: -1 },
	])("rejects mismatched or invalid frames %j", async (overrides) => {
		renderNative.mockImplementationOnce(async (request) =>
			result({ request, overrides })
		);
		await expect(paintCoverTextLayer({ ctx, canvas, layer })).rejects.toThrow();
		expect(drawImage).not.toHaveBeenCalled();
	});
	it("rejects degraded resources and image dimension mismatches", async () => {
		renderNative.mockImplementationOnce(async (request) =>
			result({
				request,
				overrides: {
					diagnostics: [
						{
							severity: "warning",
							code: "font-file-missing",
							message: "Font unavailable",
						},
					],
				},
			})
		);
		await expect(paintCoverTextLayer({ ctx, canvas, layer })).rejects.toThrow(
			"Font unavailable"
		);
		renderNative.mockImplementationOnce(async (request) =>
			result({ request, overrides: { width: 601 } })
		);
		await expect(paintCoverTextLayer({ ctx, canvas, layer })).rejects.toThrow(
			"dimensions"
		);
		expect(image.close).toHaveBeenCalledOnce();
		expect(drawImage).not.toHaveBeenCalled();
	});
	it("cancels in-flight requests and never paints a stale result", async () => {
		const controller = new AbortController();
		renderNative.mockImplementationOnce(async (request) => {
			controller.abort();
			return result({ request });
		});
		await expect(
			paintCoverTextLayer({ ctx, canvas, layer, signal: controller.signal })
		).rejects.toThrow();
		expect(cancel).toHaveBeenCalledWith({
			requestId: renderNative.mock.calls[0][0].requestId,
		});
		expect(drawImage).not.toHaveBeenCalled();
	});
	it("loads the saved font and checks current text glyphs before either painter", async () => {
		const fontAsset = {
			kind: "local-font" as const,
			source: "jianying-cache" as const,
			assetId: `sha256:${"b".repeat(64)}`,
			cssFamily: `QCutLocal_${"b".repeat(20)}`,
			familyName: "Font",
			fullName: "Font",
			postscriptName: "Font",
		};
		inspect.mockResolvedValue({ fontId: fontAsset.assetId, covered: true });
		await paintCoverTextLayer({ ctx, canvas, layer: { ...layer, fontAsset } });
		expect(mocks.loadFont).toHaveBeenCalledWith({ asset: fontAsset });
		expect(renderNative.mock.calls[0][0].fontAssetId).toBe(fontAsset.assetId);
		inspect.mockResolvedValue({ fontId: fontAsset.assetId, covered: false });
		await expect(
			paintCoverTextLayer({ ctx, canvas, layer: { ...plain, fontAsset } })
		).rejects.toThrow("字形");
	});
});
