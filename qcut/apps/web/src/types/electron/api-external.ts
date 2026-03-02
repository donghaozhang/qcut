/**
 * External service operations (API keys, FAL, GitHub, shell) for ElectronAPI.
 */

export interface ElectronApiKeyOps {
	apiKeys: {
		get: () => Promise<{
			falApiKey: string;
			freesoundApiKey: string;
			geminiApiKey: string;
			openRouterApiKey: string;
			anthropicApiKey: string;
			elevenLabsApiKey: string;
		}>;
		set: (keys: {
			falApiKey?: string;
			freesoundApiKey?: string;
			geminiApiKey?: string;
			openRouterApiKey?: string;
			anthropicApiKey?: string;
			elevenLabsApiKey?: string;
		}) => Promise<boolean>;
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

export interface ElectronShellOps {
	shell: {
		showItemInFolder: (filePath: string) => Promise<void>;
		openExternal: (url: string) => Promise<void>;
	};
}

export interface ElectronGitHubOps {
	github: {
		fetchStars: () => Promise<{
			stars: number;
		}>;
	};
}

export interface ElectronFalOps {
	fal: {
		uploadVideo: (
			videoData: Uint8Array,
			filename: string,
			apiKey: string
		) => Promise<{
			success: boolean;
			url?: string;
			error?: string;
		}>;
		uploadImage: (
			imageData: Uint8Array,
			filename: string,
			apiKey: string
		) => Promise<{
			success: boolean;
			url?: string;
			error?: string;
		}>;
		uploadAudio: (
			audioData: Uint8Array,
			filename: string,
			apiKey: string
		) => Promise<{
			success: boolean;
			url?: string;
			error?: string;
		}>;
		queueFetch: (
			url: string,
			apiKey: string
		) => Promise<{ ok: boolean; status: number; data: unknown }>;
	};
}
