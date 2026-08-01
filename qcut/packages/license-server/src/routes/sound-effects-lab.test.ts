import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
	createSignedUrl: vi.fn(),
	download: vi.fn(),
	from: vi.fn(),
}));

vi.mock("../db/supabase", () => ({
	getSupabase: vi.fn(() => ({
		storage: { from: storageMocks.from },
	})),
}));

const { soundEffectsLabRoutes } = await import("./sound-effects-lab");

function buildApp() {
	const app = new Hono();
	app.route("/api/sound-effects-lab", soundEffectsLabRoutes);
	return app;
}

function buildAssetUrl({ objectKey }: { objectKey?: string } = {}) {
	const query = new URLSearchParams();
	if (objectKey !== undefined) query.set("objectKey", objectKey);
	const suffix = query.size > 0 ? `?${query.toString()}` : "";
	return `/api/sound-effects-lab/assets${suffix}`;
}

function allowMockUser() {
	vi.stubEnv("SOUND_EFFECTS_LAB_ALLOWED_USER_IDS", "mock-user-001");
}

beforeEach(() => {
	vi.stubEnv("MOCK_MODE", "true");
	vi.stubEnv("SOUND_EFFECTS_LAB_ALLOWED_USER_IDS", "");
	vi.clearAllMocks();
	storageMocks.from.mockReturnValue({
		createSignedUrl: storageMocks.createSignedUrl,
		download: storageMocks.download,
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("sound effects lab routes", () => {
	const objectKey =
		"jianying/2026-08-01/assets/5bb4c18515e6059da16432af0db0f1dc.mp3";
	const manifestUrl = "/api/sound-effects-lab/private-manifest";

	it("requires authentication", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(401);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("fails closed when the allowlist is empty", async () => {
		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("forbids authenticated users outside the allowlist", async () => {
		vi.stubEnv(
			"SOUND_EFFECTS_LAB_ALLOWED_USER_IDS",
			" another-user, a-third-user "
		);

		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(403);
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("rejects malformed and traversal object keys", async () => {
		allowMockUser();
		const invalidKeys = [
			undefined,
			"",
			"jianying/2026-08-01/assets/sound.mp3",
			"jianying/2026-8-01/assets/5bb4c18515e6059da16432af0db0f1dc.mp3",
			"jianying/2026-08-01/assets/5BB4C18515E6059DA16432AF0DB0F1DC.mp3",
			"jianying/2026-08-01/assets/../5bb4c18515e6059da16432af0db0f1dc.mp3",
			"jianying/2026-08-01/assets/5bb4c18515e6059da16432af0db0f1dc.wav",
		];

		const responses = await Promise.all(
			invalidKeys.map((key) =>
				buildApp().request(buildAssetUrl({ objectKey: key }))
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(storageMocks.from).not.toHaveBeenCalled();
	});

	it("redirects allowlisted users to a short-lived signed URL", async () => {
		allowMockUser();
		const signedUrl =
			"https://example.supabase.co/storage/v1/object/sign/sound-effects-lab/audio.mp3?token=signed";
		storageMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl },
			error: null,
		});

		const response = await buildApp().request(buildAssetUrl({ objectKey }));

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe(signedUrl);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(storageMocks.from).toHaveBeenCalledWith("sound-effects-lab");
		expect(storageMocks.createSignedUrl).toHaveBeenCalledWith(objectKey, 600);
	});

	it("sanitizes signing failures", async () => {
		allowMockUser();
		storageMocks.createSignedUrl.mockResolvedValue({
			data: null,
			error: { message: "SUPABASE_SERVICE_KEY=do-not-leak" },
		});

		const response = await buildApp().request(buildAssetUrl({ objectKey }));
		const body = await response.text();

		expect(response.status).toBe(502);
		expect(body).toBe('{"error":"Failed to sign sound effect asset"}');
		expect(body).not.toContain("do-not-leak");
	});

	it("serves the private manifest to allowlisted users", async () => {
		allowMockUser();
		const manifestJson = JSON.stringify({
			schemaVersion: 2,
			catalogId: "jianying-sfx-reference-2026-08-01",
		});
		storageMocks.download.mockResolvedValue({
			data: new Blob([manifestJson], { type: "application/json" }),
			error: null,
		});

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		await expect(response.text()).resolves.toBe(manifestJson);
		expect(storageMocks.download).toHaveBeenCalledWith(
			"jianying/2026-08-01/manifest.json"
		);
	});

	it("forbids the private manifest outside the allowlist", async () => {
		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(403);
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("requires authentication for the private manifest", async () => {
		vi.stubEnv("MOCK_MODE", "false");

		const response = await buildApp().request(manifestUrl);

		expect(response.status).toBe(401);
		expect(storageMocks.download).not.toHaveBeenCalled();
	});

	it("sanitizes unavailable manifest errors", async () => {
		allowMockUser();
		storageMocks.download.mockResolvedValue({
			data: null,
			error: { message: "SUPABASE_SERVICE_KEY=do-not-leak" },
		});

		const response = await buildApp().request(manifestUrl);
		const body = await response.text();

		expect(response.status).toBe(404);
		expect(body).toBe('{"error":"Private sound effects manifest unavailable"}');
		expect(body).not.toContain("do-not-leak");
	});
});
