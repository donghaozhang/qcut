import { useCallback, useEffect, useMemo, useState } from "react";
import {
	acknowledgePublishedDraftImport,
	commitLiveDraftImport,
	commitPendingDraftImport,
	JianyingDraftImportClientError,
} from "@/lib/jianying-draft/jianying-draft-import-client";
import type {
	DraftImportInboxEntrySummaryDto,
	DraftImportInspectDto,
	DraftImportPlanDto,
	JianyingDraftImportAPI,
} from "@/types/electron/api-jianying-draft-import";
import {
	quarantineCorruptImportJournalRecords,
	recoverPendingImports,
	type ImportRecoveryResult,
} from "@/lib/storage/import-recovery";
import type { ImportJournalQuarantineResult } from "@/lib/storage/import-journal";

export type JianyingDraftImportPhase =
	| "idle"
	| "inspecting"
	| "planning"
	| "ready"
	| "committing"
	| "success"
	| "error";

export interface PendingImportAcknowledgement {
	entryId: string;
	projectId: string;
}

export interface JianyingDraftImportController {
	isAvailable: boolean;
	phase: JianyingDraftImportPhase;
	draftPath: string | null;
	inspect: DraftImportInspectDto | null;
	plan: DraftImportPlanDto | null;
	inboxEntries: DraftImportInboxEntrySummaryDto[];
	isInboxLoading: boolean;
	isRecoveryRunning: boolean;
	isJournalQuarantineRunning: boolean;
	recoveryResult: ImportRecoveryResult | null;
	activeInboxEntryId: string | null;
	acceptedWarningFingerprints: ReadonlySet<string>;
	pendingAcknowledgement: PendingImportAcknowledgement | null;
	errorMessage: string | null;
	importedProjectId: string | null;
	canCommit: boolean;
	chooseAndPlan: () => Promise<void>;
	commitPlan: () => Promise<void>;
	commitInboxEntry: (entryId: string) => Promise<void>;
	retryAcknowledgement: () => Promise<void>;
	refreshInbox: () => Promise<void>;
	quarantineCorruptJournalRecords: () => Promise<void>;
	setWarningsAccepted: (accepted: boolean) => void;
	resetLiveImport: () => void;
}

function getBridge(): JianyingDraftImportAPI | null {
	return window.electronAPI?.jianyingDraftImport ?? null;
}

