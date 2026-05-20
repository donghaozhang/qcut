import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentJob } from "@qcut/db";

export interface AgentSecretRow {
	key: string;
	value: string;
}

export interface AgentSessionRow {
	id: string;
	user_id: string;
	status: string;
	provider_session_id: string | null;
	image_tag: string;
	last_active_at: string;
	expires_at: string;
	end_reason?: string | null;
}

export interface DaytonaSessionCommandResult {
	stdout?: string;
	stderr?: string;
	output?: string;
	exitCode?: number;
}

export interface DaytonaSandbox {
	id: string;
	process: {
		createSession(sessionId: string): Promise<void>;
		deleteSession(sessionId: string): Promise<void>;
		executeSessionCommand(
			sessionId: string,
			request: {
				command: string;
				runAsync?: boolean;
				suppressInputEcho?: boolean;
			},
			timeout?: number
		): Promise<DaytonaSessionCommandResult>;
	};
	fs: {
		downloadFile(
			remotePath: string,
			localPath: string,
			timeout?: number
		): Promise<void>;
	};
}

export interface DaytonaClient {
	create(
		params: {
			image: string;
			envVars: Record<string, string>;
			resources: { cpu: number; memory: number };
			ephemeral: boolean;
			autoStopInterval: number;
		},
		options: { timeout: number }
	): Promise<DaytonaSandbox>;
	get(sandboxId: string): Promise<DaytonaSandbox>;
	delete(sandbox: DaytonaSandbox, timeout?: number): Promise<void>;
}

export interface DaytonaClientCtor {
	new (config: { apiKey: string }): DaytonaClient;
}

export interface RunOnDaytonaDeps {
	DaytonaClient?: DaytonaClientCtor;
	makeOutputDir?: () => Promise<string>;
	makeSessionId?: () => string;
	sleep?: (ms: number) => Promise<void>;
	extractArchive?: (params: {
		archivePath: string;
		outputDir: string;
	}) => Promise<void>;
}

export interface RunOnDaytonaParams {
	supabase: SupabaseClient;
	job: AgentJob;
	deps?: RunOnDaytonaDeps;
}

export interface CleanupDaytonaAgentSessionsParams {
	supabase: SupabaseClient;
	runnerId: string;
	deps?: Pick<RunOnDaytonaDeps, "DaytonaClient">;
}

export interface CommandParts {
	command: string;
	archiveCommand: string;
	streams: StreamSpec[];
	stdoutPath: string;
	stderrPath: string;
	exitPath: string;
}

export interface PreparedSandbox {
	sandbox: DaytonaSandbox;
	deleteSandboxOnFinish: boolean;
	agentSessionId: string | null;
}

export interface StreamSpec {
	path: string;
	kind: string;
	source: string;
}

export interface StreamCursor {
	partial: string;
	size: number;
}

export interface StreamState {
	liveStdoutMessages: Set<string>;
}
