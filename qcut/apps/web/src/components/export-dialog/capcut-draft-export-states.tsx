import {
	AlertCircle,
	CheckCircle2,
	Clapperboard,
	FolderOpen,
	Loader2,
	PackageOpen,
	RefreshCw,
	TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type {
	CapCutDraftExportFailure,
	CapCutDraftExportState,
} from "@/hooks/export/use-capcut-draft-export";
import type {
	CapCut81MigrationCommitDto,
	CapCut81MigrationPlanDto,
	JianyingDraftIssueDto,
} from "@/types/electron/api-jianying-draft-export";

interface IssueGroupProps {
	issues: JianyingDraftIssueDto[];
	severity: JianyingDraftIssueDto["severity"];
}

interface ReviewProps {
	onAcknowledgeWarnings: ({ accepted }: { accepted: boolean }) => void;
	onCommit: () => Promise<void>;
	onReset: () => Promise<void>;
	onReviewAgain: () => Promise<void>;
	plan: CapCut81MigrationPlanDto;
	warningsAcknowledged: boolean;
}

interface ErrorProps {
	failure: CapCutDraftExportFailure;
	onReset: () => Promise<void>;
	onRetry: () => Promise<void>;
	retryDisabled: boolean;
}

interface SuccessProps {
	cleanupIssues: JianyingDraftIssueDto[];
	install: Extract<CapCutDraftExportState, { phase: "success" }>["install"];
	onInstall: () => Promise<void>;
	onReset: () => Promise<void>;
	onReveal: () => Promise<void>;
	result: CapCut81MigrationCommitDto;
	revealError: string | null;
}

const ISSUE_GROUP_DETAILS: Record<
	JianyingDraftIssueDto["severity"],
	{ label: string; className: string }
> = {
	error: {
		label: "Blockers",
		className: "border-destructive/40 bg-destructive/5",
	},
	warning: {
		label: "Warnings",
		className: "border-amber-500/40 bg-amber-500/5",
	},
	info: {
		label: "Notes",
		className: "border-border/60 bg-muted/30",
	},
};

function getIssueContext({
	issue,
}: {
	issue: JianyingDraftIssueDto;
}): string[] {
	return [
		issue.trackId ? `Track ${issue.trackId}` : null,
		issue.elementId ? `Element ${issue.elementId}` : null,
		issue.mediaId ? `Media ${issue.mediaId}` : null,
	].filter((value): value is string => value !== null);
}

function IssueGroup({ issues, severity }: IssueGroupProps) {
	const matchingIssues = issues.filter((issue) => issue.severity === severity);
	if (matchingIssues.length === 0) return null;
	const details = ISSUE_GROUP_DETAILS[severity];

	return (
		<section className={`rounded-md border p-3 ${details.className}`}>
			<h4 className="text-xs font-semibold">
				{details.label} ({matchingIssues.length})
			</h4>
			<ul className="mt-2 space-y-2">
				{matchingIssues.map((issue, index) => {
					const context = getIssueContext({ issue });
					return (
						<li
							key={`${issue.code}-${issue.trackId ?? ""}-${issue.elementId ?? ""}-${index}`}
							className="text-xs"
						>
							<div className="flex items-start gap-2">
								<code className="shrink-0 rounded bg-background/70 px-1 py-0.5 text-[10px]">
									{issue.code}
								</code>
								<span>{issue.message}</span>
							</div>
							{context.length > 0 && (
								<div className="mt-1 pl-2 text-[11px] text-muted-foreground">
									{context.join(" · ")}
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function IssueSummary({ issues }: { issues: JianyingDraftIssueDto[] }) {
	if (issues.length === 0) {
		return (
			<div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
				<CheckCircle2 className="size-4 text-emerald-500" />
				No compatibility issues were found.
			</div>
		);
	}

	return (
		<div className="space-y-2" data-testid="capcut-draft-issue-summary">
			<IssueGroup issues={issues} severity="error" />
			<IssueGroup issues={issues} severity="warning" />
			<IssueGroup issues={issues} severity="info" />
		</div>
	);
}

export function CapCutDraftReviewState({
	onAcknowledgeWarnings,
	onCommit,
	onReset,
	onReviewAgain,
	plan,
	warningsAcknowledged,
}: ReviewProps) {
	const warningCount = plan.warningFingerprints.length;
	const requiresWarningAcknowledgement = warningCount > 0;
	const canCommit =
		plan.canCommit && (!requiresWarningAcknowledgement || warningsAcknowledged);

	return (
		<div className="space-y-3" data-testid="capcut-draft-review">
			<div>
				<h3 className="text-sm font-semibold">Compatibility review</h3>
				<p className="mt-1 text-xs text-muted-foreground">
					Review every issue before creating the CapCut 8.1 draft bundle.
				</p>
			</div>
			<IssueSummary issues={plan.issues} />
			{requiresWarningAcknowledgement && (
				<div
					id="capcut-draft-warning-summary"
					className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
				>
					<div className="flex items-start gap-2">
						<TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
						<div className="space-y-2">
							<p className="text-xs">
								This review contains {warningCount}{" "}
								{warningCount === 1 ? "warning" : "warnings"}.
							</p>
							<div className="flex items-start gap-2">
								<Checkbox
									id="capcut-draft-acknowledge-warnings"
									checked={warningsAcknowledged}
									onCheckedChange={(checked) =>
										onAcknowledgeWarnings({ accepted: checked === true })
									}
									aria-describedby="capcut-draft-warning-summary"
								/>
								<Label
									htmlFor="capcut-draft-acknowledge-warnings"
									className="cursor-pointer text-xs leading-4"
								>
									I reviewed and accept all warnings for this export.
								</Label>
							</div>
						</div>
					</div>
				</div>
			)}
			{!plan.canCommit && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>Resolve the blockers first</AlertTitle>
					<AlertDescription>
						Update the project, then run a fresh compatibility review.
					</AlertDescription>
				</Alert>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					onClick={() => void onCommit()}
					disabled={!canCommit}
					data-testid="capcut-draft-commit"
				>
					<PackageOpen className="size-4" />
					Create draft bundle
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => void onReviewAgain()}
				>
					<RefreshCw className="size-4" />
					Review again
				</Button>
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => void onReset()}
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}

export function CapCutDraftErrorState({
	failure,
	onReset,
	onRetry,
	retryDisabled,
}: ErrorProps) {
	return (
		<div className="space-y-3" data-testid="capcut-draft-error">
			<Alert variant="destructive">
				<AlertCircle className="size-4" />
				<AlertTitle>CapCut draft export failed</AlertTitle>
				<AlertDescription>
					<p>{failure.message}</p>
					<code className="mt-1 block text-[10px]">{failure.code}</code>
				</AlertDescription>
			</Alert>
			{failure.issues.length > 0 && <IssueSummary issues={failure.issues} />}
			<div className="flex gap-2">
				<Button
					type="button"
					size="sm"
					onClick={() => void onRetry()}
					disabled={retryDisabled}
				>
					Run a fresh review
				</Button>
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => void onReset()}
				>
					Dismiss
				</Button>
			</div>
		</div>
	);
}

export function CapCutDraftSuccessState({
	cleanupIssues,
	install,
	onInstall,
	onReset,
	onReveal,
	result,
	revealError,
}: SuccessProps) {
	return (
		<div className="space-y-3" data-testid="capcut-draft-success">
			<div
				className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3"
				role="status"
				aria-live="polite"
			>
				<div className="flex items-start gap-2">
					<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
					<div className="min-w-0">
						<h3 className="text-sm font-semibold">Draft bundle created</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							{result.assetCount} {result.assetCount === 1 ? "asset" : "assets"}{" "}
							packaged for CapCut 8.1.
						</p>
					</div>
				</div>
			</div>
			<div className="rounded-md border border-border/60 bg-muted/20 p-3">
				<div className="text-[11px] font-medium text-muted-foreground">
					Output directory
				</div>
				<code
					className="mt-1 block break-all text-xs"
					title={result.outputDirectory}
				>
					{result.outputDirectory}
				</code>
			</div>
			{result.durabilityWarnings.length > 0 && (
				<div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
					<h4 className="text-xs font-semibold">
						File system warnings ({result.durabilityWarnings.length})
					</h4>
					<ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
						{result.durabilityWarnings.map((warning) => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				</div>
			)}
			{cleanupIssues.length > 0 && <IssueSummary issues={cleanupIssues} />}
			{install.phase === "error" && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertTitle>CapCut installation failed</AlertTitle>
					<AlertDescription>
						<p>{install.failure.message}</p>
						<code className="mt-1 block text-[10px]">
							{install.failure.code}
						</code>
					</AlertDescription>
				</Alert>
			)}
			{install.phase === "success" && (
				<div
					className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs"
					role="status"
					aria-live="polite"
				>
					<div className="font-semibold">Installed into CapCut</div>
					<div className="mt-1 break-all text-muted-foreground">
						{install.result.targetDraftStoreDirectory}
					</div>
				</div>
			)}
			{revealError && (
				<p className="text-xs text-destructive" role="alert">
					{revealError}
				</p>
			)}
			{install.phase !== "success" && (
				<p className="text-[11px] text-muted-foreground">
					Automatic installation is available only for this bundle in the
					current QCut session.
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					onClick={() => void onReveal()}
					disabled={install.phase === "installing"}
					data-testid="capcut-draft-reveal"
				>
					<FolderOpen className="size-4" />
					Show output
				</Button>
				{install.phase !== "success" && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => void onInstall()}
						disabled={install.phase === "installing"}
						data-testid="capcut-draft-install"
					>
						{install.phase === "installing" ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Clapperboard className="size-4" />
						)}
						{install.phase === "installing"
							? "Installing…"
							: install.phase === "error"
								? "Retry installation"
								: "Install into CapCut"}
					</Button>
				)}
				<Button
					type="button"
					size="sm"
					variant="text"
					onClick={() => void onReset()}
					disabled={install.phase === "installing"}
				>
					Create another
				</Button>
			</div>
		</div>
	);
}

export function CapCutDraftBusyState({
	phase,
}: {
	phase: "planning" | "committing";
}) {
	const isPlanning = phase === "planning";
	return (
		<div
			className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-4"
			role="status"
			aria-live="polite"
		>
			<Loader2 className="size-5 animate-spin text-primary" />
			<div>
				<div className="text-sm font-medium">
					{isPlanning ? "Reviewing project compatibility" : "Creating draft"}
				</div>
				<div className="text-xs text-muted-foreground">
					{isPlanning
						? "Checking media paths and CapCut feature support…"
						: "Copying media and writing the CapCut draft bundle…"}
				</div>
			</div>
		</div>
	);
}
