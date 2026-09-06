import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
	reduceCoverHistory,
	type CoverDesignV1,
	type CoverSourceV1,
} from "@qcut/editor-core/cover";
import { captureStillFrame } from "@/lib/export/export-still-frame";
import { coverRepository } from "@/lib/cover/cover-repository";
import {
	normalizeCoverImage,
	renderCoverDesign,
} from "@/lib/cover/cover-renderer";
import { useProjectStore } from "@/stores/project-store";
import type { TProject } from "@/types/project";

export function useCoverDesign({
	project,
	onClose,
}: {
	project: TProject;
	onClose: () => void;
}) {
	const [initialProject] = useState(project);
	const [history, dispatch] = useReducer(reduceCoverHistory, {
		past: [],
		present: null,
		future: [],
	});
	const design = history.present;
	const designRef = useRef(design);
	designRef.current = design;
	const [busy, setBusy] = useState(Boolean(project.cover));
	const busyRef = useRef(Boolean(project.cover));
	const [error, setError] = useState<string | null>(null);
	const [rendered, setRendered] = useState<{
		design: CoverDesignV1;
		render: Blob;
		thumbnail: Blob;
	} | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const mounted = useRef(true);
	const requestId = useRef(0);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			requestId.current += 1;
		};
	}, []);
	useEffect(() => {
		let cancelled = false;
		if (!initialProject.cover) return;
		void coverRepository
			.loadDesign({ projectId: initialProject.id, cover: initialProject.cover })
			.then((saved) => {
				if (!cancelled) dispatch({ type: "load", design: saved });
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(String(reason));
			})
			.finally(() => {
				if (!cancelled) {
					busyRef.current = false;
					setBusy(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [initialProject]);
	useEffect(() => {
		let cancelled = false;
		if (!design) return;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			void renderCoverDesign({
				design,
				signal: controller.signal,
				resolveAsset: ({ asset }) =>
					coverRepository.readAsset({ projectId: initialProject.id, asset }),
			})
				.then((outputs) => {
					if (!cancelled) setRendered({ design, ...outputs });
				})
				.catch((reason: unknown) => {
					if (!cancelled) setError(String(reason));
				});
		}, 80);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			controller.abort();
		};
	}, [design, initialProject.id]);
	useEffect(() => {
		if (!rendered) return;
		const url = URL.createObjectURL(rendered.render);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [rendered]);

	const edit = useCallback((next: CoverDesignV1) => {
		setError(null);
		dispatch({ type: "edit", design: next });
	}, []);
	const chooseSource = useCallback(
		async ({
			file,
			timeSeconds,
		}: {
			file?: File;
			timeSeconds?: number;
		} = {}) => {
			if (busyRef.current) return;
			busyRef.current = true;
			const request = ++requestId.current;
			setBusy(true);
			setError(null);
			try {
				let blob: Blob;
				let source: CoverSourceV1;
				if (file) {
					blob = file;
					source = { kind: "local-image", originalName: file.name };
				} else {
					const capture = await captureStillFrame({ timeSeconds });
					if (!capture.ok) throw new Error(capture.error);
					if (capture.projectId !== initialProject.id)
						throw new Error("The active project changed");
					blob = capture.blob;
					source = {
						kind: "timeline-frame",
						sceneId: capture.sceneId,
						frame: capture.frame,
						fps: capture.fps,
						timeSeconds: capture.timeSeconds,
					};
				}
				const normalized = await normalizeCoverImage({ blob });
				const asset = await coverRepository.saveAsset({
					projectId: initialProject.id,
					...normalized,
				});
				if (!mounted.current || request !== requestId.current) return;
				const now = new Date().toISOString();
				const previous = designRef.current;
				const base: CoverDesignV1 = previous ?? {
					schema: "qcut.cover-design",
					schemaVersion: 1,
					id: crypto.randomUUID(),
					revision: 1,
					canvas: {
						...initialProject.canvasSize,
						backgroundColor: /^#[a-f0-9]{6}$/i.test(
							initialProject.backgroundColor ?? ""
						)
							? initialProject.backgroundColor!
							: "#000000",
					},
					source,
					layers: [{ id: "background", kind: "image", asset, fit: "contain" }],
					createdAt: now,
					updatedAt: now,
				};
				edit({
					...base,
					source,
					layers: [
						{ id: "background", kind: "image", asset, fit: "contain" },
						...base.layers.slice(1).filter((layer) => layer.kind === "text"),
					],
				});
			} catch (reason) {
				if (mounted.current && request === requestId.current)
					setError(String(reason));
			} finally {
				if (mounted.current && request === requestId.current) {
					busyRef.current = false;
					setBusy(false);
				}
			}
		},
		[edit, initialProject]
	);
	const ready = Boolean(design && rendered?.design === design);
	const publish = async ({ clear = false }: { clear?: boolean } = {}) => {
		if (busyRef.current || (!clear && (!design || !rendered || !ready))) return;
		busyRef.current = true;
		setBusy(true);
		setError(null);
		try {
			const cover = clear
				? undefined
				: await coverRepository.saveRevision({
						projectId: initialProject.id,
						design: {
							...design!,
							id: crypto.randomUUID(),
							revision: 1,
							updatedAt: new Date().toISOString(),
						},
						render: rendered!.render,
						thumbnail: rendered!.thumbnail,
					});
			if (!mounted.current) return;
			await useProjectStore.getState().setProjectCover({
				projectId: initialProject.id,
				cover,
				expectedCover: initialProject.cover,
			});
			if (mounted.current) onClose();
		} catch (reason) {
			if (mounted.current) setError(String(reason));
		} finally {
			if (mounted.current) {
				busyRef.current = false;
				setBusy(false);
			}
		}
	};
	return {
		design,
		history,
		dispatch,
		edit,
		preview,
		busy,
		error,
		setError,
		ready,
		chooseSource,
		publish,
	};
}
