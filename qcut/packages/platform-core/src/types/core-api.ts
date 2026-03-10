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
	readFile(filePath: string): Promise<ArrayBuffer | null>;
	writeFile(filePath: string, data: ArrayBuffer | string): Promise<boolean>;
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

export interface PlatformLicenseAPI {
	check(): Promise<unknown>;
	activate(token: string): Promise<unknown>;
	deactivate(): Promise<unknown>;
	trackUsage(type: "ai_generation" | "export" | "render"): Promise<unknown>;
	deductCredits(
		amount: number,
		modelKey: string,
		description: string
	): Promise<unknown>;
	setAuthToken(token: string): Promise<unknown>;
	clearAuthToken(): Promise<unknown>;
	emailLogin(email: string, password: string): Promise<unknown>;
	emailSignup(name: string, email: string, password: string): Promise<unknown>;
	getGoogleLoginUrl(): Promise<unknown>;
	onActivationToken?(
		callback: (token: string) => void
	): (() => void) | undefined;
}
