import { useMemo, useRef, useState } from "react";
import {
	ChevronDown,
	CirclePlus,
	FileUp,
	Layers,
	Plus,
	Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	buildLegacyColorAdjustments,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";
import { parseLutFile } from "@/lib/color/color-lut";
import { cn } from "@/lib/utils";
import { addAdjustmentLayer } from "@/lib/timeline/adjustment-layer";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { AdjustmentElement } from "@/types/timeline";

type AdjustmentShelf = "mine" | "lut";

interface SelectedAdjustmentTarget {
	element: AdjustmentElement;
	trackId: string;
}

interface AdjustmentDestination {
	element?: AdjustmentElement;
	elementId: string;
	trackId: string;
}

function selectedAdjustmentTarget({
	selectedElements,
	tracks,
}: {
	selectedElements: ReturnType<
		typeof useTimelineStore.getState
	>["selectedElements"];
	tracks: ReturnType<typeof useTimelineStore.getState>["tracks"];
}): SelectedAdjustmentTarget | null {
	for (const selection of selectedElements) {
		const track = tracks.find(
			(candidate) => candidate.id === selection.trackId
		);
		const element = track?.elements.find(
			(candidate) => candidate.id === selection.elementId
		);
		if (element?.type === "adjustment") {
			return {
				element: element as AdjustmentElement,
				trackId: selection.trackId,
			};
		}
	}
	return null;
}

export function AdjustmentsView() {
	const fileInput = useRef<HTMLInputElement>(null);
	const [activeShelf, setActiveShelf] = useState<AdjustmentShelf>("mine");
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const insertTrackAt = useTimelineStore((state) => state.insertTrackAt);
	const addElementToTrack = useTimelineStore(
		(state) => state.addElementToTrack
	);
	const getTotalDuration = useTimelineStore((state) => state.getTotalDuration);
	const updateAdjustmentElement = useTimelineStore(
		(state) => state.updateAdjustmentElement
	);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const target = useMemo(
		() => selectedAdjustmentTarget({ selectedElements, tracks }),
		[selectedElements, tracks]
	);

	const createAdjustment = ({
		name = "自定义调节",
	}: {
		name?: string;
	} = {}) => {
		const created = addAdjustmentLayer({
			timeline: { tracks, insertTrackAt, addElementToTrack, getTotalDuration },
			currentTime,
			name,
		});
		if (!created.elementId) {
			toast.error("无法创建调节层");
			return null;
		}
		toast.success("已新建调节层");
		return created;
	};

	const importLut = async ({ file }: { file: File }) => {
		try {
			const parsed = parseLutFile({
				text: await file.text(),
				fallbackName: file.name,
			});
			const created = target
				? null
				: createAdjustment({ name: `LUT - ${parsed.name}` });
			const destination: AdjustmentDestination | null = target
				? {
						element: target.element,
						elementId: target.element.id,
						trackId: target.trackId,
					}
				: created?.elementId
					? {
							elementId: created.elementId,
							trackId: created.trackId,
						}
					: null;
			if (!destination) return;
			const settings = normalizeMediaColorSettings({
				element: destination.element ?? {},
			});
			const next = {
				...settings,
				lut: {
					...settings.lut,
					enabled: true,
					presetId: "custom" as const,
					name: parsed.name,
					cube: parsed.cube,
				},
			};
			updateAdjustmentElement(
				destination.trackId,
				destination.elementId,
				{
					color: next,
					adjustments: buildLegacyColorAdjustments({ settings: next }),
				},
				Boolean(destination.element)
			);
			toast.success(`已导入 ${parsed.name} 到调节层`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "无法导入 LUT");
		}
	};

	return (
		<div className="flex h-full min-h-0" data-testid="adjustments-view">
			<aside className="w-[92px] shrink-0 border-r border-border/50 p-1.5">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					className="mb-2 h-7 w-full justify-start gap-1 rounded-sm px-2 text-[11px] text-primary"
					onClick={() => createAdjustment()}
				>
					<Plus className="size-3" />
					新建调节
				</Button>
				<button
					type="button"
					className={cn(
						"mb-1 flex h-7 w-full items-center justify-between rounded-sm px-2 text-left text-[11px] font-medium transition-colors",
						activeShelf === "mine"
							? "bg-foreground/10 text-foreground"
							: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
					)}
					onClick={() => setActiveShelf("mine")}
				>
					<span>我的</span>
					<ChevronDown className="size-3" />
				</button>
				<button
					type="button"
					className={cn(
						"flex h-7 w-full items-center rounded-sm px-2 text-left text-[11px] font-medium transition-colors",
						activeShelf === "lut"
							? "bg-foreground/10 text-primary"
							: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
					)}
					onClick={() => setActiveShelf("lut")}
				>
					LUT
				</button>
			</aside>

			<section className="min-w-0 flex-1 overflow-y-auto p-3">
				{activeShelf === "mine" ? (
					<div className="space-y-3">
						<button
							type="button"
							className="group relative flex h-[88px] w-[88px] flex-col items-center justify-center rounded-md bg-card text-center text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							onClick={() => createAdjustment()}
							aria-label="添加自定义调节到时间线"
						>
							<span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground opacity-90 transition-opacity group-hover:opacity-100">
								<Plus className="size-3" />
							</span>
							<Layers className="mb-2 size-4 text-primary" />
							自定义调节
						</button>
						<div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border/70 px-5 text-center text-xs text-muted-foreground">
							点击卡片创建调节轨，参数会显示在右侧属性面板。
						</div>
					</div>
				) : (
					<div className="space-y-3">
						<input
							ref={fileInput}
							type="file"
							accept=".cube,.3dl,text/plain"
							aria-label="选择 LUT 文件"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void importLut({ file });
								event.target.value = "";
							}}
						/>
						<button
							type="button"
							className="flex h-[134px] w-full flex-col items-center justify-center rounded-md bg-card text-center transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
							aria-label="导入 LUT"
							onClick={() => fileInput.current?.click()}
						>
							<span className="mb-2 flex items-center gap-2 text-sm font-medium">
								<CirclePlus className="size-4 text-primary" />
								导入
							</span>
							<span className="text-xs text-muted-foreground">
								支持 .cube/.3dl
							</span>
						</button>
						<div className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground">
							<FileUp className="mt-0.5 size-3.5 shrink-0" />
							<span>
								{target
									? `将 LUT 应用到：${target.element.name}`
									: "未选中调节层时，上传会自动创建一条调节轨。"}
							</span>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8"
							onClick={() => fileInput.current?.click()}
						>
							<Upload className="size-3.5" />
							选择 LUT 文件
						</Button>
					</div>
				)}
			</section>
		</div>
	);
}
