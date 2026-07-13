import { useRef } from "react";
import { ImagePlus, LoaderCircle, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/stores/media/media-store";
import {
	analyzeColorFrame,
	captureMediaColorFrame,
	captureReferenceImage,
	suggestAutoColor,
	suggestColorMatch,
} from "@/lib/color/color-analysis";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	removeColorKeyframes,
} from "@/lib/color/color-properties";
import {
	ColorKeyframedControl,
	ColorModuleSection,
	ColorToggleRow,
} from "./color-property-controls";
import type { ColorSettingsEditorBindings } from "./color-properties-types";

export function ColorSmartSettingsPanel({
	bindings,
	mediaItem,
	sourceTime,
}: {
	bindings: ColorSettingsEditorBindings;
	mediaItem: MediaItem | undefined;
	sourceTime: number;
}) {
	const referenceInput = useRef<HTMLInputElement>(null);
	const { settings, onSettingsChange } = bindings;
	const analyzing = settings.smart.status === "analyzing";
	const beginAnalysis = () =>
		onSettingsChange({
			...settings,
			smart: {
				...settings.smart,
				enabled: true,
				status: "analyzing",
				error: undefined,
			},
		});
	const finishWithError = (error: unknown) => {
		const message = error instanceof Error ? error.message : "色彩分析失败";
		onSettingsChange({
			...settings,
			smart: { ...settings.smart, status: "error", error: message },
		});
		toast.error(message);
	};
	const currentStatistics = async () => {
		if (!mediaItem) throw new Error("媒体源不可用");
		return analyzeColorFrame({
			imageData: await captureMediaColorFrame({ mediaItem, sourceTime }),
		});
	};
	const runAutoColor = async () => {
		beginAnalysis();
		try {
			const correction = suggestAutoColor({
				statistics: await currentStatistics(),
			});
			onSettingsChange({
				...settings,
				smart: {
					...settings.smart,
					enabled: true,
					status: "ready",
					correction,
					referenceName: undefined,
					error: undefined,
				},
			});
		} catch (error) {
			finishWithError(error);
		}
	};
	const matchReference = async (file: File) => {
		beginAnalysis();
		try {
			const [source, referenceData] = await Promise.all([
				currentStatistics(),
				captureReferenceImage(file),
			]);
			const reference = analyzeColorFrame({ imageData: referenceData });
			onSettingsChange({
				...settings,
				smart: {
					...settings.smart,
					enabled: true,
					status: "ready",
					correction: suggestColorMatch({ source, reference }),
					referenceName: file.name,
					error: undefined,
				},
			});
		} catch (error) {
			finishWithError(error);
		}
	};
	return (
		<ColorModuleSection
			title="智能校正"
			enabled={settings.smart.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					smart: { ...settings.smart, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeColorKeyframes({
						settings,
						properties: ["smart.intensity"],
					}),
					smart: { ...DEFAULT_MEDIA_COLOR_SETTINGS.smart },
				})
			}
			testId="color-module-smart"
		>
			<div className="grid grid-cols-2 gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={analyzing || !mediaItem}
					onClick={() => void runAutoColor()}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ")
							event.currentTarget.click();
					}}
				>
					{analyzing ? (
						<LoaderCircle className="size-3.5 animate-spin" />
					) : (
						<WandSparkles className="size-3.5" />
					)}
					自动校色
				</Button>
				<input
					ref={referenceInput}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void matchReference(file);
						event.target.value = "";
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={analyzing || !mediaItem}
					onClick={() => referenceInput.current?.click()}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ")
							referenceInput.current?.click();
					}}
				>
					<ImagePlus className="size-3.5" />
					参考图匹配
				</Button>
			</div>
			{settings.smart.referenceName ? (
				<p className="truncate text-[10px] text-muted-foreground">
					{settings.smart.referenceName}
				</p>
			) : null}
			<ColorToggleRow
				label="自动白平衡"
				checked={settings.smart.autoWhiteBalance}
				onCheckedChange={(autoWhiteBalance) =>
					onSettingsChange({
						...settings,
						smart: { ...settings.smart, autoWhiteBalance },
					})
				}
			/>
			<ColorToggleRow
				label="自动影调"
				checked={settings.smart.autoTone}
				onCheckedChange={(autoTone) =>
					onSettingsChange({
						...settings,
						smart: { ...settings.smart, autoTone },
					})
				}
			/>
			<ColorKeyframedControl property="smart.intensity" bindings={bindings} />
		</ColorModuleSection>
	);
}
