import { ImageOff } from "lucide-react";
import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";
import { useStyleCover } from "../media-panel/views/text-style-lab/jianying-text-style-lab";
import { activateCoverControl } from "./cover-tool";

export function CoverWordArtCard({
	style,
	disabled,
	selected,
	zh,
	onApply,
}: {
	style: JianyingTextStyleLabStyleSummary;
	disabled: boolean;
	selected: boolean;
	zh: boolean;
	onApply: () => void;
}) {
	const cover = useStyleCover({ style });
	const title = style.title ?? style.resourceId;
	const mode = style.runtimeReference
		? zh
			? "本机原版渲染"
			: "Native runtime"
		: style.approximation
			? zh
				? "静态近似"
				: "Static approximation"
			: zh
				? "仅参考"
				: "Preview only";
	return (
		<button
			type="button"
			className="cover-style-card"
			title={`${title} · ${mode}`}
			aria-label={`${mode} · ${title}`}
			aria-pressed={selected}
			disabled={disabled || !(style.runtimeReference || style.approximation)}
			onClick={onApply}
			onKeyDown={(event) => activateCoverControl({ event })}
			data-testid={`cover-word-art-${style.styleId}`}
		>
			<div className="cover-word-art-image">
				{cover.state === "ready" ? (
					<img src={cover.url} alt="" />
				) : (
					<ImageOff size={20}>
						<title>{title}</title>
					</ImageOff>
				)}
			</div>
			<span>{title}</span>
			<small>{mode}</small>
		</button>
	);
}
