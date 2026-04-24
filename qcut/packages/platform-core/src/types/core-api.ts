/**
 * Core platform API namespace interfaces.
 * Files, storage, theme, shell, API keys, license.
 *
 * @module @qcut/platform-core/types/core-api
 */

import type {
	ThemeSource,
	FileDialogFilter,
	FileInfo,
	SaveBlobResult,
} from "./base.js";

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface PlatformFilesAPI {
	openFileDialog(): Promise<string | null>;
	openMultipleFilesDialog(): Promise<string[]>;
	saveFileDialog(
		defaultFilename?: string,
		filters?: FileDialogFilter[]
	): Promise<string | null>;
	readFile(filePath: string): Promise<Buffer | null>;
	writeFile(
		filePath: string,
		data: Buffer | ArrayBuffer | string
	): Promise<boolean>;
	saveBlob(
		data: ArrayBuffer | Uint8Array,
		defaultFilename?: string
	): Promise<SaveBlobResult>;
	getFileInfo(filePath: string): Promise<FileInfo | null>;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface PlatformStorageAPI {
	save(key: string, data: unknown): Promise<boolean>;
	load(key: string): Promise<unknown>;
	remove(key: string): Promise<boolean>;
	list(): Promise<string[]>;
	clear(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export interface PlatformThemeAPI {
	get(): Promise<ThemeSource>;
	set(theme: ThemeSource): Promise<ThemeSource>;
	toggle(): Promise<ThemeSource>;
	isDark(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export interface PlatformShellAPI {
	showItemInFolder(filePath: string): Promise<void>;
	openExternal(url: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

/**
 * Precedence for API key sources. Highest-priority tier wins.
 *
 * ⚠ Mirrored in `electron/api-key-status.ts` and
 * `electron/preload-types/supporting-types.ts`. Electron's tsconfig
 * (`rootDir: "."`, `moduleResolution: "node"`) can't resolve workspace
 * subpath exports, which is why the constant is duplicated there rather
 * than imported — a convention documented on multiple sites in electron/
 * (e.g. `electron/native-pipeline/subtitle/subtitle-types.ts`). Any
 * reorder or new tier MUST land in all three copies together — the
 * snapshot assertion in `electron/__tests__/api-key-status.test.ts`
 * catches ordering drift.
 */
export const KEY_SOURCE_PRECEDENCE = [
	"environment",
	"electron",
	"file",
] as const;

export type KeySource = (typeof KEY_SOURCE_PRECEDENCE)[number];
export type ApiKeyStatusSource = KeySource | "localStorage" | "not-set";

export interface PlatformApiKeyStatus {
	set: boolean;
	source: ApiKeyStatusSource;
	shadowedBy: readonly KeySource[];
}

export type PlatformApiKeysStatus = Record<string, PlatformApiKeyStatus>;

export interface PlatformApiKeysAPI {
	get(): Promise<Record<string, string>>;
	set(keys: Record<string, string>): Promise<boolean>;
	clear(): Promise<boolean>;
	status(): Promise<PlatformApiKeysStatus>;
}

// ---------------------------------------------------------------------------
// License
// ---------------------------------------------------------------------------

export interface LicenseCreditBalance {
	planCredits: number;
	topUpCredits: number;
	totalCredits: number;
	planCreditsResetAt: string;
}

export interface LicenseUserProfile {
	name: string;
	email: string;
	image: string | null;
}

export interface LicenseInfo {
	plan: "free" | "pro" | "team";
	status: "active" | "past_due" | "cancelled" | "expired";
	currentPeriodEnd?: string;
	credits: LicenseCreditBalance;
	user?: LicenseUserProfile | null;
}

export interface PlatformLicenseAPI {
	check(): Promise<LicenseInfo>;
	activate(token: string): Promise<boolean>;
	deactivate(): Promise<boolean>;
	trackUsage(type: "ai_generation" | "export" | "render"): Promise<boolean>;
	deductCredits(
		amount: number,
		modelKey: string,
		description: string
	): Promise<boolean>;
	setAuthToken(token: string): Promise<boolean>;
	clearAuthToken(): Promise<boolean>;
	/**
	 * Returns the current auth token held by the desktop shell, or "" if the
	 * user is signed out. Used by renderer code (e.g. AI provider relays)
	 * that needs to forward the session to the QCut license server.
	 */
	getAuthToken(): Promise<string>;
	emailLogin(
		email: string,
		password: string
	): Promise<{ success: boolean; error?: string }>;
	emailSignup(
		name: string,
		email: string,
		password: string
	): Promise<{ success: boolean; error?: string }>;
	getGoogleLoginUrl(): Promise<string>;
	onActivationToken?(
		callback: (token: string) => void
	): (() => void) | undefined;
}
