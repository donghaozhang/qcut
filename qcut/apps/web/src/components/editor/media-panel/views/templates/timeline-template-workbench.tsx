import {
	resolveTemplateFontDependencies,
	type TemplateAspectRatio,
	type TimelineTemplate,
	type TimelineTemplateSlotValue,
	type TimelineTemplateSlotValues,
} from "@qcut/editor-core/templates";
import {
	Check,
	Download,
	LayoutTemplate,
	RefreshCw,
	Trash2,
	TriangleAlert,
	Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { FONT_OPTIONS } from "@/constants/font-constants";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	applyTimelineTemplateToEditor,
	migrateTimelineTemplateInstance,
	reflowTimelineTemplateInstance,
	replaceTimelineTemplateSlot,
} from "@/lib/templates/timeline-template-application";
import {
	BUILT_IN_TIMELINE_TEMPLATE_IDS,
	getTimelineTemplate,
	getTimelineTemplates,
	TIMELINE_TEMPLATES,
} from "@/lib/templates/template-registry";
import {
	CUSTOM_TIMELINE_TEMPLATES_CHANGED_EVENT,
	importCustomTimelineTemplates,
	removeCustomTimelineTemplate,
} from "@/lib/templates/custom-template-registry";
import { saveTimelineTemplateFile } from "@/lib/templates/timeline-template-file";
import { cn } from "@/lib/utils";

interface TemplateInstanceSummary {
	instanceId: string;
	version: string;
	aspectRatio?: TemplateAspectRatio;
}

function defaultSlotValues({
	template,
	mediaIds,
}: {
	template: TimelineTemplate;
	mediaIds: readonly string[];
}): TimelineTemplateSlotValues {
	let mediaIndex = 0;
	return Object.fromEntries(
		template.slots.map((slot) => {
			if (slot.kind === "text") {
				return [slot.id, { kind: "text", text: slot.defaultValue }];
			}
			const mediaId = mediaIds[mediaIndex] ?? "";
			mediaIndex++;
			return [slot.id, { kind: "media", mediaId }];
		})
	) as TimelineTemplateSlotValues;
}

