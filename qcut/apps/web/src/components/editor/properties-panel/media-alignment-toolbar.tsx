import {
	AlignHorizontalJustifyCenter,
	AlignHorizontalJustifyEnd,
	AlignHorizontalJustifyStart,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyEnd,
	AlignVerticalJustifyStart,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { IconButton } from "./visual-property-controls";

/**
 * Canvas alignment row shown at the top of the basic sub-tab. Distribute
 * buttons are deliberately absent: the panel edits one element, so there is
 * nothing to distribute against.
 */
export function MediaAlignmentToolbar({
	onAlignX,
	onAlignY,
}: {
	onAlignX: (alignment: "left" | "center" | "right") => void;
	onAlignY: (alignment: "top" | "center" | "bottom") => void;
}) {
	const { t } = useTranslation();
	return (
		<div
			className="flex items-center gap-1 rounded-sm border border-border/70 bg-muted/30 p-1"
			role="toolbar"
			aria-label={t("mediaProperties.alignmentToolbar")}
			data-testid="media-alignment-toolbar"
		>
			<IconButton
				label={t("mediaProperties.alignLeft")}
				onClick={() => onAlignX("left")}
			>
				<AlignHorizontalJustifyStart className="size-4" />
			</IconButton>
			<IconButton
				label={t("mediaProperties.alignCenter")}
				onClick={() => onAlignX("center")}
			>
				<AlignHorizontalJustifyCenter className="size-4" />
			</IconButton>
			<IconButton
				label={t("mediaProperties.alignRight")}
				onClick={() => onAlignX("right")}
			>
				<AlignHorizontalJustifyEnd className="size-4" />
			</IconButton>
			<span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
			<IconButton
				label={t("mediaProperties.alignTop")}
				onClick={() => onAlignY("top")}
			>
				<AlignVerticalJustifyStart className="size-4" />
			</IconButton>
			<IconButton
				label={t("mediaProperties.alignMiddle")}
				onClick={() => onAlignY("center")}
			>
				<AlignVerticalJustifyCenter className="size-4" />
			</IconButton>
			<IconButton
				label={t("mediaProperties.alignBottom")}
				onClick={() => onAlignY("bottom")}
			>
				<AlignVerticalJustifyEnd className="size-4" />
			</IconButton>
		</div>
	);
}
