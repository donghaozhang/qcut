/**
 * Web (browser) platform adapter — QCut Lite.
 *
 * Implements cross-platform capabilities using browser APIs.
 * Web-capable APIs not yet fully implemented return graceful defaults.
 * Desktop-only capabilities throw PlatformUnsupportedError.
 *
 * @module @qcut/platform-web
 */

import {
	PlatformCapability,
	PlatformUnsupportedError,
	isPlatformCapable,
	type PlatformAPI,
	type PlatformFilesAPI,
	type PlatformStorageAPI,
	type PlatformThemeAPI,
	type PlatformShellAPI,
	type PlatformApiKeysAPI,
	type PlatformApiKeysStatus,
	type PlatformLicenseAPI,
	type PlatformSoundsAPI,
	type PlatformAudioAPI,
	type PlatformVideoAPI,
	type PlatformScreenshotAPI,
	type PlatformScreenRecordingAPI,
	type PlatformFFmpegAPI,
	type PlatformTranscriptionAPI,
	type PlatformFalAPI,
	type PlatformGeminiChatAPI,
	type PlatformPiAgentAPI,
	type PlatformGitHubAPI,
	type PlatformYouTubeAPI,
	type PlatformPtyAPI,
	type PlatformMcpAPI,
	type PlatformSkillsAPI,
	type PlatformAIPipelineAPI,
	type PlatformMediaImportAPI,
	type PlatformProjectFolderAPI,
	type PlatformProjectJsonAPI,
	type PlatformRemotionFolderAPI,
	type PlatformMoyinAPI,
	type PlatformUpdatesAPI,
	type ThemeSource,
	type LicenseInfo,
} from "@qcut/platform-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "qcut:";

/**
 * Desktop-only stub — throws PlatformUnsupportedError on any method call.
 * Used for features that should never be reached on web (PTY, MCP, etc.).
 * Calling code must gate on `isElectron` or `hasCapability()`.
 */
function createUnsupportedNamespace<T extends object>(
	cap: PlatformCapability
): T {
	return new Proxy({} as T, {
		get(_, prop) {
			if (typeof prop === "string") {
				return () => {
					throw new PlatformUnsupportedError(cap, "web");
				};
			}
			return undefined;
		},
	});
}

/**
 * Graceful stub — returns safe defaults instead of throwing.
 * Used for web-capable APIs not yet fully implemented.
 * Event listeners (on*, remove*) are no-ops; other methods return null/empty.
 */
function createGracefulNamespace<T extends object>(): T {
	const noop = () => {};
	return new Proxy({} as T, {
		get(_, prop) {
			if (typeof prop === "string") {
				if (prop.startsWith("on") || prop.startsWith("remove")) {
					return (..._args: unknown[]) => noop;
				}
				return (..._args: unknown[]) => Promise.resolve(null);
			}
			return undefined;
		},
	});
}

// ---------------------------------------------------------------------------
// Storage — localStorage (IndexedDB upgrade deferred)
// ---------------------------------------------------------------------------

const storageAdapter: PlatformStorageAPI = {
	async save(key, data) {
		try {
			localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
			return true;
		} catch {
			return false;
		}
	},
	async load(key) {
		const raw = localStorage.getItem(STORAGE_PREFIX + key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	},
	async remove(key) {
		localStorage.removeItem(STORAGE_PREFIX + key);
		return true;
	},
	async list() {
		const keys: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(STORAGE_PREFIX)) {
				keys.push(key.slice(STORAGE_PREFIX.length));
			}
		}
		return keys;
	},
	async clear() {
		const keys = await storageAdapter.list();
		for (const key of keys) {
			localStorage.removeItem(STORAGE_PREFIX + key);
		}
		return true;
	},
};

// ---------------------------------------------------------------------------
// Theme — CSS media queries + localStorage
// ---------------------------------------------------------------------------

const THEME_KEY = "qcut:theme";

const themeAdapter: PlatformThemeAPI = {
	async get() {
		return (localStorage.getItem(THEME_KEY) as ThemeSource) || "system";
	},
	async set(theme) {
		localStorage.setItem(THEME_KEY, theme);
		applyTheme(theme);
		return theme;
	},
	async toggle() {
		const current = await themeAdapter.isDark();
		const next: ThemeSource = current ? "light" : "dark";
		return themeAdapter.set(next);
	},
	async isDark() {
		const theme = await themeAdapter.get();
		if (theme === "system") {
			return window.matchMedia("(prefers-color-scheme: dark)").matches;
		}
		return theme === "dark";
	},
};

function applyTheme(theme: ThemeSource) {
	const isDark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", isDark);
}

