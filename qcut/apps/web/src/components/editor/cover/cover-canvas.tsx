import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import type { CoverDesignV1, CoverTextLayerV1 } from "@qcut/editor-core/cover";
import { updateCoverText } from "@qcut/editor-core/cover";
import { getCoverImageRect } from "@/lib/cover/cover-renderer";
import { useTranslation } from "@/lib/i18n";
import { useCoverInteractionPreview } from "./use-cover-interaction-preview";

export function CoverCanvas({
	design,
	preview,
	selectedId,
	onSelect,
	onEdit,
	cropping,
	disabled,
	rendering,
	projectId,
	onError,
}: {
	design: CoverDesignV1 | null;
	preview: string | null;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onEdit: (design: CoverDesignV1) => void;
	cropping: boolean;
	disabled: boolean;
	rendering: boolean;
	projectId: string;
	onError: (error: string) => void;
}) {
	const { t } = useTranslation();
	const container = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(
		null
	);
	const [interaction, setInteraction] = useState<CoverDesignV1 | null>(null);
	const interactionDesign = useMemo(() => {
		const current = interaction ?? design;
		if (!current) return null;
		if (cropping)
			return {
				...current,
				layers: [current.layers[0]],
			} satisfies CoverDesignV1;
		return interaction;
	}, [design, interaction, cropping]);
	const canvasRef = useCoverInteractionPreview({
		design: interactionDesign,
		projectId,
		onError,
	});
	const gesture = useRef<{
		design: CoverDesignV1;
		id: string;
		pointerId: number;
		x: number;
		y: number;
		originX: number;
		originY: number;
		scaleX: number;
		scaleY: number;
		next: CoverDesignV1;
	} | null>(null);
	const ratio = design ? design.canvas.width / design.canvas.height : 16 / 9;
	useEffect(() => {
		const element = container.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			const width = Math.min(
				entry.contentRect.width - 24,
				(entry.contentRect.height - 24) * ratio
			);
			setSize({
				width: Math.max(0, width),
				height: Math.max(0, width / ratio),
			});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ratio]);
	const begin = ({
		event,
		layer,
	}: {
		event: PointerEvent<HTMLButtonElement>;
		layer?: CoverTextLayerV1;
	}) => {
		if (disabled || !design || event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.focus();
		event.currentTarget.setPointerCapture(event.pointerId);
		onSelect(layer?.id ?? null);
		const position = design.layers[0].position ?? { x: 0.5, y: 0.5, zoom: 1 };
		const rect = getCoverImageRect({
			source: design.layers[0].asset,
			target: design.canvas,
			fit: design.layers[0].fit,
			position,
		});
		gesture.current = {
			design,
			id: layer?.id ?? "background",
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			originX: layer?.x ?? position.x,
			originY: layer?.y ?? position.y,
			scaleX: layer
				? size.width
				: ((design.canvas.width - rect.width) * size.width) /
					design.canvas.width,
			scaleY: layer
				? size.height
				: ((design.canvas.height - rect.height) * size.height) /
					design.canvas.height,
			next: design,
		};
	};
	const move = (event: PointerEvent<HTMLButtonElement>) => {
		const current = gesture.current;
		if (!current || current.pointerId !== event.pointerId) return;
		const x = Math.max(
			0,
			Math.min(
				1,
				current.originX +
					(Math.abs(current.scaleX) > 1
						? (event.clientX - current.x) / current.scaleX
						: 0)
			)
		);
		const y = Math.max(
			0,
			Math.min(
				1,
				current.originY +
					(Math.abs(current.scaleY) > 1
						? (event.clientY - current.y) / current.scaleY
						: 0)
			)
		);
		setDrag({ id: current.id, x, y });
		current.next =
			current.id === "background"
				? {
						...current.design,
						layers: [
							{
								...current.design.layers[0],
								position: {
									x,
									y,
									zoom: current.design.layers[0].position?.zoom ?? 1,
								},
							},
							...current.design.layers
								.slice(1)
								.filter((layer) => layer.kind === "text"),
						],
					}
				: updateCoverText({
						design: current.design,
						id: current.id,
						changes: { x, y },
					});
		setInteraction(current.next);
	};
	const finish = ({ cancel = false }: { cancel?: boolean } = {}) => {
		if (gesture.current && !cancel) onEdit(gesture.current.next);
		gesture.current = null;
		setDrag(null);
		setInteraction(null);
	};
	return (
		<div ref={container} className="cover-stage" data-testid="cover-preview">
			<div
				className="cover-artboard"
				style={{
					width: size.width,
					height: size.height,
					background: design?.canvas.backgroundColor ?? "#171717",
				}}
			>
				{preview ? (
					<img
						src={preview}
						alt={t("editor.cover.preview")}
						draggable={false}
					/>
				) : (
					<ImageIcon className="cover-placeholder" size={36}>
						<title>{t("editor.cover.preview")}</title>
					</ImageIcon>
				)}
				<canvas
					ref={canvasRef}
					className="cover-interaction-preview"
					role="img"
					aria-label={t("editor.cover.preview")}
					hidden={!interactionDesign}
				/>
				{design &&
					!cropping &&
					design.layers
						.slice(1)
						.filter((layer) => layer.kind === "text")
						.map((layer) => (
							<button
								key={layer.id}
								type="button"
								aria-label={`${t("editor.cover.selectText")}: ${layer.content || t("editor.cover.newText")}`}
								aria-pressed={selectedId === layer.id}
								disabled={disabled}
								data-testid={`cover-layer-${layer.id}`}
								className={`cover-text-hitbox ${selectedId === layer.id ? "is-selected" : ""}`}
								style={{
									left: `${(drag?.id === layer.id ? drag.x : layer.x) * 100}%`,
									top: `${(drag?.id === layer.id ? drag.y : layer.y) * 100}%`,
									width: `${layer.width * 100}%`,
									height: `${layer.height * 100}%`,
									transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
								}}
								onClick={(event) => {
									event.stopPropagation();
									onSelect(layer.id);
								}}
								onPointerDown={(event) => begin({ event, layer })}
								onPointerMove={move}
								onPointerUp={() => finish()}
								onPointerCancel={() => finish({ cancel: true })}
								onLostPointerCapture={() => finish({ cancel: true })}
								onKeyDown={(event) => {
									if (
										[
											"ArrowLeft",
											"ArrowRight",
											"ArrowUp",
											"ArrowDown",
										].includes(event.key)
									) {
										event.preventDefault();
										event.stopPropagation();
										const step = event.shiftKey ? 0.05 : 0.005;
										onEdit(
											updateCoverText({
												design,
												id: layer.id,
												changes: {
													x: Math.max(
														0,
														Math.min(
															1,
															layer.x +
																(event.key === "ArrowLeft"
																	? -step
																	: event.key === "ArrowRight"
																		? step
																		: 0)
														)
													),
													y: Math.max(
														0,
														Math.min(
															1,
															layer.y +
																(event.key === "ArrowUp"
																	? -step
																	: event.key === "ArrowDown"
																		? step
																		: 0)
														)
													),
												},
											})
										);
									}
								}}
							/>
						))}
				{cropping && (
					<button
						type="button"
						className="cover-crop-grid"
						aria-label={t("editor.cover.crop")}
						disabled={disabled}
						onPointerDown={(event) => begin({ event })}
						onPointerMove={move}
						onPointerUp={() => finish()}
						onPointerCancel={() => finish({ cancel: true })}
						onLostPointerCapture={() => finish({ cancel: true })}
					>
						<span />
						<span />
						<span />
						<span />
					</button>
				)}
			</div>
			{rendering && (
				<Loader2 className="cover-rendering animate-spin" size={18}>
					<title>{t("editor.cover.working")}</title>
				</Loader2>
			)}
		</div>
	);
}
