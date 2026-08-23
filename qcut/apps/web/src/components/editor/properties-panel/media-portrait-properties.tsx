import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/lib/i18n";
import {
	applyPortraitPreset,
	createPortraitPreset,
	hasPortraitPresetContent,
	loadPortraitPresets,
	persistPortraitPresets,
	type PortraitPresetScope,
} from "@/lib/portrait/portrait-presets";
import type {
	JianyingPortraitAdjustmentControl,
	JianyingPortraitAdjustmentRuntimePackage,
	JianyingPortraitAdjustmentSection,
	JianyingPortraitAdjustmentStatus,
} from "@/types/electron";
import type {
	MediaEnhancements,
	MediaPortraitAdjustments,
} from "@/types/timeline";
import { PropertyGroup, PropertyItemLabel } from "./property-item";
import { PortraitAdjustmentSection } from "./portrait-adjustment-controls";
import { PortraitMakeupControls } from "./portrait-makeup-controls";
import { PortraitPresetControls } from "./portrait-preset-controls";
import { PortraitRuntimeStatus } from "./portrait-runtime-status";
import { NumberControl } from "./visual-property-controls";

type PortraitPanelTab = "face" | "body" | "face-presets" | "body-presets";
type FacePanelTab = "skin" | "face-shape" | "features" | "makeup";

function runtimePackageForControl({
	control,
}: {
	control: JianyingPortraitAdjustmentControl;
}): JianyingPortraitAdjustmentRuntimePackage {
	return control.runtimePackage ?? control.group;
}

