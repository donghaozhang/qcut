import "@/test/fix-radix-ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingDraftImportController } from "@/hooks/import/use-jianying-draft-import";
import { useLocaleStore } from "@/stores/locale-store";
import { JianyingDraftImportCard } from "../jianying-draft-import-card";

function createController(): JianyingDraftImportController {
	return {
		isAvailable: true,
		phase: "ready",
		draftPath: "/drafts/example",
		inspect: {
			outcome: "exact",
			profileId: "capcut-8-1",
			canWrite: true,
			fileCount: 3,
			skippedEntryCount: 0,
			hasContentFile: true,
			semantic: {
				trackCount: 2,
				segmentCount: 7,
				resourceCount: 4,
				capabilityCounts: { exact: 6, downgrade: 1 },
			},
			issues: [
				{
					code: "FEATURE_DOWNGRADED",
					severity: "warning",
					message: "One title will be imported as a basic clip.",
				},
			],
		},
		plan: {
			plan: {
				planToken: "plan-1",
				createdAtUnixMilliseconds: 1,
				expiresAtUnixMilliseconds: 2,
				detectionOutcome: "exact",
				profileId: "capcut-8-1",
				canCommit: true,
				warningFingerprints: ["warning-1"],
				blockerFingerprints: [],
			},
			inspect: {
				outcome: "exact",
				profileId: "capcut-8-1",
				canWrite: true,
				fileCount: 3,
				skippedEntryCount: 0,
				hasContentFile: true,
				issues: [],
			},
			assetStatuses: {
				"resource-1": "resolved",
				"resource-2": "resolved",
				"resource-3": "missing",
			},
		},
		inboxEntries: [
			{
				entryId: "entry-1",
				createdAtUnixMilliseconds: 1_700_000_000_000,
				projectName: "Queued edit",
				bundleDigest: "digest-1",
				mediaCount: 2,
			},
		],
		isInboxLoading: false,
		isRecoveryRunning: false,
		recoveryResult: {
			rolledBackImportIds: ["interrupted-1"],
			completedImportIds: ["published-1"],
			corruptJournalRecordCount: 0,
		},
		activeInboxEntryId: null,
		acceptedWarningFingerprints: new Set(),
		pendingAcknowledgement: {
			entryId: "entry-previous",
			projectId: "project-previous",
		},
		errorMessage: null,
		importedProjectId: null,
		canCommit: false,
		chooseAndPlan: vi.fn(),
		commitPlan: vi.fn(),
		commitInboxEntry: vi.fn(),
		retryAcknowledgement: vi.fn(),
		refreshInbox: vi.fn(),
		setWarningsAccepted: vi.fn(),
		resetLiveImport: vi.fn(),
	};
}

describe("JianyingDraftImportCard", () => {
	beforeEach(() => {
		useLocaleStore.setState({ locale: "en" });
	});

	it("shows profile, issues, resources, conflict policy, and warning gate", () => {
		const controller = createController();
		render(
			<JianyingDraftImportCard
				controller={controller}
				onOpenProject={vi.fn()}
			/>
		);

		expect(
			within(screen.getByTestId("draft-import-profile")).getByText("capcut-8-1")
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId("draft-import-issues")).getByText(
				"One title will be imported as a basic clip."
			)
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId("draft-import-resources")).getByText(
				"resolved 2"
			)
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId("draft-import-resources")).getByText(
				"missing 1"
			)
		).toBeInTheDocument();
		expect(
			within(screen.getByTestId("draft-import-conflict")).getByText(
				"Rename import"
			)
		).toBeInTheDocument();

		fireEvent.click(
			within(screen.getByTestId("draft-import-warning-acceptance")).getByRole(
				"checkbox"
			)
		);
		expect(controller.setWarningsAccepted).toHaveBeenCalledWith(true);
		expect(
			screen.getByRole("button", { name: "Import project" })
		).toBeDisabled();
	});

	it("shows queued imports and ack-only recovery", () => {
		const controller = createController();
		const onOpenProject = vi.fn();
		render(
			<JianyingDraftImportCard
				controller={controller}
				onOpenProject={onOpenProject}
				defaultTab="inbox"
			/>
		);

		const recovery = screen.getByTestId("draft-import-recovery");
		expect(within(recovery).getByText("Queued edit")).toBeInTheDocument();
		expect(
			within(recovery).getByText("Project imported; queue cleanup pending")
		).toBeInTheDocument();
		expect(
			within(recovery).getByText(
				"1 partial import removed · 1 published import finalized"
			)
		).toBeInTheDocument();
		fireEvent.click(
			within(recovery).getByRole("button", { name: "Retry cleanup" })
		);
		expect(controller.retryAcknowledgement).toHaveBeenCalledTimes(1);
	});

	it("shows corrupt recovery records without exposing journal identifiers", () => {
		const controller = createController();
		controller.recoveryResult = {
			rolledBackImportIds: [],
			completedImportIds: [],
			corruptJournalRecordCount: 2,
		};
		render(
			<JianyingDraftImportCard
				controller={controller}
				onOpenProject={vi.fn()}
			/>
		);

		const warning = screen.getByTestId("draft-import-corrupt-journal");
		expect(
			within(warning).getByText("Import recovery needs attention")
		).toBeInTheDocument();
		expect(
			within(warning).getByText(
				"QCut found 2 damaged recovery records and left them untouched. No project data was deleted from those records."
			)
		).toBeInTheDocument();
		expect(warning).not.toHaveTextContent("import-token");
	});
});