function messageForError({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : "The import failed.";
}

export function useJianyingDraftImport({
	onProjectImported,
	recoverImports = recoverPendingImports,
	quarantineCorruptRecords = quarantineCorruptImportJournalRecords,
}: {
	onProjectImported?: (projectId: string) => Promise<void> | void;
	recoverImports?: () => Promise<ImportRecoveryResult>;
	quarantineCorruptRecords?: () => Promise<ImportJournalQuarantineResult>;
} = {}): JianyingDraftImportController {
	const isAvailable = getBridge() !== null;
	const [phase, setPhase] = useState<JianyingDraftImportPhase>("idle");
	const [draftPath, setDraftPath] = useState<string | null>(null);
	const [inspect, setInspect] = useState<DraftImportInspectDto | null>(null);
	const [plan, setPlan] = useState<DraftImportPlanDto | null>(null);
	const [inboxEntries, setInboxEntries] = useState<
		DraftImportInboxEntrySummaryDto[]
	>([]);
	const [isInboxLoading, setIsInboxLoading] = useState(false);
	const [isRecoveryRunning, setIsRecoveryRunning] = useState(true);
	const [isJournalQuarantineRunning, setIsJournalQuarantineRunning] =
		useState(false);
	const [recoveryResult, setRecoveryResult] =
		useState<ImportRecoveryResult | null>(null);
	const [activeInboxEntryId, setActiveInboxEntryId] = useState<string | null>(
		null
	);
	const [acceptedWarningFingerprints, setAcceptedWarningFingerprints] =
		useState<Set<string>>(new Set());
	const [pendingAcknowledgement, setPendingAcknowledgement] =
		useState<PendingImportAcknowledgement | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [importedProjectId, setImportedProjectId] = useState<string | null>(
		null
	);

	const notifyImported = useCallback(
		async ({ projectId }: { projectId: string }) => {
			setImportedProjectId(projectId);
			try {
				await onProjectImported?.(projectId);
			} catch {
				// The project is already published; a list refresh can be retried safely.
			}
		},
		[onProjectImported]
	);

	const refreshInbox = useCallback(async () => {
		const bridge = getBridge();
		if (bridge === null) {
			setInboxEntries([]);
			return;
		}
		setIsInboxLoading(true);
		try {
			const result = await bridge.listPendingDraftImports();
			if (!result.ok) throw new Error(result.error.message);
			setInboxEntries(result.value);
		} catch (error) {
			setErrorMessage(messageForError({ error }));
		} finally {
			setIsInboxLoading(false);
		}
	}, []);

	useEffect(() => {
		void refreshInbox();
	}, [refreshInbox]);

	useEffect(() => {
		if (!isAvailable) {
			setIsRecoveryRunning(false);
			return;
		}
		let active = true;
		void recoverImports()
			.then((result) => {
				if (active) setRecoveryResult(result);
			})
			.catch((error: unknown) => {
				if (active) setErrorMessage(messageForError({ error }));
			})
			.finally(() => {
				if (active) setIsRecoveryRunning(false);
			});
		return () => {
			active = false;
		};
	}, [isAvailable, recoverImports]);

	const chooseAndPlan = useCallback(async () => {
		const bridge = getBridge();
		if (bridge === null) {
			setErrorMessage("Draft import is available in the QCut desktop app.");
			setPhase("error");
			return;
		}
		setErrorMessage(null);
		setImportedProjectId(null);
		setPendingAcknowledgement(null);
		try {
			const chosen = await bridge.chooseDraftDirectory();
			if (!chosen.ok) throw new Error(chosen.error.message);
			if (chosen.value === null) return;
			setDraftPath(chosen.value);
			setInspect(null);
			setPlan(null);
			setAcceptedWarningFingerprints(new Set());
			setPhase("inspecting");

			const inspected = await bridge.inspectDraft({ draftPath: chosen.value });
			if (!inspected.ok) throw new Error(inspected.error.message);
			setInspect(inspected.value);
			if (inspected.value.outcome !== "exact") {
				setPhase("ready");
				return;
			}

			setPhase("planning");
			const planned = await bridge.planDraftImport({ draftPath: chosen.value });
			if (!planned.ok) throw new Error(planned.error.message);
			setInspect(planned.value.inspect);
			setPlan(planned.value);
			setPhase("ready");
		} catch (error) {
			setErrorMessage(messageForError({ error }));
			setPhase("error");
		}
	}, []);

	const commitPlan = useCallback(async () => {
		const bridge = getBridge();
		if (bridge === null || plan === null) return;
		setPhase("committing");
		setErrorMessage(null);
		try {
			const projectId = await commitLiveDraftImport({
				bridge,
				planToken: plan.plan.planToken,
				acceptedWarningFingerprints: [...acceptedWarningFingerprints].sort(),
			});
			await notifyImported({ projectId });
			setPhase("success");
		} catch (error) {
			setErrorMessage(messageForError({ error }));
			setPhase("error");
		}
	}, [acceptedWarningFingerprints, notifyImported, plan]);

	const commitInboxEntry = useCallback(
		async (entryId: string) => {
			const bridge = getBridge();
			if (bridge === null) return;
			setActiveInboxEntryId(entryId);
			setErrorMessage(null);
			setPendingAcknowledgement(null);
			try {
				const projectId = await commitPendingDraftImport({ bridge, entryId });
				await notifyImported({ projectId });
				await refreshInbox();
			} catch (error) {
				if (error instanceof JianyingDraftImportClientError) {
					setPendingAcknowledgement(error.pendingAcknowledgement ?? null);
					if (error.pendingAcknowledgement !== undefined) {
						await notifyImported({
							projectId: error.pendingAcknowledgement.projectId,
						});
					}
				}
				setErrorMessage(messageForError({ error }));
			} finally {
				setActiveInboxEntryId(null);
			}
		},
		[notifyImported, refreshInbox]
	);

	const retryAcknowledgement = useCallback(async () => {
		const bridge = getBridge();
		if (bridge === null || pendingAcknowledgement === null) return;
		setActiveInboxEntryId(pendingAcknowledgement.entryId);
		setErrorMessage(null);
		try {
			await acknowledgePublishedDraftImport({
				bridge,
				entryId: pendingAcknowledgement.entryId,
			});
			setPendingAcknowledgement(null);
			await refreshInbox();
		} catch (error) {
			setErrorMessage(messageForError({ error }));
		} finally {
			setActiveInboxEntryId(null);
		}
	}, [pendingAcknowledgement, refreshInbox]);

	const quarantineCorruptJournalRecords = useCallback(async () => {
		setIsJournalQuarantineRunning(true);
		setErrorMessage(null);
		try {
			const result = await quarantineCorruptRecords();
			setRecoveryResult((current) => ({
				rolledBackImportIds: current?.rolledBackImportIds ?? [],
				completedImportIds: current?.completedImportIds ?? [],
				corruptJournalRecordCount: result.corruptRecordCount,
				quarantinedJournalRecordCount: result.quarantinedRecordCount,
			}));
		} catch (error) {
			setErrorMessage(messageForError({ error }));
		} finally {
			setIsJournalQuarantineRunning(false);
		}
	}, [quarantineCorruptRecords]);

	const setWarningsAccepted = useCallback(
		(accepted: boolean) => {
			setAcceptedWarningFingerprints(
				accepted && plan !== null
					? new Set(plan.plan.warningFingerprints)
					: new Set()
			);
		},
		[plan]
	);

	const resetLiveImport = useCallback(() => {
		setPhase("idle");
		setDraftPath(null);
		setInspect(null);
		setPlan(null);
		setAcceptedWarningFingerprints(new Set());
		setPendingAcknowledgement(null);
		setErrorMessage(null);
		setImportedProjectId(null);
	}, []);

	const canCommit = useMemo(() => {
		if (plan === null || !plan.plan.canCommit) return false;
		return plan.plan.warningFingerprints.every((fingerprint) =>
			acceptedWarningFingerprints.has(fingerprint)
		);
	}, [acceptedWarningFingerprints, plan]);

	return {
		isAvailable,
		phase,
		draftPath,
		inspect,
		plan,
		inboxEntries,
		isInboxLoading,
		isRecoveryRunning,
		isJournalQuarantineRunning,
		recoveryResult,
		activeInboxEntryId,
		acceptedWarningFingerprints,
		pendingAcknowledgement,
		errorMessage,
		importedProjectId,
		canCommit,
		chooseAndPlan,
		commitPlan,
		commitInboxEntry,
		retryAcknowledgement,
		refreshInbox,
		quarantineCorruptJournalRecords,
		setWarningsAccepted,
		resetLiveImport,
	};
}
