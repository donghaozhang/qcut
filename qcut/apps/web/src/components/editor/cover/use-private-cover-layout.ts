import { useEffect, useRef, useState } from "react";
import type { CoverDesignV1 } from "@qcut/editor-core/cover";
import {
	loadPrivateCoverTextLayout,
	loadCoverLayoutFonts,
	applyPrivateCoverTextLayout,
} from "@/lib/cover/private-cover-layout";
import { paintCoverDesign } from "@/lib/cover/cover-renderer";
import { coverRepository } from "@/lib/cover/cover-repository";

export function usePrivateCoverLayout({
	design,
	disabled,
	projectId,
	onEdit,
	onSelect,
	onError,
}: {
	design: CoverDesignV1 | null;
	disabled: boolean;
	projectId: string;
	onEdit: (design: CoverDesignV1) => void;
	onSelect: (id: string) => void;
	onError: (message: string) => void;
}) {
	const [importing, setImporting] = useState(false);
	const current = useRef({ design, disabled, projectId });
	current.current = { design, disabled, projectId };
	const controller = useRef<AbortController | null>(null);
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			controller.current?.abort();
		};
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Editing or changing projects invalidates in-flight imports.
	useEffect(() => {
		controller.current?.abort();
	}, [design, disabled, projectId]);
	const apply = async ({ packageHash }: { packageHash: string }) => {
		if (
			!design ||
			disabled ||
			(controller.current && !controller.current.signal.aborted)
		)
			return;
		const operation = new AbortController();
		controller.current = operation;
		setImporting(true);
		try {
			const layout = await loadPrivateCoverTextLayout({ packageHash });
			operation.signal.throwIfAborted();
			await loadCoverLayoutFonts({ layout, signal: operation.signal });
			const ctx = document.createElement("canvas").getContext("2d");
			if (!ctx) throw new Error("Cover canvas unavailable");
			const next = applyPrivateCoverTextLayout({ design, layout, ctx });
			await paintCoverDesign({
				design: next,
				maxWidth: 1280,
				signal: operation.signal,
				resolveAsset: ({ asset }) =>
					coverRepository.readAsset({ projectId, asset }),
			});
			operation.signal.throwIfAborted();
			if (
				current.current.design !== design ||
				current.current.disabled ||
				current.current.projectId !== projectId
			)
				return;
			onEdit(next);
			const first = next.layers.find(
				(layer) => layer.kind === "text" && layer.templateId === next.templateId
			);
			if (first) onSelect(first.id);
		} catch (error) {
			if (!operation.signal.aborted && mounted.current) onError(String(error));
		} finally {
			if (controller.current === operation) {
				controller.current = null;
				if (mounted.current) setImporting(false);
			}
		}
	};
	return { importing, apply };
}
