/**
 * Gemini Chat, PTY Terminal, and MCP sub-interfaces for ElectronAPI.
 */

export interface ElectronGeminiChatOps {
	geminiChat?: {
		send: (request: {
			messages: Array<{
				role: "user" | "assistant";
				content: string;
			}>;
			attachments?: Array<{
				path: string;
				mimeType: string;
				name: string;
			}>;
			model?: string;
		}) => Promise<{ success: boolean; error?: string }>;
		suggestGapPrompt: (request: {
			gapDuration: number;
			mode: string;
			beforeFrameUrl?: string | null;
			afterFrameUrl?: string | null;
		}) => Promise<{ suggestedPrompt: string | null; error?: string }>;
		onStreamChunk: (callback: (data: { text: string }) => void) => void;
		onStreamComplete: (callback: () => void) => void;
		onStreamError: (callback: (data: { message: string }) => void) => void;
		removeListeners: () => void;
	};
}

export interface ElectronPtyOps {
	pty?: {
		spawn: (options?: {
			cols?: number;
			rows?: number;
			cwd?: string;
			command?: string;
			env?: Record<string, string>;
		}) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
		write: (
			sessionId: string,
			data: string
		) => Promise<{ success: boolean; error?: string }>;
		resize: (
			sessionId: string,
			cols: number,
			rows: number
		) => Promise<{ success: boolean; error?: string }>;
		kill: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
		killAll: () => Promise<{ success: boolean }>;
		onData: (
			callback: (data: { sessionId: string; data: string }) => void
		) => void;
		onExit: (
			callback: (data: {
				sessionId: string;
				exitCode: number;
				signal?: number;
			}) => void
		) => void;
		removeListeners: () => void;
	};
}

export interface ElectronMcpOps {
	mcp?: {
		onAppHtml: (
			callback: (data: { html: string; toolName?: string }) => void
		) => void;
		removeListeners: () => void;
	};
}
