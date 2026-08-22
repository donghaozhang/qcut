import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSoundEffectsLabSource } from "@/lib/audio/local-sound-effects-lab-config";
import {
	SoundEffectsLabManifestHttpError,
	type PrivateSoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";
import { useLicenseStore } from "@/stores/license-store";
import { useLocalSoundEffectsLab } from "../use-local-sound-effects-lab";

const labMocks = vi.hoisted(() => ({
	getSource: vi.fn<() => LocalSoundEffectsLabSource | null>(),
	getSessionToken: vi.fn(),
	loadLocalManifest: vi.fn(),
	loadOfflinePack: vi.fn(),
	loadPrivateManifest: vi.fn(),
	removeOfflinePack: vi.fn(),
}));

vi.mock("@/lib/ai-video/core/license-relay", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/ai-video/core/license-relay")>();
	return { ...actual, getSessionToken: labMocks.getSessionToken };
});

vi.mock(
	"@/lib/audio/local-sound-effects-lab-config",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("@/lib/audio/local-sound-effects-lab-config")
			>();
		return {
			...actual,
			getLocalSoundEffectsLabSource: labMocks.getSource,
		};
	}
);

vi.mock("@/lib/audio/local-sound-effects-manifest", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/audio/local-sound-effects-manifest")
		>();
	return {
		...actual,
		loadLocalSoundEffectsLabManifest: labMocks.loadLocalManifest,
		loadPrivateSoundEffectsLabManifest: labMocks.loadPrivateManifest,
	};
});

vi.mock("@/lib/audio/sound-effects-lab-offline-pack", () => ({
	loadSoundEffectsLabOfflinePack: labMocks.loadOfflinePack,
	removeSoundEffectsLabOfflinePack: labMocks.removeOfflinePack,
}));

