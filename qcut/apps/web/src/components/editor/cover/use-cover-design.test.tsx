import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCoverText, type CoverDesignV1 } from "@qcut/editor-core/cover";
import type { TProject } from "@/types/project";
import { useCoverDesign } from "./use-cover-design";

const mocks = vi.hoisted(() => ({
	loadDesign: vi.fn(),
	saveAsset: vi.fn(),
	readAsset: vi.fn(),
	saveRevision: vi.fn(),
	setProjectCover: vi.fn(),
	normalizeCoverImage: vi.fn(),
	renderCoverDesign: vi.fn(),
	captureStillFrame: vi.fn(),
}));
vi.mock("@/lib/cover/cover-repository", () => ({ coverRepository: mocks }));
vi.mock("@/lib/cover/cover-renderer", () => mocks);
vi.mock("@/lib/export/export-still-frame", () => mocks);
vi.mock("@/stores/project-store", () => ({
	useProjectStore: { getState: () => mocks },
}));

const project = {
	id: "cover-test",
	canvasSize: { width: 1920, height: 1080 },
} as TProject;
const file = new File(["image"], "source.png", { type: "image/png" });
const outputs = { render: new Blob(["png"]), thumbnail: new Blob(["webp"]) };

function setup({ saved = false }: { saved?: boolean } = {}) {
	const onClose = vi.fn();
	const result = renderHook(
		() =>
			useCoverDesign({
				project: saved
					? { ...project, cover: { designId: "original" } as TProject["cover"] }
					: project,
				onClose,
			}),
		{ wrapper: StrictMode }
	);
	return { ...result, onClose };
}

describe("cover editing lifecycle", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.normalizeCoverImage.mockResolvedValue({
			blob: file,
			width: 800,
			height: 600,
		});
		mocks.saveAsset.mockResolvedValue({
			assetId: "image",
			width: 800,
			height: 600,
		});
		mocks.renderCoverDesign.mockResolvedValue(outputs);
		mocks.saveRevision.mockResolvedValue({ designId: "published" });
	});
	it("keeps manual text when replacing the source and can undo replacement", async () => {
		const { result } = setup();
		await act(() => result.current.chooseSource({ file }));
		const design = result.current.design!;
		const text = createCoverText({
			id: "manual",
			canvas: design.canvas,
			content: "My title",
		});
		act(() =>
			result.current.edit({ ...design, layers: [design.layers[0], text] })
		);
		await act(() =>
			result.current.chooseSource({
				file: new File(["next"], "next.png", { type: "image/png" }),
			})
		);
		expect(result.current.design?.layers[1]).toEqual(text);
		expect(result.current.design?.source).toEqual({
			kind: "local-image",
			originalName: "next.png",
		});
		act(() => result.current.dispatch({ type: "undo" }));
		expect(result.current.design?.source).toEqual(design.source);
	});
	it("serializes double clicks before React has rendered the busy state", async () => {
		const { result } = setup();
		await act(async () => {
			const first = result.current.chooseSource({ file });
			const second = result.current.chooseSource({ file });
			await Promise.all([first, second]);
		});
		expect(mocks.saveAsset).toHaveBeenCalledTimes(1);
		expect(result.current.busy).toBe(false);
	});
	it("blocks stale output publication, then saves a distinct revision once", async () => {
		const { result, onClose } = setup();
		await act(() => result.current.chooseSource({ file }));
		await waitFor(() => expect(result.current.ready).toBe(true));
		const design = result.current.design!;
		act(() =>
			result.current.edit({
				...design,
				canvas: { ...design.canvas, backgroundColor: "#abcdef" },
			})
		);
		await act(() => result.current.publish());
		expect(mocks.saveRevision).not.toHaveBeenCalled();
		await waitFor(() => expect(result.current.ready).toBe(true));
		await act(async () => {
			await Promise.all([result.current.publish(), result.current.publish()]);
		});
		expect(mocks.saveRevision).toHaveBeenCalledTimes(1);
		const published = mocks.saveRevision.mock.calls[0][0];
		expect(published.design.id).not.toBe(design.id);
		expect(published.design.canvas.backgroundColor).toBe("#abcdef");
		expect(mocks.setProjectCover).toHaveBeenCalledWith({
			projectId: project.id,
			cover: { designId: "published" },
			expectedCover: undefined,
		});
		expect(onClose).toHaveBeenCalledOnce();
	});
	it("loads saved layers under StrictMode and releases the loading lock", async () => {
		const saved = { id: "original", layers: [] } as unknown as CoverDesignV1;
		mocks.loadDesign.mockResolvedValue(saved);
		const { result } = setup({ saved: true });
		await waitFor(() => expect(result.current.design).toEqual(saved));
		expect(result.current.busy).toBe(false);
	});
	it("reports failed rendering and never binds incomplete output", async () => {
		mocks.renderCoverDesign.mockRejectedValue(new Error("Corrupt image"));
		const { result } = setup();
		await act(() => result.current.chooseSource({ file }));
		await waitFor(() =>
			expect(result.current.error).toContain("Corrupt image")
		);
		await act(() => result.current.publish());
		expect(mocks.setProjectCover).not.toHaveBeenCalled();
	});
	it("discards an in-flight source after the editor closes", async () => {
		let resolve: (value: object) => void = () => {};
		mocks.normalizeCoverImage.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const { result, unmount } = setup();
		let choosing: Promise<void>;
		act(() => {
			choosing = result.current.chooseSource({ file });
		});
		unmount();
		await act(async () => {
			resolve({ blob: file, width: 800, height: 600 });
			await choosing;
		});
		expect(mocks.setProjectCover).not.toHaveBeenCalled();
		expect(mocks.renderCoverDesign).not.toHaveBeenCalled();
	});
});
