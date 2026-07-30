import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStickerCatalog } from "@/lib/stickers/__tests__/fixtures/local-sticker-catalog";
import { LocalStickerReferencePanel } from "../components/local-sticker-reference-panel";

const referenceMocks = vi.hoisted(() => ({
	loadFile: vi.fn(),
}));

vi.mock("@/lib/stickers/local-sticker-reference", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/stickers/local-sticker-reference")
		>();
	return {
		...actual,
		loadLocalStickerReferenceFile: referenceMocks.loadFile,
	};
});

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("LocalStickerReferencePanel", () => {
	beforeEach(() => {
		referenceMocks.loadFile.mockReset();
		referenceMocks.loadFile.mockImplementation(
			async ({
				reference,
			}: {
				reference: { fileName: string; mimeType: string };
			}) =>
				new File([new Uint8Array([137, 80, 78, 71])], reference.fileName, {
					type: reference.mimeType,
				})
		);
		URL.createObjectURL = vi.fn(
			(file: File) => `blob:sticker-lab/${file.name}`
		);
		URL.revokeObjectURL = vi.fn();
	});

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectUrl;
		URL.revokeObjectURL = originalRevokeObjectUrl;
	});

	it("loads only the active category and releases its previews on switch", async () => {
		const catalog = createLocalStickerCatalog();
		const firstItem = catalog.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "preview-gif";
		firstItem.fileName = "popular-1.gif";
		firstItem.filePath = "/tmp/sticker-lab/popular-1.gif";
		firstItem.mimeType = "image/gif";
		const { unmount } = render(
			<LocalStickerReferencePanel
				catalog={catalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		await waitFor(() => {
			expect(referenceMocks.loadFile).toHaveBeenCalledTimes(4);
		});
		expect(screen.getByText("贴纸 popular-1")).toBeInTheDocument();
		expect(screen.queryByText("贴纸 mood-1")).toBeNull();
		expect(screen.getByText("preview-gif")).toBeInTheDocument();
		expect(screen.getAllByText("atlas-animation")).toHaveLength(2);
		expect(screen.getByText("static-image")).toBeInTheDocument();
		expect(screen.getByText("静态")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("tab", { name: "情绪，5 个贴纸" }));

		await waitFor(() => {
			expect(referenceMocks.loadFile).toHaveBeenCalledTimes(9);
			expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
		});
		expect(screen.queryByText("贴纸 popular-1")).toBeNull();
		expect(screen.getByText("贴纸 mood-1")).toBeInTheDocument();

		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledTimes(9);
	});

	it("adds the exact loaded File and prevents duplicate clicks while pending", async () => {
		const onSelect = vi.fn(
			async ({ file: _file }: { file: File }) =>
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 0);
				})
		);
		render(
			<LocalStickerReferencePanel
				catalog={createLocalStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={onSelect}
			/>
		);

		const button = await screen.findByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => expect(button).toBeEnabled());
		fireEvent.click(button);
		fireEvent.click(button);

		await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
		expect(onSelect.mock.calls[0]?.[0].file).toBeInstanceOf(File);
		expect(onSelect.mock.calls[0]?.[0].file.name).toBe("popular-1.png");
	});

	it("contains selection failures and allows the user to retry", async () => {
		const onSelect = vi.fn(async () => {
			throw new Error("timeline unavailable");
		});
		render(
			<LocalStickerReferencePanel
				catalog={createLocalStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={onSelect}
			/>
		);

		const button = await screen.findByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => expect(button).toBeEnabled());
		fireEvent.click(button);

		expect(
			await screen.findByText("无法添加到时间线，请重试")
		).toBeInTheDocument();
		expect(button).toBeEnabled();
	});

	it("clears a failed load when the same reference id receives a new file", async () => {
		referenceMocks.loadFile.mockImplementation(
			async ({
				reference,
			}: {
				reference: { fileName: string; filePath: string; mimeType: string };
			}) => {
				if (reference.filePath.endsWith("popular-1.png")) {
					throw new Error("missing sticker");
				}
				return new File([new Uint8Array([1])], reference.fileName, {
					type: reference.mimeType,
				});
			}
		);
		const initialCatalog = createLocalStickerCatalog();
		const { rerender } = render(
			<LocalStickerReferencePanel
				catalog={initialCatalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);
		const button = screen.getByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => {
			expect(within(button).getByTitle("本机贴纸无法载入")).toBeInTheDocument();
		});

		const updatedCatalog = structuredClone(initialCatalog);
		const updatedReference = updatedCatalog.categories[0]?.items[0];
		if (!updatedReference) throw new Error("Expected a sticker fixture");
		updatedReference.filePath = "/tmp/sticker-lab/popular-1-recovered.png";
		updatedReference.fileName = "popular-1-recovered.png";
		rerender(
			<LocalStickerReferencePanel
				catalog={updatedCatalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		await waitFor(() => expect(button).toBeEnabled());
		expect(
			within(button).queryByTitle("本机贴纸无法载入")
		).not.toBeInTheDocument();
	});

	it("does not select a stale file while the same reference id reloads", async () => {
		let resolveUpdatedFile: ((file: File) => void) | undefined;
		const updatedFilePromise = new Promise<File>((resolve) => {
			resolveUpdatedFile = resolve;
		});
		referenceMocks.loadFile.mockImplementation(
			async ({
				reference,
			}: {
				reference: { fileName: string; filePath: string; mimeType: string };
			}) => {
				if (reference.filePath.endsWith("popular-1-updated.png")) {
					return updatedFilePromise;
				}
				return new File([new Uint8Array([1])], reference.fileName, {
					type: reference.mimeType,
				});
			}
		);
		const onSelect = vi.fn(async ({ file: _file }: { file: File }) => {});
		const initialCatalog = createLocalStickerCatalog();
		const { rerender } = render(
			<LocalStickerReferencePanel
				catalog={initialCatalog}
				error={null}
				isLoading={false}
				onSelect={onSelect}
			/>
		);
		const button = screen.getByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => expect(button).toBeEnabled());

		const updatedCatalog = structuredClone(initialCatalog);
		const updatedReference = updatedCatalog.categories[0]?.items[0];
		if (!updatedReference) throw new Error("Expected a sticker fixture");
		updatedReference.filePath = "/tmp/sticker-lab/popular-1-updated.png";
		updatedReference.fileName = "popular-1-updated.png";
		rerender(
			<LocalStickerReferencePanel
				catalog={updatedCatalog}
				error={null}
				isLoading={false}
				onSelect={onSelect}
			/>
		);

		expect(button).toBeDisabled();
		fireEvent.click(button);
		expect(onSelect).not.toHaveBeenCalled();

		resolveUpdatedFile?.(
			new File([new Uint8Array([2])], updatedReference.fileName, {
				type: updatedReference.mimeType,
			})
		);
		await waitFor(() => expect(button).toBeEnabled());
		fireEvent.click(button);

		await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
		expect(onSelect.mock.calls[0]?.[0].file.name).toBe("popular-1-updated.png");
	});

	it("supports arrow-key navigation across category tabs", async () => {
		render(
			<LocalStickerReferencePanel
				catalog={createLocalStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		const popularTab = screen.getByRole("tab", {
			name: "热门，4 个贴纸",
		});
		const moodTab = screen.getByRole("tab", {
			name: "情绪，5 个贴纸",
		});
		popularTab.focus();
		fireEvent.keyDown(popularTab, { key: "ArrowRight" });

		await waitFor(() => {
			expect(moodTab).toHaveAttribute("aria-selected", "true");
			expect(moodTab).toHaveFocus();
		});
		expect(popularTab).toHaveAttribute("tabindex", "-1");
		expect(moodTab).toHaveAttribute("aria-controls");
		expect(screen.getByRole("tabpanel")).toHaveAttribute(
			"aria-labelledby",
			moodTab.id
		);
	});

	it("isolates a failed card while keeping its category usable", async () => {
		let failedReferenceAttempts = 0;
		referenceMocks.loadFile.mockImplementation(
			async ({
				reference,
			}: {
				reference: { id: string; fileName: string; mimeType: string };
			}) => {
				if (reference.id === "popular-2" && failedReferenceAttempts === 0) {
					failedReferenceAttempts += 1;
					throw new Error("missing sticker");
				}
				return new File([new Uint8Array([1])], reference.fileName, {
					type: reference.mimeType,
				});
			}
		);
		render(
			<LocalStickerReferencePanel
				catalog={createLocalStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		const failed = screen.getByRole("button", {
			name: "添加贴纸 popular-2到时间线",
		});
		const healthy = screen.getByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => {
			expect(failed).toBeDisabled();
			expect(healthy).toBeEnabled();
		});
		expect(within(failed).getByTitle("本机贴纸无法载入")).toBeInTheDocument();
		expect(failed).toHaveAttribute(
			"aria-describedby",
			"local-sticker-load-error-popular-2"
		);

		fireEvent.click(
			screen.getByRole("button", { name: "重试加载贴纸 popular-2" })
		);
		await waitFor(() => expect(failed).toBeEnabled());
		expect(
			screen.queryByRole("button", { name: "重试加载贴纸 popular-2" })
		).toBeNull();
	});

	it("shows catalog loading and manifest errors without mounting cards", () => {
		const { rerender } = render(
			<LocalStickerReferencePanel
				catalog={null}
				error={null}
				isLoading={true}
				onSelect={async () => {}}
			/>
		);

		expect(
			screen.getByTestId("local-sticker-catalog-loading")
		).toBeInTheDocument();
		expect(referenceMocks.loadFile).not.toHaveBeenCalled();

		rerender(
			<LocalStickerReferencePanel
				catalog={null}
				error="Invalid local sticker manifest"
				isLoading={false}
				onSelect={async () => {}}
			/>
		);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Invalid local sticker manifest"
		);
	});
});
