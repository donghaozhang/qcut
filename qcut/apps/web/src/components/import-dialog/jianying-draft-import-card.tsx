import {
	AlertCircle,
	CheckCircle2,
	FolderOpen,
	Inbox,
	LoaderCircle,
	RefreshCw,
	ShieldAlert,
} from "lucide-react";
import type { JianyingDraftImportController } from "@/hooks/import/use-jianying-draft-import";
import { useTranslation } from "@/lib/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportJournalRecoveryStatus } from "./import-journal-recovery-status";

function countValues({
	values,
}: {
	values: readonly string[];
}): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
	return counts;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
	const { t } = useTranslation();
	const labelByOutcome: Record<string, string> = {
		exact: t("draftImport.outcomeExact"),
		ambiguous: t("draftImport.outcomeAmbiguous"),
		unsupported: t("draftImport.outcomeUnsupported"),
		encrypted: t("draftImport.outcomeEncrypted"),
	};
	return (
		<Badge variant={outcome === "exact" ? "default" : "destructive"}>
			{labelByOutcome[outcome] ?? outcome}
		</Badge>
	);
}

function ImportPlanDetails({
	controller,
}: {
	controller: JianyingDraftImportController;
}) {
	const { t } = useTranslation();
	const { inspect, plan } = controller;
	if (inspect === null) return null;
	const issueCounts = countValues({
		values: inspect.issues.map((issue) => issue.severity),
	});
	const assetCounts = countValues({
		values: Object.values(plan?.assetStatuses ?? {}),
	});
	const warningsAccepted =
		plan !== null &&
		plan.plan.warningFingerprints.length > 0 &&
		plan.plan.warningFingerprints.every((fingerprint) =>
			controller.acceptedWarningFingerprints.has(fingerprint)
		);

	return (
		<div className="space-y-5" data-testid="draft-import-plan-details">
			<div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-4">
				<div data-testid="draft-import-profile">
					<p className="text-xs text-muted-foreground">
						{t("draftImport.profile")}
					</p>
					<p className="mt-1 truncate text-sm font-medium">
						{inspect.profileId ?? t("draftImport.unknownProfile")}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						{t("draftImport.detection")}
					</p>
					<div className="mt-1">
						<OutcomeBadge outcome={inspect.outcome} />
					</div>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						{t("draftImport.files")}
					</p>
					<p className="mt-1 text-sm font-medium">{inspect.fileCount}</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">
						{t("draftImport.writeStatus")}
					</p>
					<p className="mt-1 text-sm font-medium">
						{inspect.canWrite
							? t("draftImport.writable")
							: t("draftImport.readOnly")}
					</p>
				</div>
			</div>

			{inspect.semantic !== undefined && (
				<div className="grid grid-cols-3 gap-3 text-center">
					<div className="bg-muted/40 px-3 py-2">
						<p className="text-lg font-semibold">
							{inspect.semantic.trackCount}
						</p>
						<p className="text-xs text-muted-foreground">
							{t("draftImport.tracks")}
						</p>
					</div>
					<div className="bg-muted/40 px-3 py-2">
						<p className="text-lg font-semibold">
							{inspect.semantic.segmentCount}
						</p>
						<p className="text-xs text-muted-foreground">
							{t("draftImport.clips")}
						</p>
					</div>
					<div className="bg-muted/40 px-3 py-2">
						<p className="text-lg font-semibold">
							{inspect.semantic.resourceCount}
						</p>
						<p className="text-xs text-muted-foreground">
							{t("draftImport.resources")}
						</p>
					</div>
				</div>
			)}

			<section data-testid="draft-import-issues">
				<div className="mb-2 flex items-center justify-between">
					<h3 className="text-sm font-semibold">{t("draftImport.issues")}</h3>
					<div className="flex gap-1.5">
						{Object.entries(issueCounts).map(([severity, count]) => (
							<Badge key={severity} variant="outline">
								{severity} {count}
							</Badge>
						))}
					</div>
				</div>
				{inspect.issues.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("draftImport.noIssues")}
					</p>
				) : (
					<div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
						{inspect.issues.map((issue, index) => (
							<div
								key={`${issue.code}-${issue.subjectId ?? issue.path ?? index}`}
								className="flex gap-2 bg-muted/30 px-3 py-2 text-xs"
							>
								<span className="shrink-0 font-medium uppercase">
									{issue.severity}
								</span>
								<span className="min-w-0 break-words text-muted-foreground">
									{issue.message}
								</span>
							</div>
						))}
					</div>
				)}
			</section>

			{plan !== null && (
				<>
					<section data-testid="draft-import-resources">
						<h3 className="mb-2 text-sm font-semibold">
							{t("draftImport.resourceStatus")}
						</h3>
						<div className="flex flex-wrap gap-2">
							{Object.keys(assetCounts).length === 0 ? (
								<span className="text-sm text-muted-foreground">
									{t("draftImport.noResources")}
								</span>
							) : (
								Object.entries(assetCounts).map(([status, count]) => (
									<Badge key={status} variant="secondary">
										{status} {count}
									</Badge>
								))
							)}
						</div>
					</section>

					<section
						className="flex items-start justify-between gap-4 border-y py-3"
						data-testid="draft-import-conflict"
					>
						<div>
							<h3 className="text-sm font-semibold">
								{t("draftImport.conflicts")}
							</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								{t("draftImport.conflictRename")}
							</p>
						</div>
						<Badge variant="outline">{t("draftImport.rename")}</Badge>
					</section>

					{plan.plan.warningFingerprints.length > 0 && (
						<label
							className="flex cursor-pointer items-start gap-3 bg-amber-500/10 px-3 py-3"
							data-testid="draft-import-warning-acceptance"
						>
							<Checkbox
								checked={warningsAccepted}
								onCheckedChange={(checked) =>
									controller.setWarningsAccepted(checked === true)
								}
							/>
							<span className="text-sm">
								{t("draftImport.acceptWarnings", {
									count: plan.plan.warningFingerprints.length,
								})}
							</span>
						</label>
					)}
				</>
			)}
		</div>
	);
}

