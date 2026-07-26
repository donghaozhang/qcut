/** Auto-update and release notes operations. */
import type { UpdateState } from "../../auto-update-controller.js";
import type { CodexPluginUpdateState } from "../../codex-plugin-update-controller.js";
import type { UpdatePreferences } from "../../update-preferences.js";

export interface UpdatesAPI {
	updates?: {
		checkForUpdates: () => Promise<UpdateState>;
		downloadUpdate: () => Promise<UpdateState>;
		getState: () => Promise<UpdateState>;
		getPreferences: () => Promise<UpdatePreferences>;
		setPreferences: (
			preferences: Partial<UpdatePreferences>
		) => Promise<UpdatePreferences>;
		installUpdate: () => Promise<{
			success: boolean;
			message?: string;
			error?: string;
		}>;
		getReleaseNotes: (version?: string) => Promise<{
			version: string;
			date: string;
			channel: string;
			content: string;
		} | null>;
		getChangelog: () => Promise<
			Array<{
				version: string;
				date: string;
				channel: string;
				content: string;
			}>
		>;
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
		onStateChanged: (callback: (state: UpdateState) => void) => () => void;
		plugin?: {
			checkForUpdates: () => Promise<CodexPluginUpdateState>;
			installUpdate: () => Promise<CodexPluginUpdateState>;
			getState: () => Promise<CodexPluginUpdateState>;
			onStateChanged: (
				callback: (state: CodexPluginUpdateState) => void
			) => () => void;
		};
	};
}

/** License management operations. */
export interface LicenseAPI {
	license?: {
		check: () => Promise<{
			plan: "free" | "pro" | "team";
			status: "active" | "past_due" | "cancelled" | "expired";
			currentPeriodEnd?: string;
			credits: {
				planCredits: number;
				topUpCredits: number;
				totalCredits: number;
				planCreditsResetAt: string;
			};
		}>;
		activate: (token: string) => Promise<boolean>;
		trackUsage: (
			type: "ai_generation" | "export" | "render"
		) => Promise<boolean>;
		deductCredits: (
			amount: number,
			modelKey: string,
			description: string
		) => Promise<boolean>;
		setAuthToken: (token: string) => Promise<boolean>;
		clearAuthToken: () => Promise<boolean>;
		getAuthToken: () => Promise<string>;
		onActivationToken: (callback: (token: string) => void) => () => void;
		deactivate: () => Promise<boolean>;
		emailLogin: (
			email: string,
			password: string
		) => Promise<{ success: boolean; error?: string }>;
		emailSignup: (
			name: string,
			email: string,
			password: string
		) => Promise<{ success: boolean; error?: string }>;
		getGoogleLoginUrl: () => Promise<string>;
	};
}
