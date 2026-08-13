import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	JIANYING_11_3_BETA2_APP_ID,
	JIANYING_11_3_BETA2_APP_SOURCE,
	JIANYING_11_3_BETA2_APP_VERSION,
	JIANYING_11_3_BETA2_NEW_VERSION,
	JIANYING_11_3_BETA2_PROFILE_ID,
	JIANYING_11_3_BETA2_SCHEMA_VERSION,
	JIANYING_11_3_BETA2_TOP_LEVEL_KEYS,
	JIANYING_11_3_BETA3_APP_VERSION,
	JIANYING_11_3_BETA3_PROFILE_ID,
} from "@qcut/editor-core/jianying-draft";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJianying113ProjectExport } from "../jianying-11-3-project-export-writer.js";

let rootDirectory: string;
let sourceProjectDirectory: string;
let outputParentDirectory: string;

function contentBytes({
	appVersion = JIANYING_11_3_BETA2_APP_VERSION,
	startUs = 0,
}: {
	appVersion?: string;
	startUs?: number;
} = {}): Uint8Array {
	const content: Record<string, unknown> = Object.fromEntries(
		JIANYING_11_3_BETA2_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	Object.assign(content, {
		id: "outer-wrapper",
		version: JIANYING_11_3_BETA2_SCHEMA_VERSION,
		new_version: JIANYING_11_3_BETA2_NEW_VERSION,
		last_modified_platform: {
			app_id: JIANYING_11_3_BETA2_APP_ID,
			app_source: JIANYING_11_3_BETA2_APP_SOURCE,
			app_version: appVersion,
		},
		tracks: [
			{
				id: "outer-track",
				segments: [
					{
						id: "outer-segment",
						target_timerange: { start: startUs, duration: 3_000_000 },
						unknown: { preserve: true },
					},
				],
			},
		],
	});
	return new TextEncoder().encode(JSON.stringify(content));
}

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function createSourceProject({
	content = contentBytes(),
	subdraftId = "subdraft-1",
}: {
	content?: Uint8Array;
	subdraftId?: string;
} = {}): Promise<void> {
	await mkdir(join(sourceProjectDirectory, "subdraft", subdraftId), {
		recursive: true,
	});
	await mkdir(join(sourceProjectDirectory, "Timelines", "timeline-1"), {
		recursive: true,
	});
	await Promise.all([
		writeFile(
			join(
				sourceProjectDirectory,
				"subdraft",
				subdraftId,
				"draft_content.json"
			),
			content
		),
		writeFile(
			join(sourceProjectDirectory, "draft_info.json"),
			Buffer.from([0xff, 0x00, 0x7f])
		),
		writeFile(
			join(sourceProjectDirectory, "Timelines", "timeline-1", "opaque.bin"),
			Buffer.from([1, 2, 3, 4])
		),
	]);
}

beforeEach(async () => {
	rootDirectory = await mkdtemp(join(tmpdir(), "qcut-jianying-export-test-"));
	sourceProjectDirectory = join(rootDirectory, "source-project");
	outputParentDirectory = join(rootDirectory, "exports");
	await Promise.all([
		mkdir(sourceProjectDirectory),
		mkdir(outputParentDirectory),
	]);
});

afterEach(async () => {
	await rm(rootDirectory, { recursive: true, force: true });
});

describe("writeJianying113ProjectExport", () => {
	it("publishes a complete project copy while leaving the source untouched", async () => {
		const originalBytes = contentBytes();
		const preparedBytes = contentBytes({ startUs: 1_000_000 });
		await createSourceProject({ content: originalBytes });
		let guardCalls = 0;

		const result = await writeJianying113ProjectExport({
			assertTargetAppClosed: async () => {
				guardCalls += 1;
			},
			contentBytes: preparedBytes,
			draftName: "Jianying Export",
			expectedSourceSha256: sha256({ bytes: originalBytes }),
			outputParentDirectory,
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
			sourceProjectDirectory,
		});

		expect(guardCalls).toBe(2);
		expect(result).toMatchObject({
			contentRelativePath: "subdraft/subdraft-1/draft_content.json",
			contentSha256: sha256({ bytes: preparedBytes }),
			copiedFileCount: 3,
			subdraftId: "subdraft-1",
		});
		expect(
			await readFile(
				join(
					sourceProjectDirectory,
					"subdraft",
					"subdraft-1",
					"draft_content.json"
				)
			)
		).toEqual(Buffer.from(originalBytes));
		expect(
			await readFile(
				join(result.outputDirectory, ...result.contentRelativePath.split("/"))
			)
		).toEqual(Buffer.from(preparedBytes));
		expect(
			await readFile(join(result.outputDirectory, "draft_info.json"))
		).toEqual(Buffer.from([0xff, 0x00, 0x7f]));
		expect(
			(await readdir(outputParentDirectory)).some((name) =>
				name.endsWith(".tmp")
			)
		).toBe(false);
	});

	it("publishes content for an exact 11.3 beta 3 profile", async () => {
		const originalBytes = contentBytes({
			appVersion: JIANYING_11_3_BETA3_APP_VERSION,
		});
		const preparedBytes = contentBytes({
			appVersion: JIANYING_11_3_BETA3_APP_VERSION,
			startUs: 1_000_000,
		});
		await createSourceProject({ content: originalBytes });

		const result = await writeJianying113ProjectExport({
			assertTargetAppClosed: async () => undefined,
			contentBytes: preparedBytes,
			draftName: "Jianying Beta 3 Export",
			expectedSourceSha256: sha256({ bytes: originalBytes }),
			outputParentDirectory,
			profileId: JIANYING_11_3_BETA3_PROFILE_ID,
			sourceProjectDirectory,
		});

		expect(result.profileId).toBe(JIANYING_11_3_BETA3_PROFILE_ID);
		expect(
			await readFile(
				join(result.outputDirectory, ...result.contentRelativePath.split("/"))
			)
		).toEqual(Buffer.from(preparedBytes));
	});

	it("refuses a locked Jianying source", async () => {
		const originalBytes = contentBytes();
		await createSourceProject({ content: originalBytes });
		await writeFile(join(sourceProjectDirectory, "editing.locked"), "locked");

		await expect(
			writeJianying113ProjectExport({
				assertTargetAppClosed: async () => undefined,
				contentBytes: originalBytes,
				draftName: "Blocked",
				expectedSourceSha256: sha256({ bytes: originalBytes }),
				outputParentDirectory,
				profileId: JIANYING_11_3_BETA2_PROFILE_ID,
				sourceProjectDirectory,
			})
		).rejects.toThrow(/locked/u);
		expect(await readdir(outputParentDirectory)).toEqual([]);
	});

	it("refuses to guess when multiple subdrafts match the imported hash", async () => {
		const originalBytes = contentBytes();
		await createSourceProject({ content: originalBytes });
		await mkdir(join(sourceProjectDirectory, "subdraft", "subdraft-2"));
		await writeFile(
			join(
				sourceProjectDirectory,
				"subdraft",
				"subdraft-2",
				"draft_content.json"
			),
			originalBytes
		);

		await expect(
			writeJianying113ProjectExport({
				assertTargetAppClosed: async () => undefined,
				contentBytes: originalBytes,
				draftName: "Ambiguous",
				expectedSourceSha256: sha256({ bytes: originalBytes }),
				outputParentDirectory,
				profileId: JIANYING_11_3_BETA2_PROFILE_ID,
				sourceProjectDirectory,
			})
		).rejects.toThrow(/found 2/u);
	});
});
