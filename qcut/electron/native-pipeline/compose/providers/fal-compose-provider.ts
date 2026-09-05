import { getKey } from "../../infra/key-manager.js";
import {
	composeSystemPrompt,
	snapshotSummary,
} from "./openrouter-compose-provider.js";
import { createComposeQueueHttp } from "./compose-queue-http.js";
import { createQueuedComposeProvider } from "./queued-compose-provider.js";
import { createComposeJobStore } from "./compose-job-store.js";
import type { ComposeJob } from "../compose-protocol.js";

export function createFalComposeProvider({
	apiKey,
	model = process.env.QCUT_COMPOSE_MODEL ?? "google/gemini-2.5-flash",
	fetchImpl,
	store,
}: {
	apiKey?: string;
	model?: string;
	fetchImpl?: typeof fetch;
	store?: ReturnType<typeof createComposeJobStore>;
} = {}) {
	const request = createComposeQueueHttp({
		baseUrl: "https://queue.fal.run/openrouter/router",
		fetchImpl,
		authorization: () => {
			const key = apiKey ?? getKey("FAL_KEY");
			return key ? `Key ${key}` : "";
		},
	});
	const taskPath = ({ job }: { job: ComposeJob }) => {
		if (!job.remoteTaskId || !/^[a-zA-Z0-9_-]+$/.test(job.remoteTaskId))
			throw new Error("Missing FAL task identity.");
		return `/requests/${job.remoteTaskId}`;
	};
	return createQueuedComposeProvider({
		provider: "fal",
		store,
		transport: {
			preflight: () => {
				if (!(apiKey ?? getKey("FAL_KEY")))
					throw new Error("FAL_KEY is required for Compose planning.");
			},
			submit: async ({ record }) => {
				const response = await request({
					path: "",
					method: "POST",
					body: {
						model,
						system_prompt: composeSystemPrompt(),
						prompt: `Intent: ${record.intent.kind}. Options: ${JSON.stringify(record.intent.options)}. Snapshot: ${snapshotSummary({ snapshot: record.snapshot })}`,
						temperature: 0.2,
						max_tokens: 8192,
					},
				});
				if (typeof response.request_id !== "string")
					throw new Error("FAL returned no request_id.");
				return response.request_id;
			},
			status: async ({ job, signal }) => {
				const response = await request({
					path: `${taskPath({ job })}/status`,
					signal,
				});
				if (response.error) return "failed";
				if (response.status === "IN_QUEUE") return "queued";
				if (response.status === "IN_PROGRESS") return "running";
				if (response.status === "COMPLETED") return "completed";
				throw new Error("Unknown FAL Compose job status.");
			},
			result: async ({ job }) => {
				const response = await request({ path: taskPath({ job }) });
				if (
					response.error ||
					response.partial ||
					typeof response.output !== "string"
				)
					throw new Error("FAL Compose result is incomplete or failed.");
				return JSON.parse(
					response.output
						.trim()
						.replace(/^```(?:json)?\s*/, "")
						.replace(/\s*```$/, "")
				);
			},
			cancel: async ({ job }) => {
				await request({ path: `${taskPath({ job })}/cancel`, method: "PUT" });
			},
		},
	});
}
