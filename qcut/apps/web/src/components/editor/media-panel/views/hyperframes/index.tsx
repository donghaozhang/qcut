"use client";

import { PlatformCapability, platform } from "@qcut/platform-core";
import {
	AlertTriangle,
	CodeXml,
	FilePlus2,
	LoaderCircle,
	Plus,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	HyperframesParseError,
	parseHyperframesComposition,
	type HyperframesComposition,
} from "@/lib/hyperframes";
import { useHyperframesStore } from "@/stores/ai/hyperframes-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

function formatDuration(duration: number): string {
	if (duration < 10) return `${duration.toFixed(1)}s`;
	return `${Math.round(duration)}s`;
}

interface CompositionRowProps {
	composition: HyperframesComposition;
	onAdd: (composition: HyperframesComposition) => void;
	onRemove: (sourcePath: string) => void;
}

function CompositionRow({ composition, onAdd, onRemove }: CompositionRowProps) {
	return (
		<div
			className="group flex min-w-0 items-center gap-3 border-b border-border/60 px-3 py-2.5 hover:bg-muted/40"
			data-testid={`hyperframes-composition-${composition.id}`}
		>
			<div className="flex size-9 shrink-0 items-center justify-center rounded bg-emerald-500/15">
				<CodeXml className="size-4 text-emerald-400" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium">{composition.name}</div>
				<div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
					<span>{formatDuration(composition.duration)}</span>
					<span>{composition.fps} fps</span>
					<span>
						{composition.width}x{composition.height}
					</span>
					{composition.variables.length > 0 ? (
						<Badge variant="secondary" className="h-4 px-1 text-[9px]">
							{composition.variables.length} vars
						</Badge>
					) : null}
					{composition.warnings.length > 0 ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<AlertTriangle className="size-3 text-amber-400" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								{composition.warnings.join("\n")}
							</TooltipContent>
						</Tooltip>
					) : null}
				</div>
			</div>
			<Button
				type="button"
				size="icon"
				variant="text"
				className="size-7 opacity-0 group-hover:opacity-100"
				onClick={() => onRemove(composition.sourcePath)}
				title="Remove from library"
			>
				<Trash2 className="size-3.5" />
			</Button>
			<Button
				type="button"
				size="icon"
				variant="secondary"
				className="size-7"
				onClick={() => onAdd(composition)}
				title="Add to timeline"
			>
				<Plus className="size-3.5" />
			</Button>
		</div>
	);
}

/** Import and timeline library for local HyperFrames HTML compositions. */
export function HyperframesView() {
	const compositions = useHyperframesStore((state) => state.compositions);
	const initialize = useHyperframesStore((state) => state.initialize);
	const upsertComposition = useHyperframesStore(
		(state) => state.upsertComposition
	);
	const removeComposition = useHyperframesStore(
		(state) => state.removeComposition
	);
	const findOrCreateTrack = useTimelineStore(
		(state) => state.findOrCreateTrack
	);
	const addElementToTrack = useTimelineStore(
		(state) => state.addElementToTrack
	);
	const [isImporting, setIsImporting] = useState(false);
	const isAvailable = platform().hasCapability(PlatformCapability.Hyperframes);

	useEffect(() => {
		initialize();
	}, [initialize]);

	const handleImport = useCallback(async () => {
		if (!isAvailable) {
			toast.error("HyperFrames import is available in the desktop app.");
			return;
		}

		setIsImporting(true);
		try {
			const result = await platform().hyperframes.select();
			if (result.cancelled) return;
			if (
				!result.success ||
				!result.html ||
				!result.sourcePath ||
				!result.projectPath
			) {
				throw new Error(result.error || "Could not read HyperFrames HTML.");
			}

			const composition = parseHyperframesComposition({
				html: result.html,
				sourcePath: result.sourcePath,
				projectPath: result.projectPath,
			});
			upsertComposition(composition);
			toast.success(`Imported "${composition.name}"`);
			if (composition.warnings.length > 0) {
				toast.warning(
					`Imported with ${composition.warnings.length} validation warning${composition.warnings.length === 1 ? "" : "s"}.`
				);
			}
		} catch (reason) {
			const description =
				reason instanceof HyperframesParseError
					? reason.issues.join("\n")
					: reason instanceof Error
						? reason.message
						: String(reason);
			toast.error("HyperFrames import failed", { description });
		} finally {
			setIsImporting(false);
		}
	}, [isAvailable, upsertComposition]);

	const handleAdd = useCallback(
		(composition: HyperframesComposition) => {
			const trackId = findOrCreateTrack("hyperframes");
			const currentTime = usePlaybackStore.getState().currentTime;
			addElementToTrack(trackId, {
				type: "hyperframes",
				name: composition.name,
				duration: composition.duration,
				startTime: currentTime,
				trimStart: 0,
				trimEnd: 0,
				compositionId: composition.id,
				sourcePath: composition.sourcePath,
				projectPath: composition.projectPath,
				compositionWidth: composition.width,
				compositionHeight: composition.height,
				fps: composition.fps,
				durationIsEstimated: composition.durationIsEstimated,
				variableValues: { ...composition.defaultVariableValues },
				variableDefinitions: composition.variables.map((variable) => ({
					...variable,
				})),
				renderMode: "live",
				opacity: 1,
				scale: 1,
			});
			toast.success(`Added "${composition.name}" to timeline`);
		},
		[addElementToTrack, findOrCreateTrack]
	);

	return (
		<TooltipProvider>
			<div className="flex h-full min-h-0 flex-col">
				<div className="flex items-center justify-between border-b px-3 py-2">
					<div>
						<h2 className="text-sm font-medium">HyperFrames</h2>
						<p className="text-[10px] text-muted-foreground">
							{compositions.length} local composition
							{compositions.length === 1 ? "" : "s"}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						className="h-8 gap-1.5"
						onClick={handleImport}
						disabled={isImporting || !isAvailable}
					>
						{isImporting ? (
							<LoaderCircle className="size-3.5 animate-spin" />
						) : (
							<FilePlus2 className="size-3.5" />
						)}
						Import HTML
					</Button>
				</div>

				{compositions.length > 0 ? (
					<div className="min-h-0 flex-1 overflow-y-auto">
						{compositions.map((composition) => (
							<CompositionRow
								key={composition.sourcePath}
								composition={composition}
								onAdd={handleAdd}
								onRemove={removeComposition}
							/>
						))}
					</div>
				) : (
					<div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
						<CodeXml className="mb-3 size-9 text-muted-foreground" />
						<p className="text-sm font-medium">No HyperFrames compositions</p>
						<p className="mt-1 max-w-xs text-xs text-muted-foreground">
							Import a local HyperFrames HTML composition to add it to the
							timeline.
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-4 gap-1.5"
							onClick={handleImport}
							disabled={isImporting || !isAvailable}
						>
							<FilePlus2 className="size-3.5" />
							Import HTML
						</Button>
						{isAvailable ? null : (
							<p className="mt-3 text-[10px] text-amber-400">
								Desktop QCut is required.
							</p>
						)}
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}
