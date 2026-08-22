import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateSoundEffectsLabManifest } from "@/lib/audio/local-sound-effects-manifest";
import { useSoundEffectsLabOfflinePack } from "../use-sound-effects-lab-offline-pack";

const packMocks = vi.hoisted(() => ({
	getStatus: vi.fn(),
	install: vi.fn(),
	remove: vi.fn(),
}));

vi.mock("@/lib/audio/sound-effects-lab-offline-pack", () => ({
	getSoundEffectsLabOfflinePackStatus: packMocks.getStatus,
	installSoundEffectsLabOfflinePack: packMocks.install,
	removeSoundEffectsLabOfflinePack: packMocks.remove,
}));

const catalog: PrivateSoundEffectsLabManifest = {
	catalogId: "jianying-sfx-reference-2026-08-01",
	categories: [{ id: "jianying-0123456789ab", label: "热门" }],
	generatedAt: "2026-08-01T00:00:00.000Z",
	items: [
		{
			asset: {
				byteSize: 4,
				checksumSha256:
					"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				kind: "supabase-storage",
				objectKey:
					"jianying/2026-08-01/assets/0291b72047769e085e7595ce5d65dbd2.mp3",
			},
			batch: "01",
			byteSize: 4,
			categoryIds: ["jianying-0123456789ab"],
			contentMd5: "0291b72047769e085e7595ce5d65dbd2",
			contentSha256:
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			duration: 1.25,
			fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
			id: "6896679799100689",
			mappingStrategy: "metadata-md5",
			mimeType: "audio/mpeg",
			numericId: -900_000_000,
			resourceId: "6896679799100689",
			title: "唰",
		},
	],
	provenance: {
		purpose: "internal-reference",
		redistribution: "prohibited",
		sourceApp: "Jianying Pro",
	},
	schemaVersion: 2,
};

describe("useSoundEffectsLabOfflinePack", () => {
	beforeEach(() => {
		packMocks.getStatus.mockReset();
		packMocks.install.mockReset();
		packMocks.remove.mockReset();
		packMocks.getStatus.mockResolvedValue({
			cachedBytes: 0,
			persistentStorage: false,
			state: "not-installed",
			totalBytes: 4,
		});
		packMocks.install.mockImplementation(
			async ({ onProgress }: { onProgress?: (value: unknown) => void }) => {
				onProgress?.({ completedItems: 1, progress: 1, totalItems: 1 });
				return {
					cachedBytes: 4,
					installedAt: 10,
					persistentStorage: true,
					resourceCount: 1,
				};
			}
		);
		packMocks.remove.mockResolvedValue({ removedResourceCount: 1 });
	});

	it("tracks a complete install and removal lifecycle", async () => {
		const { result } = renderHook(() =>
			useSoundEffectsLabOfflinePack({
				catalog,
				ownerEmail: "qcutlove@qcut.app",
			})
		);
		await waitFor(() => expect(result.current.state).toBe("not-installed"));

		await act(async () => {
			await expect(result.current.install()).resolves.toBe(true);
		});
		expect(result.current).toMatchObject({
			cachedBytes: 4,
			completedItems: 1,
			persistentStorage: true,
			progress: 1,
			state: "installed",
		});
		expect(packMocks.install).toHaveBeenCalledWith(
			expect.objectContaining({
				catalog,
				ownerEmail: "qcutlove@qcut.app",
			})
		);

		await act(async () => {
			await expect(result.current.remove()).resolves.toBe(true);
		});
		expect(result.current.state).toBe("not-installed");
		expect(packMocks.remove).toHaveBeenCalledWith(
			expect.objectContaining({ ownerEmail: "qcutlove@qcut.app" })
		);
	});

	it("remains unavailable for local manifests or signed-out users", () => {
		const { result } = renderHook(() =>
			useSoundEffectsLabOfflinePack({ catalog, ownerEmail: null })
		);
		expect(result.current.state).toBe("unavailable");
		expect(packMocks.getStatus).not.toHaveBeenCalled();
	});
});
