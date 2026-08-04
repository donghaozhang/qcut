import { describe, expect, it, vi } from "vitest";
import type {
	DraftImportCommitDto,
	JianyingDraftImportAPI,
} from "@/types/electron/api-jianying-draft-import";
import {
	acknowledgePublishedDraftImport,
	commitLiveDraftImport,
	commitPendingDraftImport,
	decodeDraftImportPayloads,
	JianyingDraftImportClientError,
} from "../jianying-draft-import-client";

const commitDto: DraftImportCommitDto = {
	bundle: { schemaVersion: 1 },
	mediaPayloads: [
		{
			resourceId: "resource-1",
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			bytesBase64: "AQID",
		},
	],
	envelopeCapture: {
		envelope: { schemaVersion: 1, importId: "plan-1" },
		payloadBase64: "BAUG",
		payloadSha256: "a".repeat(64),
	},
};

function createRendererStageMetrics() {
	return {
		schemaVersion: 1 as const,
		phase: "renderer-commit" as const,
		measuredDurationMilliseconds: 0,
		stages: {},
	};
}

function createBridge({
	acknowledgeOk = true,
}: {
	acknowledgeOk?: boolean;
} = {}) {
	const calls: string[] = [];
	const bridge = {
		commitDraftImport: vi.fn(async () => {
			calls.push("live-commit");
			return { ok: true as const, value: commitDto };
		}),
		readPendingDraftImport: vi.fn(async () => {
			calls.push("inbox-read");
			return { ok: true as const, value: commitDto };
		}),
		acknowledgePendingDraftImport: vi.fn(async ({ entryId }) => {
			calls.push("inbox-ack");
			return acknowledgeOk
				? { ok: true as const, value: { entryId } }
				: {
						ok: false as const,
						error: {
							code: "inbox-unavailable" as const,
							name: "Error",
							message: "ack failed",
						},
					};
		}),
	} as unknown as JianyingDraftImportAPI;
	return { bridge, calls };
}

describe("Jianying draft import client", () => {
	it("decodes transported media without changing its bytes", () => {
		const [payload] = decodeDraftImportPayloads({ commit: commitDto });
		expect(payload).toMatchObject({
			resourceId: "resource-1",
			fileName: "clip.mp4",
			mimeType: "video/mp4",
		});
		expect([...payload.bytes]).toEqual([1, 2, 3]);
	});

	it("publishes a live commit through the renderer transaction", async () => {
		const { bridge, calls } = createBridge();
		const runTransaction = vi.fn(async () => {
			calls.push("transaction");
			return {
				ok: true as const,
				projectId: "project-1",
				stageMetrics: createRendererStageMetrics(),
			};
		});
		await expect(
			commitLiveDraftImport({
				bridge,
				planToken: "plan-1",
				acceptedWarningFingerprints: ["warning-1"],
				runTransaction,
			})
		).resolves.toBe("project-1");
		expect(calls).toEqual(["live-commit", "transaction"]);
		expect(runTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				envelopeCapture: {
					envelope: { schemaVersion: 1, importId: "plan-1" },
					payload: new Uint8Array([4, 5, 6]),
					payloadSha256: "a".repeat(64),
				},
			})
		);
	});

	it("acknowledges an inbox entry only after publish succeeds", async () => {
		const { bridge, calls } = createBridge();
		const runTransaction = vi.fn(async () => {
			calls.push("transaction");
			return {
				ok: true as const,
				projectId: "project-1",
				stageMetrics: createRendererStageMetrics(),
			};
		});
		await commitPendingDraftImport({
			bridge,
			entryId: "entry-1",
			runTransaction,
		});
		expect(calls).toEqual(["inbox-read", "transaction", "inbox-ack"]);
	});

	it("keeps an inbox entry when the renderer transaction fails", async () => {
		const { bridge, calls } = createBridge();
		await expect(
			commitPendingDraftImport({
				bridge,
				entryId: "entry-1",
				runTransaction: async () => {
					calls.push("transaction");
					return {
						ok: false,
						reason: "verify-failed",
						message: "readback mismatch",
						stageMetrics: createRendererStageMetrics(),
					};
				},
			})
		).rejects.toMatchObject({ code: "verify-failed" });
		expect(calls).toEqual(["inbox-read", "transaction"]);
	});

	it("returns an ack-only recovery after publish when cleanup fails", async () => {
		const { bridge } = createBridge({ acknowledgeOk: false });
		let caught: unknown;
		try {
			await commitPendingDraftImport({
				bridge,
				entryId: "entry-1",
				runTransaction: async () => ({
					ok: true,
					projectId: "project-1",
					stageMetrics: createRendererStageMetrics(),
				}),
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(JianyingDraftImportClientError);
		expect(caught).toMatchObject({
			pendingAcknowledgement: {
				entryId: "entry-1",
				projectId: "project-1",
			},
		});
	});

	it("supports retrying only the failed inbox acknowledgement", async () => {
		const { bridge, calls } = createBridge();
		await acknowledgePublishedDraftImport({ bridge, entryId: "entry-1" });
		expect(calls).toEqual(["inbox-ack"]);
	});
});
