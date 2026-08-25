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
	captureJianyingPortraitDetectionFrame,
	detectJianyingPortraitFaces,
	type PortraitFaceDetection,
} from "@/lib/portrait/jianying-portrait-face-detection";
import { usePortraitFaceStore } from "@/stores/editor/portrait-face-store";
import {
	applyPortraitAdjustments,
	applyWholeFrameBodyAdjustments,
	portraitScopeForDetectedFace,
	projectPortraitAdjustments,
	rebindPortraitAdjustments,
	type PortraitEditScope,
} from "@/lib/portrait/portrait-face-scope";
import { capturePortraitPresetThumbnail } from "@/lib/portrait/portrait-preset-thumbnail";
import {
	applyPortraitPreset,
	createPortraitPreset,
	hasPortraitPresetContent,
	loadPortraitPresets,
	overwritePortraitPreset,
	parsePortraitPresetExport,
	persistPortraitPresets,
	renamePortraitPreset,
	serializePortraitPresets,
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
	MediaPortraitManualBodyTool,
} from "@/types/timeline";
import { PropertyGroup, PropertyItemLabel } from "./property-item";
import { PortraitAdjustmentSection } from "./portrait-adjustment-controls";
import { PortraitCollapsibleGroup } from "./portrait-collapsible-group";
import { PortraitMakeupControls } from "./portrait-makeup-controls";
import { PortraitManualBodyControls } from "./portrait-manual-body-controls";
import { PortraitManualRetouchControls } from "./portrait-manual-retouch-controls";
import { PortraitPresetControls } from "./portrait-preset-controls";
import { PortraitRuntimeStatus } from "./portrait-runtime-status";
import { NumberControl } from "./visual-property-controls";

type PortraitPanelTab = "face" | "body" | "face-presets" | "body-presets";
type FacePanelSection =
	| "skin"
	| "face-shape"
	| "features"
	| "makeup"
	| "manual";
type BodyPanelTab = "automatic" | "manual";

const INITIAL_FACE_SECTION_VISIBILITY: Record<FacePanelSection, boolean> = {
	skin: false,
	"face-shape": false,
	features: false,
	makeup: false,
	manual: false,
};

function runtimePackageForControl({
	control,
}: {
	control: JianyingPortraitAdjustmentControl;
}): JianyingPortraitAdjustmentRuntimePackage {
	return control.runtimePackage ?? control.group;
}

/**
 * Face picker. It only lists observations returned by the native runtime;
 * fabricated ordinal ids cannot establish a safe person binding.
 */
