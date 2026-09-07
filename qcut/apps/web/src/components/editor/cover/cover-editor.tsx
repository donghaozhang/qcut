import { useEffect, useRef, useState } from "react";
import {
	Image as ImageIcon,
	Undo2,
	Redo2,
	Crop,
	RotateCcw,
	Trash2,
} from "lucide-react";
import {
	createCoverText,
	updateCoverText,
	type CoverTextLayerV1,
} from "@qcut/editor-core/cover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { useProjectStore } from "@/stores/project-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TProject } from "@/types/project";
import { useCoverDesign } from "./use-cover-design";
import { CoverTool, activateCoverControl } from "./cover-tool";
import { CoverTextToolbar } from "./cover-text-toolbar";
import { CoverCanvas } from "./cover-canvas";
import { CoverTemplateBrowser } from "./cover-template-browser";
import { CoverSourceStrip } from "./cover-source-strip";
import "./cover-editor.css";

export function CoverButton({
	placement = "preview",
}: {
	placement?: "preview" | "timeline";
} = {}) {
	const project = useProjectStore((state) => state.activeProject);
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const { t } = useTranslation();
	return (
		<>
			<Button
				ref={trigger}
				type="button"
				variant="text"
				size={placement === "timeline" ? "sm" : "icon"}
				className={
					placement === "timeline"
						? "h-6 shrink-0 gap-1 rounded-sm border border-cyan-400/35 bg-cyan-400/10 px-1.5 text-cyan-700 dark:text-cyan-200"
						: undefined
				}
				disabled={!project}
				title={t("editor.cover.title")}
				aria-label={t("editor.cover.title")}
				data-testid={
					placement === "timeline" ? "main-track-cover-badge" : "cover-open"
				}
				onKeyDown={(event) => activateCoverControl({ event })}
				onClick={(event) => {
					event.stopPropagation();
					usePlaybackStore.getState().pause();
					setOpen(true);
				}}
			>
				<ImageIcon className="size-4">
					<title>{t("editor.cover.title")}</title>
				</ImageIcon>
				{placement === "timeline" && (
					<span className="text-[10px] leading-none">
						{t("timeline.track.cover")}
					</span>
				)}
			</Button>
			{open && project && (
				<CoverEditor
					key={project.id}
					project={project}
					onClose={() => {
						setOpen(false);
						trigger.current?.focus();
					}}
				/>
			)}
		</>
	);
}

