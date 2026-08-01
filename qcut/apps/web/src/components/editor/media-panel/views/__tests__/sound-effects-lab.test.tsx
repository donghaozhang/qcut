import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSoundEffectsLabManifest } from "@/lib/audio/local-sound-effects-manifest";
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
});
