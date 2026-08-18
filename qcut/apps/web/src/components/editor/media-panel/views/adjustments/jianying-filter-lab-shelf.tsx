import type { ColorCubeLut, ColorMultiPassSettings } from "@/types/timeline";
import type { JianyingFilterLabLutSummary } from "@/types/electron";
import { JianyingFilterLab } from "./jianying-filter-lab";
import { useAdjustmentLut } from "./use-adjustment-lut";

/**
 * The filter lab plus its adjustment-layer apply wiring, as one mountable
 * unit. The lab is surfaced from the 滤镜 panel, but applying a LUT still
 * writes an adjustment layer — this shelf owns that binding so the host
 * panel does not have to know about adjustment semantics.
 */
export function JianyingFilterLabShelf() {
	const {
		activeLut,
		activeMultiPass,
		applyLut,
		applyMultiPass,
		completeLutIntensityInteraction,
		setLutEnabled,
		setMultiPassEnabled,
		target,
		updateLutIntensity,
		updateMultiPassIntensity,
	} = useAdjustmentLut();

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
		<JianyingFilterLab
			targetName={target?.element.name}
			activeEffect={activeMultiPass ?? activeLut}
			onApply={applyJianyingLut}
			onApplyMultiPass={({ settings }) => applyMultiPass({ settings })}
			onEffectEnabledChange={setActiveEffectEnabled}
			onEffectIntensityChange={updateActiveEffectIntensity}
			onEffectIntensityCommit={completeLutIntensityInteraction}
		/>
	);
}