// ---------------------------------------------------------------------------
// Shell — window.open for external links
// ---------------------------------------------------------------------------

const shellAdapter: PlatformShellAPI = {
	async showItemInFolder() {
		// No-op on web — can't show native file explorer
	},
	async openExternal(url) {
		window.open(url, "_blank", "noopener,noreferrer");
	},
};

// ---------------------------------------------------------------------------
// Files — File System Access API where available
// ---------------------------------------------------------------------------

const filesAdapter: PlatformFilesAPI = {
	async openFileDialog() {
		if ("showOpenFilePicker" in window) {
			try {
				const [handle] = await (window as any).showOpenFilePicker();
				const file = await handle.getFile();
				return file.name;
			} catch {
				return null;
			}
		}
		return null;
	},
	async openMultipleFilesDialog() {
		if ("showOpenFilePicker" in window) {
			try {
				const handles = await (window as any).showOpenFilePicker({
					multiple: true,
				});
				return Promise.all(
					handles.map(async (h: any) => {
						const f = await h.getFile();
						return f.name;
					})
				);
			} catch {
				return [];
			}
		}
		return [];
	},
	async saveFileDialog() {
		return null; // File System Access API save handled by saveBlob
	},
	async readFile() {
		return null; // Web can't read arbitrary file paths
	},
	async writeFile() {
		return false; // Web can't write to arbitrary file paths
	},
	async saveBlob(data, defaultFilename) {
		try {
			const blobData = data instanceof Uint8Array ? new Uint8Array(data) : data;
			const blob = new Blob([blobData as BlobPart]);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = defaultFilename || "download";
			a.click();
			URL.revokeObjectURL(url);
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : "Save failed",
			};
		}
	},
	async getFileInfo() {
		return null; // Can't access file system info on web
	},
};

// ---------------------------------------------------------------------------
// API Keys — localStorage-based
// ---------------------------------------------------------------------------

const API_KEYS_KEY = "qcut:api-keys";

const apiKeysAdapter: PlatformApiKeysAPI = {
	async get() {
		const raw = localStorage.getItem(API_KEYS_KEY);
		return raw ? JSON.parse(raw) : {};
	},
	async set(keys) {
		const current = await apiKeysAdapter.get();
		localStorage.setItem(API_KEYS_KEY, JSON.stringify({ ...current, ...keys }));
		return true;
	},
	async clear() {
		localStorage.removeItem(API_KEYS_KEY);
		return true;
	},
	async status() {
		const keys = await apiKeysAdapter.get();
		const result: PlatformApiKeysStatus = {};
		for (const [key, value] of Object.entries(keys)) {
			result[key] = { set: !!value, source: "localStorage", shadowedBy: [] };
		}
		return result;
	},
};

// ---------------------------------------------------------------------------
// License — Free tier (no server auth on web)
// ---------------------------------------------------------------------------

const FREE_LICENSE: LicenseInfo = {
	plan: "free",
	status: "active",
	credits: {
		planCredits: 0,
		topUpCredits: 0,
		totalCredits: 0,
		planCreditsResetAt: "",
	},
	user: null,
};

const licenseAdapter: PlatformLicenseAPI = {
	async check() {
		return FREE_LICENSE;
	},
	async activate() {
		return false;
	},
	async deactivate() {
		return false;
	},
	async trackUsage() {
		return true;
	},
	async deductCredits() {
		return false;
	},
	async setAuthToken() {
		return false;
	},
	async clearAuthToken() {
		return true;
	},
	async getAuthToken() {
		return "";
	},
	async emailLogin() {
		return { success: false, error: "Authentication not available in browser" };
	},
	async emailSignup() {
		return { success: false, error: "Authentication not available in browser" };
	},
	async getGoogleLoginUrl() {
		return "";
	},
	onActivationToken: undefined,
};

// ---------------------------------------------------------------------------
// AI Pipeline — graceful stub (web-capable via direct API)
// ---------------------------------------------------------------------------

const aiPipelineAdapter: PlatformAIPipelineAPI = {
	async check() {
		return { available: false, error: "AI pipeline not available in browser" };
	},
	async status() {
		return {
			available: false,
			version: null,
			source: "unavailable" as const,
			compatible: false,
			features: {},
			error: "AI pipeline not available in browser",
		};
	},
	async generate() {
		return { success: false, error: "AI pipeline not available in browser" };
	},
	async listModels() {
		return [];
	},
	async estimateCost() {
		return null;
	},
	async cancel() {
		return false;
	},
	async refresh() {
		return {
			available: false,
			version: null,
			source: "unavailable" as const,
			compatible: false,
			features: {},
		};
	},
	onProgress() {
		return () => {};
	},
};

