/**
 * Pi Agent sub-interface for ElectronAPI.
 */

export interface ElectronPiAgentOps {
	piAgent?: {
		send: (request: {
			message: string;
			settings?: { provider: string; model: string; apiKey?: string };
			apiKey?: string;
		}) => Promise<{ success: boolean; error?: string }>;
		onStreamChunk: (callback: (data: { text: string }) => void) => void;
		onToolCall: (
			callback: (data: {
				toolCallId: string;
				toolName: string;
				params: Record<string, unknown>;
			}) => void
		) => void;
		onToolResult: (
			callback: (data: {
				toolCallId: string;
				toolName: string;
				result: unknown;
				isError: boolean;
			}) => void
		) => void;
		onStreamComplete: (callback: () => void) => void;
		onStreamError: (callback: (data: { message: string }) => void) => void;
		removeListeners: () => void;
		reset: () => Promise<{ success: boolean }>;
		setModel: (settings: {
			provider: string;
			model: string;
			apiKey?: string;
		}) => Promise<{ success: boolean }>;
		getModels: () => Promise<{ provider: string; models: string[] }[]>;
	};
}
