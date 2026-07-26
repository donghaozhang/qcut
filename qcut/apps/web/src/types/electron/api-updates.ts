/**
 * Auto-update and release notes sub-interface for ElectronAPI.
 */

import type { ReleaseNote } from "./release-notes";
import type {
	PlatformCodexPluginUpdateState,
	PlatformUpdatePreferences,
	PlatformUpdateState,
} from "@qcut/platform-core";

export interface ElectronUpdateOps {
	updates?: {
		checkForUpdates: () => Promise<PlatformUpdateState>;
		downloadUpdate: () => Promise<PlatformUpdateState>;
		getState: () => Promise<PlatformUpdateState>;
		getPreferences: () => Promise<PlatformUpdatePreferences>;
		setPreferences: (
			preferences: Partial<PlatformUpdatePreferences>
		) => Promise<PlatformUpdatePreferences>;
		installUpdate: () => Promise<{
			success: boolean;
			message?: string;
			error?: string;
		}>;
		getReleaseNotes: (version?: string) => Promise<ReleaseNote | null>;
		getChangelog: () => Promise<ReleaseNote[]>;
		onUpdateAvailable: (
			callback: (data: {
				version: string;
				releaseNotes?: string;
				releaseDate?: string;
			}) => void
		) => () => void;
		onDownloadProgress: (
			callback: (data: {
				percent: number;
				transferred: number;
				total: number;
			}) => void
		) => () => void;
		onUpdateDownloaded: (
			callback: (data: { version: string }) => void
		) => () => void;
		onStateChanged: (
			callback: (state: PlatformUpdateState) => void
		) => () => void;
		plugin?: {
			checkForUpdates: () => Promise<PlatformCodexPluginUpdateState>;
			installUpdate: () => Promise<PlatformCodexPluginUpdateState>;
			getState: () => Promise<PlatformCodexPluginUpdateState>;
			onStateChanged: (
				callback: (state: PlatformCodexPluginUpdateState) => void
			) => () => void;
		};
	};
}
