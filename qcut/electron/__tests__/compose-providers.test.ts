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
		for (const provider of ["fal"] as const) {
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

describe("qcut cloud compose provider", () => {
	it("routes planning through the shared proxy-first model caller", async () => {
		const modelApiCallImpl = vi.fn(async () => ({
			success: true,
			data: {
				choices: [
					{
						message: {
							content: JSON.stringify({ operations: [] }),
						},
					},
				],
			},
			duration: 0.01,
		}));
		const adapter = createComposeProviderAdapter({
			provider: "qcut",
			openRouter: { modelApiCallImpl },
		});
		const job = await runLifecycle({ adapter, snapshot: fixtureSnapshot() });

		expect(job).toMatchObject({ provider: "qcut", status: "completed" });
		const patch = await adapter.downloadPatch({ job });
		expect(patch.provider).toBe("qcut");
		expect(modelApiCallImpl).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "openrouter",
				endpoint: "chat/completions",
			})
		);
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
		expect(JSON.parse(request.body)).toMatchObject({
			model: "google/gemini-3.7-flash",
		});
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

describe("cloud sound-effect sanitization", () => {
	function soundSnapshot(): ComposeSnapshot {
		const snapshot = fixtureSnapshot();
		return {
			...snapshot,
			availableResources: [
				{
					provider: "qcut",
					assetType: "sound-effect",
					assetId: "sound-effects-lab:whoosh",
					displayName: "Whoosh",
					duration: 10,
					availability: "cached",
					license: "commercial-ok",
				},
			],
		};
	}

	function soundResponseAdapter({
		operations,
	}: {
		operations: Array<Record<string, unknown>>;
	}) {
		return createOpenRouterComposeProvider({
			fetchImpl: (async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: JSON.stringify({ operations }) } }],
					}),
					{ status: 200 }
				)) as unknown as typeof fetch,
			apiKey: "test-key",
		});
	}

	const baseSound = {
		kind: "add-sound-effect",
		assetId: "sound-effects-lab:whoosh",
		volume: 0.8,
		startTime: 0,
		duration: 6,
	};

	it("drops sounds whose duration × playbackRate overruns the source", async () => {
		const snapshot = soundSnapshot();
		const adapter = soundResponseAdapter({
			operations: [
				// 6s × 2 = 12s of source against a 10s asset — must be dropped.
				{ ...baseSound, playbackRate: 2 },
				// 6s × 0.5 + 1s + 2s trims = 6s ≤ 10s — must survive.
				{ ...baseSound, playbackRate: 0.5, trimStart: 1, trimEnd: 2 },
			],
		});
		const job = await runLifecycle({ adapter, snapshot });
		expect(job.status).toBe("completed");
		const patch = await adapter.downloadPatch({ job });
		expect(patch.operations).toHaveLength(1);
		expect(patch.operations[0]).toMatchObject({
			kind: "add-sound-effect",
			playbackRate: 0.5,
			trimStart: 1,
			trimEnd: 2,
		});
		expect(validateComposePatch({ snapshot, patch })).toEqual([]);
	});

	it("refuses invented asset ids and strips model-supplied local paths", async () => {
		const snapshot = soundSnapshot();
		const adapter = soundResponseAdapter({
			operations: [
				{ ...baseSound, assetId: "sound-effects-lab:not-in-snapshot" },
				{
					...baseSound,
					asset: {
						provider: "qcut",
						assetType: "sound-effect",
						assetId: "sound-effects-lab:whoosh",
						localPath: "/tmp/evil.mp3",
						cacheKey: "spoofed",
						provenance: { injected: true },
					},
				},
			],
		});
		const job = await runLifecycle({ adapter, snapshot });
		expect(job.status).toBe("completed");
		const patch = await adapter.downloadPatch({ job });
		expect(patch.operations).toHaveLength(1);
		const [operation] = patch.operations;
		expect(operation).toMatchObject({
			kind: "add-sound-effect",
			asset: { assetId: "sound-effects-lab:whoosh" },
		});
		const asset = (operation as { asset: Record<string, unknown> }).asset;
		expect(asset.localPath).toBeUndefined();
		expect(asset.cacheKey).toBeUndefined();
		expect(asset.provenance).toBeUndefined();
	});

	it("strips fades that overrun the operation instead of keeping them", async () => {
		const snapshot = soundSnapshot();
		const adapter = soundResponseAdapter({
			operations: [{ ...baseSound, fadeIn: 7, fadeOut: 2 }],
		});
		const job = await runLifecycle({ adapter, snapshot });
		const patch = await adapter.downloadPatch({ job });
		expect(patch.operations).toHaveLength(1);
		const [operation] = patch.operations as Array<Record<string, unknown>>;
		expect(operation.fadeIn).toBeUndefined();
		expect(operation.fadeOut).toBe(2);
	});
});
