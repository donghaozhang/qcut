import { useEffect, useState, type ComponentProps } from "react";
import { Cpu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JianyingFilterLabLoadRendererResult } from "@/types/electron";
import type { JianyingFilterLab } from "./jianying-filter-lab";
import { JianyingFilterLabControls } from "./jianying-filter-lab-controls";
import { useJianyingFilterThumbnail } from "./use-jianying-filter-thumbnail";
import { IndependentLutLibrary } from "./independent-lut-library";

export function IndependentFilterShelf({
	activeEffect,
	onApplyMultiPass,
	onEffectEnabledChange,
	onEffectIntensityChange,
	onEffectIntensityCommit,
	...otherProps
}: ComponentProps<typeof JianyingFilterLab>) {
	const [settings, setSettings] =
		useState<JianyingFilterLabLoadRendererResult>();
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const thumbnail = useJianyingFilterThumbnail({
		resourceId: "7160594413847203085",
		hasThumbnail: true,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry starts a fresh readiness check.
	useEffect(() => {
		let cancelled = false;
		setSettings(undefined);
		setError("");
		const api = window.electronAPI?.qcutIndependentFilter;
		if (!api) {
			setError("QCut Metal 不可用：需要 macOS 桌面版。");
			return;
		}
		api
			.load()
			.then((result) => {
				if (!cancelled) setSettings(result);
			})
			.catch((cause: unknown) => {
				if (!cancelled)
					setError(cause instanceof Error ? cause.message : String(cause));
			});
		return () => {
			cancelled = true;
		};
	}, [attempt]);
	const active =
		activeEffect?.name === settings?.name ? activeEffect : undefined;
	return (
		<div className="space-y-3 p-1" data-testid="independent-filter-shelf">
			<div className="flex items-center justify-between gap-2 text-xs">
				<span role="status">
					{error
						? "不可用"
						: settings
							? "本地 LUT 已校验 · Metal 已就绪"
							: "正在检查本地渲染器…"}
				</span>
				<Button
					type="button"
					size="icon"
					variant="text"
					title="重新检查 QCut Metal"
					aria-label="重新检查 QCut Metal"
					onClick={() => setAttempt((value) => value + 1)}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<RefreshCw className="size-3.5" aria-hidden="true" />
				</Button>
			</div>
			{error && (
				<p role="alert" className="break-words text-xs text-destructive">
					{error}
				</p>
			)}
			{active &&
				onEffectEnabledChange &&
				onEffectIntensityChange &&
				onEffectIntensityCommit && (
					<JianyingFilterLabControls
						effect={active}
						onEnabledChange={onEffectEnabledChange}
						onIntensityChange={onEffectIntensityChange}
						onIntensityCommit={onEffectIntensityCommit}
					/>
				)}
			<div className="grid grid-cols-3 gap-2">
				<button
					type="button"
					aria-label="应用 迷雾 QCut Metal"
					disabled={!settings || !onApplyMultiPass}
					className="min-w-0 rounded-md border border-border text-left disabled:opacity-50 hover:border-primary focus-visible:outline focus-visible:outline-primary"
					onClick={() => {
						if (settings)
							onApplyMultiPass?.({ settings, layerName: settings.name });
					}}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<div
						ref={thumbnail.containerRef}
						className="grid aspect-square place-items-center overflow-hidden rounded-t-md bg-muted"
					>
						{thumbnail.state === "ready" ? (
							<img
								src={thumbnail.url}
								alt="迷雾滤镜缩略图"
								className="size-full object-cover"
							/>
						) : (
							<Cpu className="size-6" aria-hidden="true" />
						)}
					</div>
					<div className="space-y-0.5 p-2 text-xs">
						<div>迷雾 / Fog</div>
						<div className="text-muted-foreground">QCut Metal</div>
					</div>
				</button>
			</div>
			<IndependentLutLibrary
				{...otherProps}
				activeEffect={activeEffect}
				onApplyMultiPass={onApplyMultiPass}
				onEffectEnabledChange={onEffectEnabledChange}
				onEffectIntensityChange={onEffectIntensityChange}
				onEffectIntensityCommit={onEffectIntensityCommit}
			/>
		</div>
	);
}
