export function coverLayoutFixture() {
	const fontReference = `text/${"b".repeat(32)}`;
	const effectReference = `textEffect/${"c".repeat(32)}`;
	const text = {
		id: "text-1",
		content: "Hello",
		font_path: fontReference,
		font_title: "Fixture Font",
		font_size: 15,
		alignment: 1,
		typesetting: 0,
		text_alpha: 0.8,
		text_color: "#ffffff",
		bold_width: 0,
		italic_degree: 0,
		underline: false,
		border_color: "",
		border_width: 0.06,
		background_color: "",
		background_alpha: 1,
		has_shadow: false,
		shadow_color: "",
		shadow_alpha: 0,
		shadow_smoothing: 0,
		shadow_point: { x: 0, y: 0 },
		letter_spacing: 0,
		line_spacing: 0.1,
		shape_clip_x: false,
		shape_clip_y: false,
	};
	const segment = {
		id: "segment-1",
		material_id: text.id,
		render_index: 2,
		extra_material_refs: [] as string[],
		keyframe_refs: [] as string[],
		clip: {
			alpha: 0.5,
			rotation: 0,
			flip: { horizontal: false, vertical: false },
			scale: { x: 1, y: 1 },
			transform: { x: -0.5, y: 0.5 },
		},
	};
	const effect = {
		id: "effect-1",
		type: "text_effect",
		path: effectReference,
		resource_id: "123",
		name: "Fixture Word Art",
	};
	const filter = {
		id: "filter-1",
		type: "filter",
		path: `filter/${"d".repeat(32)}`,
		resource_id: "456",
		name: "Missing background filter",
	};
	const definition = {
		canvas_config: { width: 1280, height: 720 },
		cover: {
			cover_draft: {
				materials: {
					texts: [text],
					effects: [effect, filter],
					videos: [{ id: "video-1", path: "/author/private.mov" }],
				},
				tracks: [
					{ type: "text", segments: [segment] },
					{
						type: "video",
						segments: [
							{
								...segment,
								id: "background",
								material_id: "video-1",
								extra_material_refs: [filter.id],
							},
						],
					},
				],
			},
		},
	};
	return {
		definition,
		text,
		segment,
		effect,
		filter,
		fontReference,
		effectReference,
	};
}
