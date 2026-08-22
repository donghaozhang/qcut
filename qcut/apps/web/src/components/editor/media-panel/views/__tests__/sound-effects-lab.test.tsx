import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundEffectsLabOfflinePackController } from "@/hooks/media/use-sound-effects-lab-offline-pack";
import type {
	LocalSoundEffectsLabManifest,
	PrivateSoundEffectsLabManifest,
} from "@/lib/audio/local-sound-effects-manifest";
import { useLocaleStore } from "@/stores/locale-store";
import { useSoundsStore } from "@/stores/media/sounds-store";
import { SoundEffectsLabPanel } from "../sound-effects-lab";

vi.mock("@/components/editor/audio-waveform", () => ({
	default: () => <div data-testid="reference-waveform" />,
}));

vi.mock("@/lib/audio/audio-artwork", () => ({
	audioArtworkSeed: ({ value }: { value: string }) => value.length,
	renderAudioArtworkDataUrl: () => "data:image/webp;base64,reference",
}));

vi.mock("@/lib/audio/local-sound-effect-reference", async () => {
	const actual = await vi.importActual<
		typeof import("@/lib/audio/local-sound-effect-reference")
	>("@/lib/audio/local-sound-effect-reference");
	return {
		...actual,
		loadSoundEffectReferenceFile: vi.fn(
			async () =>
				new File([new Uint8Array([1, 2, 3, 4])], "reference.mp3", {
					type: "audio/mpeg",
				})
		),
	};
});

const catalog: LocalSoundEffectsLabManifest = {
	schemaVersion: 1,
	catalogId: "jianying-sfx-reference-2026-08-01",
	generatedAt: "2026-08-01T00:00:00.000Z",
	provenance: {
		sourceApp: "Jianying Pro",
		purpose: "internal-reference",
		redistribution: "prohibited",
	},
	categories: [
		{ id: "jianying-0123456789ab", label: "热门" },
		{ id: "jianying-abcdef012345", label: "转场" },
	],
	items: [
		{
			id: "6896679799100689672",
			numericId: -900_000_000,
			title: "测试音效",
			fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
			filePath: "/tmp/0291b72047769e085e7595ce5d65dbd2.mp3",
			mimeType: "audio/mpeg",
			byteSize: 4,
			duration: 1.25,
			contentMd5: "0291b72047769e085e7595ce5d65dbd2",
			contentSha256:
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
			resourceId: "6896679799100689672",
			batch: "01",
			mappingStrategy: "metadata-md5",
			categoryIds: ["jianying-0123456789ab", "jianying-abcdef012345"],
		},
	],
};

const offlinePack: SoundEffectsLabOfflinePackController = {
	cachedBytes: 0,
	completedItems: 0,
	error: null,
	install: vi.fn(async () => true),
	persistentStorage: false,
	progress: 0,
	remove: vi.fn(async () => true),
	state: "unavailable",
	totalBytes: 0,
	totalItems: 0,
};

const localReference = catalog.items[0];
if (!localReference) throw new Error("Sound Effects Lab fixture is empty");
const privateCatalog: PrivateSoundEffectsLabManifest = {
	...catalog,
	items: [
		{
			asset: {
				byteSize: localReference.byteSize,
				checksumSha256: localReference.contentSha256,
				kind: "supabase-storage",
				objectKey: `jianying/2026-08-01/assets/${localReference.fileName}`,
			},
			batch: localReference.batch,
			byteSize: localReference.byteSize,
			categoryIds: localReference.categoryIds,
			contentMd5: localReference.contentMd5,
			contentSha256: localReference.contentSha256,
			duration: localReference.duration,
			fileName: localReference.fileName,
			id: localReference.id,
			mappingStrategy: localReference.mappingStrategy,
			mimeType: localReference.mimeType,
			numericId: localReference.numericId,
			resourceId: localReference.resourceId,
			title: localReference.title,
		},
	],
	schemaVersion: 2,
};

