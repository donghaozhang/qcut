import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePortraitFaceStore } from "@/stores/editor/portrait-face-store";

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
	if (!detection || detection.faces.length === 0) return null;
	const isZh = locale === "zh";
	return (
		<div className="pointer-events-none absolute inset-0 z-10">
			{detection.faces.map((face, index) => {
				const selected =
					scope.mode === "face" && scope.trackId === face.trackId;
				const inert = index >= detection.appliedFaceLimit;
				return (
					<button
						type="button"
						key={face.trackId}
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
						onClick={() =>
							setScope(
								selected
									? { mode: "all" }
									: { mode: "face", trackId: face.trackId }
							)
						}
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
		</div>
	);
}
