import { type ReactNode, useEffect, useState } from "react";
import { Brush, Database, Eraser, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
	MediaPortraitAdjustments,
	MediaPortraitManualRetouchStroke,
	MediaPortraitManualRetouchTool,
} from "@/types/timeline";
import { cn } from "@/lib/utils";
import { usePortraitManualRetouchStore } from "@/stores/editor/portrait-manual-retouch-store";
import { NumberControl } from "./visual-property-controls";

function RetouchIconButton({
	active = false,
	disabled = false,
	label,
	onClick,
	children,
}: {
	active?: boolean;
	disabled?: boolean;
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			type="button"
			variant={active ? "default" : "outline"}
			size="icon"
			className="size-8 rounded-sm"
			disabled={disabled}
			aria-label={label}
			title={label}
			onClick={onClick}
			onKeyDown={(event) => event.stopPropagation()}
		>
			{children}
		</Button>
	);
}

export function PortraitManualRetouchControls({
	active,
	adjustments,
	disabled,
	locale,
	readyTools,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	active: boolean;
	adjustments: MediaPortraitAdjustments;
	disabled: boolean;
	locale: string;
	readyTools: ReadonlySet<MediaPortraitManualRetouchTool>;
	onChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const isZh = locale === "zh";
	const tool = usePortraitManualRetouchStore((state) => state.tool);
	const mode = usePortraitManualRetouchStore((state) => state.mode);
	const size = usePortraitManualRetouchStore((state) => state.size);
	const intensity = usePortraitManualRetouchStore((state) => state.intensity);
	const setActive = usePortraitManualRetouchStore((state) => state.setActive);
	const setTool = usePortraitManualRetouchStore((state) => state.setTool);
	const setMode = usePortraitManualRetouchStore((state) => state.setMode);
	const setSize = usePortraitManualRetouchStore((state) => state.setSize);
	const setIntensity = usePortraitManualRetouchStore(
		(state) => state.setIntensity
	);
	const setCommitHandler = usePortraitManualRetouchStore(
		(state) => state.setCommitHandler
	);
	const [redoStrokes, setRedoStrokes] = useState<
		MediaPortraitManualRetouchStroke[]
	>([]);
	const strokes = adjustments.manualRetouch?.strokes ?? [];
	const toolReady = readyTools.has(tool);
	const controlsDisabled = disabled || !toolReady;

	useEffect(() => {
		setActive({ active: active && !disabled });
		return () => setActive({ active: false });
	}, [active, disabled, setActive]);
	useEffect(() => {
		setCommitHandler({
			handler: (stroke) => {
				onInteractionStart();
				onChange({
					...adjustments,
					enabled: true,
					manualRetouch: { strokes: [...strokes, stroke] },
				});
				onInteractionEnd();
				setRedoStrokes([]);
			},
		});
		return () => setCommitHandler({ handler: null });
	}, [
		adjustments,
		onChange,
		onInteractionEnd,
		onInteractionStart,
		setCommitHandler,
		strokes,
	]);

	const replaceStrokes = (next: MediaPortraitManualRetouchStroke[]) => {
		onChange({
			...adjustments,
			manualRetouch: next.length > 0 ? { strokes: next } : undefined,
		});
	};
	const undo = () => {
		const stroke = strokes.at(-1);
		if (!stroke) return;
		onInteractionStart();
		replaceStrokes(strokes.slice(0, -1));
		onInteractionEnd();
		setRedoStrokes((current) => [...current, stroke]);
	};
	const redo = () => {
		const stroke = redoStrokes.at(-1);
		if (!stroke) return;
		onInteractionStart();
		replaceStrokes([...strokes, stroke]);
		onInteractionEnd();
		setRedoStrokes((current) => current.slice(0, -1));
	};
	const clear = () => {
		if (strokes.length === 0) return;
		onInteractionStart();
		replaceStrokes([]);
		onInteractionEnd();
		setRedoStrokes([]);
	};
	const updateIntensity = (nextIntensity: number) => {
		const boundedIntensity = Math.min(100, Math.max(0, nextIntensity));
		setIntensity({ intensity: boundedIntensity });
		setRedoStrokes([]);
		if (strokes.some((stroke) => stroke.tool === tool)) {
			replaceStrokes(
				strokes.map((stroke) =>
					stroke.tool === tool
						? { ...stroke, intensity: boundedIntensity }
						: stroke
				)
			);
		}
	};
	const selectTool = (nextTool: MediaPortraitManualRetouchTool) => {
		setTool({ tool: nextTool });
		const latest = [...strokes]
			.reverse()
			.find((stroke) => stroke.tool === nextTool);
		if (latest) setIntensity({ intensity: latest.intensity });
	};

	return (
		<div className="space-y-4" data-testid="portrait-manual-retouch-controls">
			<div className="grid grid-cols-2 gap-1 rounded-sm bg-muted p-1">
				{(["smooth", "acne"] as const).map((candidate) => {
					const label =
						candidate === "smooth"
							? isZh
								? "手动磨皮"
								: "Manual smooth"
							: isZh
								? "手动祛痘"
								: "Blemish repair";
					return (
						<Button
							type="button"
							key={candidate}
							variant="text"
							className={cn(
								"h-7 rounded-sm px-2 text-[11px]",
								tool === candidate && "bg-background shadow-sm"
							)}
							disabled={disabled || !readyTools.has(candidate)}
							aria-pressed={tool === candidate}
							onClick={() => selectTool(candidate)}
							onKeyDown={(event) => event.stopPropagation()}
						>
							{label}
						</Button>
					);
				})}
			</div>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-1">
					<RetouchIconButton
						active={mode === "paint"}
						disabled={controlsDisabled}
						label={isZh ? "画笔" : "Brush"}
						onClick={() => setMode({ mode: "paint" })}
					>
						<Brush className="size-4">
							<title>{isZh ? "画笔" : "Brush"}</title>
						</Brush>
					</RetouchIconButton>
					<RetouchIconButton
						active={mode === "erase"}
						disabled={controlsDisabled}
						label={isZh ? "擦除" : "Erase"}
						onClick={() => setMode({ mode: "erase" })}
					>
						<Eraser className="size-4">
							<title>{isZh ? "擦除" : "Erase"}</title>
						</Eraser>
					</RetouchIconButton>
				</div>
				<div className="flex items-center gap-1">
					<RetouchIconButton
						disabled={disabled || strokes.length === 0}
						label={isZh ? "撤销" : "Undo"}
						onClick={undo}
					>
						<Undo2 className="size-4">
							<title>{isZh ? "撤销" : "Undo"}</title>
						</Undo2>
					</RetouchIconButton>
					<RetouchIconButton
						disabled={disabled || redoStrokes.length === 0}
						label={isZh ? "重做" : "Redo"}
						onClick={redo}
					>
						<Redo2 className="size-4">
							<title>{isZh ? "重做" : "Redo"}</title>
						</Redo2>
					</RetouchIconButton>
					<RetouchIconButton
						disabled={disabled || strokes.length === 0}
						label={isZh ? "清空" : "Clear"}
						onClick={clear}
					>
						<RotateCcw className="size-4">
							<title>{isZh ? "清空" : "Clear"}</title>
						</RotateCcw>
					</RetouchIconButton>
				</div>
			</div>
			<NumberControl
				label={isZh ? "大小" : "Size"}
				value={size}
				min={1}
				max={100}
				disabled={controlsDisabled}
				onChange={(next) => setSize({ size: next })}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<NumberControl
				label={isZh ? "强度" : "Intensity"}
				value={intensity}
				min={0}
				max={100}
				disabled={controlsDisabled}
				onChange={updateIntensity}
				onInteractionStart={onInteractionStart}
				onInteractionEnd={onInteractionEnd}
			/>
			<div className="flex items-center justify-between border-t border-border/70 pt-3 text-[10px] text-muted-foreground">
				<span className="inline-flex items-center gap-1">
					<Database className="size-3">
						<title>{isZh ? "本机缓存" : "Local cache"}</title>
					</Database>
					{isZh ? "本机缓存" : "Local cache"}
				</span>
				<span data-testid="portrait-manual-stroke-count">
					{isZh ? `${strokes.length} 笔` : `${strokes.length} strokes`}
				</span>
			</div>
			{toolReady ? null : (
				<p className="text-[10px] text-muted-foreground">
					{isZh
						? "该原版效果包尚未进入本机私有库"
						: "This native package is not cached locally"}
				</p>
			)}
		</div>
	);
}
