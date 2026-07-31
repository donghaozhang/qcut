import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockedWriter = vi.hoisted(() => {
	const calls: unknown[] = [];
	return {
		calls,
		write: vi.fn((options: unknown) => {
			calls.push(options);
			return Promise.reject(new Error("observed writer options"));
		}),
	};
});

vi.mock("../writer.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../writer.js")>();
	return {
		...original,
		writeStandaloneJianyingDraft: mockedWriter.write,
	};
});

import { StandaloneJianyingDraftExportSession } from "../export-session.js";

const temporaryDirectories: string[] = [];

function createSnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name: "Writer options",
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [],
	};
}

afterEach(async () => {
	mockedWriter.calls.splice(0);
	mockedWriter.write.mockClear();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("standalone export session writer binding", () => {
	it("passes the trusted FFprobe path and timeout only at commit", async () => {
		const outputParentDirectory = await mkdtemp(
			join(tmpdir(), "qcut-session-writer-options-")
		);
		temporaryDirectories.push(outputParentDirectory);
		const trustedFfprobePath = join(outputParentDirectory, "trusted-ffprobe-8");
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: trustedFfprobePath,
			ffprobeTimeoutMilliseconds: 4321,
		});
		const plan = await session.plan({
			input: {
				draftName: "Trusted writer",
				outputParentDirectory,
				snapshot: createSnapshot(),
				targetPlatform: "macos",
			},
		});

		expect(mockedWriter.write).not.toHaveBeenCalled();
		await expect(
			session.commit({ input: { planToken: plan.planToken } })
		).rejects.toThrow("observed writer options");
		expect(mockedWriter.calls).toHaveLength(1);
		expect(mockedWriter.calls[0]).toMatchObject({
			ffprobePath: trustedFfprobePath,
			ffprobeTimeoutMilliseconds: 4321,
		});
	});
});
