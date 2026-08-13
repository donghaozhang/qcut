// @vitest-environment node
import { stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import { resolveJianyingTextPackage } from "../jianying-text-runtime/package-resolver.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import {
	hashImageSequenceFrames,
	readImageSequenceAlphaCoverages,
} from "./jianying-text-real-e2e-helpers.js";

const RESOURCE_ID = process.env.QCUT_JIANYING_TEXT_DEGRADED_E2E_RESOURCE_ID;
const PACKAGE_HASH = process.env.QCUT_JIANYING_TEXT_DEGRADED_E2E_PACKAGE_HASH;
const FRAME_COUNT = 48;
const FPS = 24;
const WIDTH = 640;
const HEIGHT = 360;
const describeRealDegraded =
	RESOURCE_ID && PACKAGE_HASH ? describe : describe.skip;

describeRealDegraded("Jianying degraded dependency real video E2E", () => {
	it("renders editable motion while preserving an unresolved shape fallback", async () => {
		if (!(RESOURCE_ID && PACKAGE_HASH)) {
			throw new Error("Jianying degraded E2E resource identity is missing");
		}
		const reference: JianyingTextRuntimeReference = {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId: RESOURCE_ID,
			packageHash: PACKAGE_HASH,
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		};
		const packageInfo = await resolveJianyingTextPackage({ reference });
		expect(packageInfo.scriptResources).toMatchObject({
			missing: [],
			degraded: [
				{
					resourceId: "7153177238966374942",
					role: "animation",
				},
			],
			diagnostics: [
				{
					code: "runtime-dependency-unresolved",
					severity: "warning",
				},
			],
		});

		const result = await renderJianyingText({
			request: {
				requestId: `degraded-text-${Date.now()}`,
				reference,
				content: "花字验证",
				fontSize: 32,
				canvasWidth: WIDTH,
				canvasHeight: HEIGHT,
				transform: {
					x: 0,
					y: 0,
					width: WIDTH,
					height: HEIGHT,
					rotation: 0,
					opacity: 1,
				},
				sourceStart: 0,
				elementDuration: FRAME_COUNT / FPS,
				frameCount: FRAME_COUNT,
				fps: FPS,
				previewVideo: true,
			},
		});
		expect(result.source.kind).toBe("image-sequence");
		if (result.source.kind !== "image-sequence") {
			throw new Error("Expected an image-sequence render");
		}
		const hashes = await hashImageSequenceFrames({
			frameCount: FRAME_COUNT,
			pattern: result.source.path,
		});
		expect(new Set(hashes).size).toBeGreaterThan(4);
		const coverages = await readImageSequenceAlphaCoverages({
			fps: FPS,
			frameCount: FRAME_COUNT,
			height: HEIGHT,
			pattern: result.source.path,
			width: WIDTH,
		});
		expect(
			Math.max(...coverages.map(({ visible }) => visible))
		).toBeGreaterThan(1000);
		expect(
			Math.min(...coverages.map(({ transparent }) => transparent))
		).toBeGreaterThan(1000);
		const previewPath = path.join(
			path.dirname(result.source.path),
			"preview.webm"
		);
		expect((await stat(previewPath)).size).toBeGreaterThan(5000);
	}, 240_000);
});