// ---------------------------------------------------------------------------
// GitHub — graceful stub (web-capable via direct API)
// ---------------------------------------------------------------------------

const githubAdapter: PlatformGitHubAPI = {
	async fetchStars() {
		try {
			const res = await fetch(
				"https://api.github.com/repos/Quriosity-agent/qcut"
			);
			if (!res.ok) return { stars: 0 };
			const data = await res.json();
			return {
				stars: data.stargazers_count ?? 0,
				url: data.html_url,
			};
		} catch {
			return { stars: 0 };
		}
	},
};

// ---------------------------------------------------------------------------
// Graceful stubs for web-capable APIs not yet fully implemented
// These return safe defaults instead of throwing.
// ---------------------------------------------------------------------------

const soundsGraceful = createGracefulNamespace<PlatformSoundsAPI>();
const audioGraceful = createGracefulNamespace<PlatformAudioAPI>();
const videoGraceful = createGracefulNamespace<PlatformVideoAPI>();
const screenshotGraceful = createGracefulNamespace<PlatformScreenshotAPI>();
const screenRecordingGraceful =
	createGracefulNamespace<PlatformScreenRecordingAPI>();
const ffmpegGraceful = createGracefulNamespace<PlatformFFmpegAPI>();
const transcriptionGraceful =
	createGracefulNamespace<PlatformTranscriptionAPI>();
const falGraceful = createGracefulNamespace<PlatformFalAPI>();
const geminiChatGraceful = createGracefulNamespace<PlatformGeminiChatAPI>();
const mediaImportGraceful = createGracefulNamespace<PlatformMediaImportAPI>();

// ---------------------------------------------------------------------------
// Desktop-only stubs (throw PlatformUnsupportedError)
// These are truly desktop-only and calling code must gate on isElectron.
// ---------------------------------------------------------------------------

const youtubeStub = createUnsupportedNamespace<PlatformYouTubeAPI>(
	PlatformCapability.YouTube
);
const ptyStub = createUnsupportedNamespace<PlatformPtyAPI>(
	PlatformCapability.Pty
);
const mcpStub = createUnsupportedNamespace<PlatformMcpAPI>(
	PlatformCapability.Mcp
);
const skillsStub = createUnsupportedNamespace<PlatformSkillsAPI>(
	PlatformCapability.Skills
);
const projectFolderStub = createUnsupportedNamespace<PlatformProjectFolderAPI>(
	PlatformCapability.ProjectFolder
);
// projectJson uses graceful stub — called during project load, must not crash
const projectJsonGraceful = createGracefulNamespace<PlatformProjectJsonAPI>();
const remotionFolderStub =
	createUnsupportedNamespace<PlatformRemotionFolderAPI>(
		PlatformCapability.RemotionFolder
	);
const moyinStub = createUnsupportedNamespace<PlatformMoyinAPI>(
	PlatformCapability.Moyin
);
const updatesStub = createUnsupportedNamespace<PlatformUpdatesAPI>(
	PlatformCapability.Updates
);

// ---------------------------------------------------------------------------
// Exported adapter
// ---------------------------------------------------------------------------

export function createWebAdapter(): PlatformAPI {
	return {
		platform: "web",
		isElectron: false,
		hasCapability: (cap: PlatformCapability) => isPlatformCapable("web", cap),
		getPathForFile: (file: File) => URL.createObjectURL(file),
		analyzeFillers: async () => ({ filteredWordIds: [] }),

		// Fully implemented for web
		files: filesAdapter,
		storage: storageAdapter,
		theme: themeAdapter,
		shell: shellAdapter,
		apiKeys: apiKeysAdapter,
		license: licenseAdapter,
		github: githubAdapter,
		aiPipeline: aiPipelineAdapter,

		// Graceful stubs — web-capable but not yet fully implemented
		// Return safe defaults instead of throwing
		sounds: soundsGraceful,
		audio: audioGraceful,
		video: videoGraceful,
		screenshot: screenshotGraceful,
		screenRecording: screenRecordingGraceful,
		ffmpeg: ffmpegGraceful,
		transcription: transcriptionGraceful,
		fal: falGraceful,
		geminiChat: geminiChatGraceful,
		mediaImport: mediaImportGraceful,

		// Desktop-only stubs — throw PlatformUnsupportedError
		youtube: youtubeStub,
		pty: ptyStub,
		mcp: mcpStub,
		skills: skillsStub,
		projectFolder: projectFolderStub,
		projectJson: projectJsonGraceful,
		remotionFolder: remotionFolderStub,
		moyin: moyinStub,
		updates: updatesStub,
		piAgent: undefined,
		claude: undefined,
	};
}
