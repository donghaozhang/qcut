"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { CodexPluginUpdateSection } from "@/components/editor/properties-panel/codex-plugin-update-section";
import { UpdateSettingsSection } from "@/components/editor/properties-panel/update-settings-section";
import { useAppVersion } from "@/hooks/use-app-version";
import { useTranslation } from "@/lib/i18n";

export function AboutUpdatesDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const appVersion = useAppVersion();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl" data-testid="about-updates-dialog">
				<DialogHeader>
					<div className="flex items-center gap-3 pr-8">
						<img
							src="/logo.svg"
							alt="QCut"
							className="size-11 rounded-md object-cover"
						/>
						<div className="min-w-0">
							<DialogTitle className="flex items-baseline gap-2 text-xl">
								QCut
								{appVersion && (
									<span className="text-sm font-normal text-muted-foreground">
										v{appVersion}
									</span>
								)}
							</DialogTitle>
							<p className="mt-1 text-sm font-medium">{t("updates.about")}</p>
						</div>
					</div>
					<DialogDescription>{t("updates.aboutDescription")}</DialogDescription>
				</DialogHeader>
				<div className="space-y-5 pt-2">
					<UpdateSettingsSection />
					<CodexPluginUpdateSection />
				</div>
			</DialogContent>
		</Dialog>
	);
}
