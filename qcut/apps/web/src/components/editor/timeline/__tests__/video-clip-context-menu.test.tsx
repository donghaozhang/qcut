import "@/test/fix-radix-ui";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useLocaleStore } from "@/stores/locale-store";
import { VideoClipContextMenu } from "../video-clip-context-menu";

function createActions() {
	return {
		copy: vi.fn(),
		cut: vi.fn(),
		copyAttributes: vi.fn(),
		pasteAttributes: vi.fn(),
		remove: vi.fn(),
		duplicate: vi.fn(),
		split: vi.fn(),
		keepLeft: vi.fn(),
		keepRight: vi.fn(),
		smartShotSplit: vi.fn(),
		openAiTextVideo: vi.fn(),
		openAiImageVideo: vi.fn(),
		openAiAudio: vi.fn(),
		review: vi.fn(),
		openSmartSpeech: vi.fn(),
		recognizeSpeech: vi.fn(),
		openVoiceSeparation: vi.fn(),
		separateAudio: vi.fn(),
		exportClip: vi.fn(),
		toggleDisabled: vi.fn(),
		relink: vi.fn(),
		replace: vi.fn(),
		openLut: vi.fn(),
		disableLut: vi.fn(),
		openFileLocation: vi.fn(),
		resetRange: vi.fn(),
		openSpeed: vi.fn(),
		savePreset: vi.fn(),
		applyPreset: vi.fn(),
		openEffects: vi.fn(),
		toggleGroup: vi.fn(),
		alignAudioVideo: vi.fn(),
		createCompound: vi.fn(),
		createMulticam: vi.fn(),
		breakApart: vi.fn(),
		linkMedia: vi.fn(),
		selectMulticamClip: vi.fn(),
	};
}

function renderMenu({
	actions,
	compoundKind,
}: {
	actions: ReturnType<typeof createActions>;
	compoundKind?: "compound" | "multicam";
}) {
	render(
		<ContextMenu>
			<ContextMenuTrigger data-testid="clip">Clip</ContextMenuTrigger>
			<VideoClipContextMenu
				isDisabled={false}
				canPasteAttributes={true}
				hasLocalFile={true}
				presets={[]}
				canGroup={true}
				isGrouped={false}
				canCreateContainer={true}
				canAlignAudioVideo={true}
				canLinkMedia={true}
				compoundKind={compoundKind}
				multicamClips={[]}
				actions={actions}
			/>
		</ContextMenu>
	);
	fireEvent.contextMenu(screen.getByTestId("clip"));
}

describe("video clip context menu", () => {
	beforeEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	afterEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	it("runs alignment, compound, multicam, and link actions", async () => {
		const actions = createActions();
		renderMenu({ actions });

		for (const [label, action] of [
			["视音频对齐", actions.alignAudioVideo],
			["新建复合片段", actions.createCompound],
			["新建多机位片段", actions.createMulticam],
			["链接媒体", actions.linkMedia],
		] as const) {
			const item = await screen.findByText(label);
			expect(item.closest("[role=menuitem]")).not.toHaveAttribute(
				"data-disabled"
			);
			fireEvent.click(item);
			expect(action).toHaveBeenCalledTimes(1);
			if (label !== "链接媒体") {
				fireEvent.contextMenu(screen.getByTestId("clip"));
			}
		}
	});

	it("offers break apart for an existing compound clip", async () => {
		const actions = createActions();
		renderMenu({ actions, compoundKind: "compound" });

		fireEvent.click(await screen.findByText("拆分复合片段"));

		expect(actions.breakApart).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("新建复合片段")).not.toBeInTheDocument();
	});

	it("renders the same actions in English after a live locale switch", async () => {
		useLocaleStore.getState().setLocale({ locale: "en" });
		const actions = createActions();
		renderMenu({ actions });

		expect(
			await screen.findByText("Align audio and video")
		).toBeInTheDocument();
		expect(screen.getByText("Create compound clip")).toBeInTheDocument();
		expect(screen.getByText("Create multicam clip")).toBeInTheDocument();
		expect(screen.getByText("Link media")).toBeInTheDocument();
	});
});
