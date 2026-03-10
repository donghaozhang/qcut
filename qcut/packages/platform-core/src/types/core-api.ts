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

export interface PlatformApiKeysAPI {
	get(): Promise<Record<string, string>>;
	set(keys: Record<string, string>): Promise<boolean>;
	clear(): Promise<boolean>;
	status(): Promise<Record<string, { set: boolean; source: string }>>;
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
