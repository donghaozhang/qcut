/**
 * Claude UI Panel Navigation Bridge
 *
 * Handles panel switch requests from the main process.
 * Enables the HTTP API and CLI to switch editor panels externally.
 *
 * @module lib/claude-bridge/claude-ui-bridge
 */

import {
	useMediaPanelStore,
	getGroupForTab,
	tabs,
	type Tab,
} from "@/components/editor/media-panel/store";
import { useExportStore } from "@/stores/export-store";
import { platform } from "@qcut/platform-core";

const propertiesPanelTabs: Record<
	string,
	"properties" | "export" | "settings"
> = {
	properties: "properties",
	export: "export",
	"api-keys": "settings",
};

export function setupClaudeUiBridge(): void {
	const bridge = platform().claude?.ui;
	if (!bridge) return;

	bridge.onSwitchPanelRequest((data) => {
		try {
			// Handle properties panel sub-tabs (Properties, Export, API Keys)
			const propTab = propertiesPanelTabs[data.panel];
			if (propTab) {
				useExportStore.getState().setPanelView(propTab);
				bridge.sendSwitchPanelResponse(data.requestId, {
					switched: true,
					panel: data.panel,
					group: "properties",
				});
				return;
			}

			const panelTab = data.panel as Tab;
			if (!(panelTab in tabs)) {
				bridge.sendSwitchPanelResponse(
					data.requestId,
					undefined,
					`Unknown panel: ${data.panel}. Available: ${Object.keys(tabs).join(", ")}, ${Object.keys(propertiesPanelTabs).join(", ")}`
				);
				return;
			}
			const store = useMediaPanelStore.getState();
			const group = getGroupForTab(panelTab);

			store.setActiveGroup(group);
			store.setActiveTab(panelTab);

			// Switch inner tab if requested (e.g. moyin sub-tabs)
			if (data.tab) {
				window.dispatchEvent(
					new CustomEvent("moyin:switch-tab", {
						detail: { tab: data.tab },
					})
				);
			}

			bridge.sendSwitchPanelResponse(data.requestId, {
				switched: true,
				panel: panelTab,
				group,
			});
		} catch (err) {
			bridge.sendSwitchPanelResponse(
				data.requestId,
				undefined,
				err instanceof Error ? err.message : String(err)
			);
		}
	});
}

export function cleanupClaudeUiBridge(): void {
	platform().claude?.ui?.removeListeners();
}
