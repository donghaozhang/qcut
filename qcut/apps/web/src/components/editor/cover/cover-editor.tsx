import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
	ImagePlus,
	Image as ImageIcon,
	Loader2,
	Trash2,
	Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { captureStillFrame } from "@/lib/export/export-still-frame";
import { coverRepository } from "@/lib/cover/cover-repository";
import {
	normalizeCoverImage,
	renderCoverDesign,
} from "@/lib/cover/cover-renderer";
import { useProjectStore } from "@/stores/project-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { TProject } from "@/types/project";
import type { CoverDesignV1, CoverSourceV1 } from "@qcut/editor-core/cover";

function activateCoverControl({
	event,
}: {
	event: KeyboardEvent<HTMLButtonElement>;
}) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	event.stopPropagation();
	event.currentTarget.click();
}

export function CoverButton() {
	const project = useProjectStore((state) => state.activeProject);
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const { t } = useTranslation();
	return (
		<>
			<Button
				ref={triggerRef}
				type="button"
				variant="text"
				size="icon"
				disabled={!project}
				title={t("editor.cover.title")}
				aria-label={t("editor.cover.title")}
				data-testid="cover-open"
				onKeyDown={(event) => activateCoverControl({ event })}
				onClick={() => {
					usePlaybackStore.getState().pause();
					setOpen(true);
				}}
			>
				<ImageIcon className="size-4">
					<title>{t("editor.cover.title")}</title>
				</ImageIcon>
			</Button>
			{open && project && (
				<CoverEditor
					key={project.id}
					project={project}
					onClose={() => {
						setOpen(false);
						triggerRef.current?.focus();
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
	const [initialProject] = useState(project);
	const [design, setDesign] = useState<CoverDesignV1 | null>(null);
	const [outputs, setOutputs] = useState<{
		render: Blob;
		thumbnail: Blob;
	} | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [busy, setBusy] = useState(Boolean(project.cover));
	const [rendering, setRendering] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const mounted = useRef(true);
	const sourceRequest = useRef(0);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			sourceRequest.current += 1;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		if (!initialProject.cover) return;
		void coverRepository
			.loadDesign({ projectId: initialProject.id, cover: initialProject.cover })
			.then((saved) => {
				if (!cancelled)
					setDesign({ ...saved, id: crypto.randomUUID(), revision: 1 });
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(String(reason));
			})
			.finally(() => {
				if (!cancelled) setBusy(false);
			});
		return () => {
			cancelled = true;
		};
	}, [initialProject]);

	useEffect(() => {
		let cancelled = false;
		setOutputs(null);
		if (!design) return;
		setRendering(true);
		void renderCoverDesign({
			design,
			resolveAsset: ({ asset }) =>
				coverRepository.readAsset({ projectId: initialProject.id, asset }),
		})
			.then((result) => {
				if (!cancelled) {
					setOutputs(result);
					setError(null);
				}
			})
			.catch((reason: unknown) => {
				if (!cancelled) setError(String(reason));
			})
			.finally(() => {
				if (!cancelled) setRendering(false);
			});
		return () => {
			cancelled = true;
		};
	}, [design, initialProject.id]);

	useEffect(() => {
		if (!outputs) {
			setPreview(null);
			return;
		}
		const url = URL.createObjectURL(outputs.render);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [outputs]);

	const prepareSource = async ({
		blob,
		source,
		request,
	}: {
		blob: Blob;
		source: CoverSourceV1;
		request: number;
	}) => {
		const normalized = await normalizeCoverImage({ blob });
		const asset = await coverRepository.saveAsset({
			projectId: initialProject.id,
			...normalized,
		});
		if (!mounted.current || request !== sourceRequest.current) return;
		const now = new Date().toISOString();
		setDesign({
			schema: "qcut.cover-design",
			schemaVersion: 1,
			id: crypto.randomUUID(),
			revision: 1,
			canvas: {
				...initialProject.canvasSize,
				backgroundColor: /^#[a-f0-9]{6}$/i.test(
					initialProject.backgroundColor ?? ""
				)
					? initialProject.backgroundColor!
					: "#000000",
			},
			source,
			layers: [{ id: "background", kind: "image", asset, fit: "contain" }],
			createdAt: now,
			updatedAt: now,
		});
	};

	const chooseSource = async ({ file }: { file?: File } = {}) => {
		const request = ++sourceRequest.current;
		setBusy(true);
		setOutputs(null);
		setError(null);
		try {
			if (file)
				await prepareSource({
					blob: file,
					source: { kind: "local-image", originalName: file.name },
					request,
				});
			else {
				const capture = await captureStillFrame();
				if (!capture.ok) throw new Error(capture.error);
				if (capture.projectId !== initialProject.id)
					throw new Error("The active project changed");
				await prepareSource({
					blob: capture.blob,
					source: {
						kind: "timeline-frame",
						sceneId: capture.sceneId,
						frame: capture.frame,
						fps: capture.fps,
						timeSeconds: capture.timeSeconds,
					},
					request,
				});
			}
		} catch (reason) {
			if (mounted.current) setError(String(reason));
		} finally {
			if (mounted.current) setBusy(false);
		}
	};

	const publish = async ({ clear = false }: { clear?: boolean } = {}) => {
		if (!clear && (!design || !outputs)) return;
		setBusy(true);
		setError(null);
		try {
			const cover = clear
				? undefined
				: await coverRepository.saveRevision({
						projectId: initialProject.id,
						design: design!,
						...outputs!,
					});
			if (!mounted.current) return;
			await useProjectStore.getState().setProjectCover({
				projectId: initialProject.id,
				cover,
				expectedCover: initialProject.cover,
			});
			if (mounted.current) onClose();
		} catch (reason) {
			if (mounted.current) setError(String(reason));
		} finally {
			if (mounted.current) setBusy(false);
		}
	};

	const pending = busy || rendering;
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent
				className="z-[1001] max-w-3xl"
				overlayClassName="z-[1000]"
				aria-describedby={undefined}
				data-testid="cover-editor"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					titleRef.current?.focus();
				}}
			>
				<DialogTitle ref={titleRef} tabIndex={-1}>
					{t("editor.cover.title")}
				</DialogTitle>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => void chooseSource()}
						onKeyDown={(event) => activateCoverControl({ event })}
						data-testid="cover-current-frame"
					>
						<Camera className="size-4" />
						{t("editor.cover.currentFrame")}
					</Button>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => fileInput.current?.click()}
						onKeyDown={(event) => activateCoverControl({ event })}
					>
						<ImagePlus className="size-4" />
						{t("editor.cover.importImage")}
					</Button>
					<input
						ref={fileInput}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						className="sr-only"
						tabIndex={-1}
						aria-label={t("editor.cover.importImage")}
						data-testid="cover-file"
						disabled={pending}
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file) void chooseSource({ file });
						}}
					/>
					{design && (
						<label className="ml-auto flex items-center gap-2 text-sm">
							{t("editor.cover.fit")}
							<select
								className="rounded border bg-background p-2 text-foreground"
								aria-label={t("editor.cover.fit")}
								value={design.layers[0].fit}
								disabled={pending}
								onChange={(event) => {
									const fit =
										event.target.value === "cover" ? "cover" : "contain";
									setOutputs(null);
									setDesign({
										...design,
										id: crypto.randomUUID(),
										revision: 1,
										updatedAt: new Date().toISOString(),
										layers: [{ ...design.layers[0], fit }],
									});
								}}
							>
								<option value="contain">{t("editor.cover.contain")}</option>
								<option value="cover">{t("editor.cover.fill")}</option>
							</select>
						</label>
					)}
				</div>
				<div
					className="relative flex h-[min(38vh,320px)] w-full items-center justify-center overflow-hidden bg-black sm:h-[min(48vh,420px)]"
					data-testid="cover-preview"
				>
					{preview && (
						<img
							src={preview}
							alt={t("editor.cover.preview")}
							className="size-full object-contain"
						/>
					)}
					{pending && (
						<Loader2 className="absolute size-6 animate-spin text-white">
							<title>{t("editor.cover.working")}</title>
						</Loader2>
					)}
					{!preview && !pending && (
						<ImageIcon className="size-10 text-neutral-500">
							<title>{t("editor.cover.preview")}</title>
						</ImageIcon>
					)}
				</div>
				<div className="text-xs text-muted-foreground">
					{initialProject.canvasSize.width} × {initialProject.canvasSize.height}
				</div>
				{error && (
					<p role="alert" className="break-words text-sm text-destructive">
						{error}
					</p>
				)}
				<div className="flex flex-wrap justify-end gap-2">
					{initialProject.cover && (
						<Button
							type="button"
							variant="outline"
							className="mr-auto"
							disabled={pending}
							onClick={() => void publish({ clear: true })}
							onKeyDown={(event) => activateCoverControl({ event })}
							data-testid="cover-clear"
						>
							<Trash2 className="size-4" />
							{t("editor.cover.clear")}
						</Button>
					)}
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
						onKeyDown={(event) => activateCoverControl({ event })}
					>
						{t("common.cancel")}
					</Button>
					<Button
						type="button"
						disabled={pending || !outputs}
						onClick={() => void publish()}
						onKeyDown={(event) => activateCoverControl({ event })}
						data-testid="cover-publish"
					>
						{t("editor.cover.publish")}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
