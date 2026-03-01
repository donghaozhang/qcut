/** PTY terminal spawn, write, resize, kill. */
export interface PtyAPI {
	pty: {
		spawn: (options?: {
			cols?: number;
			rows?: number;
			cwd?: string;
			command?: string;
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

/** MCP app bridge (renderer preview iframe updates). */
export interface McpAPI {
	mcp?: {
		onAppHtml: (
			callback: (data: { html: string; toolName?: string }) => void
		) => void;
		removeListeners: () => void;
	};
}
