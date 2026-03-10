"use client";

import { platform } from "@qcut/platform-core";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useEditorStore } from "@/stores/editor/editor-store";
import {
	useKeybindingsListener,
	useKeybindingDisabler,
} from "@/hooks/keyboard/use-keybindings";
import { useEditorActions } from "@/hooks/use-editor-actions";
import { ScenesMigrator } from "@/components/providers/migrators/scenes-migrator";
import { useLicenseStore } from "@/stores/license-store";

interface EditorProviderProps {
	children: React.ReactNode;
}

export function EditorProvider({ children }: EditorProviderProps) {
	const { isInitializing, isPanelsReady, initializeApp } = useEditorStore();
	const { disableKeybindings, enableKeybindings } = useKeybindingDisabler();

	// Set up action handlers
	useEditorActions();

	// Set up keybinding listener
	useKeybindingsListener();

	// Disable keybindings when initializing
	useEffect(() => {
		if (isInitializing || !isPanelsReady) {
			disableKeybindings();
		} else {
			enableKeybindings();
		}
	}, [isInitializing, isPanelsReady, disableKeybindings, enableKeybindings]);

	useEffect(() => {
		initializeApp();
	}, [initializeApp]);

	// Check license on editor load
	const checkLicense = useLicenseStore((s) => s.checkLicense);
	useEffect(() => {
		checkLicense();
	}, [checkLicense]);

	// Handle deep-link activation tokens delivered by the main process.
	useEffect(() => {
		const licenseApi = platform().license;
		if (!licenseApi?.onActivationToken) {
			return;
		}

		const unsubscribe = licenseApi.onActivationToken(async (token) => {
			try {
				const activated = await licenseApi.activate(token);
				if (activated) {
					await checkLicense();
				}
			} catch {
				// Activation failures should not crash editor boot.
			}
		});

		return () => {
			unsubscribe?.();
		};
	}, [checkLicense]);

	// Show loading screen while initializing
	if (isInitializing || !isPanelsReady) {
		return (
			<div className="h-screen w-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					<p className="text-sm text-muted-foreground">Loading editor...</p>
				</div>
			</div>
		);
	}

	// App is ready, render children with scene migration
	return <ScenesMigrator>{children}</ScenesMigrator>;
}