export function CoverEditor({
	project,
	onClose,
}: {
	project: TProject;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const editor = useCoverDesign({ project, onClose });
	const { design, edit, busy } = editor;
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [cropping, setCropping] = useState(false);
	const title = useRef<HTMLHeadingElement>(null);
	const initialized = useRef(false);
	useEffect(() => {
		if (initialized.current) return;
		const timer = setTimeout(() => {
			initialized.current = true;
			if (!project.cover && useTimelineStore.getState().getTotalDuration() > 0)
				void editor.chooseSource();
		}, 0);
		return () => clearTimeout(timer);
	}, [project.cover, editor.chooseSource]);
	const texts =
		design?.layers
			.slice(1)
			.filter((layer): layer is CoverTextLayerV1 => layer.kind === "text") ??
		[];
	const selected = texts.find((layer) => layer.id === selectedId);
	const changeText = (changes: Partial<CoverTextLayerV1>) => {
		if (design && selected)
			edit(updateCoverText({ design, id: selected.id, changes }));
	};
	const deleteText = () => {
		if (design && selected) {
			edit({
				...design,
				layers: [
					design.layers[0],
					...texts.filter((layer) => layer.id !== selected.id),
				],
			});
			setSelectedId(null);
		}
	};
	const addText = () => {
		if (!design || texts.length >= 20) return;
		const layer = createCoverText({
			canvas: design.canvas,
			content: t("editor.cover.newText"),
			id: crypto.randomUUID(),
		});
		edit({ ...design, layers: [design.layers[0], ...texts, layer] });
		setSelectedId(layer.id);
		setCropping(false);
	};
	const position = design?.layers[0].position ?? { x: 0.5, y: 0.5, zoom: 1 };
	const changeCrop = (changes: Partial<typeof position>) => {
		if (design)
			edit({
				...design,
				layers: [
					{ ...design.layers[0], position: { ...position, ...changes } },
					...texts,
				],
			});
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent
				scrollable={false}
				className="cover-workspace z-[1001]"
				overlayClassName="z-[1000]"
				aria-describedby={undefined}
				data-testid="cover-editor"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					title.current?.focus();
				}}
				onKeyDown={(event) => {
					const editable =
						event.target instanceof HTMLElement &&
						Boolean(
							event.target.closest(
								"input, textarea, select, [contenteditable=true]"
							)
						);
					if (editable || busy) return;
					if (
						(event.metaKey || event.ctrlKey) &&
						event.key.toLowerCase() === "z"
					) {
						event.preventDefault();
						event.stopPropagation();
						editor.dispatch({ type: event.shiftKey ? "redo" : "undo" });
					}
					if (
						(event.key === "Backspace" || event.key === "Delete") &&
						selected
					) {
						event.preventDefault();
						event.stopPropagation();
						deleteText();
					}
				}}
			>
				<header className="cover-header">
					<DialogTitle ref={title} tabIndex={-1}>
						{t("editor.cover.title")}
					</DialogTitle>
					<span>
						{project.canvasSize.width} × {project.canvasSize.height}
					</span>
				</header>
				<div className="cover-workarea">
					<CoverTemplateBrowser
						design={design}
						projectId={project.id}
						onEdit={edit}
						disabled={busy || cropping}
						selectedId={selectedId}
						onSelect={(id) => {
							setSelectedId(id);
							setCropping(false);
						}}
						onAdd={addText}
						onError={editor.setError}
					/>
					<main className="cover-main">
						<CoverTextToolbar
							layer={selected}
							canvas={editor.design?.canvas}
							disabled={busy || cropping}
							onChange={changeText}
							onDelete={deleteText}
							onOrder={(direction) => {
								if (!design || !selected) return;
								const rest = texts.filter((layer) => layer.id !== selected.id);
								edit({
									...design,
									layers: [
										design.layers[0],
										...(direction === "front"
											? [...rest, selected]
											: [selected, ...rest]),
									],
								});
							}}
						/>
						<CoverCanvas
							projectId={project.id}
							onError={editor.setError}
							design={design}
							preview={editor.preview}
							selectedId={selectedId}
							onSelect={setSelectedId}
							onEdit={edit}
							cropping={cropping}
							disabled={busy}
							rendering={
								busy || Boolean(design && !editor.ready && !editor.error)
							}
						/>
						<div className="cover-canvas-tools">
							<CoverTool
								icon={Undo2}
								label={t("editor.cover.undo")}
								disabled={busy || !editor.history.past.length}
								onClick={() => editor.dispatch({ type: "undo" })}
								testId="cover-undo"
							/>
							<CoverTool
								icon={Redo2}
								label={t("editor.cover.redo")}
								disabled={busy || !editor.history.future.length}
								onClick={() => editor.dispatch({ type: "redo" })}
								testId="cover-redo"
							/>
							<CoverTool
								icon={Crop}
								label={t("editor.cover.crop")}
								active={cropping}
								disabled={busy || !design}
								onClick={() => {
									setCropping(!cropping);
									setSelectedId(null);
								}}
								testId="cover-crop"
							/>
							{design && (
								<select
									aria-label={t("editor.cover.fit")}
									disabled={busy}
									value={design.layers[0].fit}
									onChange={(event) =>
										edit({
											...design,
											layers: [
												{
													...design.layers[0],
													fit:
														event.target.value === "cover"
															? "cover"
															: "contain",
													position: { x: 0.5, y: 0.5, zoom: 1 },
												},
												...texts,
											],
										})
									}
								>
									<option value="contain">{t("editor.cover.contain")}</option>
									<option value="cover">{t("editor.cover.fill")}</option>
								</select>
							)}
							{cropping && (
								<button
									type="button"
									className="cover-command"
									onClick={() => setCropping(false)}
									onKeyDown={(event) => activateCoverControl({ event })}
								>
									{t("editor.cover.doneCrop")}
								</button>
							)}
						</div>
						{cropping && (
							<div className="cover-crop-controls">
								<label>
									{t("editor.cover.zoom")}
									<input
										type="range"
										min={1}
										max={4}
										step={0.01}
										value={position.zoom}
										disabled={busy}
										onChange={(event) =>
											changeCrop({ zoom: Number(event.target.value) })
										}
									/>
								</label>
								<label>
									{t("editor.cover.horizontal")}
									<input
										type="range"
										min={0}
										max={1}
										step={0.01}
										value={position.x}
										disabled={busy}
										onChange={(event) =>
											changeCrop({ x: Number(event.target.value) })
										}
									/>
								</label>
								<label>
									{t("editor.cover.vertical")}
									<input
										type="range"
										min={0}
										max={1}
										step={0.01}
										value={position.y}
										disabled={busy}
										onChange={(event) =>
											changeCrop({ y: Number(event.target.value) })
										}
									/>
								</label>
								<CoverTool
									icon={RotateCcw}
									label={t("editor.cover.resetCrop")}
									disabled={busy}
									onClick={() => changeCrop({ x: 0.5, y: 0.5, zoom: 1 })}
								/>
							</div>
						)}
						<CoverSourceStrip
							source={design?.source}
							projectId={project.id}
							fps={project.fps ?? 30}
							disabled={busy}
							onChoose={editor.chooseSource}
						/>
					</main>
				</div>
				{editor.error && (
					<p role="alert" className="cover-error">
						{editor.error}
					</p>
				)}
				<footer className="cover-footer">
					{project.cover && (
						<CoverTool
							icon={Trash2}
							label={t("editor.cover.clear")}
							disabled={busy}
							onClick={() => void editor.publish({ clear: true })}
							testId="cover-clear"
						/>
					)}
					<div className="cover-footer-actions">
						<button
							type="button"
							className="cover-command"
							disabled={busy}
							onClick={onClose}
							onKeyDown={(event) => activateCoverControl({ event })}
						>
							{t("common.cancel")}
						</button>
						<button
							type="button"
							className="cover-command cover-publish"
							disabled={busy || !editor.ready}
							onClick={() => void editor.publish()}
							onKeyDown={(event) => activateCoverControl({ event })}
							data-testid="cover-publish"
						>
							{t("editor.cover.publish")}
						</button>
					</div>
				</footer>
			</DialogContent>
		</Dialog>
	);
}
