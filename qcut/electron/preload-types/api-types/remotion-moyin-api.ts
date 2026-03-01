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
		}) => Promise<{
			success: boolean;
			text?: string;
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
		onStatusRequest: (callback: (data: { requestId: string }) => void) => void;
		sendStatusResponse: (
			requestId: string,
			result?: Record<string, unknown>,
			error?: string
		) => void;
		removeMoyinBridgeListeners: () => void;
	};
}