describe("SoundEffectsLabPanel", () => {
	beforeEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reference");
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
	});

	it("loads, searches, previews, and adds a local reference sound", async () => {
		const onPlay = vi.fn();
		const addSoundToTimeline = vi.fn(async () => true);
		useSoundsStore.setState({ addSoundToTimeline });
		render(
			<SoundEffectsLabPanel
				catalog={catalog}
				error={null}
				isLoading={false}
				isOffline={false}
				offlinePack={offlinePack}
				onPlay={onPlay}
				onStop={vi.fn()}
				playingId={null}
			/>
		);

		const card = await screen.findByTestId(
			"audio-library-item-sound-effect--900000000"
		);
		expect(screen.getByText("1 个音效 · 2 个分类")).toBeVisible();
		expect(card).toHaveAttribute("draggable", "false");
		expect(
			within(card).queryByLabelText("收藏测试音效")
		).not.toBeInTheDocument();

		fireEvent.click(within(card).getByLabelText("试听测试音效"));
		expect(onPlay).toHaveBeenCalledWith({
			sound: expect.objectContaining({
				name: "测试音效",
				previewUrl: "blob:reference",
				source: "sound-effects-lab",
			}),
		});

		fireEvent.click(within(card).getByTitle("添加到时间线"));
		await waitFor(() =>
			expect(addSoundToTimeline).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "sound-effect",
					sound: expect.objectContaining({ source: "sound-effects-lab" }),
				})
			)
		);

		fireEvent.change(screen.getByLabelText("搜索音效实验室"), {
			target: { value: "不存在" },
		});
		expect(screen.getByText("没有找到匹配的音频。")).toBeVisible();
	});

	it("filters by category from the Jianying-style left rail", async () => {
		render(
			<SoundEffectsLabPanel
				catalog={catalog}
				error={null}
				isLoading={false}
				isOffline={false}
				offlinePack={offlinePack}
				onPlay={vi.fn()}
				onStop={vi.fn()}
				playingId={null}
			/>
		);
		await screen.findByTestId("audio-library-item-sound-effect--900000000");

		// Rail lists every catalog category with its item count.
		const hot = screen.getByRole("button", { name: /热门/, pressed: false });
		expect(hot).toBeVisible();
		expect(hot).toHaveTextContent("1");
		expect(
			screen.getByRole("button", { name: /全部分类/, pressed: true })
		).toBeVisible();

		// Selecting a category keeps only its sounds; the sample belongs to both.
		fireEvent.click(hot);
		expect(
			screen.getByRole("button", { name: /热门/, pressed: true })
		).toBeVisible();
		expect(
			await screen.findByTestId("audio-library-item-sound-effect--900000000")
		).toBeVisible();
	});

	it("downloads, reports, and removes the private offline pack", async () => {
		const install = vi.fn(async () => true);
		const remove = vi.fn(async () => true);
		const { rerender } = render(
			<SoundEffectsLabPanel
				catalog={privateCatalog}
				error={null}
				isLoading={false}
				isOffline={false}
				offlinePack={{
					...offlinePack,
					install,
					remove,
					state: "not-installed",
					totalBytes: 4,
					totalItems: 1,
				}}
				onPlay={vi.fn()}
				onStop={vi.fn()}
				playingId={null}
			/>
		);

		fireEvent.click(screen.getByRole("button", { name: "离线下载" }));
		await waitFor(() => expect(install).toHaveBeenCalledTimes(1));

		rerender(
			<SoundEffectsLabPanel
				catalog={privateCatalog}
				error={null}
				isLoading={false}
				isOffline={true}
				offlinePack={{
					...offlinePack,
					cachedBytes: 4,
					completedItems: 1,
					install,
					progress: 1,
					remove,
					state: "installed",
					totalBytes: 4,
					totalItems: 1,
				}}
				onPlay={vi.fn()}
				onStop={vi.fn()}
				playingId={null}
			/>
		);
		expect(screen.getByText("离线目录")).toBeVisible();
		expect(screen.getByText(/已离线/)).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "删除离线包" }));
		await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
	});
});
