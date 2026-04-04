import { vi } from "vitest";
import type { ElectronAPI } from "@/types/electron";

/**
 * Complete mock of Electron API matching useElectron hook
 */
export const mockElectronAPI: ElectronAPI = {
	// System info
	platform: "win32",
	isElectron: true,

	// File operations
	openFileDialog: vi.fn().mockResolvedValue({
		canceled: false,
		filePaths: ["/path/to/file.mp4"],
	}),
	openMultipleFilesDialog: vi.fn().mockResolvedValue({
		canceled: false,
		filePaths: ["/path/to/file1.mp4", "/path/to/file2.jpg"],
	}),
	saveFileDialog: vi.fn().mockResolvedValue({
		canceled: false,
		filePath: "/path/to/save.mp4",
	}),
	readFile: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
	writeFile: vi.fn().mockResolvedValue({ success: true }),
	saveBlob: vi.fn().mockResolvedValue({
		success: true,
		filePath: "/path/to/saved/file.mp4",
	}),
	getPathForFile: vi.fn().mockReturnValue("/mock/path/to/file"),
	getFileInfo: vi.fn().mockResolvedValue({
		size: 1024,
		created: new Date(),
		modified: new Date(),
		isFile: true,
		isDirectory: false,
	}),

	// Storage operations
	storage: {
		save: vi.fn().mockResolvedValue(undefined),
		load: vi.fn().mockResolvedValue(null),
		remove: vi.fn().mockResolvedValue(undefined),
		list: vi.fn().mockResolvedValue([]),
		clear: vi.fn().mockResolvedValue(undefined),
	},

	// Audio operations
	audio: {
		saveTemp: vi.fn().mockResolvedValue("/tmp/audio-temp.mp3"),
	},

	// Generic IPC invoke method
	invoke: vi.fn().mockResolvedValue(undefined),

	// FAL AI operations
	fal: {
		uploadVideo: vi.fn().mockResolvedValue({
			success: true,
			url: "https://fal.ai/storage/video.mp4",
		}),
		uploadImage: vi.fn().mockResolvedValue({
			success: true,
			url: "https://fal.ai/storage/image.jpg",
		}),
		uploadAudio: vi.fn().mockResolvedValue({
			success: true,
			url: "https://fal.ai/storage/audio.mp3",
		}),
		queueFetch: vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			data: {},
		}),
	},

	// FFmpeg operations
	ffmpeg: {
		createExportSession: vi.fn().mockResolvedValue({
			sessionId: "test-session",
			frameDir: "/tmp/frames",
			outputDir: "/tmp/output",
		}),
		saveFrame: vi.fn().mockResolvedValue("frame-001.png"),
		saveStickerForExport: vi.fn().mockResolvedValue({
			success: true,
			path: "/tmp/sticker.png",
		}),
		exportVideoCLI: vi.fn().mockResolvedValue({
			success: true,
			outputFile: "output.mp4",
		}),
		readOutputFile: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
		cleanupExportSession: vi.fn().mockResolvedValue(undefined),
		validateFilterChain: vi.fn().mockResolvedValue(true),
		processFrame: vi.fn().mockResolvedValue(undefined),
		extractAudio: vi.fn().mockResolvedValue({
			audioPath: "/tmp/audio.mp3",
			fileSize: 1024,
		}),
		getPath: vi.fn().mockResolvedValue("/usr/bin/ffmpeg"),
		checkHealth: vi.fn().mockResolvedValue({
			ffmpegOk: true,
			ffprobeOk: true,
			ffmpegVersion: "6.1.1",
			ffprobeVersion: "6.1.1",
			ffmpegPath: "/usr/bin/ffmpeg",
			ffprobePath: "/usr/bin/ffprobe",
			errors: [],
		}),
	},

	// Sound search operations
	sounds: {
		search: vi.fn().mockResolvedValue({
			success: true,
			results: [],
		}),
		downloadPreview: vi.fn().mockResolvedValue({
			success: true,
			localPath: "/tmp/preview.mp3",
		}),
	},

	// Transcription operations
	transcribe: {
		transcribe: vi.fn().mockResolvedValue({
			text: "Test transcription",
			segments: [],
			language: "en",
		}),
		cancel: vi.fn().mockResolvedValue({
			success: true,
			message: "Transcription cancelled",
		}),
		elevenlabs: vi.fn().mockResolvedValue({
			text: "Test transcription",
			language_code: "eng",
			language_probability: 0.95,
			words: [
				{ text: "Test", start: 0, end: 0.5, type: "word", speaker_id: null },
				{ text: " ", start: 0.5, end: 0.6, type: "spacing", speaker_id: null },
				{
					text: "transcription",
					start: 0.6,
					end: 1.2,
					type: "word",
					speaker_id: null,
				},
			],
		}),
		uploadToFal: vi.fn().mockResolvedValue({
			url: "https://fal.ai/storage/mock-file-url",
		}),
	},

	analyzeFillers: vi.fn().mockResolvedValue({
		filteredWordIds: [],
		provider: "pattern",
	}),

	// API key operations
	apiKeys: {
		get: vi.fn().mockResolvedValue({
			falApiKey: "",
			freesoundApiKey: "",
			geminiApiKey: "",
			openRouterApiKey: "",
			elevenLabsApiKey: "",
		}),
		set: vi.fn().mockResolvedValue(true),
		clear: vi.fn().mockResolvedValue(true),
		status: vi.fn().mockResolvedValue({
			falApiKey: { set: false, source: "not-set" },
			freesoundApiKey: { set: false, source: "not-set" },
			geminiApiKey: { set: false, source: "not-set" },
			openRouterApiKey: { set: false, source: "not-set" },
			anthropicApiKey: { set: false, source: "not-set" },
			elevenLabsApiKey: { set: false, source: "not-set" },
		}),
	},

	// Shell operations
	shell: {
		showItemInFolder: vi.fn().mockResolvedValue(undefined),
		openExternal: vi.fn().mockResolvedValue(undefined),
	},

	// GitHub operations
	github: {
		fetchStars: vi.fn().mockResolvedValue({
			stars: 1234,
		}),
	},

	// PTY operations
	pty: {
		spawn: vi.fn().mockResolvedValue({
			success: true,
			sessionId: "test-pty-session",
		}),
		write: vi.fn().mockResolvedValue({ success: true }),
		resize: vi.fn().mockResolvedValue({ success: true }),
		kill: vi.fn().mockResolvedValue({ success: true }),
		killAll: vi.fn().mockResolvedValue({ success: true }),
		onData: vi.fn(),
		onExit: vi.fn(),
		removeListeners: vi.fn(),
	},

	// Gemini chat operations
	geminiChat: {
		send: vi.fn().mockResolvedValue({ success: true }),
		suggestGapPrompt: vi.fn().mockResolvedValue({ suggestedPrompt: null }),
		describeFrame: vi.fn().mockResolvedValue({ prompt: null }),
		onStreamChunk: vi.fn(),
		onStreamComplete: vi.fn(),
		onStreamError: vi.fn(),
		removeListeners: vi.fn(),
	},

	// AI Pipeline operations
	aiPipeline: {
		check: vi.fn().mockResolvedValue({ available: true }),
		status: vi.fn().mockResolvedValue({
			available: true,
			version: "1.0.0",
			source: "bundled" as const,
			compatible: true,
			features: {
				textToVideo: true,
				imageToVideo: true,
				avatarGeneration: true,
				videoUpscale: true,
				yamlPipelines: true,
			},
		}),
		generate: vi.fn().mockResolvedValue({
			success: true,
			outputPath: "/tmp/generated-video.mp4",
			duration: 5.2,
		}),
		listModels: vi.fn().mockResolvedValue({
			success: true,
			models: ["sora-2", "kling-v1", "runway-gen3"],
		}),
		estimateCost: vi.fn().mockResolvedValue({
			success: true,
			cost: 0.15,
		}),
		cancel: vi.fn().mockResolvedValue({ success: true }),
		refresh: vi.fn().mockResolvedValue({
			available: true,
			version: "1.0.0",
			source: "bundled" as const,
			compatible: true,
			features: {
				textToVideo: true,
				imageToVideo: true,
				avatarGeneration: true,
				videoUpscale: true,
				yamlPipelines: true,
			},
		}),
		onProgress: vi.fn(() => vi.fn()),
	},

	// Wallpaper operations
	wallpapers: {
		list: vi.fn().mockResolvedValue([]),
		upload: vi.fn().mockResolvedValue({
			id: "test-wallpaper",
			name: "test-wallpaper",
			path: "/tmp/wallpapers/test-wallpaper.jpg",
		}),
		delete: vi.fn().mockResolvedValue(true),
		pick: vi.fn().mockResolvedValue("/tmp/test-wallpaper.jpg"),
	},

	// Media import operations (symlink with copy fallback)
	mediaImport: {
		import: vi.fn().mockResolvedValue({
			success: true,
			targetPath: "/path/to/project/media/imported/media-123.mp4",
			importMethod: "symlink" as const,
			originalPath: "/path/to/original/video.mp4",
			fileSize: 1_024_000,
		}),
		validateSymlink: vi.fn().mockResolvedValue(true),
		locateOriginal: vi.fn().mockResolvedValue("/path/to/original/video.mp4"),
		relinkMedia: vi.fn().mockResolvedValue({
			success: true,
			targetPath: "/path/to/project/media/imported/media-123.mp4",
			importMethod: "symlink" as const,
			originalPath: "/path/to/new/video.mp4",
			fileSize: 1_024_000,
		}),
		remove: vi.fn().mockResolvedValue(undefined),
		checkSymlinkSupport: vi.fn().mockResolvedValue(true),
		getMediaPath: vi.fn().mockResolvedValue("/path/to/project/media/imported"),
	},
};

/**
 * Setup mock Electron API in window
 */
export function setupElectronMock() {
	window.electronAPI = mockElectronAPI;
	return () => {
		Reflect.deleteProperty(window, "electronAPI");
	};
}

/**
 * Mock for non-Electron environment
 */
export const mockNonElectronAPI = {
	isElectron: false,
};
