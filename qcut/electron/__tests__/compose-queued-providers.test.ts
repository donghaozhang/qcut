import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createComposeJobStore } from "../native-pipeline/compose/providers/compose-job-store";
import {
	createQueuedComposeProvider,
	type ComposeQueueTransport,
} from "../native-pipeline/compose/providers/queued-compose-provider";
import { createFalComposeProvider } from "../native-pipeline/compose/providers/fal-compose-provider";
import { createQCutComposeProvider } from "../native-pipeline/compose/providers/qcut-compose-provider";
import { createComposeQueueHttp } from "../native-pipeline/compose/providers/compose-queue-http";
import type {
	ComposeSnapshot,
	ComposeIntent,
} from "../native-pipeline/compose/compose-protocol";

const snapshot: ComposeSnapshot = {
	schemaVersion: 1,
	id: "snapshot",
	createdAt: "2026-09-06T00:00:00Z",
	sourceFingerprint: "test-fingerprint",
	project: {
		id: "project",
		fps: 30,
		duration: 10,
		canvasSize: { width: 1920, height: 1080 },
	},
	media: [],
	captions: [],
	beats: [],
	shots: [],
	capabilities: { editorApply: true, headlessRender: true },
	availableResources: [
		{
			provider: "local",
			assetType: "font",
			assetId: "font-1",
			localPath: "/private/fonts/font.ttf",
			cacheKey: "private-hash",
			provenance: { secret: "private-source" },
		},
	],
};
const intent: ComposeIntent = {
	schemaVersion: 1,
	kind: "subtitle-style",
	options: {},
};
const output = {
	operations: [
		{
			kind: "add-caption",
			language: "zh",
			text: "Hello",
			startTime: 1,
			duration: 2,
		},
	],
};
let directory: string;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "compose-queue-"));
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

function fixture() {
	const transport: ComposeQueueTransport = {
		submit: vi.fn(async () => "remote-task"),
		status: vi.fn(async () => "completed"),
		result: vi.fn(async () => output),
		cancel: vi.fn(async () => {}),
	};
	const store = createComposeJobStore({ directory });
	const adapter = createQueuedComposeProvider({
		provider: "qcut",
		store,
		transport,
	});
	return { transport, store, adapter };
}

