import {
	ChevronDown,
	ChevronUp,
	Copy,
	Eye,
	EyeOff,
	Plus,
	Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn, generateUUID } from "@/lib/utils";
import {
	duplicateMediaMask,
	moveMediaMask,
	removeMediaMask,
	updateMediaMaskInStack,
} from "@/lib/video/media-mask-stack";
import type { MediaMask, MediaMaskBlendMode } from "@/types/timeline";
import { MaskIconButton } from "./media-mask-controls";
import { MASK_SHAPES, maskIcon } from "./media-mask-shapes";
import { PropertyItemLabel } from "./property-item";

export function MediaMaskLayerList({
	masks,
	selectedMaskId,
	onChange,
	onSelect,
	onAdd,
}: {
	masks: MediaMask[];
	selectedMaskId: string | null;
	onChange: (masks: MediaMask[], history?: boolean) => void;
	onSelect: (maskId: string) => void;
	onAdd: () => void;
}) {
	const selectedIndex = masks.findIndex((mask) => mask.id === selectedMaskId);
	const selectedMask = masks[selectedIndex];
	const selectedMaskIdValue = selectedMask?.id ?? "";

	const removeSelectedMask = () => {
		if (!selectedMask) return;
		const next = removeMediaMask(masks, selectedMaskIdValue);
		onChange(next);
		const fallback = next[Math.min(selectedIndex, next.length - 1)];
		if (fallback?.id) onSelect(fallback.id);
	};

	return (
		<div className="space-y-3" data-testid="media-mask-layer-list">
			<div className="flex min-w-0 items-center gap-2">
				<div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
					{masks.map((mask, index) => {
						const Icon = maskIcon({ type: mask.type });
						const selected = mask.id === selectedMaskId;
						const maskId = mask.id ?? `mask-${index + 1}`;
						const shapeLabel =
							MASK_SHAPES.find((shape) => shape.type === mask.type)?.label ??
							"蒙版";
						return (
							<div
								key={maskId}
								className={cn(
									"flex h-8 min-w-[132px] shrink-0 items-center rounded-sm border bg-muted/35 px-1",
									selected
										? "border-cyan-400/80 bg-cyan-400/5"
										: "border-border/70"
								)}
							>
								<button
									type="button"
									className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
									onClick={() => onSelect(maskId)}
									onKeyDown={(event) => {
										if (event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										onSelect(maskId);
									}}
									aria-label={`选择${mask.name ?? `蒙版 ${index + 1}`}`}
								>
									<Icon className="size-3.5" />
								</button>
								<Input
									aria-label="蒙版名称"
									value={mask.name ?? `蒙版 ${index + 1}`}
									onFocus={() => onSelect(maskId)}
									onChange={(event) =>
										onChange(
											updateMediaMaskInStack({
												masks,
												maskId,
												updates: { name: event.target.value },
											}),
											false
										)
									}
									className="h-7 min-w-12 flex-1 border-0 bg-transparent px-0.5 text-[11px] shadow-none"
								/>
								<span className="shrink-0 pr-1 text-[10px] text-muted-foreground">
									{shapeLabel}
								</span>
							</div>
						);
					})}
				</div>
				<button
					type="button"
					className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/35 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
					onClick={onAdd}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						onAdd();
					}}
					aria-label="新建蒙版"
					title="新建蒙版"
				>
					<Plus className="size-4" />
				</button>
			</div>

			{selectedMask ? (
				<div className="border-t border-border/70 pt-3">
					<div className="flex items-center justify-between gap-2">
						<PropertyItemLabel>蒙版参数</PropertyItemLabel>
						<div className="flex items-center gap-0.5">
							<Select
								value={
									selectedIndex === 0
										? "add"
										: (selectedMask.blendMode ?? "add")
								}
								onValueChange={(blendMode) =>
									onChange(
										updateMediaMaskInStack({
											masks,
											maskId: selectedMaskIdValue,
											updates: {
												blendMode: blendMode as MediaMaskBlendMode,
											},
										})
									)
								}
								disabled={selectedIndex === 0}
							>
								<SelectTrigger
									className="h-7 w-[72px] px-2 text-[10px]"
									aria-label="蒙版混合方式"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="add">相加</SelectItem>
									<SelectItem value="subtract">相减</SelectItem>
									<SelectItem value="intersect">交集</SelectItem>
								</SelectContent>
							</Select>
							<MaskIconButton
								label={selectedMask.enabled === false ? "显示蒙版" : "隐藏蒙版"}
								onClick={() =>
									onChange(
										updateMediaMaskInStack({
											masks,
											maskId: selectedMaskIdValue,
											updates: {
												enabled: selectedMask.enabled === false,
											},
										})
									)
								}
							>
								{selectedMask.enabled === false ? (
									<EyeOff className="size-3.5" />
								) : (
									<Eye className="size-3.5" />
								)}
							</MaskIconButton>
							<MaskIconButton
								label="上移蒙版"
								disabled={selectedIndex === 0}
								onClick={() =>
									onChange(
										moveMediaMask({
											masks,
											maskId: selectedMaskIdValue,
											toIndex: selectedIndex - 1,
										})
									)
								}
							>
								<ChevronUp className="size-3.5" />
							</MaskIconButton>
							<MaskIconButton
								label="下移蒙版"
								disabled={selectedIndex === masks.length - 1}
								onClick={() =>
									onChange(
										moveMediaMask({
											masks,
											maskId: selectedMaskIdValue,
											toIndex: selectedIndex + 1,
										})
									)
								}
							>
								<ChevronDown className="size-3.5" />
							</MaskIconButton>
							<MaskIconButton
								label="复制蒙版"
								onClick={() => {
									const newId = `mask-${generateUUID()}`;
									onChange(
										duplicateMediaMask({
											masks,
											maskId: selectedMaskIdValue,
											newId,
										})
									);
									onSelect(newId);
								}}
							>
								<Copy className="size-3.5" />
							</MaskIconButton>
							<MaskIconButton label="删除蒙版" onClick={removeSelectedMask}>
								<Trash2 className="size-3.5" />
							</MaskIconButton>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
