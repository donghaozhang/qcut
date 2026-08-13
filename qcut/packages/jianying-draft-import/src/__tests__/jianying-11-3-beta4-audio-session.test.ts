import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "@qcut/editor-core/jianying-draft";
import { describe, expect, it } from "vitest";
import { JianyingDraftImportSession } from "../import-session.js";
import { writeJianying113Beta4StaticAudioFixture } from "./support/jianying-11-3-beta4-audio-fixture.js";

describe("Jianying 11.3 beta4 audio import session", () => {
	it("plans, commits, and verifies the real static-audio shape", async () => {
		const root = await mkdtemp(join(tmpdir(), "qcut-jianying-beta4-audio-"));
		const session = new JianyingDraftImportSession({
			buildIdentity: { appVersion: "test", interopSchemaVersion: 1 },
		});
		try {
			const { audioBytes } = await writeJianying113Beta4StaticAudioFixture({
				root,
			});
			const plan = await session.plan({ input: { draftPath: root } });

			expect(plan.inspect).toMatchObject({
				outcome: "exact",
				profileId: JIANYING_11_3_BETA4_PROFILE_ID,
				sourceScope: "selected-directory",
				issues: [],
				semantic: {
					trackCount: 2,
					segmentCount: 1,
					resourceCount: 1,
					capabilityCounts: {
						exact: 1,
						downgrade: 0,
						opaque: 0,
						blocked: 0,
					},
				},
			});
			expect(plan.plan).toMatchObject({
				canCommit: true,
				profileId: JIANYING_11_3_BETA4_PROFILE_ID,
				warningFingerprints: [],
				blockerFingerprints: [],
			});
			expect(Object.values(plan.assetStatuses)).toEqual(["resolved"]);

			const commit = await session.commit({
				input: {
					planToken: plan.plan.planToken,
					acceptedWarningFingerprints: [],
				},
			});
			expect(commit.bundle.timelinePlan).toMatchObject({
				resourceIds: ["inner-audio"],
				skipped: [],
				tracks: [
					{ type: "media", isMain: true, elements: [] },
					{
						type: "audio",
						elements: [
							{
								type: "media",
								resourceId: "inner-audio",
								startTime: 0,
								duration: 3,
								trimStart: 0,
								trimEnd: 0,
							},
						],
					},
				],
			});
			expect(commit.mediaPayloads).toMatchObject([
				{
					fileName: "tone.wav",
					mimeType: "audio/wav",
					resourceId: "inner-audio",
				},
			]);
			expect(
				Buffer.from(commit.mediaPayloads[0].bytesBase64, "base64")
			).toEqual(Buffer.from(audioBytes));

			const roundTrip = await session.verifyRoundTrip({
				input: { draftPath: root },
			});
			expect(roundTrip.result).toMatchObject({
				ok: true,
				verification: {
					byteIdentical: true,
					importedSegmentCount: 1,
					preservedBindingCount: 4,
					profileId: JIANYING_11_3_BETA4_PROFILE_ID,
					scope: "active-subdraft-noop",
					targetAppPersistenceVerified: false,
					writebackPerformed: false,
				},
			});
			expect(JSON.stringify({ plan, commit, roundTrip })).not.toContain(root);
		} finally {
			session.dispose();
			await rm(root, { recursive: true, force: true });
		}
	});
});
