import type {
	RemotionFolderSelectResult,
	RemotionFolderScanResult,
	RemotionFolderBundleResult,
	RemotionFolderImportResult,
} from "../supporting-types";

/** Remotion project folder operations. */
export interface RemotionFolderAPI {
	remotionFolder?: {
		select: () => Promise<RemotionFolderSelectResult>;
		scan: (folderPath: string) => Promise<RemotionFolderScanResult>;
		bundle: (
			folderPath: string,
			compositionIds?: string[]
		) => Promise<RemotionFolderBundleResult>;
		import: (folderPath: string) => Promise<RemotionFolderImportResult>;
		checkBundler: () => Promise<{ available: boolean }>;
		validate: (
			folderPath: string
		) => Promise<{ isValid: boolean; error?: string }>;
		bundleFile: (
			filePath: string,
			compositionId: string
		) => Promise<{
			compositionId: string;
			success: boolean;
			code?: string;
			error?: string;
		}>;
	};
}

/** Moyin script-to-storyboard operations. */
export interface MoyinAPI {
	moyin?: {
		parseScript: (options: {
			rawScript: string;
			language?: string;
			sceneCount?: number;
			model?: string;
		}) => Promise<{
			success: boolean;
			data?: Record<string, unknown>;
			error?: string;
		}>;
		generateStoryboard: (options: {
			scenes: unknown[];
			styleId?: string;
		}) => Promise<{
			success: boolean;
			outputPaths?: string[];
			error?: string;
		}>;
		callLLM: (options: {
			systemPrompt: string;
			userPrompt: string;
			temperature?: number;
			maxTokens?: number;
			model?: string;
		}) => Promise<{
			success: boolean;
			text?: string;
			error?: string;
		}>;
		/** Generate a storyboard image via FAL or GMI (main-process IPC). */
		generateImage: (options: {
			provider: "fal" | "gmi";
			prompt: string;
			size?: { width: number; height: number };
			model?: string;
		}) => Promise<{
			success: boolean;
			url?: string;
			error?: string;
		}>;
		/** Generate a video from an existing image via FAL or GMI. */
		generateVideo: (options: {
			provider: "fal" | "gmi";
			imageUrl: string;
			prompt: string;
			model?: string;
		}) => Promise<{
			success: boolean;
			url?: string;
			error?: string;
		}>;
		isClaudeAvailable: () => Promise<boolean>;
		saveTempScript: (options: { rawScript: string }) => Promise<{
			success: boolean;
			filePath?: string;
			projectRoot?: string;
			error?: string;
		}>;
		cleanupTempScript: (filePath: string) => Promise<void>;
		onParsed: (callback: (data: Record<string, unknown>) => void) => void;
		removeParseListener: () => void;
		onSetScript: (callback: (data: { text: string }) => void) => void;
		onTriggerParse: (callback: () => void) => void;
		onGenerateScript: (
			callback: (data: {
				idea: string;
				genre?: string;
				targetDuration?: string;
			}) => void
		) => void;
		onStatusRequest: (callback: (data: { requestId: string }) => void) => void;
		sendStatusResponse: (
			requestId: string,
			result?: Record<string, unknown>,
			error?: string
		) => void;
		onExportRequest: (callback: (data: { requestId: string }) => void) => void;
		sendExportResponse: (
			requestId: string,
			result?: Record<string, unknown>,
			error?: string
		) => void;
		removeMoyinBridgeListeners: () => void;
	};
}