function TemplatePicker({
	templates,
	selectedId,
	onSelect,
	previewUrl,
}: {
	templates: TimelineTemplate[];
	selectedId: string;
	onSelect: (templateId: string) => void;
	previewUrl?: string;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			{templates.map((template) => {
				const selected = selectedId === template.id;
				return (
					<button
						key={template.id}
						type="button"
						aria-pressed={selected}
						onClick={() => onSelect(template.id)}
						onKeyDown={(event) => {
							if (event.key === " ") {
								event.preventDefault();
								onSelect(template.id);
							}
						}}
						className={cn(
							"overflow-hidden rounded border text-left transition-colors",
							selected
								? "border-primary bg-primary/10"
								: "border-border bg-foreground/5 hover:border-foreground/30"
						)}
					>
						<div className="relative h-20 overflow-hidden bg-black">
							{previewUrl ? (
								<img
									src={previewUrl}
									alt=""
									className="h-full w-full object-cover opacity-65"
								/>
							) : (
								<div className="flex h-full items-center justify-center">
									<LayoutTemplate className="size-6 text-muted-foreground">
										<title>Timeline template</title>
									</LayoutTemplate>
								</div>
							)}
							<div className="absolute inset-x-2 bottom-2 h-2 rounded-sm bg-white/80" />
						</div>
						<div className="p-2">
							<div className="truncate text-xs font-medium">
								{template.name}
							</div>
							<div className="mt-0.5 text-[10px] text-muted-foreground">
								{template.slots.length} slots · v{template.version}
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}

function RatioControl({
	template,
	value,
	onChange,
}: {
	template: TimelineTemplate;
	value: TemplateAspectRatio;
	onChange: (ratio: TemplateAspectRatio) => void;
}) {
	return (
		<div
			className="grid gap-1"
			style={{
				gridTemplateColumns: `repeat(${template.supportedAspectRatios.length}, minmax(0, 1fr))`,
			}}
		>
			{template.supportedAspectRatios.map((ratio) => (
				<button
					key={ratio}
					type="button"
					aria-pressed={value === ratio}
					onClick={() => onChange(ratio)}
					onKeyDown={(event) => {
						if (event.key === " ") {
							event.preventDefault();
							onChange(ratio);
						}
					}}
					className={cn(
						"h-7 rounded text-[10px]",
						value === ratio
							? "bg-primary text-primary-foreground"
							: "bg-foreground/5 text-muted-foreground"
					)}
				>
					{ratio}
				</button>
			))}
		</div>
	);
}

export function TimelineTemplateWorkbench() {
	const allMediaItems = useMediaStore((state) => state.mediaItems);
	const mediaItems = useMemo(
		() => allMediaItems.filter((item) => item.type !== "audio"),
		[allMediaItems]
	);
	const tracks = useTimelineStore((state) => state.tracks);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const [templates, setTemplates] = useState(getTimelineTemplates);
	const [templateId, setTemplateId] = useState(TIMELINE_TEMPLATES[0].id);
	const template =
		templates.find((candidate) => candidate.id === templateId) ??
		getTimelineTemplate({ templateId }) ??
		TIMELINE_TEMPLATES[0];
	const [aspectRatio, setAspectRatio] = useState<TemplateAspectRatio>(
		template.defaultAspectRatio
	);
	const [values, setValues] = useState<TimelineTemplateSlotValues>(() =>
		defaultSlotValues({
			template,
			mediaIds: mediaItems.map((item) => item.id),
		})
	);
	const [activeInstanceId, setActiveInstanceId] = useState<string>();
	const [isApplying, setIsApplying] = useState(false);
	const templateFileInput = useRef<HTMLInputElement>(null);
	const isCustomTemplate = !BUILT_IN_TIMELINE_TEMPLATE_IDS.has(template.id);

	const refreshTemplates = useCallback(() => {
		const next = getTimelineTemplates();
		setTemplates(next);
		setTemplateId((current) =>
			next.some((candidate) => candidate.id === current)
				? current
				: TIMELINE_TEMPLATES[0].id
		);
	}, []);

	useEffect(() => {
		window.addEventListener(
			CUSTOM_TIMELINE_TEMPLATES_CHANGED_EVENT,
			refreshTemplates
		);
		return () =>
			window.removeEventListener(
				CUSTOM_TIMELINE_TEMPLATES_CHANGED_EVENT,
				refreshTemplates
			);
	}, [refreshTemplates]);

	useEffect(() => {
		setAspectRatio(template.defaultAspectRatio);
		setValues(
			defaultSlotValues({
				template,
				mediaIds: mediaItems.map((item) => item.id),
			})
		);
		setActiveInstanceId(undefined);
	}, [template, mediaItems]);

	const instances = useMemo(() => {
		const summaries = new Map<string, TemplateInstanceSummary>();
		for (const element of tracks.flatMap((track) => track.elements)) {
			const binding = element.templateBinding;
			if (!binding || binding.templateId !== template.id) continue;
			summaries.set(binding.instanceId, {
				instanceId: binding.instanceId,
				version: binding.templateVersion,
				aspectRatio: binding.aspectRatio,
			});
		}
		return [...summaries.values()];
	}, [template.id, tracks]);

	useEffect(() => {
		if (activeInstanceId || instances.length === 0) return;
		const latest = instances.at(-1);
		setActiveInstanceId(latest?.instanceId);
		if (latest?.aspectRatio) setAspectRatio(latest.aspectRatio);
	}, [activeInstanceId, instances]);

	const activeInstance = instances.find(
		(instance) => instance.instanceId === activeInstanceId
	);
	const fontStatus = resolveTemplateFontDependencies({
		template,
		availableFonts: FONT_OPTIONS.map((font) => font.value),
	});
	const previewUrl =
		mediaItems[0]?.thumbnailUrl ??
		mediaItems[0]?.url ??
		mediaItems[0]?.originalUrl;

	const setSlotValue = ({
		slotId,
		value,
	}: {
		slotId: string;
		value: TimelineTemplateSlotValue;
	}) => setValues((current) => ({ ...current, [slotId]: value }));

	const applyTemplate = async () => {
		setIsApplying(true);
		try {
			const result = await applyTimelineTemplateToEditor({
				template,
				values,
				mediaItems,
				aspectRatio,
				instanceStartTime: currentTime,
			});
			setActiveInstanceId(result.instanceId);
			toast.success(`${template.name} added to the timeline`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Template failed");
		} finally {
			setIsApplying(false);
		}
	};

	const replaceSlot = async ({ slotId }: { slotId: string }) => {
		if (!activeInstanceId) return;
		const value = values[slotId];
		if (!value) return;
		try {
			await replaceTimelineTemplateSlot({
				template,
				instanceId: activeInstanceId,
				slotId,
				value,
				mediaItems,
			});
			toast.success("Template slot replaced");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Replace failed");
		}
	};

	const reflowInstance = async () => {
		if (!activeInstanceId) return;
		try {
			await reflowTimelineTemplateInstance({
				template,
				instanceId: activeInstanceId,
				aspectRatio,
			});
			toast.success(`Template changed to ${aspectRatio}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Layout update failed"
			);
		}
	};

	const migrateInstance = async () => {
		if (!activeInstanceId) return;
		try {
			const count = await migrateTimelineTemplateInstance({
				template,
				instanceId: activeInstanceId,
			});
			toast.success(`${count} template slots upgraded`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Upgrade failed");
		}
	};

	const importTemplateFile = async ({ file }: { file: File }) => {
		try {
			const imported = importCustomTimelineTemplates({
				text: await file.text(),
				builtInIds: BUILT_IN_TIMELINE_TEMPLATE_IDS,
			});
			refreshTemplates();
			setTemplateId(imported[0]?.id ?? TIMELINE_TEMPLATES[0].id);
			toast.success(
				`${imported.length} custom template${imported.length === 1 ? "" : "s"} imported`
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Import failed");
		}
	};

	const exportTemplate = async () => {
		try {
			const result = await saveTimelineTemplateFile({ template });
			if (result.success) toast.success("Template exported");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Export failed");
		}
	};

	const deleteTemplate = () => {
		if (!isCustomTemplate) return;
		removeCustomTimelineTemplate({ templateId: template.id });
		refreshTemplates();
		toast.success("Custom template deleted");
	};

	return (
		<div className="space-y-4" data-testid="timeline-template-workbench">
			<TemplatePicker
				templates={templates}
				selectedId={template.id}
				onSelect={setTemplateId}
				previewUrl={previewUrl}
			/>
			<div className="flex items-center gap-1.5">
				<input
					ref={templateFileInput}
					type="file"
					accept="application/json,.json,.qcut-template.json"
					className="hidden"
					aria-label="Import timeline template"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) void importTemplateFile({ file });
						event.target.value = "";
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 flex-1 text-xs"
					onClick={() => templateFileInput.current?.click()}
					onKeyDown={() => undefined}
					data-testid="import-timeline-template"
				>
					<Upload className="size-3.5">
						<title>Import timeline template</title>
					</Upload>
					Import
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-7"
					aria-label="Export timeline template"
					title="Export timeline template"
					onClick={() => void exportTemplate()}
					onKeyDown={() => undefined}
					data-testid="export-timeline-template"
				>
					<Download className="size-3.5">
						<title>Export timeline template</title>
					</Download>
				</Button>
				{isCustomTemplate ? (
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-7 text-destructive"
						aria-label="Delete custom timeline template"
						title="Delete custom timeline template"
						onClick={deleteTemplate}
						onKeyDown={() => undefined}
						data-testid="delete-timeline-template"
					>
						<Trash2 className="size-3.5">
							<title>Delete custom timeline template</title>
						</Trash2>
					</Button>
				) : null}
			</div>

			<div className="space-y-2 border-t border-border/60 pt-3">
				<div className="flex items-center justify-between gap-2">
					<div className="min-w-0">
						<h3 className="truncate text-sm font-medium">{template.name}</h3>
						<p className="line-clamp-2 text-[10px] text-muted-foreground">
							{template.description}
						</p>
					</div>
					{fontStatus.missingRequired.length === 0 ? (
						<Check className="size-4 shrink-0 text-emerald-500">
							<title>Font dependencies ready</title>
						</Check>
					) : (
						<TriangleAlert className="size-4 shrink-0 text-amber-500">
							<title>Missing required fonts</title>
						</TriangleAlert>
					)}
				</div>
				<RatioControl
					template={template}
					value={aspectRatio}
					onChange={setAspectRatio}
				/>
			</div>

			<div className="space-y-3">
				{template.slots.map((slot) => {
					const value = values[slot.id];
					return (
						<div key={slot.id} className="space-y-1.5">
							<Label className="text-xs">{slot.label}</Label>
							<div className="flex gap-1.5">
								{slot.kind === "media" ? (
									<Select
										value={value?.kind === "media" ? value.mediaId : ""}
										onValueChange={(mediaId) =>
											setSlotValue({
												slotId: slot.id,
												value: { kind: "media", mediaId },
											})
										}
									>
										<SelectTrigger
											className="h-8 min-w-0 flex-1 text-xs"
											aria-label={slot.label}
										>
											<SelectValue placeholder="Choose media" />
										</SelectTrigger>
										<SelectContent>
											{mediaItems
												.filter((item) =>
													slot.acceptedTypes.includes(item.type)
												)
												.map((item) => (
													<SelectItem key={item.id} value={item.id}>
														{item.name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								) : (
									<div className="min-w-0 flex-1">
										<Input
											value={value?.kind === "text" ? value.text : ""}
											onChange={(event) =>
												setSlotValue({
													slotId: slot.id,
													value: {
														kind: "text",
														text: event.target.value,
													},
												})
											}
											className="h-8 min-w-0 text-xs"
											aria-label={slot.label}
										/>
									</div>
								)}
								{activeInstance ? (
									<Button
										type="button"
										variant="outline"
										size="icon"
										className="size-8 shrink-0"
										aria-label={`Replace ${slot.label}`}
										title={`Replace ${slot.label}`}
										onClick={() => void replaceSlot({ slotId: slot.id })}
									>
										<RefreshCw className="size-3.5">
											<title>Replace slot</title>
										</RefreshCw>
									</Button>
								) : null}
							</div>
						</div>
					);
				})}
			</div>

			<div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
				<Button
					type="button"
					disabled={
						isApplying ||
						fontStatus.missingRequired.length > 0 ||
						mediaItems.length === 0
					}
					onClick={() => void applyTemplate()}
					data-testid="apply-timeline-template"
				>
					<LayoutTemplate className="size-4">
						<title>Apply timeline template</title>
					</LayoutTemplate>
					{isApplying ? "Applying" : "Apply"}
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={!activeInstance}
					onClick={() => void reflowInstance()}
					data-testid="reflow-timeline-template"
				>
					<RefreshCw className="size-4">
						<title>Update template ratio</title>
					</RefreshCw>
					Update layout
				</Button>
			</div>

			{activeInstance && activeInstance.version !== template.version ? (
				<Button
					type="button"
					variant="secondary"
					className="w-full"
					onClick={() => void migrateInstance()}
				>
					Upgrade instance from v{activeInstance.version}
				</Button>
			) : null}
		</div>
	);
}
