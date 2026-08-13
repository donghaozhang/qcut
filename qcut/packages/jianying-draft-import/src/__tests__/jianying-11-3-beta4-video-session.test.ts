import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "@qcut/editor-core/jianying-draft";
import { describe, expect, it } from "vitest";
import {
	addBeta4LinearPositionXKeyframes,
	BETA4_ADJACENT_DURATION_US,
	createJianying113Beta4AdjacentVideoFixture,
} from "../../../editor-core/src/__tests__/support/jianying-11-3-beta4-video-fixture.js";
import { JianyingDraftImportSession } from "../import-session.js";

describe("Jianying 11.3 beta4 adjacent video import session", () => {
	it("plans, commits, and verifies both real-shape video clips", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-jianying-beta4-video-"));
		const session = new JianyingDraftImportSession({
			buildIdentity: { appVersion: "test", interopSchemaVersion: 1 },
		});
		try {
			const firstBytes = new TextEncoder().encode("synthetic-blue-video");
			const secondBytes = new TextEncoder().encode("synthetic-red-video");
			const firstPath = join(root, "blue.mp4");
			const secondPath = join(root, "red.mp4");
			await Promise.all([
				writeFile(firstPath, firstBytes),
				writeFile(secondPath, secondBytes),
			]);
			const content = createJianying113Beta4AdjacentVideoFixture({
				firstPath,
				secondPath,
			});
			addBeta4LinearPositionXKeyframes({ content });
			await Promise.all([
				writeFile(join(root, "draft_content.json"), JSON.stringify(content)),
				writeFile(
					join(root, "sub_draft_config.json"),
					JSON.stringify({
						draft_json_file: "draft_content.json",
						is_from_sub_draft: true,
						rough_cut_duration: BETA4_ADJACENT_DURATION_US,
						type: "video",
					})
				),
			]);

			const plan = await session.plan({ input: { draftPath: root } });
			expect(plan.inspect).toMatchObject({
				issues: [],
				outcome: "exact",
				profileId: JIANYING_11_3_BETA4_PROFILE_ID,
				semantic: {
					capabilityCounts: {
						blocked: 0,
						downgrade: 0,
						exact: 2,
						opaque: 0,
					},
					resourceCount: 2,
					segmentCount: 2,
					trackCount: 1,
				},
				sourceScope: "selected-directory",
			});
			expect(plan.plan).toMatchObject({
				blockerFingerprints: [],
				canCommit: true,
				profileId: JIANYING_11_3_BETA4_PROFILE_ID,
				warningFingerprints: [],
			});
			expect(Object.values(plan.assetStatuses)).toEqual([
				"resolved",
				"resolved",
			]);

			const commit = await session.commit({
				input: {
					acceptedWarningFingerprints: [],
					planToken: plan.plan.planToken,
				},
			});
			expect(commit.bundle.timelinePlan).toMatchObject({
				resourceIds: ["first-video", "second-video"],
				skipped: [],
				tracks: [
					{
						elements: [
							{
								duration: 3,
								keyframes: {
									x: [
										{ frame: 0, value: 0 },
										{ frame: 60, value: 25 },
									],
									y: [
										{ frame: 0, value: 0 },
										{ frame: 60, value: 0 },
									],
								},
								resourceId: "first-video",
								startTime: 0,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
								x: 25,
								y: 0,
							},
							{
								duration: 3,
								resourceId: "second-video",
								startTime: 3,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
							},
						],
						isMain: true,
						type: "media",
					},
				],
			});
			const payloadByResourceId = new Map(
				commit.mediaPayloads.map((payload) => [payload.resourceId, payload])
			);
			expect(payloadByResourceId.get("first-video")).toMatchObject({
				fileName: "blue.mp4",
				mimeType: "video/mp4",
			});
			expect(payloadByResourceId.get("second-video")).toMatchObject({
				fileName: "red.mp4",
				mimeType: "video/mp4",
			});
			expect(
				Buffer.from(
					payloadByResourceId.get("first-video")?.bytesBase64 ?? "",
					"base64"
				)
			).toEqual(Buffer.from(firstBytes));
			expect(
				Buffer.from(
					payloadByResourceId.get("second-video")?.bytesBase64 ?? "",
					"base64"
				)
			).toEqual(Buffer.from(secondBytes));

			const roundTrip = await session.verifyRoundTrip({
				input: { draftPath: root },
			});
			expect(roundTrip.result).toMatchObject({
				ok: true,
				verification: {
					byteIdentical: true,
					importedSegmentCount: 2,
					preservedBindingCount: 5,
					profileId: JIANYING_11_3_BETA4_PROFILE_ID,
					scope: "active-subdraft-noop",
					targetAppPersistenceVerified: false,
					writebackPerformed: false,
				},
			});
			expect(JSON.stringify({ commit, plan, roundTrip })).not.toContain(root);
		} finally {
			session.dispose();
			await rm(root, { force: true, recursive: true });
		}
	});
});
