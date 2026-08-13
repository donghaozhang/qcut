import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { describe, expect, it } from "vitest";
import { isSameProfileWritebackSnapshotCurrent } from "../same-profile-writeback-current";
import { createSameProfileWritebackTimingSnapshot } from "../same-profile-writeback-snapshot";

const tracks: TimelineTrack[] = [
	{
		id: "track-1",
		name: "Video",
		type: "media",
		order: 0,
		elements: [],
	},
];

function project({
	bundleDigest = "b".repeat(64),
	writebackReady = false,
}: {
	bundleDigest?: string;
	writebackReady?: boolean;
} = {}): TProject {
	const timestamp = new Date("2026-08-13T00:00:00.000Z");
	return {
		id: "project-1",
		name: "Imported Jianying project",
		thumbnail: "",
		createdAt: timestamp,
		updatedAt: timestamp,
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		],
		currentSceneId: "scene-1",
		canvasSize: { width: 1280, height: 720 },
		canvasMode: "custom",
		fps: 30,
		draftInterop: {
			schemaVersion: 1,
			importId: "import-1",
			profileId: "jianying-macos-11.3.0-beta2-plaintext-subdraft",
			bundleDigest,
			sourceFileSha256: ["a".repeat(64)],
			internalIdBySemanticId: {},
			writeback: writebackReady
				? { status: "ready" }
				: { status: "unavailable", reason: "profile-not-writable" },
		},
	};
}

describe("same-profile writeback current-state check", () => {
	it("allows a new-copy export without in-place writeback capability", () => {
		const capturedProject = project();
		const capturedSnapshot = createSameProfileWritebackTimingSnapshot({
			fps: 30,
			tracks,
		});

		expect(
			isSameProfileWritebackSnapshotCurrent({
				capturedProject,
				capturedSnapshot,
				currentProject: project(),
				currentTracks: tracks,
				requireWritebackReady: false,
			})
		).toBe(true);
		expect(
			isSameProfileWritebackSnapshotCurrent({
				capturedProject,
				capturedSnapshot,
				currentProject: project(),
				currentTracks: tracks,
			})
		).toBe(false);
	});

	it("rejects a changed import binding even when timing is unchanged", () => {
		const capturedProject = project();
		const capturedSnapshot = createSameProfileWritebackTimingSnapshot({
			fps: 30,
			tracks,
		});

		expect(
			isSameProfileWritebackSnapshotCurrent({
				capturedProject,
				capturedSnapshot,
				currentProject: project({ bundleDigest: "c".repeat(64) }),
				currentTracks: tracks,
				requireWritebackReady: false,
			})
		).toBe(false);
	});
});
