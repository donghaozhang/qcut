"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiKeysView } from "./api-keys-view";

/** Settings panel — renders API Keys management in the editor properties sidebar. */
export function SettingsView() {
	return (
		<ScrollArea className="h-full">
			<div className="p-5" data-testid="api-keys-content">
				<ApiKeysView />
			</div>
		</ScrollArea>
	);
}
