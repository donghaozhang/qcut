import type {
	MediaElement,
	MediaMask,
	TimelineTrack,
} from "../types/timeline.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import {
	isCapCut81StaticMaskType,
	resolveConfiguredMediaMasks,
	validateCapCut81MediaMaskElement,
	validateCapCut81StaticMediaMask,
} from "./mask-validation.js";

export const CAPCUT_8_1_STATIC_MASK_METADATA = {
	ellipse: {
		name: "Circle",
		resourceId: "7374021188315517456",
		resourceType: "circle",
	},
	rectangle: {
		name: "Rectangle",
		resourceId: "7374021450748924432",
		resourceType: "rectangle",
	},
} as const;

export const CAPCUT_8_1_MASK_RESOURCE_RESOLUTION_NOTE =
	"Generated masks use an empty portable path; integration must reopen the draft in CapCut 8.1 and verify that resource_id resolves the bundled mask package." as const;

export interface CapCut81CommonMaskMaterial {
	id: string;
	type: "mask";
	category: "video";
	category_name: "";
	category_id: "";
	panel: "";
	is_old_version: false;
	resource_id: string;
	constant_material_id: string;
	name: "Circle" | "Rectangle";
	resource_type: "circle" | "rectangle";
	path: "";
	position_info: "";
	config: {
		width: number;
		height: number;
		centerX: number;
		centerY: number;
		rotation: number;
		feather: 0;
		expansion: 0;
		roundCorner: 0;
		invert: false;
		aspectRatio: 1;
	};
	text_config: {
		content: "";
		font_name: "";
		font_path: "";
		font_resource_id: "";
		font_size: 15;
		bold_width: 0;
		italic_degree: 0;
		has_underline: false;
		line_gap: 0;
		char_spacing: 0;
		align_type: 15;
		scale: 1;
	};
	platform: "all";
	loader_work_space: "";
	track_segment: "";
	contour_path: null;
	source_platform: 0;
}

export interface MappedCapCut81StaticMask {
	material: CapCut81CommonMaskMaterial;
	/** Add this exact id to the owning segment's extra_material_refs. */
	extraMaterialRef: string;
}

function createMaskSourceId({
	elementId,
	mask,
}: {
	elementId: string;
	mask: MediaMask;
}): string {
	return `${elementId}:${mask.id?.trim() || "mask"}`;
}

export function mapStaticMediaMaskToCapCut81({
	elementId,
	mask,
}: {
	elementId: string;
	mask: MediaMask;
}): CapCut81CommonMaskMaterial {
	const issues = validateCapCut81StaticMediaMask({ elementId, mask });
	if (issues.length > 0 || !isCapCut81StaticMaskType({ type: mask.type })) {
		throw new RangeError(
			issues.map(({ code, message }) => `${code}: ${message}`).join("; ")
		);
	}

	const metadata =
		mask.type === "ellipse"
			? CAPCUT_8_1_STATIC_MASK_METADATA.ellipse
			: CAPCUT_8_1_STATIC_MASK_METADATA.rectangle;
	const sourceId = createMaskSourceId({ elementId, mask });
	return {
		id: createDeterministicJianyingId({
			namespace: "capcut-8.1-common-mask",
			sourceId,
		}),
		type: "mask",
		category: "video",
		category_name: "",
		category_id: "",
		panel: "",
		is_old_version: false,
		resource_id: metadata.resourceId,
		constant_material_id: createDeterministicJianyingId({
			namespace: "capcut-8.1-common-mask-constant-material",
			sourceId,
		}),
		name: metadata.name,
		resource_type: metadata.resourceType,
		path: "",
		position_info: "",
		config: {
			width: mask.width,
			height: mask.height,
			centerX: (mask.centerX - 0.5) * 2,
			centerY: (mask.centerY - 0.5) * 2,
			rotation: mask.rotation,
			feather: 0,
			expansion: 0,
			roundCorner: 0,
			invert: false,
			aspectRatio: 1,
		},
		text_config: {
			content: "",
			font_name: "",
			font_path: "",
			font_resource_id: "",
			font_size: 15,
			bold_width: 0,
			italic_degree: 0,
			has_underline: false,
			line_gap: 0,
			char_spacing: 0,
			align_type: 15,
			scale: 1,
		},
		platform: "all",
		loader_work_space: "",
		track_segment: "",
		contour_path: null,
		source_platform: 0,
	};
}

export function mapMediaElementStaticMaskToCapCut81({
	element,
	track,
}: {
	element: MediaElement;
	track: TimelineTrack;
}): MappedCapCut81StaticMask | null {
	const issues = validateCapCut81MediaMaskElement({ element, track });
	if (issues.length > 0) {
		throw new RangeError(
			issues.map(({ code, message }) => `${code}: ${message}`).join("; ")
		);
	}

	const [mask] = resolveConfiguredMediaMasks({ element });
	if (!mask) return null;
	const material = mapStaticMediaMaskToCapCut81({
		elementId: element.id,
		mask,
	});
	return {
		extraMaterialRef: material.id,
		material,
	};
}
