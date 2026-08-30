import { existsSync } from "node:fs";
import { test } from "@playwright/test";
import {
	PRIVATE_REAL_RUNTIME_DEFINITIONS,
	PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH,
	PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY,
} from "./helpers/sticker-lab-private-real-runtime-cases";
import { runPrivateRealRuntimeLifecycle } from "./helpers/sticker-lab-private-real-runtime-lifecycle";

test.describe("Sticker Lab private real runtime cache lifecycle", () => {
	test.skip(
		!PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY ||
			!existsSync(PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY) ||
			!existsSync(PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH),
		"Requires QCUT_REAL_STICKER_LAB_RUNTIME_VIDEOS_DIRECTORY and a real HEVC/AAC input video"
	);

	for (const definition of PRIVATE_REAL_RUNTIME_DEFINITIONS) {
		for (const trigger of ["ui", "cli"] as const) {
			// biome-ignore lint/correctness/noEmptyPattern: each case launches an isolated Electron process.
			test(`${trigger.toUpperCase()} add + ${trigger.toUpperCase()} export preserves ${definition.kind}`, async ({}, testInfo) => {
				test.setTimeout(900_000);
				await runPrivateRealRuntimeLifecycle({
					definition,
					testInfo,
					trigger,
				});
			});
		}
	}
});