function LiveImport({
	controller,
	onOpenProject,
}: {
	controller: JianyingDraftImportController;
	onOpenProject: (projectId: string) => void;
}) {
	const { t } = useTranslation();
	const isBusy = ["inspecting", "planning", "committing"].includes(
		controller.phase
	);
	return (
		<div className="space-y-5">
			<div className="flex items-center gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => void controller.chooseAndPlan()}
					disabled={isBusy}
				>
					{isBusy ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<FolderOpen className="size-4" />
					)}
					{controller.draftPath === null
						? t("draftImport.chooseFolder")
						: t("draftImport.chooseAnother")}
				</Button>
				{controller.draftPath !== null && (
					<span
						className="min-w-0 truncate text-xs text-muted-foreground"
						title={controller.draftPath}
					>
						{controller.draftPath}
					</span>
				)}
			</div>

			<ImportPlanDetails controller={controller} />

			{controller.errorMessage !== null && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>{t("draftImport.importFailed")}</AlertTitle>
					<AlertDescription>{controller.errorMessage}</AlertDescription>
				</Alert>
			)}

			{controller.phase === "success" &&
				controller.importedProjectId !== null && (
					<Alert>
						<CheckCircle2 className="size-4" />
						<AlertTitle>{t("draftImport.importComplete")}</AlertTitle>
						<AlertDescription>
							<Button
								type="button"
								variant="link"
								className="h-auto px-0"
								onClick={() => onOpenProject(controller.importedProjectId!)}
							>
								{t("draftImport.openProject")}
							</Button>
						</AlertDescription>
					</Alert>
				)}

			{controller.plan !== null && controller.phase !== "success" && (
				<div className="flex justify-end">
					<Button
						type="button"
						variant="primary"
						onClick={() => void controller.commitPlan()}
						disabled={
							!controller.canCommit || controller.phase === "committing"
						}
					>
						{controller.phase === "committing" && (
							<LoaderCircle className="size-4 animate-spin" />
						)}
						{t("draftImport.importProject")}
					</Button>
				</div>
			)}
		</div>
	);
}

