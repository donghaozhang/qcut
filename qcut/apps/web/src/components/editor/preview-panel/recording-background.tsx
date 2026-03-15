import type { BackgroundConfig } from "@/lib/screen-recording/wallpapers";
import { GRADIENT_PRESETS } from "@/lib/screen-recording/wallpapers";
import type { ReactNode } from "react";

interface RecordingBackgroundProps {
	background: BackgroundConfig;
	width: number;
	height: number;
	children: ReactNode;
}

/**
 * Wraps the video preview with a styled background —
 * gradient/solid fill, rounded corners, padding, and drop shadow.
 */
export function RecordingBackground({
	background,
	width,
	height,
	children,
}: RecordingBackgroundProps) {
	const bgStyle = getBackgroundStyle(background, width, height);

	return (
		<div className="absolute inset-0" style={bgStyle.container}>
			<div style={bgStyle.videoWrapper}>{children}</div>
		</div>
	);
}

function getBackgroundStyle(
	config: BackgroundConfig,
	width: number,
	height: number
): {
	container: React.CSSProperties;
	videoWrapper: React.CSSProperties;
} {
	const angle = config.gradientAngle ?? 135;
	let backgroundCss: string;

	if (config.type === "gradient") {
		const colors = resolveGradientColors(config);
		backgroundCss = `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})`;
	} else if (config.type === "solid") {
		backgroundCss = config.solidColor ?? "#1a1a2e";
	} else {
		backgroundCss = "transparent";
	}

	const padding = config.padding;

	const container: React.CSSProperties = {
		width,
		height,
		background: backgroundCss,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	};

	const videoWrapper: React.CSSProperties = {
		width: width - padding * 2,
		height: height - padding * 2,
		borderRadius: config.borderRadius,
		overflow: "hidden",
		position: "relative",
		...(config.shadow
			? {
					boxShadow:
						"0 20px 60px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(0, 0, 0, 0.3)",
				}
			: {}),
	};

	return { container, videoWrapper };
}

function resolveGradientColors(config: BackgroundConfig): [string, string] {
	if (config.gradientColors) return config.gradientColors;
	if (config.gradientId) {
		const preset = GRADIENT_PRESETS.find((g) => g.id === config.gradientId);
		if (preset) return preset.colors;
	}
	return ["#667eea", "#764ba2"];
}
