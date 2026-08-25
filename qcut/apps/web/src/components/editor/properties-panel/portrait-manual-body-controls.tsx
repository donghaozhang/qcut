import { useEffect } from "react";
import { Redo2, RotateCcw, Undo2 } from "lucide-react";
import { DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY } from "@qcut/editor-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePortraitManualBodyStore } from "@/stores/editor/portrait-manual-body-store";
import type {
	MediaPortraitAdjustments,
	MediaPortraitManualBody,
	MediaPortraitManualBodyTool,
} from "@/types/timeline";
import { NumberControl } from "./visual-property-controls";

const TOOLS = ["stretch", "slim", "zoom"] as const;

function bodyWithoutTool({
	manualBody,
	tool,
}: {
	manualBody: MediaPortraitManualBody;
	tool: MediaPortraitManualBodyTool;
}): MediaPortraitManualBody {
	return {
		...(tool === "stretch" || !manualBody.stretch
			? {}
			: { stretch: manualBody.stretch }),
		...(tool === "slim" || !manualBody.slim ? {} : { slim: manualBody.slim }),
		...(tool === "zoom" || !manualBody.zoom ? {} : { zoom: manualBody.zoom }),
	};
}

export function PortraitManualBodyControls({
	active,
	adjustments,
	disabled,
	elementId,
	locale,
	readyTools,
	onChange,
	onInteractionEnd,
	onInteractionStart,
}: {
	active: boolean;
	adjustments: MediaPortraitAdjustments;
	disabled: boolean;
	elementId: string;
	locale: string;
	readyTools: ReadonlySet<MediaPortraitManualBodyTool>;
	onChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionEnd: () => void;
	onInteractionStart: () => void;
}) {
	const isZh = locale === "zh";
	const tool = usePortraitManualBodyStore((state) => state.tool);
	const manualBody = usePortraitManualBodyStore((state) => state.manualBody);
	const pastCount = usePortraitManualBodyStore((state) => state.past.length);
	const futureCount = usePortraitManualBodyStore(
		(state) => state.future.length
	);
	const setActive = usePortraitManualBodyStore((state) => state.setActive);
	const setTool = usePortraitManualBodyStore((state) => state.setTool);
	const setBindings = usePortraitManualBodyStore((state) => state.setBindings);
	const syncValue = usePortraitManualBodyStore((state) => state.syncValue);
	const beginInteraction = usePortraitManualBodyStore(
		(state) => state.beginInteraction
	);
	const updateManualBody = usePortraitManualBodyStore(
		(state) => state.updateManualBody
	);
	const finishInteraction = usePortraitManualBodyStore(
		(state) => state.finishInteraction
	);
	const applyManualBody = usePortraitManualBodyStore(
		(state) => state.applyManualBody
	);
	const undo = usePortraitManualBodyStore((state) => state.undo);
	const redo = usePortraitManualBodyStore((state) => state.redo);

	useEffect(() => {
		syncValue({ elementId, manualBody: adjustments.manualBody });
	}, [adjustments.manualBody, elementId, syncValue]);
	useEffect(() => {
		setActive({ active: active && !disabled });
		return () => setActive({ active: false });
	}, [active, disabled, setActive]);
	useEffect(() => {
		setBindings({
			bindings: {
				onChange: (next) =>
					onChange({
						...adjustments,
						enabled: true,
						manualBody: next,
					}),
				onInteractionStart,
				onInteractionEnd,
			},
		});
		return () => setBindings({ bindings: null });
	}, [
		adjustments,
		onChange,
		onInteractionEnd,
		onInteractionStart,
		setBindings,
	]);

	const toolReady = readyTools.has(tool);
	const controlsDisabled = disabled || !toolReady;
	const setToolValue = ({
		next,
	}: {
		next: MediaPortraitManualBody[MediaPortraitManualBodyTool];
	}) => {
		if (!next) return;
		updateManualBody({ manualBody: { ...manualBody, [tool]: next } });
	};
	const resetTool = () =>
		applyManualBody({ manualBody: bodyWithoutTool({ manualBody, tool }) });
	const commonControlProps = {
		disabled: controlsDisabled,
		onInteractionStart: beginInteraction,
		onInteractionEnd: finishInteraction,
	};

	const intensityControl = () => {
		const value = manualBody[tool] ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY[tool];
		return (
			<NumberControl
				label={isZh ? "强度" : "Intensity"}
				value={value.intensity}
				min={-50}
				max={50}
				onChange={(intensity) =>
					setToolValue({ next: { ...value, intensity } })
				}
				{...commonControlProps}
			/>
		);
	};

	return (
		<div className="space-y-4" data-testid="portrait-manual-body-controls">
			<div className="grid grid-cols-3 gap-1 rounded-sm bg-muted p-1">
				{TOOLS.map((candidate) => {
					const labels = {
						stretch: isZh ? "拉长" : "Stretch",
						slim: isZh ? "瘦身瘦腿" : "Slim",
						zoom: isZh ? "放大缩小" : "Zoom",
					};
					return (
						<Button
							type="button"
							key={candidate}
							variant="text"
							className={cn(
								"h-7 rounded-sm px-1 text-[10px]",
								tool === candidate && "bg-background shadow-sm"
							)}
							disabled={disabled || !readyTools.has(candidate)}
							aria-pressed={tool === candidate}
							onClick={() => setTool({ tool: candidate })}
							onKeyDown={(event) => event.stopPropagation()}
						>
							{labels[candidate]}
						</Button>
					);
				})}
			</div>
			<div className="flex justify-end gap-1">
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 rounded-sm"
					disabled={pastCount === 0}
					aria-label={isZh ? "撤销手动美体" : "Undo manual body"}
					title={isZh ? "撤销" : "Undo"}
					onClick={undo}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<Undo2 className="size-4">
						<title>{isZh ? "撤销" : "Undo"}</title>
					</Undo2>
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 rounded-sm"
					disabled={futureCount === 0}
					aria-label={isZh ? "重做手动美体" : "Redo manual body"}
					title={isZh ? "重做" : "Redo"}
					onClick={redo}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<Redo2 className="size-4">
						<title>{isZh ? "重做" : "Redo"}</title>
					</Redo2>
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 rounded-sm"
					disabled={controlsDisabled || !manualBody[tool]}
					aria-label={isZh ? "重置当前工具" : "Reset current tool"}
					title={isZh ? "重置" : "Reset"}
					onClick={resetTool}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<RotateCcw className="size-4">
						<title>{isZh ? "重置" : "Reset"}</title>
					</RotateCcw>
				</Button>
			</div>
			{intensityControl()}
			{tool === "stretch" ? (
				<>
					<NumberControl
						label={isZh ? "上边界" : "Upper line"}
						value={
							(manualBody.stretch ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch)
								.upper * 100
						}
						min={2}
						max={100}
						onChange={(upper) => {
							const value =
								manualBody.stretch ??
								DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch;
							setToolValue({
								next: {
									...value,
									upper: Math.max(value.bottom + 0.02, upper / 100),
								},
							});
						}}
						{...commonControlProps}
					/>
					<NumberControl
						label={isZh ? "下边界" : "Lower line"}
						value={
							(manualBody.stretch ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch)
								.bottom * 100
						}
						min={0}
						max={98}
						onChange={(bottom) => {
							const value =
								manualBody.stretch ??
								DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.stretch;
							setToolValue({
								next: {
									...value,
									bottom: Math.min(value.upper - 0.02, bottom / 100),
								},
							});
						}}
						{...commonControlProps}
					/>
				</>
			) : null}
			{tool === "slim" ? (
				<>
					{(["x", "y", "width", "height"] as const).map((key) => {
						const value =
							manualBody.slim ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim;
						const labels = {
							x: isZh ? "中心 X" : "Center X",
							y: isZh ? "中心 Y" : "Center Y",
							width: isZh ? "宽度" : "Width",
							height: isZh ? "高度" : "Height",
						};
						return (
							<NumberControl
								key={key}
								label={labels[key]}
								value={value[key] * 100}
								min={key === "width" || key === "height" ? 2 : 0}
								max={100}
								onChange={(next) =>
									setToolValue({ next: { ...value, [key]: next / 100 } })
								}
								{...commonControlProps}
							/>
						);
					})}
					<NumberControl
						label={isZh ? "旋转" : "Rotation"}
						value={
							(manualBody.slim ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim)
								.rotation
						}
						min={-180}
						max={180}
						onChange={(rotation) => {
							const value =
								manualBody.slim ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.slim;
							setToolValue({ next: { ...value, rotation } });
						}}
						{...commonControlProps}
					/>
				</>
			) : null}
			{tool === "zoom" ? (
				<>
					{(["x", "y", "radius"] as const).map((key) => {
						const value =
							manualBody.zoom ?? DEFAULT_MEDIA_PORTRAIT_MANUAL_BODY.zoom;
						const labels = {
							x: isZh ? "中心 X" : "Center X",
							y: isZh ? "中心 Y" : "Center Y",
							radius: isZh ? "半径" : "Radius",
						};
						return (
							<NumberControl
								key={key}
								label={labels[key]}
								value={value[key] * 100}
								min={key === "radius" ? 1 : 0}
								max={key === "radius" ? 50 : 100}
								onChange={(next) =>
									setToolValue({ next: { ...value, [key]: next / 100 } })
								}
								{...commonControlProps}
							/>
						);
					})}
				</>
			) : null}
			{toolReady ? null : (
				<p className="text-[10px] text-muted-foreground">
					{isZh
						? "该原版手动美体包尚未进入本机私有库"
						: "This native manual body package is not cached locally"}
				</p>
			)}
		</div>
	);
}
