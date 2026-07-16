import type { TextTemplateDefinition } from "@/lib/text/text-template-registry";
import type { TextTemplatePackPayload } from "@/lib/text/text-template-packs";
import type { TextElement } from "@/types/timeline";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { renderTextTemplateThumbnail } from "./text-template-thumbnail-renderer";

const THUMBNAIL_CANVAS_SIZE = {
	width: 320,
	height: 304,
} as const;

export function TextTemplateThumbnail({
	definition,
	pack,
	template,
	thumbnailUrl,
}: {
	definition: TextTemplateDefinition;
	pack?: TextTemplatePackPayload;
	template: TextElement;
	thumbnailUrl?: string;
}) {
	const { t } = useTranslation();
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<
		string | undefined
	>();
	const showImage =
		Boolean(thumbnailUrl) && failedThumbnailUrl !== thumbnailUrl;
	const thumbnailLabel = t("textLibrary.thumbnailAria", {
		name: template.name,
	});

	useEffect(() => {
		if (showImage) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		renderTextTemplateThumbnail({ canvas, definition, pack, template });
	}, [definition, pack, showImage, template]);

	return (
		<div
			className="absolute inset-0 overflow-hidden"
			data-thumbnail-renderer={showImage ? "image" : "canvas"}
		>
			{showImage ? (
				<img
					alt={thumbnailLabel}
					className="h-full w-full object-cover"
					decoding="async"
					draggable={false}
					src={thumbnailUrl}
					onError={() => setFailedThumbnailUrl(thumbnailUrl)}
				/>
			) : (
				<canvas
					ref={canvasRef}
					aria-label={thumbnailLabel}
					className="h-full w-full"
					height={THUMBNAIL_CANVAS_SIZE.height}
					role="img"
					width={THUMBNAIL_CANVAS_SIZE.width}
				/>
			)}
			<span className="sr-only">{template.content}</span>
		</div>
	);
}
