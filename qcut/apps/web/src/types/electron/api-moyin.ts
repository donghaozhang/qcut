/**
 * Moyin script-to-storyboard sub-interface for ElectronAPI.
 */

export interface ElectronMoyinOps {
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
