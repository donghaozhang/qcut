// @vitest-environment node
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import {
	JianyingTextPackageError,
	resolveJianyingTextPackage,
} from "../jianying-text-runtime/package-resolver.js";
import { renderJianyingText } from "../jianying-text-runtime/render.js";
import { inspectJianyingTextRuntime } from "../jianying-text-runtime/runtime-discovery.js";
import {
	hashImageSequenceFrames,
	readImageSequenceAlphaCoverages,
} from "./jianying-text-real-e2e-helpers.js";

const RESOURCE_ID = process.env.QCUT_JIANYING_TEXT_RECOVERY_E2E_RESOURCE_ID;
const PACKAGE_HASH = process.env.QCUT_JIANYING_TEXT_RECOVERY_E2E_PACKAGE_HASH;
const EDGE_POLICY =
	process.env.QCUT_JIANYING_TEXT_RECOVERY_E2E_EDGE_POLICY === "may-touch"
		? "may-touch"
		: "clear";
const FRAME_COUNT = 48;
const FPS = 24;
const WIDTH = 640;
const HEIGHT = 360;
const describeRealRecovery =
	RESOURCE_ID && PACKAGE_HASH ? describe : describe.skip;

function isWithinDirectory({
	directory,
	filePath,
}: {
	directory: string;
	filePath: string;
}) {
	const relative = path.relative(directory, filePath);
	return (
		relative.length > 0 &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative)
	);
}

describeRealRecovery("Jianying text dependency recovery real video E2E", () => {
	it("recovers missing dependencies into QCut cache and renders their motion", async () => {
		if (!(RESOURCE_ID && PACKAGE_HASH)) {
			throw new Error("Jianying recovery E2E resource identity is missing");
		}
		const recoveryRoot = await realpath(
			await mkdtemp(path.join(os.tmpdir(), "qcut-jianying-text-real-recovery-"))
		);
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
		try {
			vi.stubEnv("QCUT_JIANYING_TEXT_RECOVERY_ROOT", recoveryRoot);
			vi.stubEnv("QCUT_JIANYING_TEXT_AUTO_RECOVER", "0");
			let sourceMissing: NonNullable<
				JianyingTextPackageError["missingDependencies"]
			> = [];
			try {
				await resolveJianyingTextPackage({ reference });
			} catch (cause) {
				if (!(cause instanceof JianyingTextPackageError)) throw cause;
				expect(cause.code).toBe("dependency-missing");
				sourceMissing = cause.missingDependencies ?? [];
			}
			expect(sourceMissing.length).toBeGreaterThan(0);

			vi.stubEnv("QCUT_JIANYING_TEXT_AUTO_RECOVER", "1");
			const runtime = await inspectJianyingTextRuntime({ refresh: true });
			expect(runtime.status.state).toBe("ready");
			const packageInfo = await resolveJianyingTextPackage({ reference });
			expect(packageInfo.scriptResources?.missing).toEqual([]);
			for (const { resourceId } of sourceMissing) {
				const recoveredPath =
					packageInfo.scriptResources?.resourcePaths[resourceId];
				expect(recoveredPath).toBeTruthy();
				if (!recoveredPath) {
					throw new Error(`Recovered dependency ${resourceId} has no path`);
				}
				expect(
					isWithinDirectory({
						directory: recoveryRoot,
						filePath: recoveredPath,
					})
				).toBe(true);
			}

			const result = await renderJianyingText({
				request: {
					requestId: `recovered-text-${Date.now()}`,
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
			const visiblePixels = coverages.map(({ visible }) => visible);
			expect(Math.max(...visiblePixels)).toBeGreaterThan(1000);
			expect(visiblePixels.at(-1)).toBeGreaterThan(1000);
			expect(Math.max(...visiblePixels) - visiblePixels[0]).toBeGreaterThan(
				1000
			);
			expect(
				coverages.filter(({ visible }) => visible > 1000).length
			).toBeGreaterThan(8);
			expect(
				Math.min(...coverages.map(({ transparent }) => transparent))
			).toBeGreaterThan(1000);
			const maximumEdgeVisible = Math.max(
				...coverages.map(({ edgeVisible }) => edgeVisible)
			);
			if (EDGE_POLICY === "clear") expect(maximumEdgeVisible).toBe(0);
			const previewPath = path.join(
				path.dirname(result.source.path),
				"preview.webm"
			);
			expect((await stat(previewPath)).size).toBeGreaterThan(5000);
		} finally {
			vi.unstubAllEnvs();
			await rm(recoveryRoot, { recursive: true, force: true });
		}
	}, 240_000);
});
