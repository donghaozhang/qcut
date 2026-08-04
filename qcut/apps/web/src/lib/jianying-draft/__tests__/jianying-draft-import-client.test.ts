import { describe, expect, it, vi } from "vitest";
import type {
	DraftImportCommitDto,
	JianyingDraftImportAPI,
} from "@/types/electron/api-jianying-draft-import";
import {
	acknowledgePublishedDraftImport,
	commitLiveDraftImport,
	commitPendingDraftImport,
	createDraftImportMediaSources,
	JianyingDraftImportClientError,
} from "../jianying-draft-import-client";

const GRANT_TOKEN = "g".repeat(43);

const commitDto: DraftImportCommitDto = {
	bundle: { schemaVersion: 1 },
	mediaGrants: [
		{
			schemaVersion: 1,
			grantToken: GRANT_TOKEN,
			resourceId: "resource-1",
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			byteLength: 3,
			sha256: "b".repeat(64),
			expiresAtUnixMilliseconds: 2_000_000,
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
	malformedChunk = false,
	releaseOk = true,
}: {
	acknowledgeOk?: boolean;
	malformedChunk?: boolean;
	releaseOk?: boolean;
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
		readDraftImportMediaChunk: vi.fn(
			async ({
				grantToken,
				maxBytes,
				offset,
			}: {
				grantToken: string;
				maxBytes: number;
				offset: number;
			}) => {
				calls.push("chunk-read");
				const source = new Uint8Array([1, 2, 3]);
				const bytes = source.slice(offset, offset + maxBytes);
				return {
					ok: true as const,
					value: {
						schemaVersion: 1 as const,
						grantToken,
						offset,
						bytes,
						eof: malformedChunk ? false : offset + bytes.byteLength === 3,
					},
				};
			}
		),
		releaseDraftImportMedia: vi.fn(async () => {
			calls.push("media-release");
			return releaseOk
				? { ok: true as const, value: { releasedCount: 1 } }
				: {
						ok: false as const,
						error: {
							code: "grant-not-found" as const,
							name: "MediaPayloadGrantError",
							message: "release failed",
						},
					};
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
	it("reads transported media in validated chunks", async () => {
		const { bridge, calls } = createBridge();
		const [payload] = createDraftImportMediaSources({
			bridge,
			commit: commitDto,
		});
		expect(payload).toMatchObject({
			transport: "chunked",
			resourceId: "resource-1",
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			byteLength: 3,
		});
		if (payload?.transport !== "chunked") return;
		await expect(
			payload.readChunk({ offset: 0, maxBytes: 2 })
		).resolves.toEqual({
			bytes: new Uint8Array([1, 2]),
			eof: false,
		});
		await expect(
			payload.readChunk({ offset: 2, maxBytes: 2 })
		).resolves.toEqual({
			bytes: new Uint8Array([3]),
			eof: true,
		});
		expect(calls).toEqual(["chunk-read", "chunk-read"]);
	});

	it("rejects malformed grants before starting a transaction", () => {
		const { bridge } = createBridge();
		const malformed = {
			...commitDto,
			mediaGrants: [{ ...commitDto.mediaGrants[0], byteLength: -1 }],
		};
		expect(() =>
			createDraftImportMediaSources({ bridge, commit: malformed })
		).toThrowError(JianyingDraftImportClientError);
	});

	it("rejects a malformed chunk response", async () => {
		const { bridge } = createBridge({ malformedChunk: true });
		const [payload] = createDraftImportMediaSources({
			bridge,
			commit: commitDto,
		});
		if (payload?.transport !== "chunked") return;
		await expect(
			payload.readChunk({ offset: 2, maxBytes: 2 })
		).rejects.toMatchObject({ code: "payload-malformed" });
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
		expect(calls).toEqual(["live-commit", "transaction", "media-release"]);
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
		expect(calls).toEqual([
			"inbox-read",
			"transaction",
			"media-release",
			"inbox-ack",
		]);
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
		expect(calls).toEqual(["inbox-read", "transaction", "media-release"]);
	});

	it("does not turn a published project into a failure when release fails", async () => {
		const { bridge, calls } = createBridge({ releaseOk: false });
		await expect(
			commitLiveDraftImport({
				bridge,
				planToken: "plan-1",
				acceptedWarningFingerprints: [],
				runTransaction: async () => ({
					ok: true,
					projectId: "project-1",
					stageMetrics: createRendererStageMetrics(),
				}),
			})
		).resolves.toBe("project-1");
		expect(calls).toEqual(["live-commit", "media-release"]);
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
