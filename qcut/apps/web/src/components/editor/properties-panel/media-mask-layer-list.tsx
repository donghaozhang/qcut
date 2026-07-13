import {
	ChevronDown,
	ChevronUp,
	Copy,
	Eye,
	EyeOff,
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
import { maskIcon } from "./media-mask-shapes";

export function MediaMaskLayerList({
	masks,
	selectedMaskId,
	onChange,
	onSelect,
}: {
	masks: MediaMask[];
	selectedMaskId: string | null;
	onChange: (masks: MediaMask[], history?: boolean) => void;
	onSelect: (maskId: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			{masks.map((mask, index) => {
				const Icon = maskIcon({ type: mask.type });
				const selected = mask.id === selectedMaskId;
				const maskId = mask.id ?? `mask-${index + 1}`;
				return (
					<div
						key={maskId}
						className={cn(
							"rounded-md border p-1.5",
							selected ? "border-primary/70 bg-primary/5" : "border-border"
						)}
					>
						<div className="flex items-center gap-1">
							<button
								type="button"
								className="flex size-7 shrink-0 items-center justify-center rounded-sm hover:bg-accent"
								onClick={() => onSelect(maskId)}
								aria-label={`选择${mask.name ?? `蒙版 ${index + 1}`}`}
							>
								<Icon className="size-4" />
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
								className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs shadow-none"
							/>
							<MaskIconButton
								label={mask.enabled === false ? "显示蒙版" : "隐藏蒙版"}
								onClick={() =>
									onChange(
										updateMediaMaskInStack({
											masks,
											maskId,
											updates: { enabled: mask.enabled === false },
										})
									)
								}
							>
								{mask.enabled === false ? (
									<EyeOff className="size-3.5" />
								) : (
									<Eye className="size-3.5" />
								)}
							</MaskIconButton>
							<MaskIconButton
								label="删除蒙版"
								onClick={() => {
									const next = removeMediaMask(masks, maskId);
									onChange(next);
									if (!selected) return;
									const fallback = next[Math.min(index, next.length - 1)];
									if (fallback?.id) onSelect(fallback.id);
								}}
							>
								<Trash2 className="size-3.5" />
							</MaskIconButton>
						</div>
						{selected ? (
							<div className="mt-1.5 flex items-center gap-1 border-t border-border/70 pt-1.5">
								<Select
									value={index === 0 ? "add" : (mask.blendMode ?? "add")}
									onValueChange={(blendMode) =>
										onChange(
											updateMediaMaskInStack({
												masks,
												maskId,
												updates: {
													blendMode: blendMode as MediaMaskBlendMode,
												},
											})
										)
									}
									disabled={index === 0}
								>
									<SelectTrigger
										className="h-7 min-w-0 flex-1 text-[11px]"
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
									label="上移蒙版"
									disabled={index === 0}
									onClick={() =>
										onChange(
											moveMediaMask({ masks, maskId, toIndex: index - 1 })
										)
									}
								>
									<ChevronUp className="size-3.5" />
								</MaskIconButton>
								<MaskIconButton
									label="下移蒙版"
									disabled={index === masks.length - 1}
									onClick={() =>
										onChange(
											moveMediaMask({ masks, maskId, toIndex: index + 1 })
										)
									}
								>
									<ChevronDown className="size-3.5" />
								</MaskIconButton>
								<MaskIconButton
									label="复制蒙版"
									onClick={() => {
										const newId = `mask-${generateUUID()}`;
										onChange(duplicateMediaMask({ masks, maskId, newId }));
										onSelect(newId);
									}}
								>
									<Copy className="size-3.5" />
								</MaskIconButton>
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