const privateCatalog: PrivateSoundEffectsLabManifest = {
	schemaVersion: 2,
	catalogId: "jianying-sfx-reference-2026-08-01",
	generatedAt: "2026-08-01T00:00:00.000Z",
	provenance: {
		sourceApp: "Jianying Pro",
		purpose: "internal-reference",
		redistribution: "prohibited",
	},
	categories: [{ id: "jianying-0123456789ab", label: "热门" }],
	items: [
		{
			id: "6896679799100689672",
			numericId: -900_000_000,
			title: "唰",
			fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
			mimeType: "audio/mpeg",
			byteSize: 4,
			duration: 1.25,
			contentMd5: "0291b72047769e085e7595ce5d65dbd2",
			contentSha256:
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			resourceId: "6896679799100689672",
			batch: "01",
			mappingStrategy: "metadata-md5",
			categoryIds: ["jianying-0123456789ab"],
			asset: {
				kind: "supabase-storage",
				objectKey:
					"jianying/2026-08-01/assets/0291b72047769e085e7595ce5d65dbd2.mp3",
				byteSize: 4,
				checksumSha256:
					"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			},
		},
	],
};

function setSignedInTestUser(): void {
	useLicenseStore.setState({
		license: {
			credits: {
				planCredits: 50,
				planCreditsResetAt: "",
				topUpCredits: 0,
				totalCredits: 50,
			},
			plan: "free",
			status: "active",
			user: {
				email: "qcutlove@qcut.app",
				image: null,
				name: "QCut Love",
			},
		},
	});
}

describe("useLocalSoundEffectsLab", () => {
	beforeEach(() => {
		labMocks.getSource.mockReset();
		labMocks.getSessionToken.mockReset();
		labMocks.getSessionToken.mockResolvedValue("session-token");
		labMocks.loadLocalManifest.mockReset();
		labMocks.loadOfflinePack.mockReset();
		labMocks.loadPrivateManifest.mockReset();
		labMocks.removeOfflinePack.mockReset();
		labMocks.removeOfflinePack.mockResolvedValue({ removedResourceCount: 0 });
		useLicenseStore.setState({ license: null });
	});

	it("stays unavailable when the lab is disabled", () => {
		labMocks.getSource.mockReturnValue(null);

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		expect(result.current).toEqual({
			catalog: null,
			error: null,
			isAvailable: false,
			isLoading: false,
			isOffline: false,
		});
	});

	it("reveals the private catalog only after entitlement succeeds", async () => {
		labMocks.getSource.mockReturnValue({ kind: "private-manifest" });
		labMocks.loadPrivateManifest.mockResolvedValue(privateCatalog);

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		expect(result.current).toMatchObject({
			catalog: null,
			isAvailable: false,
			isLoading: true,
		});
		await waitFor(() => expect(result.current.isAvailable).toBe(true));
		expect(result.current.catalog).toEqual(privateCatalog);
		expect(result.current.isOffline).toBe(false);
		expect(labMocks.loadPrivateManifest).toHaveBeenCalledWith(
			expect.objectContaining({
				manifestUrl: expect.stringContaining(
					"/api/sound-effects-lab/private-manifest"
				),
				signal: expect.any(AbortSignal),
			})
		);
	});

	it("keeps the private lab hidden when the server denies access", async () => {
		labMocks.getSource.mockReturnValue({ kind: "private-manifest" });
		labMocks.loadPrivateManifest.mockRejectedValue(
			new Error("Unable to fetch Sound Effects Lab manifest (403)")
		);

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current).toEqual({
			catalog: null,
			error: null,
			isAvailable: false,
			isLoading: false,
			isOffline: false,
		});
	});

	it("uses a complete account-bound offline pack when the network fails", async () => {
		labMocks.getSource.mockReturnValue({ kind: "private-manifest" });
		labMocks.loadPrivateManifest.mockRejectedValue(new Error("offline"));
		labMocks.loadOfflinePack.mockResolvedValue({
			cachedBytes: 4,
			catalog: privateCatalog,
			installedAt: 1,
			persistentStorage: true,
			totalBytes: 4,
		});
		setSignedInTestUser();

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		await waitFor(() => expect(result.current.isOffline).toBe(true));
		expect(result.current.catalog).toEqual(privateCatalog);
		expect(result.current.isAvailable).toBe(true);
		expect(labMocks.loadOfflinePack).toHaveBeenCalledWith({
			ownerEmail: "qcutlove@qcut.app",
		});
	});

	it("revokes the account offline pack after an explicit access denial", async () => {
		labMocks.getSource.mockReturnValue({ kind: "private-manifest" });
		labMocks.loadPrivateManifest.mockRejectedValue(
			new SoundEffectsLabManifestHttpError({
				manifestUrl: "https://license.example/private-manifest",
				status: 403,
			})
		);
		setSignedInTestUser();

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.isAvailable).toBe(false);
		expect(labMocks.removeOfflinePack).toHaveBeenCalledWith({
			ownerEmail: "qcutlove@qcut.app",
		});
		expect(labMocks.loadOfflinePack).not.toHaveBeenCalled();
	});

	it("does not expose an offline pack without a persisted session token", async () => {
		labMocks.getSource.mockReturnValue({ kind: "private-manifest" });
		labMocks.getSessionToken.mockResolvedValue("");
		labMocks.loadPrivateManifest.mockRejectedValue(new Error("offline"));
		labMocks.loadOfflinePack.mockResolvedValue({
			cachedBytes: 4,
			catalog: privateCatalog,
			installedAt: 1,
			persistentStorage: true,
			totalBytes: 4,
		});
		setSignedInTestUser();

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.isAvailable).toBe(false);
		expect(labMocks.loadOfflinePack).not.toHaveBeenCalled();
	});

	it("keeps a configured local lab visible when its manifest fails", async () => {
		labMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/broken.json",
		});
		labMocks.loadLocalManifest.mockRejectedValue(
			new Error("Invalid Sound Effects Lab manifest")
		);

		const { result } = renderHook(() => useLocalSoundEffectsLab());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current).toMatchObject({
			catalog: null,
			error: "Invalid Sound Effects Lab manifest",
			isAvailable: true,
		});
	});
});
