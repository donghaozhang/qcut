import { useState } from "react";
import { Scaling } from "lucide-react";
import type { CoverTextLayerV1 } from "@qcut/editor-core/cover";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n";
import { activateCoverControl } from "./cover-tool";
import "./cover-text-style.css";

const LABELS = {
	width: "editor.cover.textWidth",
	height: "editor.cover.textHeight",
	rotation: "editor.cover.rotation",
} as const;

export function CoverTextGeometry({
	layer,
	disabled,
	onChange,
}: {
	layer?: CoverTextLayerV1;
	disabled: boolean;
	onChange: (changes: Partial<CoverTextLayerV1>) => void;
}) {
	const { t, locale } = useTranslation();
	const [open, setOpen] = useState(false);
	const label = locale === "zh" ? "尺寸与旋转" : "Size and rotation";
	const off = disabled || !layer;
	return (
		<Popover open={open && !off} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="cover-tool"
					title={label}
					aria-label={label}
					data-testid="cover-geometry"
					disabled={off}
					onKeyDown={(event) => activateCoverControl({ event })}
				>
					<Scaling size={16}>
						<title>{label}</title>
					</Scaling>
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="cover-style-popover"
				align="start"
				collisionPadding={12}
				aria-label={label}
				onEscapeKeyDown={(event) => event.stopPropagation()}
			>
				<header>
					<strong>{label}</strong>
				</header>
				<fieldset disabled={off}>
					{(["width", "height", "rotation"] as const).map((field) => {
						const ratio = field !== "rotation";
						const min = ratio ? 5 : -180;
						const max = ratio ? 100 : 180;
						const fieldLabel = t(LABELS[field]);
						const value = Math.round((layer?.[field] ?? 0) * (ratio ? 100 : 1));
						return (
							<label className="cover-style-field" key={field}>
								<span>{fieldLabel}</span>
								{(["range", "number"] as const).map((type) => (
									<input
										key={type}
										type={type}
										aria-label={`${fieldLabel}${type === "number" ? (locale === "zh" ? " 数值" : " value") : ""}`}
										min={min}
										max={max}
										step={1}
										value={value}
										onChange={(event) => {
											const next = event.target.valueAsNumber;
											if (Number.isFinite(next))
												onChange({
													[field]:
														Math.max(min, Math.min(max, next)) /
														(ratio ? 100 : 1),
												});
										}}
									/>
								))}
							</label>
						);
					})}
				</fieldset>
			</PopoverContent>
		</Popover>
	);
}
