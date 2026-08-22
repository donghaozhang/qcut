import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { JianyingTextRuntimeRenderRequest } from "../../../jianying-text-runtime-contract";
import type {
	JianyingTextAnimationLabSummary,
	JianyingTextStyleLabStyleSummary,
} from "../../../jianying-text-style-lab-contract";
import {
	handleTextLabAnimations,
	handleTextLabList,
	handleTextLabRender,
	type TextLabHandlerDependencies,
} from "../cli-handlers-text-lab";
import { parseCliArgs } from "../cli";
import type { CLIRunOptions } from "../cli-runner/types";

const CAPABILITIES = {
	staticTexture: true,
	multipleStrokes: true,
	animationComponents: true,
	scriptInfoSticker: false,
	shaderComponents: false,
	threeDimensional: false,
	feedbackComponents: false,
};

function createStyle(): JianyingTextStyleLabStyleSummary {
	return {
		styleId: `style-resource/${"a".repeat(32)}`,
		resourceId: "style-resource",
		version: "a".repeat(32),
		title: "金色标题",
		categoryIds: ["popular", "yellow"],
		packageKind: "TextStyle",
		packageVersion: "3.0",
		fillKind: "texture",
		strokeCount: 2,
		innerShadowCount: 0,
		shadowCount: 1,
		textureLayerCount: 1,
		capabilities: CAPABILITIES,
		diagnostics: [],
		hasCover: true,
		compatibility: "native-runtime",
		runtimeReference: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "TextStyle",
			resourceId: "style-resource",
			packageHash: "a".repeat(32),
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		},
	};
}

function createAnimation({
	resourceId,
	slot,
	title,
}: {
	resourceId: string;
	slot: JianyingTextAnimationLabSummary["slot"];
	title: string;
}): JianyingTextAnimationLabSummary {
	return {
		animationId: `${slot}:${resourceId}/${"b".repeat(32)}`,
		resourceId,
		packageHash: "b".repeat(32),
		title,
		slot,
		duration: 1.2,
		capabilities: CAPABILITIES,
	};
}

function createCatalog(): Awaited<
	ReturnType<TextLabHandlerDependencies["loadCatalog"]>
> {
	const styles = [createStyle()];
	const animations = [
		createAnimation({
			resourceId: "enter-resource",
			slot: "entrance",
			title: "弹入",
		}),
		createAnimation({
			resourceId: "loop-resource",
			slot: "loop",
			title: "波浪",
		}),
	];
	return {
		styles: {
			count: styles.length,
			styles,
			categories: [{ id: "popular", label: "热门", count: 1 }],
			packageCount: 1,
			invalidPackageCount: 0,
		},
		animations: {
			count: animations.length,
			animations,
			catalogCount: 3,
			packageCount: 2,
			missingPackageCount: 0,
			invalidPackageCount: 1,
		},
	};
}

function baseOptions({
	command,
	outputDir,
}: {
	command: string;
	outputDir: string;
}): CLIRunOptions {
	return {
		command,
		outputDir,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

describe("text-lab CLI", () => {
	test("parses grouped list, animation, and render commands", () => {
		const list = parseCliArgs([
			"text-lab",
			"list",
			"--query",
			"金色",
			"--limit",
			"8",
		]);
		const animations = parseCliArgs([
			"text-lab",
			"animations",
			"--slot",
			"loop",
		]);
		const render = parseCliArgs([
			"text-lab",
			"render",
			"--style",
			"金色标题",
			"--text",
			"QCut",
			"--loop-animation",
			"波浪",
			"--font-size",
			"108",
			"--output",
			"flower.webm",
		]);

		expect(list).toMatchObject({
			command: "text-lab-list",
			query: "金色",
			limit: 8,
		});
		expect(animations).toMatchObject({
			command: "text-lab-animations",
			animationSlot: "loop",
		});
		expect(render).toMatchObject({
			command: "text-lab-render",
			style: "金色标题",
			text: "QCut",
			loopAnimation: "波浪",
			fontSize: 108,
			output: "flower.webm",
		});
	});

	test("filters cached styles and animations with catalog totals intact", async () => {
		const dependencies = { loadCatalog: async () => createCatalog() };
		const styles = await handleTextLabList(
			{
				...baseOptions({ command: "text-lab-list", outputDir: "/tmp" }),
				query: "yellow",
			},
			dependencies
		);
		const animations = await handleTextLabAnimations(
			{
				...baseOptions({ command: "text-lab-animations", outputDir: "/tmp" }),
				animationSlot: "loop",
			},
			dependencies
		);

		expect(styles.data).toMatchObject({ total: 1, matching: 1 });
		expect(animations.data).toMatchObject({
			catalogCount: 3,
			usableCount: 2,
			invalidPackageCount: 1,
			matching: 1,
			animations: [{ title: "波浪", slot: "loop" }],
		});
	});

	test("renders a cached style with a selected animation to PNG", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "qcut-text-lab-"));
		const source = path.join(directory, "runtime-frame.png");
		const output = path.join(directory, "flower.png");
		await writeFile(source, "transparent-frame");
		let capturedRequest: JianyingTextRuntimeRenderRequest | undefined;
		const renderText = vi.fn(
			async ({ request }: { request: JianyingTextRuntimeRenderRequest }) => {
				capturedRequest = request;
				return {
					requestId: request.requestId,
					resourceId: request.reference.resourceId,
					packageHash: request.reference.packageHash,
					templateDuration: 3,
					frameCount: request.frameCount,
					strategy: "runtime-parameters" as const,
					cacheHit: false,
					x: 0,
					y: 0,
					width: request.canvasWidth,
					height: request.canvasHeight,
					source: { kind: "image" as const, path: source },
				};
			}
		);

		try {
			const result = await handleTextLabRender(
				{
					...baseOptions({ command: "text-lab-render", outputDir: directory }),
					style: "金色标题",
					text: "QCut 花字",
					loopAnimation: "波浪",
					fontSize: 108,
					width: 1280,
					height: 720,
					output,
				},
				() => undefined,
				{ loadCatalog: async () => createCatalog(), renderText }
			);

			expect(result).toMatchObject({ success: true, outputPath: output });
			expect(await readFile(output, "utf8")).toBe("transparent-frame");
			expect(capturedRequest).toMatchObject({
				content: "QCut 花字",
				fontSize: 108,
				canvasWidth: 1280,
				canvasHeight: 720,
				frameCount: 1,
				reference: {
					resourceId: "style-resource",
					animations: {
						loop: {
							resourceId: "loop-resource",
							duration: 1.2,
						},
					},
				},
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
