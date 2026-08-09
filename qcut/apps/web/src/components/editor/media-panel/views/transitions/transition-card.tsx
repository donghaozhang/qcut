import {
	AlertCircleIcon,
	CloudDownloadIcon,
	CloudOffIcon,
	HardDriveIcon,
	CrownIcon,
	FlaskConicalIcon,
	HeartIcon,
	LoaderCircleIcon,
	MousePointerClickIcon,
	RefreshCwIcon,
	SparklesIcon,
} from "lucide-react";
import type { DragEvent, KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TransitionResourceState } from "@/lib/transitions/transition-resource";
import type { TransitionPreset } from "./transition-presets";
import {
	TransitionPreview,
	type TransitionPreviewSources,
} from "./transition-preview";

interface TransitionCardProps {
	preset: TransitionPreset;
	selected: boolean;
	canApply: boolean;
	resourceState: TransitionResourceState;
	favorite: boolean;
	previewSources?: TransitionPreviewSources;
	onSelect: ({ preset }: { preset: TransitionPreset }) => void;
	onApply: ({ preset }: { preset: TransitionPreset }) => void;
	onToggleFavorite: ({ preset }: { preset: TransitionPreset }) => void;
	onDownload: ({ preset }: { preset: TransitionPreset }) => void;
	onDragStart: ({
		event,
		preset,
	}: {
		event: DragEvent<HTMLDivElement>;
		preset: TransitionPreset;
	}) => void;
}

