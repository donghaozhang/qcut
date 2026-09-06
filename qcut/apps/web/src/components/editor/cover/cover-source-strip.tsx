import { useEffect, useMemo, useRef, useState } from "react";
import {
	Camera,
	ImagePlus,
	ChevronLeft,
	ChevronRight,
	Film,
} from "lucide-react";
import { captureStillFrame } from "@/lib/export/export-still-frame";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media-store";
import { useTranslation } from "@/lib/i18n";
import type { CoverSourceV1 } from "@qcut/editor-core/cover";
import { CoverTool, activateCoverControl } from "./cover-tool";

export function CoverSourceStrip({
	source,
	projectId,
	fps,
	disabled,
	onChoose,
}: {
	source?: CoverSourceV1;
	projectId: string;
	fps: number;
	disabled: boolean;
	onChoose: (options?: { file?: File; timeSeconds?: number }) => Promise<void>;
}) {
	const { t } = useTranslation();
	const input = useRef<HTMLInputElement>(null);
	const mediaLoading = useMediaStore((state) => state.isLoading);
	const duration = useTimelineStore((state) => state.getTotalDuration());
	const lastFrame = Math.max(0, Math.ceil(duration * fps) - 1);
	const [frame, setFrame] = useState(() =>
		Math.min(
			lastFrame,
			Math.round(usePlaybackStore.getState().currentTime * fps)
		)
	);
	const [expansionOverride, setExpanded] = useState<boolean | null>(null);
	const expanded = expansionOverride ?? duration > 0;
	const [frames, setFrames] = useState<{ frame: number; url: string }[]>([]);
	const [failed, setFailed] = useState(false);
	const [loading, setLoading] = useState(false);
	const samples = useMemo(
		() => [
			...new Set(
				Array.from({ length: 10 }, (_, index) =>
					Math.round((lastFrame * index) / 9)
				)
			),
		],
		[lastFrame]
	);
	useEffect(() => {
		if (source?.kind === "timeline-frame") setFrame(source.frame);
	}, [source]);
	useEffect(() => {
		if (!expanded || duration <= 0 || mediaLoading) return;
		let cancelled = false;
		const urls: string[] = [];
		setFrames([]);
		setFailed(false);
		setLoading(true);
		void samples
			.reduce(async (previous, sample) => {
				await previous;
				if (cancelled) return;
				const result = await captureStillFrame({ timeSeconds: sample / fps });
				if (cancelled) return;
				if (!result.ok || result.projectId !== projectId) {
					setFailed(true);
					return;
				}
				const bitmap = await createImageBitmap(result.blob);
				try {
					if (cancelled) return;
					const canvas = document.createElement("canvas");
					canvas.width = 144;
					canvas.height = Math.max(
						2,
						Math.round((144 * bitmap.height) / bitmap.width)
					);
					const ctx = canvas.getContext("2d");
					if (!ctx) throw new Error("Frame thumbnail canvas unavailable");
					ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
					const blob = await new Promise<Blob | null>((resolve) =>
						canvas.toBlob(resolve, "image/webp")
					);
					if (cancelled) return;
					if (!blob) throw new Error("Frame thumbnail encoding failed");
					const url = URL.createObjectURL(blob);
					urls.push(url);
					setFrames((current) => [...current, { frame: sample, url }]);
				} finally {
					bitmap.close();
				}
			}, Promise.resolve())
			.catch(() => {
				if (!cancelled) setFailed(true);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
			for (const url of urls) URL.revokeObjectURL(url);
		};
	}, [expanded, duration, samples, fps, projectId, mediaLoading]);
	const chooseFrame = ({ next }: { next: number }) => {
		const bounded = Math.max(0, Math.min(lastFrame, Math.round(next)));
		setFrame(bounded);
		void onChoose({ timeSeconds: bounded / fps });
	};
	return (
		<div className="cover-source-strip">
			<div className="cover-toolbar-row">
				<CoverTool
					icon={ImagePlus}
					label={t("editor.cover.importImage")}
					disabled={disabled}
					onClick={() => input.current?.click()}
				/>
				<CoverTool
					icon={Camera}
					label={t("editor.cover.currentFrame")}
					disabled={disabled || duration <= 0}
					onClick={() => void onChoose()}
					testId="cover-current-frame"
				/>
				<CoverTool
					icon={Film}
					label={t("editor.cover.frames")}
					active={expanded}
					disabled={duration <= 0}
					onClick={() => setExpanded(!expanded)}
					testId="cover-frames"
				/>
				<span className="cover-source-name">
					{source?.kind === "local-image"
						? source.originalName
						: t("editor.cover.frames")}
				</span>
				{duration > 0 && (
					<>
						<CoverTool
							icon={ChevronLeft}
							label={t("editor.cover.previousFrame")}
							disabled={disabled || frame <= 0}
							onClick={() => chooseFrame({ next: frame - 1 })}
						/>
						<input
							aria-label={t("editor.cover.frameNumber")}
							type="number"
							min={0}
							max={lastFrame}
							value={frame}
							className="cover-number"
							disabled={disabled}
							onChange={(event) => {
								if (Number.isFinite(event.target.valueAsNumber))
									setFrame(
										Math.max(0, Math.min(lastFrame, event.target.valueAsNumber))
									);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									chooseFrame({ next: frame });
								}
							}}
							onBlur={() => {
								if (
									!disabled &&
									(source?.kind !== "timeline-frame" || source.frame !== frame)
								)
									chooseFrame({ next: frame });
							}}
						/>
						<CoverTool
							icon={ChevronRight}
							label={t("editor.cover.nextFrame")}
							disabled={disabled || frame >= lastFrame}
							onClick={() => chooseFrame({ next: frame + 1 })}
						/>
					</>
				)}
				<input
					ref={input}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					hidden
					data-testid="cover-file"
					aria-label={t("editor.cover.importImage")}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (file) void onChoose({ file });
					}}
				/>
			</div>
			{expanded && (
				<>
					<div
						className="cover-filmstrip"
						data-testid="cover-filmstrip"
						role="group"
						aria-busy={loading || mediaLoading}
						aria-label={t("editor.cover.frames")}
					>
						{samples.map((sample) => {
							const thumbnail = mediaLoading
								? undefined
								: frames.find((item) => item.frame === sample);
							return (
								<button
									type="button"
									key={sample}
									aria-label={`${t("editor.cover.frameNumber")} ${sample}`}
									aria-pressed={
										source?.kind === "timeline-frame" && source.frame === sample
									}
									disabled={disabled || !thumbnail || mediaLoading}
									onClick={() => chooseFrame({ next: sample })}
									onKeyDown={(event) => activateCoverControl({ event })}
								>
									{thumbnail && <img src={thumbnail.url} alt="" />}
									<span>{(sample / fps).toFixed(2)}s</span>
								</button>
							);
						})}
					</div>
					<input
						className="cover-frame-slider"
						type="range"
						min={0}
						max={lastFrame}
						step={1}
						aria-label={t("editor.cover.frameNumber")}
						value={frame}
						disabled={disabled}
						onChange={(event) => setFrame(Number(event.target.value))}
						onPointerUp={() => chooseFrame({ next: frame })}
						onKeyUp={(event) => {
							if (
								["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
							)
								chooseFrame({ next: frame });
						}}
					/>
					{failed && (
						<p className="cover-frame-error" role="status">
							{t("editor.cover.frameError")}
						</p>
					)}
				</>
			)}
		</div>
	);
}
