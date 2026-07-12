"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiKeysView } from "./api-keys-view";
import { UpdateSettingsSection } from "./update-settings-section";

/** Settings panel — renders API Keys management in the editor properties sidebar. */
export function SettingsView() {
	return (
		<ScrollArea className="h-full">
			<div className="space-y-5 p-5" data-testid="api-keys-content">
				<UpdateSettingsSection />
				<ApiKeysView />
			</div>
		</ScrollArea>
	);
}
