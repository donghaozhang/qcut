/**
 * Discriminated union types for IPC messages between
 * the main process (utility-bridge) and the utility process.
 */

// ─── Messages FROM utility process TO main process ───

export interface UtilityReadyMessage {
	type: "ready";
}

export interface UtilityMainRequestMessage {
	type: "main-request";
	id: string;
	channel: string;
	data: Record<string, unknown>;
}

export interface UtilityPtyDataMessage {
	type: "pty:data";
	sessionId: string;
	data: string;
}

export interface UtilityPtyExitMessage {
	type: "pty:exit";
	sessionId: string;
	exitCode: number;
	signal?: number;
}

export interface UtilityPtySpawnResultMessage {
	type: "pty:spawn-result";
	requestId: string;
	success: boolean;
	sessionId?: string;
	error?: string;
}

export interface UtilityPtyKillResultMessage {
	type: "pty:kill-result";
	sessionId: string;
	success: boolean;
	error?: string;
}

export interface UtilityPtyKillAllResultMessage {
	type: "pty:kill-all-result";
	count: number;
}

export interface UtilityPongMessage {
	type: "pong";
}

/** All messages the utility process can send to the main process. */
export type UtilityToMainMessage =
	| UtilityReadyMessage
	| UtilityMainRequestMessage
	| UtilityPtyDataMessage
	| UtilityPtyExitMessage
	| UtilityPtySpawnResultMessage
	| UtilityPtyKillResultMessage
	| UtilityPtyKillAllResultMessage
	| UtilityPongMessage;

// ─── Messages FROM main process TO utility process ───

export interface MainExportProgressMessage {
	type: "export-progress";
	payload: {
		jobId: string;
		progress: number;
		currentFrame?: number;
		totalFrames?: number;
		fps?: number;
		estimatedTimeRemaining?: number;
	};
}

export interface MainInitMessage {
	type: "init";
	config: {
		httpPort: number;
		appVersion: string;
	};
}

export interface MainResponseMessage {
	type: "main-response";
	id: string;
	result?: unknown;
	error?: string;
}

export interface MainPtySpawnMessage {
	type: "pty:spawn";
	requestId: string;
	sessionId: string;
	command?: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	env?: Record<string, string>;
	mcpServerPath?: string | null;
	projectId?: string;
	projectRoot?: string;
	apiBaseUrl?: string;
}

export interface MainPtyWriteMessage {
	type: "pty:write";
	sessionId: string;
	data: string;
}

export interface MainPtyOutputMessage {
	type: "pty:output";
	sessionId: string;
	data: string;
}

export interface MainPtyResizeMessage {
	type: "pty:resize";
	sessionId: string;
	cols: number;
	rows: number;
}

export interface MainPtyKillMessage {
	type: "pty:kill";
	sessionId: string;
}

export interface MainPtyKillAllMessage {
	type: "pty:kill-all";
}

export interface MainPingMessage {
	type: "ping";
}

export interface MainShutdownMessage {
	type: "shutdown";
}

/** All messages the main process can send to the utility process. */
export type MainToUtilityMessage =
	| MainExportProgressMessage
	| MainInitMessage
	| MainResponseMessage
	| MainPtySpawnMessage
	| MainPtyWriteMessage
	| MainPtyOutputMessage
	| MainPtyResizeMessage
	| MainPtyKillMessage
	| MainPtyKillAllMessage
	| MainPingMessage
	| MainShutdownMessage;

// ─── Main-request channel payloads (utility → main handleMainRequest) ───

export interface WebContentsSendRequest {
	channel: string;
	args: unknown[];
}

export interface SplitElementRequest {
	elementId: string;
	splitTime: number;
	mode: string;
}

export interface TimelineAddElementRequest {
	correlationId?: string;
	element: unknown;
	projectId: string;
}

export interface BatchAddElementsRequest {
	correlationId?: string;
	projectId: string;
	elements: unknown[];
}

export interface BatchUpdateElementsRequest {
	updates: unknown[];
}

export interface BatchDeleteElementsRequest {
	elements: unknown[];
	ripple?: boolean;
}

export interface GetProjectStatsRequest {
	projectId: string;
}

export interface TransactionBeginRequest {
	request?: { label?: string; timeoutMs?: number };
}

export interface TransactionFinalizeRequest {
	transactionId: string;
	reason?: string;
}

export interface TransactionStatusRequest {
	transactionId: string;
}

// ─── PTY spawn options from renderer ───

export interface PtySpawnOptions {
	command?: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	env?: Record<string, string>;
}

export interface PtySpawnResult {
	success: boolean;
	sessionId?: string;
	error?: string;
}