export function TransitionCard({
	preset,
	selected,
	canApply,
	resourceState,
	favorite,
	previewSources,
	onSelect,
	onApply,
	onToggleFavorite,
	onDownload,
	onDragStart,
}: TransitionCardProps) {
	const [isPreviewing, setIsPreviewing] = useState(false);
	const selectedOnPointerDown = useRef(false);
	const available = resourceState.available;
	const isAiGeneration = preset.tags.includes("ai-generation");
	const handlePointerDown = ({
		event,
	}: {
		event: PointerEvent<HTMLDivElement>;
	}) => {
		if (event.button !== 0) return;
		selectedOnPointerDown.current = true;
		onSelect({ preset });
	};
	const handleClick = () => {
		if (selectedOnPointerDown.current) {
			selectedOnPointerDown.current = false;
			return;
		}
		onSelect({ preset });
	};
	const handleKeyDown = ({
		event,
	}: {
		event: KeyboardEvent<HTMLDivElement>;
	}) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}

		event.preventDefault();
		onSelect({ preset });
	};
	const resourceAction = (() => {
		switch (resourceState.status) {
			case "ready":
				return null;
			case "downloading":
				return {
					label: `正在下载 ${Math.round(resourceState.progress * 100)}%`,
					disabled: true,
					icon: (
						<LoaderCircleIcon className="size-3 animate-spin">
							<title>正在下载</title>
						</LoaderCircleIcon>
					),
				};
			case "update":
				return {
					label: "更新转场素材",
					disabled: false,
					icon: (
						<RefreshCwIcon className="size-3">
							<title>更新转场素材</title>
						</RefreshCwIcon>
					),
				};
			case "offline":
				return {
					label: "离线，无法下载",
					disabled: true,
					icon: (
						<CloudOffIcon className="size-3">
							<title>离线</title>
						</CloudOffIcon>
					),
				};
			case "failed":
				return {
					label: "下载失败，点击重试",
					disabled: false,
					icon: (
						<AlertCircleIcon className="size-3 text-destructive">
							<title>下载失败</title>
						</AlertCircleIcon>
					),
				};
			case "download":
				return {
					label: "下载转场素材",
					disabled: false,
					icon: (
						<CloudDownloadIcon className="size-3">
							<title>下载转场素材</title>
						</CloudDownloadIcon>
					),
				};
			case "checking-local":
				return {
					label: "正在检查本机剪映资源",
					disabled: true,
					icon: (
						<LoaderCircleIcon className="size-3 animate-spin">
							<title>正在检查本机剪映资源</title>
						</LoaderCircleIcon>
					),
				};
			case "local-unavailable":
				return {
					label: isAiGeneration ? "AI 首尾帧生成说明" : "检查本机剪映资源",
					disabled: false,
					icon: isAiGeneration ? (
						<SparklesIcon className="size-3">
							<title>AI 首尾帧生成说明</title>
						</SparklesIcon>
					) : (
						<HardDriveIcon className="size-3">
							<title>检查本机剪映资源</title>
						</HardDriveIcon>
					),
				};
		}
	})();

	return (
		<div
			className={cn(
				"group flex h-[112px] min-w-0 flex-col overflow-hidden rounded border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
				available ? "cursor-grab" : "cursor-pointer",
				selected && "border-primary"
			)}
			draggable={available}
			aria-pressed={selected}
			role="button"
			tabIndex={0}
			title={`${preset.localizedName}: ${preset.description}`}
			onClick={handleClick}
			onPointerDown={(event) => handlePointerDown({ event })}
			onDoubleClick={(event) => {
				event.stopPropagation();
				if (available && canApply) onApply({ preset });
			}}
			onKeyDown={(event) => handleKeyDown({ event })}
			onDragStart={(event) => available && onDragStart({ event, preset })}
			onMouseEnter={() => setIsPreviewing(true)}
			onMouseLeave={() => setIsPreviewing(false)}
			onFocus={() => setIsPreviewing(true)}
			onBlur={() => setIsPreviewing(false)}
			data-testid={`transition-card-${preset.id}`}
		>
			<div className="relative h-[72px] shrink-0">
				<TransitionPreview
					preset={preset}
					isPlaying={isPreviewing}
					sources={previewSources}
				/>
				<div className="absolute left-1.5 top-1.5 flex gap-1">
					{preset.category === "lab" ? (
						<Badge className="gap-0.5 border-cyan-400/40 bg-cyan-400/15 px-1 py-0 text-[9px] text-cyan-100">
							<FlaskConicalIcon className="size-2.5">
								<title>QCut Shader 实验转场</title>
							</FlaskConicalIcon>
							Shader
						</Badge>
					) : null}
					{preset.premium && (
						<Badge className="gap-0.5 border-amber-500/40 bg-amber-500/20 px-1 py-0 text-[9px] text-amber-100">
							<CrownIcon className="h-2.5 w-2.5" />
							Pro
						</Badge>
					)}
					{preset.backend === "jianying-local" ? (
						<Badge className="border-cyan-500/40 bg-cyan-500/15 px-1 py-0 text-[9px] text-cyan-200">
							{isAiGeneration ? "AI" : "本机"}
						</Badge>
					) : null}
				</div>
				{resourceAction ? (
					<button
						type="button"
						className="absolute bottom-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-sm bg-background/85 text-foreground shadow-sm disabled:cursor-not-allowed disabled:text-muted-foreground"
						aria-label={`${resourceAction.label}: ${preset.localizedName}`}
						title={resourceAction.label}
						disabled={resourceAction.disabled}
						onClick={(event) => {
							event.stopPropagation();
							onDownload({ preset });
						}}
						onPointerDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
					>
						{resourceAction.icon}
					</button>
				) : null}
				{resourceState.status === "downloading" ? (
					<div
						className="absolute inset-x-0 top-0 h-0.5 bg-primary"
						style={{ width: `${resourceState.progress * 100}%` }}
					/>
				) : null}
				<div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-focus:opacity-100 group-hover:opacity-100">
					<Button
						type="button"
						variant="text"
						size="icon"
						className="h-6 w-6 bg-background/80 backdrop-blur-sm"
						title={favorite ? "取消收藏" : "收藏"}
						aria-label={favorite ? "取消收藏" : "收藏"}
						onClick={(event) => {
							event.stopPropagation();
							onToggleFavorite({ preset });
						}}
						onPointerDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
					>
						<HeartIcon
							className={
								favorite ? "size-3.5 fill-rose-500 text-rose-500" : "size-3.5"
							}
						/>
					</Button>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="h-6 w-6 bg-background/80 backdrop-blur-sm"
						disabled={!canApply || !available}
						title={`应用${preset.localizedName}`}
						aria-label={`应用${preset.localizedName}`}
						onClick={(event) => {
							event.stopPropagation();
							onApply({ preset });
						}}
						onPointerDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
					>
						<MousePointerClickIcon className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
			<div className="min-h-0 flex-1 px-1.5 py-1">
				<div className="min-w-0">
					<div className="truncate text-[11px] font-medium text-foreground">
						{preset.localizedName}
					</div>
					<div className="truncate text-[9px] text-muted-foreground">
						{preset.defaultDuration.toFixed(2)}s
					</div>
				</div>
			</div>
		</div>
	);
}
