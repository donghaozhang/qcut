import type {
	ApiKeyConfig,
	GitHubStarsResponse,
	FalUploadResult,
} from "../supporting-types";

/** API key management. */
export interface ApiKeysAPI {
	apiKeys: {
		get: () => Promise<ApiKeyConfig>;
		set: (keys: ApiKeyConfig) => Promise<boolean>;
		clear: () => Promise<boolean>;
		status: () => Promise<{
			falApiKey: { set: boolean; source: string };
			freesoundApiKey: { set: boolean; source: string };
			geminiApiKey: { set: boolean; source: string };
			openRouterApiKey: { set: boolean; source: string };
			anthropicApiKey: { set: boolean; source: string };
			elevenLabsApiKey: { set: boolean; source: string };
		}>;
	};
}

/** Shell operations (reveal files in OS). */
export interface ShellAPI {
	shell: {
		showItemInFolder: (filePath: string) => Promise<void>;
	};
}

/** GitHub star count fetching. */
export interface GitHubAPI {
	github: {
		fetchStars: () => Promise<GitHubStarsResponse>;
	};
}

/** FAL AI file upload and queue operations. */
export interface FalAPI {
	fal: {
		uploadVideo: (
			videoData: Uint8Array,
			filename: string,
			apiKey: string
		) => Promise<FalUploadResult>;
		uploadImage: (
			imageData: Uint8Array,
			filename: string,
			apiKey: string
		) => Promise<FalUploadResult>;
		uploadAudio: (
			audioData: Uint8Array,
			filename: string,
			apiKey: string
		) => Promise<FalUploadResult>;
		queueFetch: (
			url: string,
			apiKey: string
		) => Promise<{ ok: boolean; status: number; data: unknown }>;
	};
}

/** Gemini chat streaming operations. */
export interface GeminiChatAPI {
	geminiChat: {
		send: (request: {
			messages: Array<{ role: "user" | "assistant"; content: string }>;
			attachments?: Array<{
				path: string;
				mimeType: string;
				name: string;
			}>;
			model?: string;
		}) => Promise<{ success: boolean; error?: string }>;
		onStreamChunk: (callback: (data: { text: string }) => void) => void;
		onStreamComplete: (callback: () => void) => void;
		onStreamError: (callback: (data: { message: string }) => void) => void;
		removeListeners: () => void;
	};
}
