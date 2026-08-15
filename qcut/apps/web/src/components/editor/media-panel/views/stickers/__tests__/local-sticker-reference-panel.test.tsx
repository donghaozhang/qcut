import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLocalStickerCatalog,
	createPrivateStickerCatalog,
	createPrivateStickerCatalogs,
	createRemoteStickerCatalog,
} from "@/lib/stickers/__tests__/fixtures/local-sticker-catalog";
import { LocalStickerReferencePanel } from "../components/local-sticker-reference-panel";
import { buildPrivateStickerCategoryViews } from "../components/private-sticker-category-views";

const referenceMocks = vi.hoisted(() => ({
	loadFile: vi.fn(),
	loadThumbnail: vi.fn(),
}));

vi.mock("@/lib/stickers/local-sticker-reference", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/stickers/local-sticker-reference")
		>();
	return {
		...actual,
		loadStickerLabReferenceFile: referenceMocks.loadFile,
		loadStickerLabThumbnail: referenceMocks.loadThumbnail,
	};
});

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function privateCategoryViews({
	catalogs,
}: {
	catalogs: Parameters<typeof buildPrivateStickerCategoryViews>[0]["catalogs"];
}) {
	return buildPrivateStickerCategoryViews({ catalogs });
}

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
		referenceMocks.loadThumbnail.mockReset();
		// Remote references preview through the ungated thumbnail tier.
		referenceMocks.loadThumbnail.mockImplementation(
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

	it("lays stickers out in a responsive tile grid", () => {
		render(
			<LocalStickerReferencePanel
				catalog={createLocalStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={() => Promise.resolve()}
			/>
		);

		expect(screen.getByTestId("local-sticker-category-grid")).toHaveClass(
			"grid-cols-[repeat(auto-fill,minmax(80px,1fr))]"
		);
	});

	it("loads only the active category and releases its previews on switch", async () => {
		const catalog = createLocalStickerCatalog();
		const firstItem = catalog.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "preview-gif";
		firstItem.fileName = "popular-1.gif";
		firstItem.filePath = "/tmp/sticker-lab/popular-1.gif";
		firstItem.mimeType = "image/gif";
		const { rerender, unmount } = render(
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
		expect(
			screen.getByRole("button", { name: "添加贴纸 popular-1到时间线" })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "添加贴纸 mood-1到时间线" })
		).toBeNull();

		rerender(
			<LocalStickerReferencePanel
				catalog={catalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
				selection={{ catalogKey: "public", categoryId: "mood" }}
			/>
		);

		await waitFor(() => {
			expect(referenceMocks.loadFile).toHaveBeenCalledTimes(9);
			expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
		});
		expect(
			screen.queryByRole("button", { name: "添加贴纸 popular-1到时间线" })
		).toBeNull();
		expect(
			screen.getByRole("button", { name: "添加贴纸 mood-1到时间线" })
		).toBeInTheDocument();

		unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledTimes(9);
	});

	it("aborts in-flight item loads on category switch and unmount", async () => {
		const pendingSignals: AbortSignal[] = [];
		referenceMocks.loadFile.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise<File>((_resolve, reject) => {
					pendingSignals.push(signal);
					signal.addEventListener(
						"abort",
						() =>
							reject(
								new DOMException("The operation was aborted", "AbortError")
							),
						{ once: true }
					);
				})
		);
		const catalog = createLocalStickerCatalog();
		const { rerender, unmount } = render(
			<LocalStickerReferencePanel
				catalog={catalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		await waitFor(() => expect(pendingSignals).toHaveLength(4));
		expect(pendingSignals.every((signal) => !signal.aborted)).toBe(true);

		rerender(
			<LocalStickerReferencePanel
				catalog={catalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
				selection={{ catalogKey: "public", categoryId: "mood" }}
			/>
		);

		await waitFor(() => expect(pendingSignals).toHaveLength(9));
		expect(pendingSignals.slice(0, 4).every((signal) => signal.aborted)).toBe(
			true
		);
		expect(pendingSignals.slice(4).every((signal) => !signal.aborted)).toBe(
			true
		);
		expect(screen.queryByText("实验素材无法载入")).toBeNull();

		unmount();
		expect(pendingSignals.slice(4).every((signal) => signal.aborted)).toBe(
			true
		);
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
			expect(within(button).getByTitle("实验贴纸无法载入")).toBeInTheDocument();
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
			within(button).queryByTitle("实验贴纸无法载入")
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
		expect(within(failed).getByTitle("实验贴纸无法载入")).toBeInTheDocument();
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

	it("previews remote references through the ungated thumbnail tier", async () => {
		const catalog = createRemoteStickerCatalog();
		const { rerender } = render(
			<LocalStickerReferencePanel
				catalog={catalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		const button = screen.getByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => expect(button).toBeEnabled());
		// Browsing must not touch the entitlement-gated full asset.
		expect(referenceMocks.loadThumbnail).toHaveBeenCalledTimes(2);
		expect(referenceMocks.loadFile).not.toHaveBeenCalled();

		const updatedCatalog = structuredClone(catalog);
		const updatedReference = updatedCatalog.categories[0]?.items[0];
		if (!updatedReference) throw new Error("Expected a remote sticker fixture");
		updatedReference.asset.objectKey =
			"catalogs/qcut-original-test/assets/popular-1-updated.gif";
		updatedReference.asset.checksumSha256 = "b".repeat(64);
		rerender(
			<LocalStickerReferencePanel
				catalog={updatedCatalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		await waitFor(() =>
			expect(referenceMocks.loadThumbnail).toHaveBeenCalledTimes(4)
		);
		expect(referenceMocks.loadThumbnail).toHaveBeenCalledWith({
			reference: expect.objectContaining({
				asset: expect.objectContaining({
					objectKey: "catalogs/qcut-original-test/assets/popular-1-updated.gif",
				}),
			}),
			signal: expect.any(AbortSignal),
		});
	});

	it("reads a missing entitlement as locked rather than broken", async () => {
		// This is the default path for every user outside the allow list, so it
		// must not look like a failure.
		referenceMocks.loadFile.mockRejectedValue(
			new Error("Asset request failed: 403")
		);
		const catalog = createRemoteStickerCatalog();
		render(
			<LocalStickerReferencePanel
				catalog={catalog}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
			/>
		);

		const button = screen.getByRole("button", {
			name: "添加贴纸 popular-1到时间线",
		});
		await waitFor(() => expect(button).toBeEnabled());
		fireEvent.click(button);

		await waitFor(() =>
			expect(screen.getByText("仅限内测账号使用")).toBeInTheDocument()
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("shows four references from each private batch in one 12-item category view", async () => {
		render(
			<LocalStickerReferencePanel
				catalog={createRemoteStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
				privateCategories={privateCategoryViews({
					catalogs: createPrivateStickerCatalogs({ itemCount: 4 }),
				})}
				selection={{ catalogKey: "private", categoryId: "hot" }}
			/>
		);

		await waitFor(() =>
			expect(
				screen.getAllByTestId("local-sticker-reference-item")
			).toHaveLength(12)
		);
		expect(screen.getByText("剪映贴纸面板 · 3 批参照")).toBeInTheDocument();
	});

	it("falls back to the private catalogue when the public manifest fails", async () => {
		// No explicit selection: with the public manifest broken the resolver
		// must land on the reference slice instead of the error state.
		render(
			<LocalStickerReferencePanel
				catalog={null}
				error="Invalid local sticker manifest"
				isLoading={false}
				onSelect={async () => {}}
				privateCategories={privateCategoryViews({
					catalogs: [createPrivateStickerCatalog()],
				})}
			/>
		);

		await waitFor(() =>
			expect(
				screen.getByTestId("local-sticker-category-grid")
			).toBeInTheDocument()
		);
		// The public catalog's failure must not mask the private view.
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.getAllByTestId("local-sticker-reference-item")).toHaveLength(
			2
		);
	});

	it("previews private references through the cached original loader", async () => {
		render(
			<LocalStickerReferencePanel
				catalog={createRemoteStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
				privateCategories={privateCategoryViews({
					catalogs: [createPrivateStickerCatalog()],
				})}
				selection={{ catalogKey: "private", categoryId: "hot" }}
			/>
		);

		await waitFor(() =>
			expect(referenceMocks.loadFile).toHaveBeenCalledTimes(2)
		);

		// Private previews go through the IndexedDB-cached original loader —
		// the uncached thumbnail tier would re-download megabytes of GIF on
		// every category switch.
		for (const call of referenceMocks.loadThumbnail.mock.calls) {
			expect(call[0].reference.asset.objectKey).not.toMatch(/^jianying\//);
		}
		expect(referenceMocks.loadFile).toHaveBeenCalledWith(
			expect.objectContaining({
				provenance: expect.objectContaining({
					creator: "Jianying (harvested reference)",
					license: expect.objectContaining({ commercialUse: "restricted" }),
				}),
			})
		);
	});

	it("names the catalogues that failed while others still load", () => {
		render(
			<LocalStickerReferencePanel
				catalog={createRemoteStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
				privateCategories={privateCategoryViews({
					catalogs: [createPrivateStickerCatalog()],
				})}
				unavailablePrivateCatalogIds={["jianying-2026-08-01-batch-2"]}
			/>
		);

		const warning = screen.getByTestId("sticker-lab-private-catalog-warning");
		expect(warning).toHaveTextContent("1 个参照素材包未能载入");
		expect(warning).toHaveTextContent("只显示部分贴纸");
		expect(warning).toHaveTextContent("jianying-2026-08-01-batch-2");
	});

	it("still reports the failure when every catalogue is unavailable", () => {
		// The worst case, and the one a deployment regression actually produces:
		// no private catalogue loads. A warning gated on the private view would
		// leave the shortfall as silent as before.
		render(
			<LocalStickerReferencePanel
				catalog={createRemoteStickerCatalog()}
				error={null}
				isLoading={false}
				onSelect={async () => {}}
				privateCategories={[]}
				unavailablePrivateCatalogIds={[
					"jianying-2026-07-31",
					"jianying-2026-08-01-batch-2",
					"jianying-2026-08-01-batch-3",
				]}
			/>
		);

		const warning = screen.getByTestId("sticker-lab-private-catalog-warning");
		expect(warning).toHaveTextContent("3 个参照素材包未能载入");
		expect(warning).toHaveTextContent("暂时无法显示");
	});
});
