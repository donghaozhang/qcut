/**
 * Web (browser) platform adapter — QCut Lite.
 *
 * Implements cross-platform capabilities using browser APIs.
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
} from "@qcut/platform-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unsupported(cap: PlatformCapability): never {
	throw new PlatformUnsupportedError(cap, "web");
}

const STORAGE_PREFIX = "qcut:";

// ---------------------------------------------------------------------------
// Storage — IndexedDB with localStorage fallback
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
			const blob = new Blob([data]);
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
		const result: Record<string, { set: boolean; source: string }> = {};
		for (const [key, value] of Object.entries(keys)) {
			result[key] = { set: !!value, source: "localStorage" };
		}
		return result;
	},
};

// ---------------------------------------------------------------------------
// Desktop-only stubs (throw PlatformUnsupportedError)
// ---------------------------------------------------------------------------

function createUnsupportedNamespace<T>(cap: PlatformCapability): T {
	return new Proxy({} as T, {
		get(_, prop) {
			if (typeof prop === "string") {
				return (..._args: unknown[]) =>
					Promise.reject(new PlatformUnsupportedError(cap, "web"));
			}
			return undefined;
		},
	});
}

const licenseStub = createUnsupportedNamespace<PlatformLicenseAPI>(
	PlatformCapability.License
);
const soundsStub = createUnsupportedNamespace<PlatformSoundsAPI>(
	PlatformCapability.Sounds
);
const audioStub = createUnsupportedNamespace<PlatformAudioAPI>(
	PlatformCapability.AudioTemp
);
const videoStub = createUnsupportedNamespace<PlatformVideoAPI>(
	PlatformCapability.VideoTemp
);
const screenshotStub = createUnsupportedNamespace<PlatformScreenshotAPI>(
	PlatformCapability.Screenshot
);
const screenRecordingStub =
	createUnsupportedNamespace<PlatformScreenRecordingAPI>(
		PlatformCapability.ScreenRecording
	);
const ffmpegStub = createUnsupportedNamespace<PlatformFFmpegAPI>(
	PlatformCapability.FFmpeg
);
const transcriptionStub = createUnsupportedNamespace<PlatformTranscriptionAPI>(
	PlatformCapability.Transcription
);
const falStub = createUnsupportedNamespace<PlatformFalAPI>(
	PlatformCapability.FalUpload
);
const geminiChatStub = createUnsupportedNamespace<PlatformGeminiChatAPI>(
	PlatformCapability.GeminiChat
);
const githubStub = createUnsupportedNamespace<PlatformGitHubAPI>(
	PlatformCapability.GitHub
);
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
const aiPipelineStub = createUnsupportedNamespace<PlatformAIPipelineAPI>(
	PlatformCapability.AiPipeline
);
const mediaImportStub = createUnsupportedNamespace<PlatformMediaImportAPI>(
	PlatformCapability.MediaImport
);
const projectFolderStub = createUnsupportedNamespace<PlatformProjectFolderAPI>(
	PlatformCapability.ProjectFolder
);
const projectJsonStub = createUnsupportedNamespace<PlatformProjectJsonAPI>(
	PlatformCapability.ProjectJson
);
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
		getPathForFile: () => unsupported(PlatformCapability.FilePathResolution),
		analyzeFillers: () => unsupported(PlatformCapability.FillerAnalysis),

		// Implemented for web
		files: filesAdapter,
		storage: storageAdapter,
		theme: themeAdapter,
		shell: shellAdapter,
		apiKeys: apiKeysAdapter,

		// Desktop-only stubs
		license: licenseStub,
		sounds: soundsStub,
		audio: audioStub,
		video: videoStub,
		screenshot: screenshotStub,
		screenRecording: screenRecordingStub,
		ffmpeg: ffmpegStub,
		transcription: transcriptionStub,
		fal: falStub,
		geminiChat: geminiChatStub,
		github: githubStub,
		youtube: youtubeStub,
		pty: ptyStub,
		mcp: mcpStub,
		skills: skillsStub,
		aiPipeline: aiPipelineStub,
		mediaImport: mediaImportStub,
		projectFolder: projectFolderStub,
		projectJson: projectJsonStub,
		remotionFolder: remotionFolderStub,
		moyin: moyinStub,
		updates: updatesStub,
		claude: undefined,
	};
}