function FaceTargetControl({
	adjustments,
	detection,
	detectionError,
	detecting,
	scope,
	disabled,
	locale,
	onScopeChange,
	onDetect,
}: {
	adjustments: MediaPortraitAdjustments;
	detection: PortraitFaceDetection | null;
	detectionError: string | null;
	detecting: boolean;
	scope: PortraitEditScope;
	disabled: boolean;
	locale: string;
	onScopeChange: (scope: PortraitEditScope) => void;
	onDetect: () => void;
}) {
	const isZh = locale === "zh";
	const value =
		scope.mode === "all" ? "all" : `person-${scope.personBindingId}`;
	const configuredBindingIds = new Set(
		(adjustments.faces ?? []).flatMap((face) =>
			face.personBindingId ? [face.personBindingId] : []
		)
	);
	const detected = detection?.faces ?? [];
	const appliedLimit = detection?.appliedFaceLimit ?? 5;
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1">
				<Select
					value={value}
					onValueChange={(next) => {
						if (next === "all") {
							onScopeChange({ mode: "all" });
							return;
						}
						const face = detected.find(
							(candidate) =>
								candidate.personBindingId === next.slice("person-".length)
						);
						if (!face || !detection) return;
						onScopeChange(
							portraitScopeForDetectedFace({
								face,
								frameNumber: detection.frameNumber,
							})
						);
					}}
					disabled={disabled}
				>
					<SelectTrigger
						className="h-8 w-full text-xs"
						aria-label={isZh ? "人脸选择" : "Face target"}
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							{isZh ? "全部人脸" : "All faces"}
						</SelectItem>
						{detected.map((face, index) => (
							<SelectItem
								key={face.personBindingId}
								value={`person-${face.personBindingId}`}
							>
								{`${isZh ? "人脸" : "Face"} ${index + 1}`}
								{index >= appliedLimit
									? isZh
										? "（不生效）"
										: " (inert)"
									: ""}
								{configuredBindingIds.has(face.personBindingId) ? " ●" : ""}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<button
					type="button"
					className="h-8 shrink-0 rounded border px-2 text-xs disabled:opacity-50"
					onClick={onDetect}
					disabled={disabled || detecting}
					title={isZh ? "识别画面中的人脸" : "Detect faces in the frame"}
				>
					{detecting ? (isZh ? "识别中" : "…") : isZh ? "识别" : "Detect"}
				</button>
			</div>
			{detectionError ? (
				<p className="text-[10px] text-muted-foreground">{detectionError}</p>
			) : null}
			{detected.length > appliedLimit ? (
				<p className="text-[10px] text-muted-foreground">
					{isZh
						? `本机运行时同时最多对 ${appliedLimit} 张人脸生效`
						: `The runtime applies effects to at most ${appliedLimit} faces`}
				</p>
			) : null}
		</div>
	);
}

export function MediaPortraitProperties({
	elementId,
	currentFrame,
	enhancements,
	adjustments,
	onEnhancementsChange,
	onAdjustmentsChange,
	onInteractionStart,
	onInteractionEnd,
}: {
	elementId: string;
	currentFrame: number;
	enhancements: MediaEnhancements;
	adjustments: MediaPortraitAdjustments;
	onEnhancementsChange: (enhancements: MediaEnhancements) => void;
	onAdjustmentsChange: (adjustments: MediaPortraitAdjustments) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}) {
	const { locale, t } = useTranslation();
	const [activeTab, setActiveTab] = useState<PortraitPanelTab>("face");
	const [openFaceSections, setOpenFaceSections] = useState(() => ({
		...INITIAL_FACE_SECTION_VISIBILITY,
	}));
	const [activeBodyTab, setActiveBodyTab] = useState<BodyPanelTab>("automatic");
	const [status, setStatus] = useState<JianyingPortraitAdjustmentStatus | null>(
		null
	);
	const [loading, setLoading] = useState(true);
	const [presets, setPresets] = useState(loadPortraitPresets);
	const [selectedPresetId, setSelectedPresetId] = useState<string>();
	// Face selection and detection are transient view state: they describe the
	// current frame, never the project, so they are deliberately not persisted.
	const scope = usePortraitFaceStore((state) => state.scope);
	const setScope = usePortraitFaceStore((state) => state.setScope);
	const detection = usePortraitFaceStore((state) => state.detection);
	const setDetection = usePortraitFaceStore((state) => state.setDetection);
	const [detectionError, setDetectionError] = useState<string | null>(null);
	const [detecting, setDetecting] = useState(false);
	const resetFaceState = usePortraitFaceStore((state) => state.reset);
	// Detection track ids belong to one source frame and must not survive seeks.
	// biome-ignore lint/correctness/useExhaustiveDependencies: frame coordinates are intentional reset triggers
	useEffect(() => {
		resetFaceState();
		setDetectionError(null);
	}, [currentFrame, elementId, resetFaceState]);
	const detectFaces = useCallback(async () => {
		setDetecting(true);
		setDetectionError(null);
		try {
			const frame = captureJianyingPortraitDetectionFrame({ elementId });
			if (!frame) {
				throw new Error(
					locale === "zh" ? "预览画面尚未就绪" : "The preview is not ready"
				);
			}
			const next = await detectJianyingPortraitFaces({
				frameNumber: currentFrame,
				personBindings: (adjustments.faces ?? []).flatMap((face) =>
					face.personBindingId && face.bindingAnchor
						? [
								{
									personBindingId: face.personBindingId,
									anchor: face.bindingAnchor,
								},
							]
						: []
				),
				source: frame.source,
				sourceKey: frame.sourceKey,
			});
			setDetection(next);
			const rebound = rebindPortraitAdjustments({
				adjustments,
				faces: next.faces,
				frameNumber: currentFrame,
			});
			if (rebound !== adjustments) onAdjustmentsChange(rebound);
			if (next.faces.length === 0) {
				setDetectionError(
					locale === "zh" ? "画面中未识别到人脸" : "No faces in this frame"
				);
			} else if (next.unmatchedPersonBindingIds.length > 0) {
				setDetectionError(
					locale === "zh"
						? `有 ${next.unmatchedPersonBindingIds.length} 个已保存人物无法安全匹配，请重新选择`
						: `${next.unmatchedPersonBindingIds.length} saved people could not be matched safely`
				);
			}
		} catch (cause) {
			setDetection(null);
			setDetectionError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setDetecting(false);
		}
	}, [
		adjustments,
		currentFrame,
		elementId,
		locale,
		onAdjustmentsChange,
		setDetection,
	]);
	const scopedAdjustments = useMemo(
		() => projectPortraitAdjustments({ adjustments, scope }),
		[adjustments, scope]
	);
	const onScopedAdjustmentsChange = useCallback(
		(edited: MediaPortraitAdjustments) => {
			onAdjustmentsChange(
				applyPortraitAdjustments({ adjustments, scope, edited })
			);
		},
		[adjustments, onAdjustmentsChange, scope]
	);
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
	const readyManualTools = useMemo(() => {
		const tools = new Set<"smooth" | "acne">();
		if (readyPackages.has("manual-smooth")) tools.add("smooth");
		if (readyPackages.has("manual-acne")) tools.add("acne");
		return tools;
	}, [readyPackages]);
	const readyManualBodyTools = useMemo(() => {
		const tools = new Set<MediaPortraitManualBodyTool>();
		if (readyPackages.has("manual-stretch")) tools.add("stretch");
		if (readyPackages.has("manual-slim")) tools.add("slim");
		if (readyPackages.has("manual-zoom")) tools.add("zoom");
		return tools;
	}, [readyPackages]);
	const isControlReady = useCallback(
		(control: JianyingPortraitAdjustmentControl) =>
			readyPackages.has(runtimePackageForControl({ control })),
		[readyPackages]
	);
	const nativeDisabled = loading || !status?.available;
	const hasSectionValue = useCallback(
		({ section }: { section: JianyingPortraitAdjustmentSection }) =>
			(controlsBySection.get(section) ?? []).some(
				({ key }) => (scopedAdjustments.values[key] ?? 0) !== 0
			),
		[controlsBySection, scopedAdjustments.values]
	);
	const faceSectionActivity: Record<FacePanelSection, boolean> = {
		skin:
			enhancements.relight !== 0 ||
			enhancements.beauty !== 0 ||
			hasSectionValue({ section: "skin" }),
		"face-shape": hasSectionValue({ section: "face-shape" }),
		features: hasSectionValue({ section: "features" }),
		makeup: Object.values(scopedAdjustments.makeup ?? {}).some(Boolean),
		manual: (adjustments.manualRetouch?.strokes.length ?? 0) > 0,
	};
	const setFaceSectionOpen = ({
		open,
		section,
	}: {
		open: boolean;
		section: FacePanelSection;
	}) => {
		setOpenFaceSections((current) => ({ ...current, [section]: open }));
		if (section === "manual" && open && !detection && !detecting) {
			void detectFaces();
		}
	};
	const presetScope: PortraitPresetScope = activeTab.startsWith("body")
		? "body"
		: "face";
	const presetAdjustments =
		presetScope === "body" ? adjustments : scopedAdjustments;
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
		const thumbnailDataUrl = capturePortraitPresetThumbnail();
		const preset = createPortraitPreset({
			adjustments: presetAdjustments,
			name,
			scope: presetScope,
			...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
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
		const edited = applyPortraitPreset({
			adjustments: presetAdjustments,
			preset,
		});
		if (presetScope === "body") {
			onAdjustmentsChange(applyWholeFrameBodyAdjustments({ edited }));
		} else {
			onScopedAdjustmentsChange(edited);
		}
		onInteractionEnd();
		toast.success(
			locale === "zh" ? `已应用 ${preset.name}` : `Applied ${preset.name}`
		);
	};
	const renamePresetById = ({ id, name }: { id: string; name: string }) => {
		const next = renamePortraitPreset({ presets, id, name });
		if (next === presets) return;
		persistPortraitPresets({ presets: next });
		setPresets(next);
	};
	const overwriteSelectedPreset = () => {
		if (!selectedPresetId) return;
		const thumbnailDataUrl = capturePortraitPresetThumbnail();
		const next = overwritePortraitPreset({
			presets,
			id: selectedPresetId,
			adjustments: presetAdjustments,
			...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
		});
		persistPortraitPresets({ presets: next });
		setPresets(next);
		toast.success(locale === "zh" ? "已覆盖保存" : "Preset updated");
	};
	const exportPresets = () => {
		const scoped = presets.filter((preset) => preset.scope === presetScope);
		if (scoped.length === 0) {
			toast.error(locale === "zh" ? "当前没有可导出的预设" : "No presets yet");
			return;
		}
		const blob = new Blob([serializePortraitPresets({ presets: scoped })], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `qcut-portrait-presets-${presetScope}.json`;
		link.click();
		URL.revokeObjectURL(url);
	};
	const importPresets = async (file: File) => {
		try {
			const imported = parsePortraitPresetExport({
				value: JSON.parse(await file.text()),
			});
			const next = [...imported, ...presets];
			persistPortraitPresets({ presets: next });
			setPresets(next);
			toast.success(
				locale === "zh"
					? `已导入 ${imported.length} 个预设`
					: `Imported ${imported.length} presets`
			);
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : String(cause));
		}
	};
	const deleteSelectedPreset = () => {
		const next = presets.filter((preset) => preset.id !== selectedPresetId);
		persistPortraitPresets({ presets: next });
		setPresets(next);
		setSelectedPresetId(undefined);
	};
	const sectionProps = (section: JianyingPortraitAdjustmentSection) => {
		const wholeFrame = section === "body";
		return {
			section,
			controls: controlsBySection.get(section) ?? [],
			adjustments: wholeFrame ? adjustments : scopedAdjustments,
			disabled: nativeDisabled || !adjustments.enabled,
			locale,
			isControlReady,
			onChange: wholeFrame
				? (edited: MediaPortraitAdjustments) =>
						onAdjustmentsChange(applyWholeFrameBodyAdjustments({ edited }))
				: onScopedAdjustmentsChange,
			onInteractionStart,
			onInteractionEnd,
		};
	};

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
							detection={detection}
							detectionError={detectionError}
							detecting={detecting}
							scope={scope}
							disabled={nativeDisabled || !adjustments.enabled}
							locale={locale}
							onScopeChange={setScope}
							onDetect={() => {
								void detectFaces();
							}}
						/>
						<div className="border-t border-border/70">
							<PortraitCollapsibleGroup
								active={faceSectionActivity.skin}
								label={locale === "zh" ? "皮肤管理" : "Skin management"}
								open={openFaceSections.skin}
								onOpenChange={(open) =>
									setFaceSectionOpen({ open, section: "skin" })
								}
								testId="portrait-group-skin"
							>
								<div className="space-y-5">
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
								</div>
							</PortraitCollapsibleGroup>
							<PortraitCollapsibleGroup
								active={faceSectionActivity["face-shape"]}
								label={locale === "zh" ? "脸型" : "Face shape"}
								open={openFaceSections["face-shape"]}
								onOpenChange={(open) =>
									setFaceSectionOpen({ open, section: "face-shape" })
								}
								testId="portrait-group-face-shape"
							>
								<PortraitAdjustmentSection {...sectionProps("face-shape")} />
							</PortraitCollapsibleGroup>
							<PortraitCollapsibleGroup
								active={faceSectionActivity.features}
								label={locale === "zh" ? "五官精修" : "Feature refinement"}
								open={openFaceSections.features}
								onOpenChange={(open) =>
									setFaceSectionOpen({ open, section: "features" })
								}
								testId="portrait-group-features"
							>
								<PortraitAdjustmentSection {...sectionProps("features")} />
							</PortraitCollapsibleGroup>
							<PortraitCollapsibleGroup
								active={faceSectionActivity.makeup}
								label={locale === "zh" ? "美妆" : "Makeup"}
								open={openFaceSections.makeup}
								onOpenChange={(open) =>
									setFaceSectionOpen({ open, section: "makeup" })
								}
								testId="portrait-group-makeup"
							>
								<PortraitMakeupControls
									cards={status?.makeupCards ?? []}
									adjustments={scopedAdjustments}
									disabled={nativeDisabled || !adjustments.enabled}
									locale={locale}
									onChange={onScopedAdjustmentsChange}
									onInteractionStart={onInteractionStart}
									onInteractionEnd={onInteractionEnd}
								/>
							</PortraitCollapsibleGroup>
							<PortraitCollapsibleGroup
								active={faceSectionActivity.manual}
								label={locale === "zh" ? "手动精修" : "Manual retouch"}
								open={openFaceSections.manual}
								onOpenChange={(open) =>
									setFaceSectionOpen({ open, section: "manual" })
								}
								testId="portrait-group-manual"
							>
								<PortraitManualRetouchControls
									active={activeTab === "face" && openFaceSections.manual}
									adjustments={adjustments}
									disabled={nativeDisabled || !adjustments.enabled}
									locale={locale}
									readyTools={readyManualTools}
									onChange={onAdjustmentsChange}
									onInteractionStart={onInteractionStart}
									onInteractionEnd={onInteractionEnd}
								/>
							</PortraitCollapsibleGroup>
						</div>
					</TabsContent>
					<TabsContent value="body" className="mt-4 space-y-3">
						<div
							className="flex items-center justify-between rounded-sm border border-border/70 bg-muted/30 px-2.5 py-2 text-[11px]"
							data-testid="portrait-body-scope"
						>
							<span className="text-muted-foreground">
								{locale === "zh" ? "作用范围" : "Scope"}
							</span>
							<span className="font-medium">
								{locale === "zh" ? "全部人物" : "All people"}
							</span>
						</div>
						<Tabs
							value={activeBodyTab}
							onValueChange={(value) => setActiveBodyTab(value as BodyPanelTab)}
						>
							<TabsList className="grid h-8 w-full grid-cols-2 gap-0.5 rounded-sm p-0.5">
								<TabsTrigger value="automatic" className="px-1 text-[10px]">
									{locale === "zh" ? "自动美体" : "Auto body"}
								</TabsTrigger>
								<TabsTrigger value="manual" className="px-1 text-[10px]">
									{locale === "zh" ? "手动美体" : "Manual body"}
								</TabsTrigger>
							</TabsList>
							<TabsContent value="automatic" className="mt-4">
								<PortraitAdjustmentSection {...sectionProps("body")} />
							</TabsContent>
							<TabsContent value="manual" className="mt-4">
								<PortraitManualBodyControls
									active={activeTab === "body" && activeBodyTab === "manual"}
									adjustments={adjustments}
									disabled={nativeDisabled || !adjustments.enabled}
									elementId={elementId}
									locale={locale}
									readyTools={readyManualBodyTools}
									onChange={onAdjustmentsChange}
									onInteractionStart={onInteractionStart}
									onInteractionEnd={onInteractionEnd}
								/>
							</TabsContent>
						</Tabs>
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
								onRenamePreset={renamePresetById}
								onOverwritePreset={overwriteSelectedPreset}
								onExportPresets={exportPresets}
								onImportPresets={(file) => {
									void importPresets(file);
								}}
							/>
						</TabsContent>
					))}
				</Tabs>
			</div>
		</PropertyGroup>
	);
}
