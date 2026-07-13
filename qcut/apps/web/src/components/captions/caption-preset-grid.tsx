import { cn } from "@/lib/utils";
import {
	CAPTION_STYLE_PRESETS,
	type CaptionStylePreset,
} from "@/lib/captions/workbench";
import { useTranslation } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

const PRESET_LABEL_KEYS: Record<
	string,
	{ name: TranslationKey; platform: TranslationKey }
> = {
	"talking-head-bold": {
		name: "caption.preset.talkingHead",
		platform: "caption.platform.talkingHead",
	},
	"knowledge-highlight": {
		name: "caption.preset.knowledge",
		platform: "caption.platform.knowledge",
	},
	"bilingual-clean": {
		name: "caption.preset.bilingual",
		platform: "caption.platform.bilingual",
	},
	"karaoke-lyrics": {
		name: "caption.preset.karaoke",
		platform: "caption.platform.karaoke",
	},
	"variety-pop": {
		name: "caption.preset.variety",
		platform: "caption.platform.variety",
	},
};

export function CaptionPresetGrid({
	selectedId,
	onSelect,
	presets = CAPTION_STYLE_PRESETS,
}: {
	selectedId?: string;
	onSelect: (preset: CaptionStylePreset) => void;
	presets?: readonly CaptionStylePreset[];
}) {
	const { t } = useTranslation();

	return (
		<div className="grid grid-cols-2 gap-2" data-testid="caption-preset-grid">
			{presets.map((preset) => {
				const labels = PRESET_LABEL_KEYS[preset.id];
				const name = labels ? t(labels.name) : preset.name;
				const platform = labels ? t(labels.platform) : preset.platform;
				const selected = selectedId === preset.id;
				const previewFontSize = Math.min(
					18,
					Math.max(12, preset.style.fontSize / 3)
				);
				const previewOutlineWidth =
					preset.style.outlineWidth > 0
						? Math.min(1, Math.max(0.35, preset.style.outlineWidth / 6))
						: 0;

				return (
					<button
						key={preset.id}
						type="button"
						className={cn(
							"min-w-0 overflow-hidden rounded-md border bg-background text-left transition-colors hover:border-primary/60 hover:bg-muted/40",
							selected && "border-primary ring-1 ring-primary/30"
						)}
						onClick={() => onSelect(preset)}
						onKeyDown={(event) => {
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							onSelect(preset);
						}}
						aria-pressed={selected}
						aria-label={t("caption.applyPreset", { name })}
					>
						<span className="flex h-14 items-center justify-center overflow-hidden bg-neutral-950 px-2">
							<span
								className="max-w-full truncate"
								style={{
									color: preset.style.fontColor,
									fontFamily: preset.style.fontFamily,
									fontSize: `${previewFontSize}px`,
									fontStyle: preset.style.italic ? "italic" : "normal",
									fontWeight: preset.style.bold ? "bold" : "normal",
									letterSpacing: `${preset.style.letterSpacing / 2}px`,
									WebkitTextStroke:
										previewOutlineWidth > 0
											? `${previewOutlineWidth}px ${preset.style.outlineColor}`
											: undefined,
								}}
							>
								Aa 字幕
							</span>
						</span>
						<span className="block min-w-0 px-2 py-1.5">
							<span className="block truncate text-xs font-medium">{name}</span>
							<span className="block truncate text-[10px] text-muted-foreground">
								{platform}
							</span>
						</span>
					</button>
				);
			})}
		</div>
	);
}
