import * as fs from "node:fs";
import * as path from "node:path";
import type { CLIResult, CLIRunOptions } from "./cli-runner/types.js";
import { stateDir as resolveStateDir } from "../infra/xdg-paths.js";

const SESSION_STATE_VERSION = 1;
const SESSION_HISTORY_LIMIT = 50;

export interface SessionState {
	version: number;
	sessionName: string;
	projectId?: string;
	lastPanel?: string;
	lastTab?: string;
	commandHistory: string[];
	savedAt: string;
}

export interface SessionCommandPayload {
	session: SessionState;
	path: string;
	existed: boolean;
}

function sanitizeSessionName({
	sessionName,
}: {
	sessionName: string;
}): string {
	const trimmed = sessionName.trim();
	if (!trimmed) {
		throw new Error("Session name cannot be empty.");
	}

	return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function getSessionStateRoot({
	stateDir,
}: {
	stateDir?: string;
}): string {
	return path.join(resolveStateDir(stateDir), "sessions");
}

export function getSessionStatePath({
	sessionName,
	stateDir,
}: {
	sessionName: string;
	stateDir?: string;
}): string {
	const safeName = sanitizeSessionName({ sessionName });
	const root = getSessionStateRoot({ stateDir });
	fs.mkdirSync(root, { recursive: true });
	return path.join(root, `${safeName}.json`);
}

export function createEmptySessionState({
	sessionName,
}: {
	sessionName: string;
}): SessionState {
	return {
		version: SESSION_STATE_VERSION,
		sessionName: sanitizeSessionName({ sessionName }),
		commandHistory: [],
		savedAt: new Date(0).toISOString(),
	};
}

export function buildSessionStateSnapshot({
	sessionName,
	options,
	existingState,
}: {
	sessionName: string;
	options: CLIRunOptions;
	existingState?: SessionState;
}): SessionState {
	const baseState =
		existingState ?? createEmptySessionState({ sessionName: sessionName });
	return {
		...baseState,
		sessionName: sanitizeSessionName({ sessionName }),
		projectId: options.projectId ?? baseState.projectId,
		lastPanel: options.panel ?? baseState.lastPanel,
		lastTab: options.tab ?? baseState.lastTab,
		savedAt: new Date().toISOString(),
	};
}

function parseSessionState({
	value,
	expectedSessionName,
}: {
	value: unknown;
	expectedSessionName: string;
}): SessionState {
	if (typeof value !== "object" || value === null) {
		throw new Error("Session state must be an object.");
	}

	const candidate = value as Partial<SessionState>;
	if (!Array.isArray(candidate.commandHistory)) {
		throw new Error("Session state commandHistory must be an array.");
	}
	if (typeof candidate.savedAt !== "string") {
		throw new Error("Session state savedAt must be a string.");
	}

	const sessionName = sanitizeSessionName({
		sessionName:
			typeof candidate.sessionName === "string"
				? candidate.sessionName
				: expectedSessionName,
	});

	return {
		version:
			typeof candidate.version === "number"
				? candidate.version
				: SESSION_STATE_VERSION,
		sessionName,
		projectId:
			typeof candidate.projectId === "string" ? candidate.projectId : undefined,
		lastPanel:
			typeof candidate.lastPanel === "string" ? candidate.lastPanel : undefined,
		lastTab:
			typeof candidate.lastTab === "string" ? candidate.lastTab : undefined,
		commandHistory: candidate.commandHistory.filter(
			(entry): entry is string => typeof entry === "string"
		),
		savedAt: candidate.savedAt,
	};
}

export function loadSessionState({
	sessionName,
	stateDir,
}: {
	sessionName: string;
	stateDir?: string;
}): SessionState | null {
	const filePath = getSessionStatePath({ sessionName, stateDir });
	if (!fs.existsSync(filePath)) {
		return null;
	}

	let raw: string;
	try {
		raw = fs.readFileSync(filePath, "utf-8");
	} catch (error) {
		throw new Error(
			`Cannot read session state '${sessionName}': ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Invalid JSON in session state '${sessionName}': ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	return parseSessionState({
		value: parsed,
		expectedSessionName: sessionName,
	});
}

export function saveSessionState({
	sessionState,
	stateDir,
}: {
	sessionState: SessionState;
	stateDir?: string;
}): void {
	const filePath = getSessionStatePath({
		sessionName: sessionState.sessionName,
		stateDir,
	});
	const nextState: SessionState = {
		...sessionState,
		version: SESSION_STATE_VERSION,
		sessionName: sanitizeSessionName({ sessionName: sessionState.sessionName }),
		commandHistory: sessionState.commandHistory.slice(-SESSION_HISTORY_LIMIT),
	};

	fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2), "utf-8");
}

export function extractSessionCommandPayload({
	value,
}: {
	value: unknown;
}): SessionCommandPayload | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const candidate = value as Partial<SessionCommandPayload>;
	if (typeof candidate.path !== "string" || typeof candidate.existed !== "boolean") {
		return null;
	}
	if (typeof candidate.session !== "object" || candidate.session === null) {
		return null;
	}

	const session = candidate.session as Partial<SessionState>;
	if (
		typeof session.sessionName !== "string" ||
		!Array.isArray(session.commandHistory) ||
		typeof session.savedAt !== "string"
	) {
		return null;
	}

	return {
		path: candidate.path,
		existed: candidate.existed,
		session: parseSessionState({
			value: session,
			expectedSessionName: session.sessionName,
		}),
	};
}

export function applySessionStateToOptions({
	options,
	sessionState,
}: {
	options: CLIRunOptions;
	sessionState: SessionState;
}): CLIRunOptions {
	return {
		...options,
		projectId: options.projectId ?? sessionState.projectId,
		panel: options.panel ?? sessionState.lastPanel,
		tab: options.tab ?? sessionState.lastTab,
	};
}

function buildHistoryEntry({
	options,
}: {
	options: CLIRunOptions;
}): string {
	const parts = [options.command];
	if (options.projectId) {
		parts.push(`project=${options.projectId}`);
	}
	if (options.panel) {
		parts.push(`panel=${options.panel}`);
	}
	if (options.tab) {
		parts.push(`tab=${options.tab}`);
	}
	return parts.join(" ");
}

export function updateSessionState({
	sessionState,
	options,
	result,
}: {
	sessionState: SessionState;
	options: CLIRunOptions;
	result: CLIResult;
}): SessionState {
	const nextState: SessionState = {
		...sessionState,
		commandHistory: [
			...sessionState.commandHistory,
			buildHistoryEntry({ options }),
		].slice(-SESSION_HISTORY_LIMIT),
		savedAt: new Date().toISOString(),
	};

	if (result.success) {
		if (options.projectId) {
			nextState.projectId = options.projectId;
		}
		if (options.panel) {
			nextState.lastPanel = options.panel;
		}
		if (options.tab) {
			nextState.lastTab = options.tab;
		}
	}

	return nextState;
}
