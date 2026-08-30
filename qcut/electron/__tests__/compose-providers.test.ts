import { describe, expect, it, vi } from "vitest";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	validateComposePatch,
	type ComposeIntent,
	type ComposeSnapshot,
} from "../native-pipeline/compose/compose-protocol.js";
import {
	createComposeProviderAdapter,
	createLocalComposeProvider,
	createOpenRouterComposeProvider,
} from "../native-pipeline/compose/providers/index.js";

function fixtureSnapshot(): ComposeSnapshot {
	const project = {
		id: "project-1",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		duration: 30,
	};
	const media = [
		{
			id: "media-1",
			kind: "video" as const,
			trackId: "track-video",
			elementId: "element-1",
			startTime: 0,
			duration: 10,
			trimStart: 0,
		},
		{
			id: "media-2",
			kind: "video" as const,
			trackId: "track-video",
			elementId: "element-2",
			startTime: 10,
			duration: 10,
			trimStart: 0,
		},
	];
	const captions = [
		{
			id: "caption-1",
			text: "a memorable long line",
			startTime: 1,
			duration: 2,
		},
		{ id: "caption-2", text: "short", startTime: 4, duration: 1 },
	];
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: "snapshot-1",
		createdAt: "2026-08-30T00:00:00.000Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media,
			captions,
		}),
		project,
		media,
		captions,
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { headlessRender: true, editorApply: true },
	};
}

const intent: ComposeIntent = {
	schemaVersion: COMPOSE_PROTOCOL_VERSION,
	kind: "smart-packaging",
	options: {},
};

async function runLifecycle({
	adapter,
	snapshot,
}: {
	adapter: ReturnType<typeof createLocalComposeProvider>;
	snapshot: ComposeSnapshot;
}) {
	let job = await adapter.createJob({ snapshot, intent });
	if (job.status !== "failed") {
		job = await adapter.uploadAssets({ job, snapshot });
		job = await adapter.pollJob({ job, snapshot, intent });
	}
	return job;
}

describe("local compose provider", () => {
	it("produces a validating patch bound to the snapshot", async () => {
		const snapshot = fixtureSnapshot();
		const adapter = createLocalComposeProvider();
		const job = await runLifecycle({ adapter, snapshot });
		expect(job.status).toBe("completed");
		expect(job.resultPatchId).toBeDefined();

		const patch = await adapter.downloadPatch({ job });
		expect(patch.snapshotId).toBe(snapshot.id);
		expect(patch.sourceFingerprint).toBe(snapshot.sourceFingerprint);
		expect(validateComposePatch({ snapshot, patch })).toEqual([]);
		expect(patch.operations.map(({ kind, id }) => ({ kind, id }))).toEqual([
			{ kind: "add-text-overlay", id: "text:caption-1" },
			{ kind: "add-text-overlay", id: "text:caption-2" },
			{
				kind: "upsert-transition",
				id: "transition:track-video:element-1:element-2",
			},
		]);
	});

	it("keeps operation ids stable across retries", async () => {
		const snapshot = fixtureSnapshot();
		const first = createLocalComposeProvider();
		const second = createLocalComposeProvider();
		const firstPatch = await first.downloadPatch({
			job: await runLifecycle({ adapter: first, snapshot }),
		});
		const secondPatch = await second.downloadPatch({
			job: await runLifecycle({ adapter: second, snapshot }),
		});
		expect(secondPatch.operations.map(({ id }) => id)).toEqual(
			firstPatch.operations.map(({ id }) => id)
		);
	});
});

describe("unavailable providers", () => {
	it("fails with a structured unsupported error", async () => {
		for (const provider of ["qcut", "fal"] as const) {
			const adapter = createComposeProviderAdapter({ provider });
			const job = await adapter.createJob({
				snapshot: fixtureSnapshot(),
				intent,
			});
			expect(job.status).toBe("failed");
			expect(job.error).toMatchObject({
				category: "unsupported",
				retryable: false,
			});
		}
	});
});

describe("openrouter compose provider", () => {
	it("plans through the API and re-keys operations deterministically", async () => {
		const snapshot = fixtureSnapshot();
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									content: `\`\`\`json\n${JSON.stringify({
										operations: [
											{
												kind: "add-text-overlay",
												id: "model-made-up",
												text: "hi",
												textTemplateId: "plain",
												startTime: 1,
												duration: 2,
											},
											{ kind: "bogus-kind", startTime: 0, duration: 1 },
										],
									})}\n\`\`\``,
								},
							},
						],
					}),
					{ status: 200 }
				)
		);
		const adapter = createOpenRouterComposeProvider({
			fetchImpl: fetchImpl as unknown as typeof fetch,
			apiKey: "test-key",
		});
		const job = await runLifecycle({ adapter, snapshot });
		expect(job.status).toBe("completed");
		const patch = await adapter.downloadPatch({ job });
		expect(patch.operations).toHaveLength(1);
		expect(patch.operations[0].id).toBe("openrouter:add-text-overlay:0");
		expect(patch.snapshotId).toBe(snapshot.id);

		const [, request] = fetchImpl.mock.calls[0] as unknown as [
			string,
			{ headers: Record<string, string>; body: string },
		];
		expect(request.headers.Authorization).toBe("Bearer test-key");
		expect(request.body).not.toContain("/Users/");
	});

	it("categorizes auth, quota, and missing-key failures", async () => {
		const snapshot = fixtureSnapshot();
		for (const [status, category] of [
			[401, "auth"],
			[429, "quota"],
		] as const) {
			const adapter = createOpenRouterComposeProvider({
				fetchImpl: (async () =>
					new Response("denied", { status })) as unknown as typeof fetch,
				apiKey: "test-key",
			});
			const job = await runLifecycle({ adapter, snapshot });
			expect(job.status).toBe("failed");
			expect(job.error?.category).toBe(category);
		}

		const keyless = createOpenRouterComposeProvider({
			fetchImpl: vi.fn() as unknown as typeof fetch,
			apiKey: "",
		});
		const job = await runLifecycle({ adapter: keyless, snapshot });
		expect(job.error?.category).toBe("auth");
	});

	it("treats malformed model output as retryable", async () => {
		const adapter = createOpenRouterComposeProvider({
			fetchImpl: (async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: "not json at all" } }],
					}),
					{ status: 200 }
				)) as unknown as typeof fetch,
			apiKey: "test-key",
		});
		const job = await runLifecycle({ adapter, snapshot: fixtureSnapshot() });
		expect(job.status).toBe("failed");
		expect(job.error).toMatchObject({
			category: "retryable",
			retryable: true,
		});
	});
});
