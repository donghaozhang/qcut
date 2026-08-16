import {
	Download,
	FlaskConical,
	ImageOff,
	Loader2,
	Lock,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EffectPreset } from "@/types/effects";
import type { JianyingEffectDefinition } from "@/types/electron";
import { useJianyingEffectRuntime } from "./use-jianying-effect-runtime";

/**
 * Lists the Jianying effects this machine can render. QCut ships none of them:
 * installed entries come from the local Jianying caches, and the rest of the
 * catalog can be fetched on demand through the main process — every package
 * still renders through the local Jianying runtime.
 */

const PREVIEW_CONCURRENCY = 2;

type DownloadState = "downloading" | "failed";

function labPreset({
	definition,
}: {
	definition: JianyingEffectDefinition;
}): EffectPreset {
	return {
		id: definition.id,
		name: definition.name,
		description: `${definition.name}由本机剪映运行时渲染，QCut 不内置或上传剪映特效文件。`,
		category: "basic",
		icon: "JY",
		parameters: {},
		engine: "jianying-local",
		packageHash: definition.packageHash,
		adjustParameters: definition.adjustParameters,
	};
}

function EffectPreviewTile({
	definition,
	dataUrl,
	downloadState,
}: {
	definition: JianyingEffectDefinition;
	dataUrl: string | undefined;
	downloadState: DownloadState | undefined;
}) {
	if (!definition.supported) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
				<Lock className="size-4" />
				<span className="px-1 text-center text-[9px] leading-tight">
					需剪映算法
				</span>
			</div>
		);
	}
	if (!definition.installed) {
		if (downloadState === "downloading") {
			return (
				<div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					<span className="text-[9px]">下载中…</span>
				</div>
			);
		}
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground group-hover:text-primary">
				<Download className="size-4" />
				<span className="text-[9px]">
					{downloadState === "failed" ? "下载失败，点击重试" : "点击下载"}
				</span>
			</div>
		);
	}
	if (dataUrl === "") {
		return (
			<div className="flex h-full w-full items-center justify-center text-muted-foreground">
				<ImageOff className="size-4" />
			</div>
		);
	}
	if (!dataUrl) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}
	return (
		<img
			src={dataUrl}
			alt={definition.name}
			className="h-full w-full object-cover"
			draggable={false}
		/>
	);
}

export function JianyingEffectLabPanel({
	onApply,
	searchQuery = "",
}: {
	onApply: (preset: EffectPreset) => void;
	searchQuery?: string;
}) {
	const { checking, status, error, refresh } = useJianyingEffectRuntime();
	// "" marks a render that failed — without it the pump would retry forever
	// and the tile would spin forever.
	const [previews, setPreviews] = useState<Record<string, string>>({});
	const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
	// Requests already on the wire; a state update must not re-issue them.
	const inFlightIds = useRef(new Set<string>());

	const effects = status?.effects ?? [];

	// Previews are rendered by the runtime one at a time; a small concurrency
	// keeps the panel responsive without queueing dozens of renders at once.
	useEffect(() => {
		const api = window.electronAPI?.jianyingEffects;
		if (!api) return;
		const pending = effects.filter(
			(effect) =>
				effect.supported &&
				effect.installed &&
				previews[effect.id] === undefined &&
				!inFlightIds.current.has(effect.id)
		);
		const capacity = PREVIEW_CONCURRENCY - inFlightIds.current.size;
		if (pending.length === 0 || capacity <= 0) return;

		let cancelled = false;
		const batch = pending.slice(0, capacity);
		for (const effect of batch) {
			inFlightIds.current.add(effect.id);
		}
		void Promise.all(
			batch.map(async (effect) => {
				try {
					const result = await api.preview({ effectId: effect.id });
					if (cancelled) return;
					setPreviews((current) => ({
						...current,
						[effect.id]: result.dataUrl,
					}));
				} catch {
					// Record the failure so the pump advances to the next batch.
					if (!cancelled) {
						setPreviews((current) => ({ ...current, [effect.id]: "" }));
					}
				} finally {
					inFlightIds.current.delete(effect.id);
				}
			})
		);
		return () => {
			cancelled = true;
		};
	}, [effects, previews]);

	const handleDownload = useCallback(
		async ({ definition }: { definition: JianyingEffectDefinition }) => {
			const api = window.electronAPI?.jianyingEffects;
			if (!api?.download) return;
			setDownloads((current) => ({
				...current,
				[definition.effectId]: "downloading",
			}));
			try {
				await api.download({ effectId: definition.effectId });
				setDownloads((current) => {
					const next = { ...current };
					delete next[definition.effectId];
					return next;
				});
				// A fresh status marks the effect installed, which also lets the
				// preview pump pick it up.
				await refresh();
			} catch (cause) {
				setDownloads((current) => ({
					...current,
					[definition.effectId]: "failed",
				}));
				toast.error(
					cause instanceof Error ? cause.message : "特效包下载失败。"
				);
			}
		},
		[refresh]
	);

	const handleTileClick = useCallback(
		({ definition }: { definition: JianyingEffectDefinition }) => {
			if (!definition.installed) {
				if (downloads[definition.effectId] === "downloading") return;
				void handleDownload({ definition });
				return;
			}
			onApply(labPreset({ definition }));
		},
		[downloads, handleDownload, onApply]
	);

	const query = searchQuery.trim().toLowerCase();
	const visibleEffects = query
		? effects.filter((effect) => effect.name.toLowerCase().includes(query))
		: effects;

	if (checking) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				正在检测本机剪映运行时…
			</div>
		);
	}

	if (error || !status || status.state !== "ready") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
				<FlaskConical className="size-6 text-muted-foreground" />
				<p className="text-xs text-muted-foreground">
					{error || status?.message || "本机剪映特效不可用。"}
				</p>
				<Button size="sm" variant="outline" onClick={() => void refresh()}>
					<RefreshCw className="mr-1.5 size-3" />
					重新检测
				</Button>
			</div>
		);
	}

	const installedCount = visibleEffects.filter(
		(effect) => effect.supported && effect.installed
	).length;
	const downloadableCount = visibleEffects.filter(
		(effect) => effect.supported && !effect.installed
	).length;

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-testid="effect-lab-panel"
		>
			<div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
				<span>
					本机剪映特效 {installedCount} 个
					{downloadableCount > 0 ? ` · 可下载 ${downloadableCount} 个` : ""}
				</span>
				<Button
					size="sm"
					variant="text"
					aria-label="重新检测本机剪映特效"
					onClick={() => void refresh()}
				>
					<RefreshCw aria-hidden="true" className="size-3" />
				</Button>
			</div>
			<div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-3 pt-0">
				{visibleEffects.map((definition) => (
					<button
						key={definition.id}
						type="button"
						disabled={!definition.supported}
						title={definition.unsupportedReason ?? definition.name}
						data-testid={`effect-lab-card-${definition.id}`}
						className={cn(
							"group flex flex-col overflow-hidden rounded border border-border/60 text-left transition-colors",
							definition.supported
								? "hover:border-primary/60"
								: "cursor-not-allowed opacity-60"
						)}
						onClick={() => handleTileClick({ definition })}
					>
						<div className="aspect-video w-full bg-foreground/5">
							<EffectPreviewTile
								definition={definition}
								dataUrl={previews[definition.id]}
								downloadState={downloads[definition.effectId]}
							/>
						</div>
						<span className="truncate px-1.5 py-1 text-[10px]">
							{definition.name}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
