/** Auto-update and release notes operations. */
export interface UpdatesAPI {
	updates?: {
		checkForUpdates: () => Promise<{
			available: boolean;
			version?: string;
			message?: string;
			error?: string;
		}>;
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
		onActivationToken: (callback: (token: string) => void) => () => void;
		deactivate: () => Promise<boolean>;
	};
}
