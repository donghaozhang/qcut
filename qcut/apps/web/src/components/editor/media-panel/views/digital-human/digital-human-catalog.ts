import type { TranslationKey } from "@/lib/i18n";
import type { DigitalHumanShotSize } from "@/stores/digital-human-store";

export interface DigitalHumanShotOption {
	id: DigitalHumanShotSize;
	labelKey: TranslationKey;
	/**
	 * Window onto the schematic figure, in its own 100x150 coordinate space. The
	 * framing *is* the shot, so it is expressed as a viewBox rather than a
	 * scale/offset pair — a tighter box crops to the head without pushing it out
	 * of frame. Every box keeps the 3:4 card ratio so nothing is distorted.
	 */
	viewBox: string;
}

export const DIGITAL_HUMAN_SHOT_OPTIONS: readonly DigitalHumanShotOption[] = [
	{
		id: "wide",
		labelKey: "digitalHuman.shot.wide",
		viewBox: "-4 4 109 145",
	},
	{
		id: "medium",
		labelKey: "digitalHuman.shot.medium",
		viewBox: "12 8 75 100",
	},
	{
		id: "close",
		labelKey: "digitalHuman.shot.close",
		viewBox: "23 12 54 72",
	},
	{
		id: "closeup",
		labelKey: "digitalHuman.shot.closeup",
		viewBox: "32 14 36 48",
	},
];

/**
 * Flat background swatches. The first two grid cells (clear + custom colour) are
 * rendered as controls rather than entries in this list.
 */
export const DIGITAL_HUMAN_BACKGROUND_COLORS: readonly string[] = [
	"#ffffff",
	"#d9d9d9",
	"#a6a6a6",
	"#737373",
	"#000000",
	"#f7c8cd",
	"#f08a7a",
	"#ec5b3a",
	"#d92b1f",
	"#8f1d18",
	"#d9a191",
	"#c2703a",
	"#e8802a",
	"#c25a12",
	"#8a2f1c",
	"#d8d98a",
	"#c6d92b",
	"#d9b22b",
	"#e8a11a",
	"#8a6a12",
	"#e3a8d9",
	"#d94fb5",
	"#a52b8f",
	"#5c2b8a",
	"#8ab4d9",
	"#2b7ad9",
	"#1d4f8f",
	"#8ad9c6",
	"#2bd9a5",
	"#12806a",
];

/** Swatches shown before the palette is expanded, matching Jianying's two rows. */
export const DIGITAL_HUMAN_COLLAPSED_COLOR_COUNT = 22;
