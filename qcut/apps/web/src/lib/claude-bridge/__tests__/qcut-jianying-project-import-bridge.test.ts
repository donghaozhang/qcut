import { describe, expect, it, vi } from "vitest";
import type {
	DraftImportPlanDto,
	JianyingDraftImportAPI,
} from "@/types/electron/api-jianying-draft-import";
import { executeLiveQCutJianyingProjectImport } from "../qcut-jianying-project-import-bridge";

const WARNING = "a".repeat(64);

function plan({
	blockerFingerprints = [],
	canCommit = true,
	warningFingerprints = [WARNING],
}: {
	blockerFingerprints?: string[];
	canCommit?: boolean;
	warningFingerprints?: string[];
} = {}): DraftImportPlanDto {
	return {
		assetStatuses: {},
		inspect: {
			canWrite: false,
			fileCount: 3,
			hasContentFile: true,
			issues: [],
			outcome: "exact",
			selectedSubdraftId: "compound-1",
			skippedEntryCount: 0,
			sourceScope: "compound-subdraft",
			subdraftCandidateCount: 1,
		},
		plan: {
			blockerFingerprints,
			canCommit,
			createdAtUnixMilliseconds: 1,
			detectionOutcome: "exact",
			expiresAtUnixMilliseconds: 2,
			planToken: "plan-token",
			profileId: "jianying-macos-11.3.0-beta2-plaintext-subdraft",
			warningFingerprints,
		},
	};
}

function bridgeWithPlan({
	value = plan(),
}: {
	value?: DraftImportPlanDto;
} = {}): JianyingDraftImportAPI {
	return {
		planDraftImport: vi.fn(async () => ({ ok: true as const, value })),
	} as unknown as JianyingDraftImportAPI;
}

describe("live QCut Jianying project import", () => {
	it("reports that the desktop import bridge is unavailable", async () => {
		await expect(
			executeLiveQCutJianyingProjectImport({
				bridge: null,
				request: {
					acceptedWarningFingerprints: [],
					draftPath: "/private/draft",
				},
			})
		).resolves.toMatchObject({
			outcome: "failed",
			reason: "bridge-unavailable",
		});
	});

	it("requires exact warning acceptance before committing", async () => {
		const commitImport = vi.fn();
		const result = await executeLiveQCutJianyingProjectImport({
			bridge: bridgeWithPlan(),
			commitImport,
			request: {
				acceptedWarningFingerprints: [],
				draftPath: "/private/draft",
			},
		});

		expect(result).toMatchObject({
			outcome: "blocked",
			reason: "warning-acceptance-required",
			warningFingerprints: [WARNING],
		});
		expect(commitImport).not.toHaveBeenCalled();
	});

	it("returns blockers without starting a renderer transaction", async () => {
		const blocker = "b".repeat(64);
		const commitImport = vi.fn();
		const result = await executeLiveQCutJianyingProjectImport({
			bridge: bridgeWithPlan({
				value: plan({ blockerFingerprints: [blocker], canCommit: false }),
			}),
			commitImport,
			request: {
				acceptedWarningFingerprints: [WARNING],
				draftPath: "/private/draft",
			},
		});

		expect(result).toMatchObject({
			blockerFingerprints: [blocker],
			outcome: "blocked",
			reason: "plan-blocked",
		});
		expect(commitImport).not.toHaveBeenCalled();
	});

	it("publishes an envelope-preserving import as reversible", async () => {
		const bridge = bridgeWithPlan();
		const commitImport = vi.fn(async () => "project-1");
		const result = await executeLiveQCutJianyingProjectImport({
			bridge,
			commitImport,
			request: {
				acceptedWarningFingerprints: [WARNING],
				draftPath: "/private/draft",
			},
		});

		expect(commitImport).toHaveBeenCalledWith({
			acceptedWarningFingerprints: [WARNING],
			bridge,
			planToken: "plan-token",
		});
		expect(result).toMatchObject({
			outcome: "imported",
			profileId: "jianying-macos-11.3.0-beta2-plaintext-subdraft",
			projectId: "project-1",
			reversible: true,
			selectedSubdraftId: "compound-1",
			sourceScope: "compound-subdraft",
		});
	});
});