function FaceTargetControl({
	adjustments,
	disabled,
	locale,
	onChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	adjustments: MediaPortraitAdjustments;
	disabled: boolean;
	locale: string;
	onChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const value =
		adjustments.faceTarget?.mode === "single"
			? `face-${adjustments.faceTarget.faceId ?? 0}`
			: "all";
	const setTarget = (nextValue: string) => {
		onInteractionStart();
		const faceId = Number(nextValue.slice(5));
		onChange({
			enabled: adjustments.enabled,
			values: adjustments.values,
			...(adjustments.makeup ? { makeup: adjustments.makeup } : {}),
			...(nextValue === "all"
				? {}
				: { faceTarget: { mode: "single" as const, faceId } }),
		});
		onInteractionEnd();
	};
	return (
		<Select value={value} onValueChange={setTarget} disabled={disabled}>
			<SelectTrigger
				className="h-8 w-full text-xs"
				aria-label={locale === "zh" ? "人脸选择" : "Face target"}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">
					{locale === "zh" ? "全部人脸" : "All faces"}
				</SelectItem>
				{Array.from({ length: 10 }, (_, faceId) => (
					<SelectItem key={faceId} value={`face-${faceId}`}>
						{locale === "zh" ? `人脸 ${faceId + 1}` : `Face ${faceId + 1}`}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function MediaPortraitProperties({
	enhancements,
	adjustments,
	onEnhancementsChange,
	onAdjustmentsChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	enhancements: MediaEnhancements;
	adjustments: MediaPortraitAdjustments;
	onEnhancementsChange: (enhancements: MediaEnhancements) => void;
	onAdjustmentsChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const { locale, t } = useTranslation();
	const [activeTab, setActiveTab] = useState<PortraitPanelTab>("face");
	const [activeFaceTab, setActiveFaceTab] = useState<FacePanelTab>("skin");
	const [status, setStatus] = useState<JianyingPortraitAdjustmentStatus | null>(
		null
	);
	const [loading, setLoading] = useState(true);
	const [presets, setPresets] = useState(loadPortraitPresets);
	const [selectedPresetId, setSelectedPresetId] = useState<string>();
	const inspect = useCallback(async ({ refresh }: { refresh: boolean }) => {
		setLoading(true);
		try {
			const next =
				await window.electronAPI?.jianyingPortraitAdjustment?.inspect({
					refresh,
				});
			setStatus(next ?? null);
		} catch (cause) {
			setStatus({
				state: "error",
				message: cause instanceof Error ? cause.message : String(cause),
				provider: "jianying-local-swing-v1",
				available: false,
				offlineReady: false,
				catalog: [],
				packages: [],
				makeupCards: [],
			});
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void inspect({ refresh: false });
	}, [inspect]);
	const controlsBySection = useMemo(
		() =>
			new Map(
				(["skin", "face-shape", "features", "body"] as const).map((section) => [
					section,
					(status?.catalog ?? []).filter(
						(control) => control.section === section
					),
				])
			),
		[status?.catalog]
	);
	const readyPackages = useMemo(
		() =>
			new Set(
				(status?.packages ?? [])
					.filter(({ ready }) => ready)
					.map(({ runtimePackage }) => runtimePackage)
			),
		[status?.packages]
	);
	const isControlReady = useCallback(
		(control: JianyingPortraitAdjustmentControl) =>
			readyPackages.has(runtimePackageForControl({ control })),
		[readyPackages]
	);
	const nativeDisabled = loading || !status?.available;
	const presetScope: PortraitPresetScope = activeTab.startsWith("body")
		? "body"
		: "face";
	const scopedPresets = useMemo(
		() => presets.filter((preset) => preset.scope === presetScope),
		[presetScope, presets]
	);
	useEffect(() => {
		if (
			selectedPresetId &&
			!scopedPresets.some((preset) => preset.id === selectedPresetId)
		) {
			setSelectedPresetId(undefined);
		}
	}, [scopedPresets, selectedPresetId]);

	const savePreset = (name?: string) => {
		const preset = createPortraitPreset({
			adjustments,
			name,
			scope: presetScope,
		});
		if (!hasPortraitPresetContent({ preset })) {
			toast.error(
				locale === "zh" ? "请先调整至少一个参数" : "Adjust a value first"
			);
			return;
		}
		const next = [preset, ...presets];
		persistPortraitPresets({ presets: next });
		setPresets(next);
		setSelectedPresetId(preset.id);
		toast.success(
			locale === "zh" ? `已保存 ${preset.name}` : `Saved ${preset.name}`
		);
	};
	const applySelectedPreset = () => {
		const preset = scopedPresets.find(
			(candidate) => candidate.id === selectedPresetId
		);
		if (!preset) return;
		onInteractionStart();
		onAdjustmentsChange(applyPortraitPreset({ adjustments, preset }));
		onInteractionEnd();
		toast.success(
			locale === "zh" ? `已应用 ${preset.name}` : `Applied ${preset.name}`
		);
	};
	const deleteSelectedPreset = () => {
		const next = presets.filter((preset) => preset.id !== selectedPresetId);
		persistPortraitPresets({ presets: next });
		setPresets(next);
		setSelectedPresetId(undefined);
	};
	const sectionProps = (section: JianyingPortraitAdjustmentSection) => ({
		section,
		controls: controlsBySection.get(section) ?? [],
		adjustments,
		disabled: nativeDisabled || !adjustments.enabled,
		locale,
		isControlReady,
		onChange: onAdjustmentsChange,
		onInteractionStart,
		onInteractionEnd,
	});

	return (
		<PropertyGroup title={t("mediaProperties.tab.portrait")} defaultExpanded>
			<div className="space-y-4" data-testid="jianying-portrait-adjustments">
				<PortraitRuntimeStatus
					status={status}
					loading={loading}
					locale={locale}
					onRefresh={() => void inspect({ refresh: true })}
				/>
				<div className="flex items-center justify-between">
					<PropertyItemLabel>
						{locale === "zh" ? "原版美颜美体" : "Native retouch"}
					</PropertyItemLabel>
					<Switch
						checked={adjustments.enabled}
						disabled={nativeDisabled}
						aria-label={
							locale === "zh"
								? "启用原版美颜美体"
								: "Enable native portrait retouch"
						}
						onCheckedChange={(enabled) =>
							onAdjustmentsChange({ ...adjustments, enabled })
						}
					/>
				</div>
				<Tabs
					value={activeTab}
					onValueChange={(value) => setActiveTab(value as PortraitPanelTab)}
				>
					<TabsList className="grid h-8 w-full grid-cols-4 gap-0.5 rounded-sm p-0.5">
						<TabsTrigger value="face" className="px-1 text-[10px]">
							{locale === "zh" ? "美颜" : "Retouch"}
						</TabsTrigger>
						<TabsTrigger value="body" className="px-1 text-[10px]">
							{locale === "zh" ? "美体" : "Body"}
						</TabsTrigger>
						<TabsTrigger value="face-presets" className="px-1 text-[10px]">
							{locale === "zh" ? "美颜预设" : "Face presets"}
						</TabsTrigger>
						<TabsTrigger value="body-presets" className="px-1 text-[10px]">
							{locale === "zh" ? "美体预设" : "Body presets"}
						</TabsTrigger>
					</TabsList>
					<TabsContent value="face" className="mt-4 space-y-4">
						<FaceTargetControl
							adjustments={adjustments}
							disabled={nativeDisabled || !adjustments.enabled}
							locale={locale}
							onChange={onAdjustmentsChange}
							onInteractionStart={onInteractionStart}
							onInteractionEnd={onInteractionEnd}
						/>
						<Tabs
							value={activeFaceTab}
							onValueChange={(value) => setActiveFaceTab(value as FacePanelTab)}
						>
							<TabsList className="grid h-8 w-full grid-cols-4 gap-0.5 rounded-sm p-0.5">
								<TabsTrigger value="skin" className="px-1 text-[10px]">
									{locale === "zh" ? "皮肤" : "Skin"}
								</TabsTrigger>
								<TabsTrigger value="face-shape" className="px-1 text-[10px]">
									{locale === "zh" ? "脸型" : "Face"}
								</TabsTrigger>
								<TabsTrigger value="features" className="px-1 text-[10px]">
									{locale === "zh" ? "五官" : "Features"}
								</TabsTrigger>
								<TabsTrigger value="makeup" className="px-1 text-[10px]">
									{locale === "zh" ? "美妆" : "Makeup"}
								</TabsTrigger>
							</TabsList>
							<TabsContent value="skin" className="mt-4 space-y-5">
								<div className="space-y-4 border-b border-border/70 pb-4">
									<NumberControl
										label={t("mediaProperties.relight")}
										value={enhancements.relight}
										min={-100}
										max={100}
										onChange={(relight) =>
											onEnhancementsChange({ ...enhancements, relight })
										}
										onInteractionStart={onInteractionStart}
										onInteractionEnd={onInteractionEnd}
									/>
									<NumberControl
										label={t("mediaProperties.beauty")}
										value={enhancements.beauty}
										min={0}
										max={100}
										onChange={(beauty) =>
											onEnhancementsChange({ ...enhancements, beauty })
										}
										onInteractionStart={onInteractionStart}
										onInteractionEnd={onInteractionEnd}
									/>
								</div>
								<PortraitAdjustmentSection {...sectionProps("skin")} />
							</TabsContent>
							<TabsContent value="face-shape" className="mt-4">
								<PortraitAdjustmentSection {...sectionProps("face-shape")} />
							</TabsContent>
							<TabsContent value="features" className="mt-4">
								<PortraitAdjustmentSection {...sectionProps("features")} />
							</TabsContent>
							<TabsContent value="makeup" className="mt-4">
								<PortraitMakeupControls
									cards={status?.makeupCards ?? []}
									adjustments={adjustments}
									disabled={nativeDisabled || !adjustments.enabled}
									locale={locale}
									onChange={onAdjustmentsChange}
									onInteractionStart={onInteractionStart}
									onInteractionEnd={onInteractionEnd}
								/>
							</TabsContent>
						</Tabs>
					</TabsContent>
					<TabsContent value="body" className="mt-4">
						<PortraitAdjustmentSection {...sectionProps("body")} />
					</TabsContent>
					{(["face-presets", "body-presets"] as const).map((tab) => (
						<TabsContent key={tab} value={tab} className="mt-4">
							<PortraitPresetControls
								scope={tab === "body-presets" ? "body" : "face"}
								presets={scopedPresets}
								selectedPresetId={selectedPresetId}
								disabled={nativeDisabled}
								locale={locale}
								onSelectedPresetChange={setSelectedPresetId}
								onApplyPreset={applySelectedPreset}
								onDeletePreset={deleteSelectedPreset}
								onSavePreset={savePreset}
							/>
						</TabsContent>
					))}
				</Tabs>
			</div>
		</PropertyGroup>
	);
}
