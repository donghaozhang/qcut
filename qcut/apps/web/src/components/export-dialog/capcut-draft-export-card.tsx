import { useEffect, useState, type KeyboardEvent } from "react";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type CapCutDraftExportElectronAPI,
	type CapCutDraftExportState,
	useCapCutDraftExport,
} from "@/hooks/export/use-capcut-draft-export";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import {
	CapCutDraftBusyState,
	CapCutDraftErrorState,
	CapCutDraftReviewState,
	CapCutDraftSuccessState,
} from "./capcut-draft-export-states";

interface CapCutDraftExportCardProps {
	disabled?: boolean;
	electronAPI?: CapCutDraftExportElectronAPI;
	mediaItems: readonly MediaItem[];
	onBusyChange?: (isBusy: boolean) => void;
	project: TProject | null;
	tracks: readonly TimelineTrack[];
}

function handleCardKeyDown({
	event,
	onReset,
	state,
}: {
	event: KeyboardEvent<HTMLDivElement>;
	onReset: () => Promise<void>;
	state: CapCutDraftExportState;
}) {
	if (
		event.key !== "Escape" ||
		state.phase === "idle" ||
		state.phase === "planning" ||
		state.phase === "committing" ||
		(state.phase === "success" && state.install.phase === "installing")
	) {
		return;
	}
	event.stopPropagation();
	void onReset();
}

export function CapCutDraftExportCard({
	disabled = false,
	electronAPI,
	mediaItems,
	onBusyChange,
	project,
	tracks,
}: CapCutDraftExportCardProps) {
	const resolvedElectronAPI =
		electronAPI ??
		(typeof window === "undefined" ? undefined : window.electronAPI);
	const {
		acknowledgeWarnings,
		commitExport,
		installDraft,
		isBusy,
		planExport,
		reset,
		state,
		unavailableReason,
	} = useCapCutDraftExport({
		electronAPI: resolvedElectronAPI,
		mediaItems,
		project,
		tracks,
	});
	const [revealError, setRevealError] = useState<string | null>(null);

	useEffect(() => {
		onBusyChange?.(isBusy);
	}, [isBusy, onBusyChange]);

	useEffect(
		() => () => {
			onBusyChange?.(false);
		},
		[onBusyChange]
	);

	const revealOutput = async () => {
		if (state.phase !== "success") return;
		setRevealError(null);
		try {
			const reveal = resolvedElectronAPI?.shell?.showItemInFolder;
			if (!reveal) {
				throw new Error("The system file browser is unavailable.");
			}
			await reveal(state.result.outputDirectory);
		} catch (error) {
			setRevealError(
				error instanceof Error
					? error.message
					: "QCut could not show the output directory."
			);
		}
	};

	return (
		<Card
			className="border-primary/30 bg-primary/[0.03]"
			data-testid="capcut-draft-export-card"
			onKeyDown={(event) => handleCardKeyDown({ event, onReset: reset, state })}
		>
			<CardHeader className="space-y-2 p-4 pb-3">
				<div className="flex items-start gap-3">
					<div className="rounded-md border border-primary/20 bg-primary/10 p-2 text-primary">
						<Clapperboard className="size-4" />
					</div>
					<div className="min-w-0">
						<CardTitle className="text-sm">CapCut draft</CardTitle>
						<CardDescription className="mt-1 text-xs">
							Create a CapCut 8.1 draft bundle without rendering a video.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3 p-4 pt-0">
				{state.phase === "idle" && (
					<div className="space-y-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void planExport()}
							disabled={disabled || unavailableReason !== null}
							aria-describedby={
								unavailableReason ? "capcut-draft-unavailable" : undefined
							}
							data-testid="capcut-draft-plan"
						>
							Review draft export
						</Button>
						{unavailableReason && (
							<p
								id="capcut-draft-unavailable"
								className="text-xs text-muted-foreground"
							>
								{unavailableReason}
							</p>
						)}
						{disabled && !unavailableReason && (
							<p className="text-xs text-muted-foreground">
								Finish the current video export first.
							</p>
						)}
					</div>
				)}

				{(state.phase === "planning" || state.phase === "committing") && (
					<CapCutDraftBusyState phase={state.phase} />
				)}

				{state.phase === "reviewing" && (
					<CapCutDraftReviewState
						onAcknowledgeWarnings={acknowledgeWarnings}
						onCommit={commitExport}
						onReset={reset}
						onReviewAgain={planExport}
						plan={state.plan}
						warningsAcknowledged={state.warningsAcknowledged}
					/>
				)}

				{state.phase === "error" && (
					<CapCutDraftErrorState
						failure={state.failure}
						onReset={reset}
						onRetry={planExport}
						retryDisabled={disabled || unavailableReason !== null}
					/>
				)}

				{state.phase === "success" && (
					<CapCutDraftSuccessState
						cleanupIssues={state.cleanupIssues}
						install={state.install}
						onInstall={installDraft}
						onReset={reset}
						onReveal={revealOutput}
						result={state.result}
						revealError={revealError}
					/>
				)}
			</CardContent>
		</Card>
	);
}
