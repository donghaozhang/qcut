import { getKey } from "../../infra/key-manager.js";
import { getLicenseServerUrl } from "../../infra/proxy-client.js";
import { createComposeQueueHttp } from "./compose-queue-http.js";
import { createQueuedComposeProvider } from "./queued-compose-provider.js";
import type { createComposeJobStore } from "./compose-job-store.js";
import type { ComposeJob } from "../compose-protocol.js";

export function createQCutComposeProvider({
	baseUrl = process.env.QCUT_COMPOSE_API_URL ?? getLicenseServerUrl(),
	token,
	fetchImpl,
	store,
}: {
	baseUrl?: string;
	token?: string;
	fetchImpl?: typeof fetch;
	store?: ReturnType<typeof createComposeJobStore>;
} = {}) {
	const request = createComposeQueueHttp({
		baseUrl,
		fetchImpl,
		authorization: () => {
			const key = token ?? getKey("QCUT_AUTH_TOKEN");
			return key ? `Bearer ${key}` : "";
		},
	});
	const pathFor = ({ job }: { job: ComposeJob }) =>
		`/api/compose/jobs/${encodeURIComponent(job.remoteTaskId ?? job.id)}`;
	return createQueuedComposeProvider({
		provider: "qcut",
		store,
		transport: {
			preflight: () => {
				if (!(token ?? getKey("QCUT_AUTH_TOKEN")))
					throw new Error("Sign in to QCut before cloud Compose planning.");
			},
			submit: async ({ record }) => {
				const result = await request({
					path: "/api/compose/jobs",
					method: "POST",
					body: {
						id: record.job.id,
						snapshot: record.snapshot,
						intent: record.intent,
					},
				});
				if (result.id !== record.job.id)
					throw new Error("QCut Compose response identity mismatch.");
				return record.job.id;
			},
			status: async ({ job, signal }) => {
				const result = await request({ path: pathFor({ job }), signal });
				if (result.id !== job.remoteTaskId)
					throw new Error("QCut Compose status identity mismatch.");
				const status = result.status;
				if (
					status === "queued" ||
					status === "running" ||
					status === "completed" ||
					status === "failed" ||
					status === "canceled"
				)
					return status;
				throw new Error("Unknown QCut Compose job status.");
			},
			result: ({ job }) => request({ path: `${pathFor({ job })}/result` }),
			cancel: async ({ job }) => {
				const result = await request({
					path: `${pathFor({ job })}/cancel`,
					method: "POST",
				});
				if (
					result.id !== job.remoteTaskId ||
					(result.status !== "completed" && result.status !== "canceled")
				)
					throw new Error(
						"QCut cancellation did not reach a terminal state; poll the job again."
					);
				return result.status;
			},
		},
	});
}
