import { useRef, useState } from "react";
import {
	ChevronDown,
	CirclePlus,
	FileUp,
	FlaskConical,
	Layers,
	Plus,
	Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parseLutFile } from "@/lib/color/color-lut";
import { cn } from "@/lib/utils";
import type { ColorCubeLut, ColorMultiPassSettings } from "@/types/timeline";
import type { JianyingFilterLabLutSummary } from "@/types/electron";
import { JianyingFilterLab } from "./adjustments/jianying-filter-lab";
import { useAdjustmentLut } from "./adjustments/use-adjustment-lut";

type AdjustmentShelf = "mine" | "lut" | "lab";

export function AdjustmentsView() {
	const fileInput = useRef<HTMLInputElement>(null);
	const [activeShelf, setActiveShelf] = useState<AdjustmentShelf>("mine");
	const {
		activeLut,
		activeMultiPass,
		applyLut,
		applyMultiPass,
		completeLutIntensityInteraction,
		createAdjustment,
		setLutEnabled,
		setMultiPassEnabled,
		target,
		updateLutIntensity,
		updateMultiPassIntensity,
	} = useAdjustmentLut();

	const importLut = async ({ file }: { file: File }) => {
		try {
			const parsed = parseLutFile({
				text: await file.text(),
				fallbackName: file.name,
			});
			applyLut({
				name: parsed.name,
				cube: parsed.cube,
				layerName: `LUT - ${parsed.name}`,
				successMessage: `已导入 ${parsed.name} 到调节层`,
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "无法导入 LUT");
		}
	};

	const applyJianyingMultiPass = ({
		settings,
	}: {
		settings: ColorMultiPassSettings;
	}) => {
		applyMultiPass({ settings });
	};

	const setActiveEffectEnabled = ({ enabled }: { enabled: boolean }) => {
		if (activeMultiPass) {
			setMultiPassEnabled({ enabled });
			return;
		}
		setLutEnabled({ enabled });
	};

	const updateActiveEffectIntensity = ({ value }: { value: number }) => {
		if (activeMultiPass) {
			updateMultiPassIntensity({ value });
			return;
		}
		updateLutIntensity({ value });
	};

	const applyJianyingLut = ({
		name,
		cube,
		skinCube,
		entry,
		localRuntimeReady,
	}: {
		name: string;
		cube: ColorCubeLut;
		skinCube?: ColorCubeLut;
		entry: JianyingFilterLabLutSummary;
		localRuntimeReady?: boolean;
	}) => {
		let successMessage = `已应用 ${name} 到调节层`;
		if (skinCube) {
			successMessage = localRuntimeReady
				? `已应用 ${name} 本机人像渲染到调节层`
				: `已应用 ${name} 双 LUT；当前使用近似肤色蒙版`;
		}
		applyLut({
			name,
			cube,
			skinCube,
			// Only bind the local runtime when it is actually ready: otherwise
			// the stored settings must fall back to skin-tone-v1 so preview and
			// export do not attempt (and force engines for) local rendering.
			...(skinCube && localRuntimeReady
				? { localPortraitResourceId: entry.resourceId }
				: {}),
			layerName: `剪映 - ${name}`,
			successMessage,
		});
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
				<button
					type="button"
					className={cn(
						"mt-1 flex h-7 w-full items-center gap-0.5 rounded-sm px-1 text-left text-[10px] font-medium transition-colors",
						activeShelf === "lab"
							? "bg-foreground/10 text-primary"
							: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
					)}
					onClick={() => setActiveShelf("lab")}
					onKeyDown={(event) => {
						if (event.key === "Escape") event.currentTarget.blur();
					}}
				>
					<FlaskConical className="size-3" />
					<span className="truncate">滤镜实验室</span>
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
				) : activeShelf === "lut" ? (
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
				) : (
					<JianyingFilterLab
						targetName={target?.element.name}
						activeEffect={activeMultiPass ?? activeLut}
						onApply={applyJianyingLut}
						onApplyMultiPass={applyJianyingMultiPass}
						onEffectEnabledChange={setActiveEffectEnabled}
						onEffectIntensityChange={updateActiveEffectIntensity}
						onEffectIntensityCommit={completeLutIntensityInteraction}
					/>
				)}
			</section>
		</div>
	);
}
