// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyJianyingTextEffectCapabilities } from "../jianying-text-effect-capabilities.js";
import type { JianyingTextStyleCatalogEntry } from "../jianying-text-style-lab-catalog.js";
import { readJianyingTextStyleGeneratedCover } from "../jianying-text-style-generated-cover.js";
import type { renderJianyingText } from "../jianying-text-runtime/render.js";

const temporaryRoots: string[] = [];

function createFrameBytes({ tiny = false }: { tiny?: boolean } = {}) {
	const canvas = createCanvas(256, 256);
	const context = canvas.getContext("2d");
	context.fillStyle = "#00ddff";
	context.fillRect(
		tiny ? 126 : 48,
		tiny ? 126 : 88,
		tiny ? 4 : 160,
		tiny ? 4 : 80
	);
	return canvas.toBuffer("image/png");
}

async function createWorkspace({
	frameBytes = createFrameBytes(),
}: {
	frameBytes?: Buffer;
} = {}) {
	const root = await mkdtemp(join(tmpdir(), "qcut-generated-text-cover-"));
	temporaryRoots.push(root);
	const frames = join(root, "frames");
	await mkdir(frames, { recursive: true });
	await writeFile(join(frames, "frame-000001.png"), frameBytes);
	return { cacheRoot: join(root, "cache"), frames };
}

function runtimeEntry(): JianyingTextStyleCatalogEntry {
	const resourceId = "7328639616670649634";
	const version = "b".repeat(32);
	return {
		styleId: `${resourceId}/${version}`,
		resourceId,
		version,
		packageKind: "ScriptInfoSticker",
		packageVersion: "runtime",
		fillKind: "unknown",
		strokeCount: 0,
		innerShadowCount: 0,
		shadowCount: 0,
		textureLayerCount: 0,
		capabilities: createEmptyJianyingTextEffectCapabilities(),
		diagnostics: [],
		hasCover: false,
		compatibility: "native-runtime",
		runtimeReference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId,
			packageHash: version,
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		},
	};
}

function createRender({
	entry,
	frames,
}: {
	entry: JianyingTextStyleCatalogEntry;
	frames: string;
}) {
	return vi.fn(async ({ request }) => ({
		requestId: request.requestId,
		resourceId: entry.resourceId,
		packageHash: entry.version,
		templateDuration: 3,
		frameCount: 3,
		strategy: "runtime-parameters" as const,
		cacheHit: false,
		x: 0,
		y: 0,
		width: 256,
		height: 256,
		source: {
			kind: "image-sequence" as const,
			path: join(frames, "frame-%06d.png"),
			frameRate: 1,
		},
	})) as unknown as typeof renderJianyingText;
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("Jianying generated text style covers", () => {
	it("renders a middle frame once and reuses the local cover", async () => {
		const { cacheRoot, frames } = await createWorkspace();
		const entry = runtimeEntry();
		const render = createRender({ entry, frames });

		const first = await readJianyingTextStyleGeneratedCover({
			cacheRoot,
			entry,
			render,
		});
		const second = await readJianyingTextStyleGeneratedCover({
			cacheRoot,
			entry,
			render,
		});

		expect(first).toMatchObject({ mimeType: "image/png", fromCache: false });
		expect(second).toMatchObject({ mimeType: "image/png", fromCache: true });
		expect(render).toHaveBeenCalledOnce();
		expect(render).toHaveBeenCalledWith({
			request: expect.objectContaining({
				content: "花字",
				frameCount: 3,
				fps: 1,
			}),
		});
	});

	it("creates a cached QCut cover when the native runtime is unavailable", async () => {
		const { cacheRoot } = await createWorkspace();
		const entry = runtimeEntry();
		const render = vi.fn(async () => {
			throw new Error("unsupported text ABI");
		}) as unknown as typeof renderJianyingText;

		const first = await readJianyingTextStyleGeneratedCover({
			cacheRoot,
			entry,
			render,
		});
		const second = await readJianyingTextStyleGeneratedCover({
			cacheRoot,
			entry,
			render,
		});

		expect(first).toMatchObject({ mimeType: "image/png", fromCache: false });
		expect(first.bytes.length).toBeGreaterThan(1000);
		expect(first.bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
		expect(second).toMatchObject({ mimeType: "image/png", fromCache: true });
		expect(render).toHaveBeenCalledOnce();
	});

	it("replaces a nearly empty runtime frame with a QCut cover", async () => {
		const { cacheRoot, frames } = await createWorkspace({
			frameBytes: createFrameBytes({ tiny: true }),
		});
		const entry = runtimeEntry();
		const render = createRender({ entry, frames });

		const cover = await readJianyingTextStyleGeneratedCover({
			cacheRoot,
			entry,
			render,
		});

		expect(cover.mimeType).toBe("image/png");
		expect(cover.bytes.length).toBeGreaterThan(1000);
		expect(cover.bytes).not.toEqual(createFrameBytes({ tiny: true }));
	});
});
