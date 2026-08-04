import { Archive, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ImportJournalRecoveryStatus({
	corruptCount,
	isRunning,
	onQuarantine,
	quarantinedCount,
}: {
	corruptCount: number;
	isRunning: boolean;
	onQuarantine: () => Promise<void>;
	quarantinedCount: number;
}) {
	const { t } = useTranslation();
	if (corruptCount === 0 && quarantinedCount === 0) return null;
	const startQuarantine = () => void onQuarantine();
	return (
		<div className="mb-4 space-y-3">
			{corruptCount > 0 && (
				<Alert variant="destructive" data-testid="draft-import-corrupt-journal">
					<ShieldAlert className="size-4" />
					<AlertTitle>{t("draftImport.corruptRecoveryTitle")}</AlertTitle>
					<AlertDescription className="space-y-3">
						<p>
							{t("draftImport.corruptRecoveryDescription", {
								count: corruptCount,
							})}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={startQuarantine}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") return;
								event.preventDefault();
								startQuarantine();
							}}
							disabled={isRunning}
						>
							{isRunning ? (
								<LoaderCircle className="size-4 animate-spin" />
							) : (
								<Archive className="size-4" />
							)}
							{t(
								isRunning
									? "draftImport.corruptRecoveryRunning"
									: "draftImport.corruptRecoveryAction"
							)}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{quarantinedCount > 0 && (
				<Alert data-testid="draft-import-quarantined-journal">
					<ShieldCheck className="size-4" />
					<AlertTitle>{t("draftImport.quarantinedRecoveryTitle")}</AlertTitle>
					<AlertDescription>
						{t("draftImport.quarantinedRecoveryDescription", {
							count: quarantinedCount,
						})}
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
