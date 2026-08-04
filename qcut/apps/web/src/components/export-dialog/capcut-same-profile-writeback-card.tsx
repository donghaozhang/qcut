import {
	AlertCircle,
	CheckCircle2,
	FolderSync,
	Loader2,
	RotateCcw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type CapCutWritebackAvailabilityReason,
	useCapCutSameProfileWriteback,
	type UseCapCutSameProfileWritebackOptions,
} from "@/hooks/export/use-capcut-same-profile-writeback";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { useEffect } from "react";

interface CapCutSameProfileWritebackCardProps
	extends Pick<
		UseCapCutSameProfileWritebackOptions,
		"bridgeAvailable" | "recoverWriteback" | "runWriteback"
	> {
	disabled?: boolean;
	onBusyChange?: (isBusy: boolean) => void;
	project: TProject | null;
	tracks: readonly TimelineTrack[];
}

const AVAILABILITY_KEYS: Record<
	CapCutWritebackAvailabilityReason,
	TranslationKey
> = {
	"baseline-document-missing": "draftWriteback.baselineMissing",
	"bridge-unavailable": "draftWriteback.desktopOnly",
	"envelope-not-captured": "draftWriteback.envelopeMissing",
	"envelope-unavailable": "draftWriteback.envelopeUnavailable",
	"profile-not-writable": "draftWriteback.verificationRequired",
};

export function CapCutSameProfileWritebackCard({
	bridgeAvailable,
	disabled = false,
	onBusyChange,
	project,
	recoverWriteback,
	runWriteback,
	tracks,
}: CapCutSameProfileWritebackCardProps) {
	const { t } = useTranslation();
	const controller = useCapCutSameProfileWriteback({
		bridgeAvailable,
		project,
		recoverWriteback,
		runWriteback,
		tracks,
	});

	useEffect(() => {
		onBusyChange?.(controller.isBusy);
	}, [controller.isBusy, onBusyChange]);

	useEffect(
		() => () => {
			onBusyChange?.(false);
		},
		[onBusyChange]
	);

	if (!controller.isVisible) return null;
	const unavailableMessage = controller.availabilityReason
		? t(AVAILABILITY_KEYS[controller.availabilityReason])
		: null;

	return (
		<Card
			className="border-emerald-500/30 bg-emerald-500/[0.03]"
			data-testid="capcut-same-profile-writeback-card"
		>
			<CardHeader className="space-y-2 p-4 pb-3">
				<div className="flex items-start gap-3">
					<div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-500">
						<FolderSync className="size-4" />
					</div>
					<div className="min-w-0">
						<CardTitle className="text-sm">
							{t("draftWriteback.title")}
						</CardTitle>
						<CardDescription className="mt-1 text-xs">
							{t("draftWriteback.description")}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3 p-4 pt-0">
				{controller.state.phase === "idle" && (
					<div className="space-y-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void controller.writeback()}
							disabled={disabled || unavailableMessage !== null}
							data-testid="capcut-same-profile-writeback-start"
						>
							<FolderSync className="mr-2 size-4" />
							{t("draftWriteback.action")}
						</Button>
						{unavailableMessage && (
							<p className="text-xs text-muted-foreground" role="status">
								{unavailableMessage}
							</p>
						)}
						{disabled && unavailableMessage === null && (
							<p className="text-xs text-muted-foreground">
								{t("draftWriteback.finishOperation")}
							</p>
						)}
					</div>
				)}

				{(controller.state.phase === "writing" ||
					controller.state.phase === "recovering") && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						{controller.state.phase === "writing"
							? t("draftWriteback.writing")
							: t("draftWriteback.recovering")}
					</div>
				)}

				{controller.state.phase === "success" && (
					<Alert className="border-emerald-500/30 bg-emerald-500/5">
						<CheckCircle2 className="size-4 text-emerald-500" />
						<AlertTitle>{t("draftWriteback.complete")}</AlertTitle>
						<AlertDescription>
							{t(`draftWriteback.${controller.state.result.outcome}`)}
						</AlertDescription>
					</Alert>
				)}

				{controller.state.phase === "error" && (
					<Alert variant="destructive">
						<AlertCircle className="size-4" />
						<AlertTitle>{t("draftWriteback.failed")}</AlertTitle>
						<AlertDescription className="space-y-2">
							<p>{controller.state.failure.message}</p>
							{"issues" in controller.state.failure &&
								controller.state.failure.issues?.map((issue) => (
									<p key={`${issue.code}-${issue.semanticId ?? ""}`}>
										{issue.code}: {issue.message}
									</p>
								))}
						</AlertDescription>
					</Alert>
				)}

				{controller.state.phase === "recovered" && (
					<Alert>
						<CheckCircle2 className="size-4" />
						<AlertTitle>{t("draftWriteback.recovered")}</AlertTitle>
						<AlertDescription>{controller.state.action}</AlertDescription>
					</Alert>
				)}

				{controller.state.phase === "error" &&
					"selectionToken" in controller.state.failure &&
					controller.state.failure.selectionToken !== undefined && (
						<Button
							type="button"
							size="sm"
							onClick={() => void controller.recover()}
						>
							<RotateCcw className="mr-2 size-4" />
							{t("draftWriteback.recover")}
						</Button>
					)}

				{(controller.state.phase === "success" ||
					controller.state.phase === "error" ||
					controller.state.phase === "recovered") && (
					<Button
						type="button"
						size="sm"
						variant="text"
						onClick={controller.reset}
					>
						{t("draftWriteback.reset")}
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
