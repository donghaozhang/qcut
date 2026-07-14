import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLicenseStore } from "@/stores/license-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";
import { StickerStorefront } from "../components/sticker-storefront";

const managerMocks = vi.hoisted(() => ({
	installPack: vi.fn(),
	removePack: vi.fn(),
}));

vi.mock("../hooks/use-sticker-pack-manager", () => ({
	useStickerPackManager: () => managerMocks,
}));

const ACTIVE_PRO_LICENSE = {
	plan: "pro" as const,
	status: "active" as const,
	credits: {
		planCredits: 500,
		topUpCredits: 0,
		totalCredits: 500,
		planCreditsResetAt: "",
	},
};

describe("StickerStorefront", () => {
	const openPricingPage = vi.fn();

	beforeEach(() => {
		openPricingPage.mockReset();
		managerMocks.installPack.mockReset();
		managerMocks.removePack.mockReset();
		managerMocks.installPack.mockImplementation(async ({ pack }) => {
			useStickerPackStore.getState().completeInstall({
				cachedBytes: 1024,
				installedAt: 123,
				packId: pack.id,
				version: pack.version,
			});
			return true;
		});
		managerMocks.removePack.mockImplementation(async ({ pack }) => {
			useStickerPackStore.getState().completeRemoval({ packId: pack.id });
			return true;
		});
		useStickerPackStore.getState().resetPacks();
		useLicenseStore.setState({ license: null, openPricingPage });
	});

	it("shows complete pack previews and gates Pro motion stickers", () => {
		const onSelect = vi.fn();
		render(<StickerStorefront onDownload={vi.fn()} onSelect={onSelect} />);

		expect(screen.getAllByTestId(/^sticker-pack-(?!grid-)/)).toHaveLength(5);
		const motionPack = screen.getByTestId("sticker-pack-qcut-motion-emphasis");
		expect(within(motionPack).getAllByTestId("sticker-item")).toHaveLength(12);
		expect(within(motionPack).getByText("动态强调贴纸")).toBeInTheDocument();

		fireEvent.click(
			within(motionPack).getByRole("button", { name: "Unlock 注意脉冲" })
		);
		expect(openPricingPage).toHaveBeenCalledOnce();
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("lets active Pro users install, use, and remove animated packs", () => {
		const onSelect = vi.fn();
		useLicenseStore.setState({ license: ACTIVE_PRO_LICENSE });
		render(<StickerStorefront onDownload={vi.fn()} onSelect={onSelect} />);
		const motionPack = screen.getByTestId("sticker-pack-qcut-motion-emphasis");

		fireEvent.click(within(motionPack).getByRole("button", { name: "下载" }));
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "qcut-motion-emphasis",
			})
		).toBe(true);
		expect(managerMocks.installPack).toHaveBeenCalledOnce();

		fireEvent.click(
			within(motionPack).getByRole("button", {
				name: "注意脉冲 (qcut-motion-emphasis)",
			})
		);
		expect(onSelect).toHaveBeenCalledWith(
			"qcut-motion-emphasis:attention-pulse",
			"注意脉冲"
		);

		fireEvent.click(within(motionPack).getByRole("button", { name: "移除" }));
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "qcut-motion-emphasis",
			})
		).toBe(false);
		expect(managerMocks.removePack).toHaveBeenCalledOnce();
	});
});
