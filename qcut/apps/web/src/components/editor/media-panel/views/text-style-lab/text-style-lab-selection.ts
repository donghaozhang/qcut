import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";

const TRIAL_STYLE_COUNT = 5;

export function displayTitle({
	style,
}: {
	style: JianyingTextStyleLabStyleSummary;
}) {
	return style.title ?? `本机花字 ${style.resourceId.slice(-6)}`;
}

export function selectTrialStyles({
	styles,
}: {
	styles: JianyingTextStyleLabStyleSummary[];
}) {
	return styles
		.filter(
			(style) =>
				style.approximation &&
				style.fillKind === "solid" &&
				style.textureLayerCount === 0
		)
		.sort((left, right) => {
			const titleDelta =
				Number(Boolean(right.title)) - Number(Boolean(left.title));
			return (
				titleDelta ||
				displayTitle({ style: left }).localeCompare(
					displayTitle({ style: right }),
					"zh-CN"
				)
			);
		})
		.slice(0, TRIAL_STYLE_COUNT);
}
