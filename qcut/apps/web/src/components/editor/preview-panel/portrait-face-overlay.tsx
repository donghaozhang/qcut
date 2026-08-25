import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePortraitFaceStore } from "@/stores/editor/portrait-face-store";
import { usePortraitManualRetouchStore } from "@/stores/editor/portrait-manual-retouch-store";
import { portraitScopeForDetectedFace } from "@/lib/portrait/portrait-face-scope";

/**
 * Draws the faces the native runtime is tracking over the preview and lets the
 * user pick one to edit. Boxes come from the detector in normalized frame
 * coordinates, so they follow the preview at any fit mode without extra math.
 */
export function PortraitFaceOverlay() {
	const { locale } = useTranslation();
	const detection = usePortraitFaceStore((state) => state.detection);
	const scope = usePortraitFaceStore((state) => state.scope);
	const setScope = usePortraitFaceStore((state) => state.setScope);
	const manualActive = usePortraitManualRetouchStore((state) => state.active);
	const manualMode = usePortraitManualRetouchStore((state) => state.mode);
	const brushSize = usePortraitManualRetouchStore((state) => state.size);
	const draft = usePortraitManualRetouchStore((state) => state.draft);
	const beginStroke = usePortraitManualRetouchStore(
		(state) => state.beginStroke
	);
	const appendPoint = usePortraitManualRetouchStore(
		(state) => state.appendPoint
	);
	const finishStroke = usePortraitManualRetouchStore(
		(state) => state.finishStroke
	);
	const cancelStroke = usePortraitManualRetouchStore(
		(state) => state.cancelStroke
	);
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
	if ((!detection || detection.faces.length === 0) && !manualActive)
		return null;
	const isZh = locale === "zh";
	const pointForEvent = ({
		clientX,
		clientY,
		currentTarget,
	}: {
		clientX: number;
		clientY: number;
		currentTarget: HTMLElement;
	}) => {
		const bounds = currentTarget.getBoundingClientRect();
		return {
			x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
			y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height)),
		};
	};
	return (
		<div
			className="pointer-events-none absolute inset-0 z-[80]"
			data-testid="portrait-face-overlay"
		>
			{(detection?.faces ?? []).map((face, index) => {
				const selected =
					scope.mode === "face" &&
					scope.personBindingId === face.personBindingId;
				const inert = index >= (detection?.appliedFaceLimit ?? 0);
				return (
					<button
						type="button"
						key={face.personBindingId}
						className={cn(
							"pointer-events-auto absolute rounded-sm border-2 transition-colors",
							selected
								? "border-primary"
								: inert
									? "border-muted-foreground/40 border-dashed"
									: "border-white/70 hover:border-white"
						)}
						style={{
							left: `${face.rect.x * 100}%`,
							top: `${face.rect.y * 100}%`,
							width: `${face.rect.width * 100}%`,
							height: `${face.rect.height * 100}%`,
						}}
						aria-pressed={selected}
						aria-label={`${isZh ? "人脸" : "Face"} ${index + 1}`}
						data-testid={`portrait-face-${face.personBindingId}`}
						data-face-id={face.faceId}
						data-freid-track-id={face.freidTrackId}
						data-person-binding-id={face.personBindingId}
						data-binding-status={face.bindingStatus}
						onClick={(event) => {
							event.stopPropagation();
							setScope(
								selected
									? { mode: "all" }
									: portraitScopeForDetectedFace({
											face,
											frameNumber: detection?.frameNumber ?? 0,
										})
							);
						}}
						onPointerDown={(event) => event.stopPropagation()}
						onKeyDown={(event) => event.stopPropagation()}
					>
						<span
							className={cn(
								"absolute -top-5 left-0 rounded px-1 text-[10px] leading-4",
								selected
									? "bg-primary text-primary-foreground"
									: "bg-black/60 text-white"
							)}
						>
							{`${isZh ? "人脸" : "Face"} ${index + 1}`}
							{inert ? (isZh ? "（不生效）" : " (inert)") : ""}
						</span>
					</button>
				);
			})}
			{manualActive ? (
				<div
					className="pointer-events-auto absolute inset-0 z-10 touch-none cursor-crosshair"
					data-testid="portrait-manual-retouch-overlay"
					data-manual-retouch-mode={manualMode}
					role="application"
					aria-label={isZh ? "手动美颜画布" : "Manual retouch canvas"}
					onPointerEnter={(event) =>
						setCursor(
							pointForEvent({
								clientX: event.clientX,
								clientY: event.clientY,
								currentTarget: event.currentTarget,
							})
						)
					}
					onPointerLeave={() => {
						if (!draft) setCursor(null);
					}}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						const point = pointForEvent({
							clientX: event.clientX,
							clientY: event.clientY,
							currentTarget: event.currentTarget,
						});
						const faceTrackId = detection?.faces.find(
							(face) =>
								point.x >= face.rect.x &&
								point.x <= face.rect.x + face.rect.width &&
								point.y >= face.rect.y &&
								point.y <= face.rect.y + face.rect.height
						)?.trackId;
						event.currentTarget.setPointerCapture(event.pointerId);
						setCursor(point);
						beginStroke({ point, faceTrackId });
						event.preventDefault();
						event.stopPropagation();
					}}
					onPointerMove={(event) => {
						const point = pointForEvent({
							clientX: event.clientX,
							clientY: event.clientY,
							currentTarget: event.currentTarget,
						});
						setCursor(point);
						if (draft) appendPoint({ point });
					}}
					onPointerUp={(event) => {
						if (!draft) return;
						const point = pointForEvent({
							clientX: event.clientX,
							clientY: event.clientY,
							currentTarget: event.currentTarget,
						});
						appendPoint({ point });
						finishStroke();
						event.currentTarget.releasePointerCapture(event.pointerId);
						event.preventDefault();
						event.stopPropagation();
					}}
					onPointerCancel={cancelStroke}
				>
					{cursor ? (
						<span
							className={cn(
								"pointer-events-none absolute rounded-full border-2 shadow-sm",
								manualMode === "erase"
									? "border-white bg-black/20"
									: "border-cyan-300 bg-cyan-300/15"
							)}
							style={{
								left: `${cursor.x * 100}%`,
								top: `${cursor.y * 100}%`,
								width: `${12 + brushSize * 1.2}px`,
								height: `${12 + brushSize * 1.2}px`,
								transform: "translate(-50%, -50%)",
							}}
						/>
					) : null}
				</div>
			) : null}
		</div>
	);
}
