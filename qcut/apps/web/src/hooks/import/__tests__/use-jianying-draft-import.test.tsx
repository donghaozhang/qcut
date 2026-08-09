import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronAPI } from "@/types/electron";
import type { JianyingDraftImportAPI } from "@/types/electron/api-jianying-draft-import";
import { useJianyingDraftImport } from "../use-jianying-draft-import";

function installBridge({
	outcome = "exact",
}: {
	outcome?: "exact" | "unsupported";
}) {
	const inspect = {
		outcome,
		...(outcome === "exact" ? { profileId: "capcut-8-1" } : {}),
		canWrite: outcome === "exact",
		fileCount: 2,
		skippedEntryCount: 0,
		hasContentFile: true,
		issues: [],
	} as const;
	const bridge = {
		chooseDraftDirectory: vi.fn(async () => ({
			ok: true as const,
			value: "/drafts/example",
		})),
		inspectDraft: vi.fn(async () => ({ ok: true as const, value: inspect })),
		planDraftImport: vi.fn(async () => ({
			ok: true as const,
			value: {
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
				inspect,
				assetStatuses: {},
			},
		})),
		listPendingDraftImports: vi.fn(async () => ({
			ok: true as const,
			value: [],
		})),
	} as unknown as JianyingDraftImportAPI;
	window.electronAPI = {
		jianyingDraftImport: bridge,
	} as unknown as ElectronAPI;
	return bridge;
}

afterEach(() => {
	Reflect.deleteProperty(window, "electronAPI");
});

describe("useJianyingDraftImport", () => {
	it("inspects, plans, and gates commit on exact warning acceptance", async () => {
		installBridge({});
		const recoverImports = async () => ({
			rolledBackImportIds: [],
			completedImportIds: [],
			corruptJournalRecordCount: 0,
			quarantinedJournalRecordCount: 0,
		});
		const { result } = renderHook(() =>
			useJianyingDraftImport({ recoverImports })
		);
		await act(async () => result.current.chooseAndPlan());

		expect(result.current.phase).toBe("ready");
		expect(result.current.inspect?.profileId).toBe("capcut-8-1");
		expect(result.current.canCommit).toBe(false);
		act(() => result.current.setWarningsAccepted(true));
		expect(result.current.canCommit).toBe(true);
	});

	it("stops after inspection when the profile is unsupported", async () => {
		const bridge = installBridge({ outcome: "unsupported" });
		const recoverImports = async () => ({
			rolledBackImportIds: [],
			completedImportIds: [],
			corruptJournalRecordCount: 0,
			quarantinedJournalRecordCount: 0,
		});
		const { result } = renderHook(() =>
			useJianyingDraftImport({ recoverImports })
		);
		await act(async () => result.current.chooseAndPlan());

		expect(result.current.phase).toBe("ready");
		expect(result.current.plan).toBeNull();
		expect(bridge.planDraftImport).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(bridge.listPendingDraftImports).toHaveBeenCalledTimes(1)
		);
	});

	it("quarantines corrupt journals and refreshes recovery counts", async () => {
		installBridge({});
		const recoverImports = vi.fn(async () => ({
			rolledBackImportIds: [],
			completedImportIds: [],
			corruptJournalRecordCount: 2,
			quarantinedJournalRecordCount: 0,
		}));
		const quarantineCorruptRecords = vi.fn(async () => ({
			newlyQuarantinedRecordCount: 2,
			corruptRecordCount: 0,
			quarantinedRecordCount: 2,
		}));
		const { result } = renderHook(() =>
			useJianyingDraftImport({
				recoverImports,
				quarantineCorruptRecords,
			})
		);
		await waitFor(() =>
			expect(result.current.recoveryResult?.corruptJournalRecordCount).toBe(2)
		);

		await act(async () => result.current.quarantineCorruptJournalRecords());

		expect(quarantineCorruptRecords).toHaveBeenCalledTimes(1);
		expect(result.current.recoveryResult).toEqual({
			rolledBackImportIds: [],
			completedImportIds: [],
			corruptJournalRecordCount: 0,
			quarantinedJournalRecordCount: 2,
		});
		expect(result.current.isJournalQuarantineRunning).toBe(false);
	});
});
