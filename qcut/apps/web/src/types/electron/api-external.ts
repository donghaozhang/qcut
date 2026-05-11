/**
 * External service operations (API keys, FAL, GitHub, shell) for ElectronAPI.
 */

import type { PlatformApiKeyStatus } from "@qcut/platform-core";

export interface ElectronApiKeyOps {
	apiKeys: {
		get: () => Promise<{
			falApiKey: string;
			freesoundApiKey: string;
			geminiApiKey: string;
			openRouterApiKey: string;
			anthropicApiKey: string;
			elevenLabsApiKey: string;
			gmiApiKey: string;
			runwayApiKey?: string;
			imarouterApiKey?: string;
		}>;
		set: (keys: {
			falApiKey?: string;
			freesoundApiKey?: string;
			geminiApiKey?: string;
			openRouterApiKey?: string;
			anthropicApiKey?: string;
			elevenLabsApiKey?: string;
			gmiApiKey?: string;
			runwayApiKey?: string;
			imarouterApiKey?: string;
		}) => Promise<boolean>;
		clear: () => Promise<boolean>;
		status: () => Promise<{
			anthropicApiKey: PlatformApiKeyStatus;
			elevenLabsApiKey: PlatformApiKeyStatus;
			falApiKey: PlatformApiKeyStatus;
			freesoundApiKey: PlatformApiKeyStatus;
			geminiApiKey: PlatformApiKeyStatus;
			gmiApiKey: PlatformApiKeyStatus;
			openRouterApiKey: PlatformApiKeyStatus;
			runwayApiKey: PlatformApiKeyStatus;
			imarouterApiKey?: PlatformApiKeyStatus;
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
