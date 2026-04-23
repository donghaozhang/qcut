/**
 * Moyin script-to-storyboard sub-interface for ElectronAPI.
 */

export interface ElectronMoyinOps {
	moyin?: {
		parseScript: (options: {
			rawScript: string;
			language?: string;
			sceneCount?: number;
			/** Model alias (e.g. "gmi-glm-5.1", "gemini-pro"). */
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
			/** Model alias (e.g. "gmi-glm-5.1", "gemini-pro"). */
			model?: string;
		}) => Promise<{
			success: boolean;
			text?: string;
			error?: string;
		}>;
		/**
		 * Generate a storyboard image through the selected provider.
		 * Routes through FAL (default flux-pro v1.1-ultra) or GMI (default
		 * seedream-4.0) based on the `provider` field.
		 */
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
		/** Generate a video from an existing image via the selected provider. */
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
		onTriggerParse: (callback: (data?: { model?: string }) => void) => void;
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
