"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiKeysView } from "./api-keys-view";
import { UpdateSettingsSection } from "./update-settings-section";
import { LanguageSelector } from "@/components/language-selector";
import { useTranslation } from "@/lib/i18n";

/** Settings panel — renders API Keys management in the editor properties sidebar. */
export function SettingsView() {
	const { t } = useTranslation();

	return (
		<ScrollArea className="h-full">
			<div className="space-y-5 p-5" data-testid="api-keys-content">
				<section className="space-y-2 border-b pb-5">
					<h3 className="text-sm font-semibold">{t("settings.interface")}</h3>
					<div className="flex items-center justify-between gap-3">
						<span className="text-xs text-muted-foreground">
							{t("language.label")}
						</span>
						<LanguageSelector />
					</div>
				</section>
				<UpdateSettingsSection />
				<ApiKeysView />
			</div>
		</ScrollArea>
	);
}
