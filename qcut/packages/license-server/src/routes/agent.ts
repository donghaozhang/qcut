import { Hono, type Context } from "hono";

import { agentAuthMiddleware } from "./agent-parts/auth";
import {
	downloadAgentSessionArtifact,
	downloadAgentSessionFile,
	downloadAgentSessionFilesystemPath,
	listAgentSessionArtifacts,
	listAgentSessionFiles,
	uploadAgentSessionFiles,
} from "./agent-parts/files";
import {
	createAgentJob,
	downloadAgentArtifact,
	getAgentArtifactText,
	getAgentJobDetail,
	listAgentJobs,
} from "./agent-parts/jobs";
import {
	createOrReuseAgentSession,
	endAgentSession,
} from "./agent-parts/sessions";
import { createAgentPtyToken } from "./agent-parts/terminal";

const agentRoutes = new Hono();

type AgentHandler = (c: Context) => Promise<Response>;

function routeError({
	error,
	fallback,
}: {
	error: unknown;
	fallback: string;
}): string {
	return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
}

function withRouteError({
	handler,
	fallback,
}: {
	handler: AgentHandler;
	fallback: string;
}): AgentHandler {
	return async (c) => {
		try {
			return await handler(c);
		} catch (error) {
			return c.json({ error: routeError({ error, fallback }) }, 500);
		}
	};
}

agentRoutes.use("/*", agentAuthMiddleware);

agentRoutes.post(
	"/sessions",
	withRouteError({
		handler: createOrReuseAgentSession,
		fallback: "Failed to create agent session",
	})
);

agentRoutes.post(
	"/sessions/:sessionId/end",
	withRouteError({
		handler: endAgentSession,
		fallback: "Failed to end agent session",
	})
);

agentRoutes.post(
	"/sessions/:sessionId/pty-token",
	withRouteError({
		handler: createAgentPtyToken,
		fallback: "Failed to create agent terminal",
	})
);

agentRoutes.get(
	"/sessions/:sessionId/artifacts",
	withRouteError({
		handler: listAgentSessionArtifacts,
		fallback: "Failed to list session artifacts",
	})
);

agentRoutes.get(
	"/sessions/:sessionId/files",
	withRouteError({
		handler: listAgentSessionFiles,
		fallback: "Failed to list session files",
	})
);

agentRoutes.post(
	"/sessions/:sessionId/files",
	withRouteError({
		handler: uploadAgentSessionFiles,
		fallback: "Failed to upload session file",
	})
);

agentRoutes.get(
	"/sessions/:sessionId/files/download",
	withRouteError({
		handler: downloadAgentSessionFilesystemPath,
		fallback: "Failed to download session file",
	})
);

agentRoutes.get(
	"/sessions/:sessionId/files/:folder/:filename/download",
	withRouteError({
		handler: downloadAgentSessionFile,
		fallback: "Failed to download session file",
	})
);

agentRoutes.get(
	"/sessions/:sessionId/artifacts/:filename/download",
	withRouteError({
		handler: downloadAgentSessionArtifact,
		fallback: "Failed to download session artifact",
	})
);

agentRoutes.post(
	"/jobs",
	withRouteError({
		handler: createAgentJob,
		fallback: "Failed to create agent job",
	})
);

agentRoutes.get("/jobs", listAgentJobs);
agentRoutes.get(
	"/jobs/:jobId/artifacts/:artifactId/text",
	getAgentArtifactText
);
agentRoutes.get(
	"/jobs/:jobId/artifacts/:artifactId/download",
	downloadAgentArtifact
);
agentRoutes.get("/jobs/:jobId", getAgentJobDetail);

export {
	CODEX_AGENT_COMMAND,
	getDefaultAgentUserId,
} from "./agent-parts/constants";
export {
	buildTerminalArtifactListCommand,
	parseTerminalArtifactFiles,
	parseTerminalArtifactList,
} from "./agent-parts/files";
export {
	normalizeUploadedFilename,
	validateAgentJobBody,
	validateCommand,
} from "./agent-parts/validation";
export { agentRoutes };