describe("durable Compose providers", () => {
	it("resumes with a fresh adapter, keeps stable patches and stores no private resource locators", async () => {
		const { adapter, store, transport } = fixture();
		const created = await adapter.createJob({ snapshot, intent });
		const queued = await adapter.uploadAssets({ job: created, snapshot });
		const restarted = createQueuedComposeProvider({
			provider: "qcut",
			store: createComposeJobStore({ directory }),
			transport,
		});
		const completed = await restarted.pollJob({
			job: queued,
			snapshot,
			intent,
		});
		const first = await restarted.downloadPatch({ job: completed });
		expect(await adapter.downloadPatch({ job: completed })).toEqual(first);
		expect(first.operations).toHaveLength(1);
		expect(transport.result).toHaveBeenCalledTimes(1);
		const stored = await readFile(
			join(directory, `${created.id}.json`),
			"utf8"
		);
		expect(stored).not.toMatch(/private-source|private-hash|\/private\/fonts/);
		// Windows stat mode does not represent POSIX owner/group permissions.
		if (process.platform !== "win32") {
			expect(
				(await stat(join(directory, `${created.id}.json`))).mode & 0o777
			).toBe(0o600);
		}
		expect((await store.read({ id: created.id })).job.status).toBe("completed");
	});
	it("serializes duplicate uploads across independent adapters", async () => {
		const { adapter, transport } = fixture();
		const second = createQueuedComposeProvider({
			provider: "qcut",
			store: createComposeJobStore({ directory }),
			transport,
		});
		const job = await adapter.createJob({ snapshot, intent });
		await Promise.all([
			adapter.uploadAssets({ job, snapshot }),
			second.uploadAssets({ job, snapshot }),
		]);
		expect(transport.submit).toHaveBeenCalledTimes(1);
	});
	it("does not overwrite cancellation when an old handle polls", async () => {
		const { adapter, transport } = fixture();
		const job = await adapter.uploadAssets({
			job: await adapter.createJob({ snapshot, intent }),
			snapshot,
		});
		await adapter.cancelJob({ job });
		expect((await adapter.pollJob({ job, snapshot, intent })).status).toBe(
			"canceled"
		);
		expect(transport.status).not.toHaveBeenCalled();
	});
	it("keeps an ambiguous FAL submission recoverable without duplicating billing", async () => {
		const { store, transport } = fixture();
		transport.submit = vi.fn(async () => {
			throw new Error("connection lost");
		});
		const adapter = createQueuedComposeProvider({
			provider: "fal",
			store,
			transport,
		});
		const job = await adapter.createJob({ snapshot, intent });
		await expect(adapter.uploadAssets({ job, snapshot })).rejects.toThrow(
			"connection lost"
		);
		await expect(adapter.uploadAssets({ job, snapshot })).rejects.toThrow(
			"outcome is unknown"
		);
		expect(transport.submit).toHaveBeenCalledTimes(1);
		expect((await store.read({ id: job.id })).job.status).toBe("uploading");
	});
	it("rejects mismatched snapshots, traversal IDs and silently dropped model operations", async () => {
		const { adapter, transport, store } = fixture();
		const job = await adapter.uploadAssets({
			job: await adapter.createJob({ snapshot, intent }),
			snapshot,
		});
		await expect(
			adapter.pollJob({
				job: { ...job, snapshotId: "another" },
				snapshot,
				intent,
			})
		).rejects.toThrow("mismatch");
		await expect(store.read({ id: "../private" })).rejects.toThrow(
			"Invalid Compose job ID"
		);
		transport.result = vi.fn(async () => ({
			operations: [{ kind: "invented", startTime: 0, duration: 1 }],
		}));
		const completed = await adapter.pollJob({ job, snapshot, intent });
		await expect(adapter.downloadPatch({ job: completed })).rejects.toThrow(
			"rejected operations"
		);
	});
	it("uses FAL's queue endpoints and never follows response-supplied URLs", async () => {
		const fetchImpl = vi.fn(
			async (url: string | URL | Request, init?: RequestInit) => {
				expect(init?.headers).toMatchObject({ Authorization: "Key test-fal" });
				const path = String(url);
				if (init?.method === "POST")
					return Response.json({
						request_id: "fal-request",
						status_url: "https://untrusted.test/token",
					});
				if (path.endsWith("/status"))
					return Response.json({ status: "COMPLETED" });
				return Response.json({
					output: JSON.stringify(output),
					partial: false,
				});
			}
		);
		const adapter = createFalComposeProvider({
			store: createComposeJobStore({ directory }),
			apiKey: "test-fal",
			fetchImpl: fetchImpl as typeof fetch,
		});
		const job = await adapter.uploadAssets({
			job: await adapter.createJob({ snapshot, intent }),
			snapshot,
		});
		const completed = await adapter.pollJob({ job, snapshot, intent });
		expect(
			(await adapter.downloadPatch({ job: completed })).operations
		).toHaveLength(1);
		expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
			"https://queue.fal.run/openrouter/router",
			"https://queue.fal.run/openrouter/router/requests/fal-request/status",
			"https://queue.fal.run/openrouter/router/requests/fal-request",
		]);
	});
	it("submits idempotent QCut jobs to its authenticated API", async () => {
		let id = "";
		const fetchImpl = vi.fn(
			async (url: string | URL | Request, init?: RequestInit) => {
				expect(init?.headers).toMatchObject({
					Authorization: "Bearer test-session",
				});
				if (init?.method === "POST") {
					id = JSON.parse(String(init.body)).id;
					return Response.json({ id, status: "queued" });
				}
				if (String(url).endsWith("/result")) return Response.json(output);
				return Response.json({ id, status: "completed" });
			}
		);
		const adapter = createQCutComposeProvider({
			baseUrl: "https://compose.test",
			token: "test-session",
			store: createComposeJobStore({ directory }),
			fetchImpl: fetchImpl as typeof fetch,
		});
		const job = await adapter.uploadAssets({
			job: await adapter.createJob({ snapshot, intent }),
			snapshot,
		});
		const completed = await adapter.pollJob({ job, snapshot, intent });
		expect((await adapter.downloadPatch({ job: completed })).provider).toBe(
			"qcut"
		);
		expect(fetchImpl.mock.calls[0][0]).toBe(
			"https://compose.test/api/compose/jobs"
		);
	});
	it("rejects insecure transports and redacts remote error bodies", async () => {
		expect(() =>
			createComposeQueueHttp({
				baseUrl: "http://public.test",
				authorization: () => "secret",
			})
		).toThrow();
		const request = createComposeQueueHttp({
			baseUrl: "https://queue.test",
			authorization: () => "secret",
			fetchImpl: vi.fn(
				async () => new Response("private-provider-token", { status: 429 })
			) as typeof fetch,
		});
		await expect(request({ path: "" })).rejects.toThrow("HTTP 429");
		await expect(request({ path: "" })).rejects.not.toThrow(
			"private-provider-token"
		);
	});
});
