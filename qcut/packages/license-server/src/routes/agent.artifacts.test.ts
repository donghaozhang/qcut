import { describe, expect, it, vi } from "vitest";

import {
	buildApp,
	getSupabase,
	mockArtifactDownload,
	mockOwnedJobAndArtifact,
} from "./agent.test-utils";

describe("GET /api/agent/jobs/:jobId/artifacts/:artifactId/text", () => {
	it("returns text artifacts owned by the authenticated user", async () => {
		mockOwnedJobAndArtifact({
			artifact: {
				kind: "log",
				storagePath: "agent/mock-user-001/job-1/codex-last-message.md",
				bytes: 17,
				meta: { filename: "codex-last-message.md" },
			},
		});
		mockArtifactDownload({ text: "Hello from Codex." });

		const res = await buildApp().request(
			"/api/agent/jobs/job-1/artifacts/artifact-1/text"
		);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Hello from Codex.");
	});

	it("rejects large text artifacts before downloading", async () => {
		mockOwnedJobAndArtifact({
			artifact: {
				kind: "log",
				storagePath: "agent/mock-user-001/job-1/codex-events.jsonl",
				bytes: 300_000,
				meta: { filename: "codex-events.jsonl" },
			},
		});

		const res = await buildApp().request(
			"/api/agent/jobs/job-1/artifacts/artifact-1/text"
		);

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "artifact_too_large" });
		expect(getSupabase).not.toHaveBeenCalled();
	});
});

describe("GET /api/agent/jobs/:jobId/artifacts/:artifactId/download", () => {
	it("streams artifacts owned by the authenticated user", async () => {
		mockOwnedJobAndArtifact({
			artifact: {
				kind: "image",
				storagePath: "agent/mock-user-001/job-1/result.jpg",
				bytes: 3,
				meta: { filename: "result.jpg" },
			},
		});
		const download = vi.fn().mockResolvedValue({
			data: new Blob([new Uint8Array([1, 2, 3])]),
			error: null,
		});
		const from = vi.fn().mockReturnValue({ download });
		vi.mocked(getSupabase).mockReturnValue({
			storage: { from },
		} as never);

		const res = await buildApp().request(
			"/api/agent/jobs/job-1/artifacts/artifact-1/download"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/jpeg");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="result.jpg"'
		);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3])
		);
		expect(download).toHaveBeenCalledWith(
			"agent/mock-user-001/job-1/result.jpg"
		);
	});
});
