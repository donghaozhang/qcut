import type { PlanarTrackingDirection } from "@qcut/editor-core";
import {
	ArrowLeftRight,
	StepBack,
	StepForward,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

const DIRECTION_OPTIONS: Array<{
	direction: PlanarTrackingDirection;
	icon: LucideIcon;
}> = [
	{ direction: "backward", icon: StepBack },
	{ direction: "both", icon: ArrowLeftRight },
	{ direction: "forward", icon: StepForward },
];

export function PlanarTrackingDirectionControl({
	disabled,
	onChange,
	value,
}: {
	disabled: boolean;
	onChange: (input: { direction: PlanarTrackingDirection }) => void;
	value: PlanarTrackingDirection;
}) {
	const { t } = useTranslation();
	return (
		<div
			className="grid grid-cols-3 gap-1"
			role="group"
			aria-label={t("stickerProperties.tracking.direction")}
		>
			{DIRECTION_OPTIONS.map(({ direction, icon: Icon }) => {
				const label = t(`stickerProperties.tracking.direction.${direction}`);
				return (
					<Button
						key={direction}
						type="button"
						variant={value === direction ? "default" : "outline"}
						size="icon"
						className="h-8 w-full"
						title={label}
						aria-label={label}
						onClick={() => onChange({ direction })}
						onKeyDown={(event) => event.stopPropagation()}
						disabled={disabled}
					>
						<Icon className="size-4">
							<title>{label}</title>
						</Icon>
					</Button>
				);
			})}
		</div>
	);
}
