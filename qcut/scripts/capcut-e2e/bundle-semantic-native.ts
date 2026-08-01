import {
	getMaterials,
	getRangeEvidence,
	getSegments,
	getTracks,
	type JsonRecord,
	requireArray,
	requireExactValue,
	requireRecord,
	requireSingle,
	requireString,
	type TimelineRangeEvidence,
} from "./bundle-semantic-json.js";

const TIMELINE_DURATION_US = 6_000_000;
const TITLE_TEXT = "剪映真实导入测试 ABC123";
const CAPTION_TEXT = "原生字幕验证 ABC123";

export interface NativeSemanticEvidence {
	audio: TimelineRangeEvidence & { materialName: string };
	caseId: "native-text-sticker";
	sticker: TimelineRangeEvidence & {
		height: number;
		materialName: string;
		type: "photo";
		width: number;
	};
	systemFontFallback: true;
	textPayloads: readonly [typeof CAPTION_TEXT, typeof TITLE_TEXT];
}

function assertNoExplicitFont({
	index,
	material,
	payload,
}: {
	index: number;
	material: JsonRecord;
	payload: JsonRecord;
}): void {
	for (const key of ["font_name", "font_path", "font_resource_id"]) {
		if (material[key] !== undefined && material[key] !== "") {
			throw new Error(`Native text ${index} must use system font fallback.`);
		}
	}
	const styles = requireArray({
		label: `Native text ${index} styles`,
		value: payload.styles,
	});
	for (const [styleIndex, styleValue] of styles.entries()) {
		const style = requireRecord({
			label: `Native text ${index} style ${styleIndex}`,
			value: styleValue,
		});
		if (style.font !== undefined) {
			throw new Error(
				`Native text ${index} style ${styleIndex} must not bind a custom font.`
			);
		}
	}
}

function verifyTextPayloads({
	content,
	texts,
}: {
	content: JsonRecord;
	texts: JsonRecord[];
}): void {
	const materials = requireRecord({
		label: "Native materials",
		value: content.materials,
	});
	if (
		materials.fonts !== undefined &&
		requireArray({ label: "Native font materials", value: materials.fonts })
			.length > 0
	) {
		throw new Error("Native case must not contain custom font materials.");
	}
	const decodedTexts = texts
		.map((material, index) => {
			const payload = requireRecord({
				label: `Native text ${index} payload`,
				value: JSON.parse(
					requireString({
						label: `Native text ${index} content`,
						value: material.content,
					})
				),
			});
			assertNoExplicitFont({ index, material, payload });
			return requireString({
				label: `Native text ${index}`,
				value: payload.text,
			});
		})
		.sort();
	requireExactValue({
		actual: decodedTexts,
		expected: [CAPTION_TEXT, TITLE_TEXT].sort(),
		label: "Native text payloads",
	});
}

function verifyTextTracks({
	content,
	texts,
}: {
	content: JsonRecord;
	texts: JsonRecord[];
}): void {
	const textTracks = getTracks({ content, type: "text" });
	if (textTracks.length !== 2) {
		throw new Error("Native case must contain exactly two text tracks.");
	}
	const segments = textTracks.flatMap((track) =>
		getSegments({ label: "Native text track", track })
	);
	if (segments.length !== 2) {
		throw new Error("Native case must contain exactly two text segments.");
	}
	const actualMaterialIds = segments
		.map((segment) =>
			requireString({
				label: "Native text segment material ID",
				value: segment.material_id,
			})
		)
		.sort();
	const expectedMaterialIds = texts
		.map((material) =>
			requireString({
				label: "Native text material ID",
				value: material.id,
			})
		)
		.sort();
	requireExactValue({
		actual: actualMaterialIds,
		expected: expectedMaterialIds,
		label: "Native text segment material coverage",
	});
	for (const segment of segments) {
		requireExactValue({
			actual: {
				source: segment.source_timerange,
				target: segment.target_timerange,
			},
			expected: {
				source: null,
				target: { duration: TIMELINE_DURATION_US, start: 0 },
			},
			label: "Native text segment range",
		});
	}
}

export function verifyNativeSemantics({
	content,
}: {
	content: JsonRecord;
}): NativeSemanticEvidence {
	const texts = getMaterials({ content, key: "texts" });
	if (texts.length !== 2) {
		throw new Error("Native case must contain two text materials.");
	}
	verifyTextPayloads({ content, texts });
	verifyTextTracks({ content, texts });

	const videos = getMaterials({ content, key: "videos" });
	if (videos.length !== 2) {
		throw new Error("Native case must contain video and photo materials.");
	}
	const photo = requireSingle({
		label: "Native photo material",
		values: videos.filter(({ type }) => type === "photo"),
	});
	requireExactValue({
		actual: {
			height: photo.height,
			name: photo.material_name,
			width: photo.width,
		},
		expected: { height: 512, name: "icon.png", width: 512 },
		label: "Sticker material",
	});
	const sourceVideo = requireSingle({
		label: "Native source video material",
		values: videos.filter(({ type }) => type === "video"),
	});
	requireExactValue({
		actual: sourceVideo.material_name,
		expected: "source-video.mp4",
		label: "Source video material name",
	});

	const audioMaterial = requireSingle({
		label: "Native audio material",
		values: getMaterials({ content, key: "audios" }),
	});
	requireExactValue({
		actual: audioMaterial.name,
		expected: "source-audio.wav",
		label: "Audio material name",
	});
	const audioTrack = requireSingle({
		label: "Native audio track",
		values: getTracks({ content, type: "audio" }),
	});
	const audioSegment = requireSingle({
		label: "Native audio segment",
		values: getSegments({ label: "Native audio track", track: audioTrack }),
	});
	requireExactValue({
		actual: audioSegment.material_id,
		expected: audioMaterial.id,
		label: "Native audio material reference",
	});
	const audioRange = getRangeEvidence({ segment: audioSegment });
	const fullRange = {
		durationMicroseconds: TIMELINE_DURATION_US,
		sourceStartMicroseconds: 0,
		targetStartMicroseconds: 0,
	};
	requireExactValue({
		actual: audioRange,
		expected: fullRange,
		label: "Native audio range",
	});

	const photoSegment = requireSingle({
		label: "Native sticker photo segment",
		values: getTracks({ content, type: "video" })
			.flatMap((track) => getSegments({ label: "Native video track", track }))
			.filter(({ material_id }) => material_id === photo.id),
	});
	const stickerRange = getRangeEvidence({ segment: photoSegment });
	requireExactValue({
		actual: stickerRange,
		expected: fullRange,
		label: "Native sticker range",
	});

	return {
		audio: { ...audioRange, materialName: "source-audio.wav" },
		caseId: "native-text-sticker",
		sticker: {
			...stickerRange,
			height: 512,
			materialName: "icon.png",
			type: "photo",
			width: 512,
		},
		systemFontFallback: true,
		textPayloads: [CAPTION_TEXT, TITLE_TEXT],
	};
}
