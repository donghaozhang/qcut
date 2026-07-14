import type { TextTemplateDefinition } from "@/lib/text/text-template-registry";
import type { TextElement } from "@/types/timeline";
import { useEffect, useRef } from "react";
import { renderTextTemplateThumbnail } from "./text-template-thumbnail-renderer";

const THUMBNAIL_CANVAS_SIZE = {
	width: 320,
	height: 304,
} as const;

export function TextTemplateThumbnail({
	definition,
	template,
}: {
	definition: TextTemplateDefinition;
	template: TextElement;
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		renderTextTemplateThumbnail({ canvas, definition, template });
	}, [definition, template]);

	return (
		<div
			className="absolute inset-0 overflow-hidden"
			data-thumbnail-renderer="canvas"
		>
			<canvas
				ref={canvasRef}
				aria-label={`${template.name} 缩略图`}
				className="h-full w-full"
				height={THUMBNAIL_CANVAS_SIZE.height}
				role="img"
				width={THUMBNAIL_CANVAS_SIZE.width}
			/>
			<span className="sr-only">{template.content}</span>
		</div>
	);
}
