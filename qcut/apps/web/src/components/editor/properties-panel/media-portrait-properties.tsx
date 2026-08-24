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
	detectJianyingPortraitFaces,
	type PortraitFaceDetection,
} from "@/lib/portrait/jianying-portrait-face-detection";
import { usePortraitFaceStore } from "@/stores/editor/portrait-face-store";
import {
	applyPortraitAdjustments,
	projectPortraitAdjustments,
	type PortraitEditScope,
} from "@/lib/portrait/portrait-face-scope";
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

/**
 * Face picker. It lists the faces the native runtime is actually tracking,
 * falling back to the historical fixed list when detection is unavailable so
 * the control never becomes unusable on a machine without the runtime.
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
	const value = scope.mode === "all" ? "all" : `face-${scope.trackId}`;
	const configuredTrackIds = new Set(
		(adjustments.faces ?? []).map((face) => face.trackId)
	);
	const detected = detection?.faces ?? [];
	const appliedLimit = detection?.appliedFaceLimit ?? 5;
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-1">
				<Select
					value={value}
					onValueChange={(next) =>
						onScopeChange(
							next === "all"
								? { mode: "all" }
								: { mode: "face", trackId: Number(next.slice(5)) }
						)
					}
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
							<SelectItem key={face.trackId} value={`face-${face.trackId}`}>
								{`${isZh ? "人脸" : "Face"} ${index + 1}`}
								{index >= appliedLimit
									? isZh
										? "（不生效）"
										: " (inert)"
									: ""}
								{configuredTrackIds.has(face.trackId) ? " ●" : ""}
							</SelectItem>
						))}
						{detected.length === 0
							? Array.from({ length: 10 }, (_, faceId) => (
									<SelectItem key={faceId} value={`face-${faceId}`}>
										{`${isZh ? "人脸" : "Face"} ${faceId + 1}`}
									</SelectItem>
								))
							: null}
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
	// Face selection and detection are transient view state: they describe the
	// current frame, never the project, so they are deliberately not persisted.
	const [scope, setScope] = useState<PortraitEditScope>({ mode: "all" });
	const [detection, setDetection] = useState<PortraitFaceDetection | null>(
		null
	);
	const [detectionError, setDetectionError] = useState<string | null>(null);
	const [detecting, setDetecting] = useState(false);
	const detectFaces = useCallback(async () => {
		setDetecting(true);
		setDetectionError(null);
		try {
			const canvas = document.querySelector<HTMLCanvasElement>(
				'[data-testid="color-preview-canvas"]'
			);
			const context = canvas?.getContext("2d", { willReadFrequently: true });
			if (!canvas || !context || canvas.width === 0 || canvas.height === 0) {
				throw new Error(
					locale === "zh" ? "预览画面尚未就绪" : "The preview is not ready"
				);
			}
			const next = await detectJianyingPortraitFaces({
				source: context.getImageData(0, 0, canvas.width, canvas.height),
			});
			setDetection(next);
			if (next.faces.length === 0) {
				setDetectionError(
					locale === "zh" ? "画面中未识别到人脸" : "No faces in this frame"
				);
			}
		} catch (cause) {
			setDetection(null);
			setDetectionError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setDetecting(false);
		}
	}, [locale, setDetection]);
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
		adjustments: scopedAdjustments,
		disabled: nativeDisabled || !adjustments.enabled,
		locale,
		isControlReady,
		onChange: onScopedAdjustmentsChange,
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