function PendingImports({
	controller,
	onOpenProject,
}: {
	controller: JianyingDraftImportController;
	onOpenProject: (projectId: string) => void;
}) {
	const { t } = useTranslation();
	const recoveredCount =
		(controller.recoveryResult?.rolledBackImportIds.length ?? 0) +
		(controller.recoveryResult?.completedImportIds.length ?? 0);
	return (
		<div className="space-y-4" data-testid="draft-import-recovery">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{t("draftImport.pendingCount", {
						count: controller.inboxEntries.length,
					})}
				</p>
				<Button
					type="button"
					variant="text"
					size="sm"
					onClick={() => void controller.refreshInbox()}
					disabled={controller.isInboxLoading}
				>
					<RefreshCw
						className={
							controller.isInboxLoading ? "size-4 animate-spin" : "size-4"
						}
					/>
					{t("draftImport.refresh")}
				</Button>
			</div>

			{controller.isRecoveryRunning && (
				<p className="text-xs text-muted-foreground">
					{t("draftImport.recoveryRunning")}
				</p>
			)}
			{recoveredCount > 0 && (
				<Alert>
					<CheckCircle2 className="size-4" />
					<AlertTitle>{t("draftImport.recoveryComplete")}</AlertTitle>
					<AlertDescription>
						{t("draftImport.recoverySummary", {
							rolledBack:
								controller.recoveryResult?.rolledBackImportIds.length ?? 0,
							completed:
								controller.recoveryResult?.completedImportIds.length ?? 0,
						})}
					</AlertDescription>
				</Alert>
			)}

			{controller.pendingAcknowledgement !== null && (
				<Alert>
					<ShieldAlert className="size-4" />
					<AlertTitle>{t("draftImport.cleanupPending")}</AlertTitle>
					<AlertDescription className="space-y-2">
						<p>{t("draftImport.cleanupPendingDescription")}</p>
						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void controller.retryAcknowledgement()}
							>
								{t("draftImport.retryCleanup")}
							</Button>
							<Button
								type="button"
								variant="link"
								size="sm"
								onClick={() =>
									onOpenProject(controller.pendingAcknowledgement!.projectId)
								}
							>
								{t("draftImport.openProject")}
							</Button>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{controller.errorMessage !== null && (
				<p className="text-sm text-destructive">{controller.errorMessage}</p>
			)}

			{!controller.isInboxLoading && controller.inboxEntries.length === 0 ? (
				<div className="py-12 text-center">
					<Inbox className="mx-auto size-8 text-muted-foreground" />
					<p className="mt-3 text-sm text-muted-foreground">
						{t("draftImport.noPending")}
					</p>
				</div>
			) : (
				<div className="divide-y border-y">
					{controller.inboxEntries.map((entry) => (
						<div
							key={entry.entryId}
							className="flex items-center justify-between gap-4 py-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">
									{entry.projectName}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{t("draftImport.queuedMedia", {
										count: entry.mediaCount,
										date: new Date(
											entry.createdAtUnixMilliseconds
										).toLocaleString(),
									})}
								</p>
							</div>
							<Button
								type="button"
								variant="primary"
								size="sm"
								onClick={() => void controller.commitInboxEntry(entry.entryId)}
								disabled={controller.activeInboxEntryId !== null}
							>
								{controller.activeInboxEntryId === entry.entryId && (
									<LoaderCircle className="size-4 animate-spin" />
								)}
								{t("draftImport.importProject")}
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function JianyingDraftImportCard({
	controller,
	onOpenProject,
	defaultTab = "draft",
}: {
	controller: JianyingDraftImportController;
	onOpenProject: (projectId: string) => void;
	defaultTab?: "draft" | "inbox";
}) {
	const { t } = useTranslation();
	return (
		<>
			<ImportJournalRecoveryStatus
				corruptCount={controller.recoveryResult?.corruptJournalRecordCount ?? 0}
				quarantinedCount={
					controller.recoveryResult?.quarantinedJournalRecordCount ?? 0
				}
				isRunning={controller.isJournalQuarantineRunning}
				onQuarantine={controller.quarantineCorruptJournalRecords}
			/>
			<Tabs defaultValue={defaultTab}>
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="draft">
						{t("draftImport.draftFolder")}
					</TabsTrigger>
					<TabsTrigger value="inbox">
						{t("draftImport.desktopQueue")}
						{controller.inboxEntries.length > 0 && (
							<Badge variant="secondary" className="ml-2 px-1.5 py-0">
								{controller.inboxEntries.length}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="draft" className="mt-5">
					<LiveImport controller={controller} onOpenProject={onOpenProject} />
				</TabsContent>
				<TabsContent value="inbox" className="mt-5">
					<PendingImports
						controller={controller}
						onOpenProject={onOpenProject}
					/>
				</TabsContent>
			</Tabs>
		</>
	);
}
