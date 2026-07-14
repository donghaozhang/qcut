import { Daytona, Image } from "@daytona/sdk";
import { eq } from "@qcut/db";

import { agentEvents, agentSecrets, agentSessions } from "@qcut/db/schema";

import { db } from "../../db/drizzle";
import {
	AGENT_SESSION_SANDBOX_AUTO_STOP_MINUTES,
	DAYTONA_CREATE_REQUEST_TIMEOUT_MS,
	getAgentImageTag,
	getDaytonaApiKey,
} from "./constants";

export type DaytonaClient = InstanceType<typeof Daytona>;
export type DaytonaSandbox = Awaited<ReturnType<DaytonaClient["create"]>>;
export type AgentTerminalSandboxSnapshot = Pick<DaytonaSandbox, "id"> & {
	state?: string;
	errorReason?: string;
};

type DaytonaSandboxCreateApi = {
	createSandbox: (
		body: Record<string, unknown>,
		organizationId?: unknown,
		options?: { timeout?: number }
	) => Promise<{ data: AgentTerminalSandboxSnapshot }>;
};

type DaytonaCreateOnlyClient = {
	sandboxApi: DaytonaSandboxCreateApi;
	target?: string;
};

export async function getDaytonaSandboxForSession({
	session,
}: {
	session: typeof agentSessions.$inferSelect;
}): Promise<DaytonaSandbox> {
	if (!session.providerSessionId) {
		throw new Error("agent_session_sandbox_not_ready");
	}
	const apiKey = getDaytonaApiKey();
	if (!apiKey) {
		throw new Error("agent_terminal_misconfigured: daytona");
	}
	const daytona = new Daytona({ apiKey });
	return daytona.get(session.providerSessionId);
}

export async function getOrCreateAgentTerminalSandbox({
	daytona,
	session,
	userId,
}: {
	daytona: DaytonaClient;
	session: typeof agentSessions.$inferSelect;
	userId: string;
}): Promise<AgentTerminalSandboxSnapshot> {
	if (session.providerSessionId) {
		try {
			return await daytona.get(session.providerSessionId);
		} catch (error) {
			await db.insert(agentEvents).values({
				jobId: null,
				userId,
				kind: "agent_terminal_sandbox_replaced",
				payload: {
					sessionId: session.id,
					sandboxId: session.providerSessionId,
					error: error instanceof Error ? error.message : String(error),
				},
				createdAt: new Date(),
			});
		}
	}

	return createAgentTerminalSandbox({ daytona, userId });
}

async function createAgentTerminalSandbox({
	daytona,
	userId,
}: {
	daytona: DaytonaClient;
	userId: string;
}): Promise<AgentTerminalSandboxSnapshot> {
	const envVars = await buildAgentTerminalEnv({ userId });
	const imageTag = getAgentImageTag();
	const createClient = daytona as unknown as DaytonaCreateOnlyClient;
	const response = await createClient.sandboxApi.createSandbox(
		{
			buildInfo: { dockerfileContent: Image.base(imageTag).dockerfile },
			env: envVars,
			labels: { "code-toolbox-language": "python" },
			target: createClient.target,
			cpu: 2,
			memory: 4,
			autoStopInterval: AGENT_SESSION_SANDBOX_AUTO_STOP_MINUTES,
			autoDeleteInterval: 0,
		},
		undefined,
		{ timeout: DAYTONA_CREATE_REQUEST_TIMEOUT_MS }
	);
	if (!response.data?.id) {
		throw new Error("agent_terminal_sandbox_create_invalid_response");
	}
	return response.data;
}

export function isAgentTerminalSandboxStarted({
	sandbox,
}: {
	sandbox: AgentTerminalSandboxSnapshot;
}): boolean {
	return sandbox.state === "started";
}

export function isAgentTerminalSandboxFailed({
	sandbox,
}: {
	sandbox: AgentTerminalSandboxSnapshot;
}): boolean {
	return ["build_failed", "destroyed", "error"].includes(sandbox.state || "");
}

async function buildAgentTerminalEnv({
	userId,
}: {
	userId: string;
}): Promise<Record<string, string>> {
	const secrets = await db
		.select({ key: agentSecrets.key, value: agentSecrets.value })
		.from(agentSecrets)
		.where(eq(agentSecrets.userId, userId));
	const envVars: Record<string, string> = { QCUT_SESSION_ROLE: "agent" };
	for (const secret of secrets) envVars[secret.key] = secret.value;
	return envVars;
}
