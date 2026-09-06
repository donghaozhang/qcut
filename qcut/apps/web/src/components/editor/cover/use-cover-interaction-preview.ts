import { useEffect, useRef } from "react";
import type { CoverDesignV1 } from "@qcut/editor-core/cover";
import { paintCoverDesign } from "@/lib/cover/cover-renderer";
import { coverRepository } from "@/lib/cover/cover-repository";

export function useCoverInteractionPreview({
	design,
	projectId,
	onError,
}: {
	design: CoverDesignV1 | null;
	projectId: string;
	onError: (error: string) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		if (!design) return;
		let cancelled = false;
		const frame = requestAnimationFrame(() => {
			void paintCoverDesign({
				design,
				maxWidth: 1024,
				resolveAsset: ({ asset }) =>
					coverRepository.readAsset({ projectId, asset }),
			})
				.then((painted) => {
					const canvas = canvasRef.current;
					if (cancelled || !canvas) return;
					canvas.width = painted.width;
					canvas.height = painted.height;
					canvas.getContext("2d")?.drawImage(painted, 0, 0);
				})
				.catch((reason: unknown) => {
					if (!cancelled) onError(String(reason));
				});
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
		};
	}, [design, projectId, onError]);
	return canvasRef;
}
