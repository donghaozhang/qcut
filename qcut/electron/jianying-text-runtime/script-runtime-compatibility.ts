import { asJianyingRecord } from "../jianying-text-package-metadata.js";

const CUSTOM_CONTOUR_POLYGON_SHAPE_TYPE = 4;

function isTextWidget({ value }: { value: unknown }) {
	return asJianyingRecord(value)?.type === "text";
}

function isUnsupportedCustomContourShape({ value }: { value: unknown }) {
	const widget = asJianyingRecord(value);
	if (widget?.type !== "shape") return false;
	const shapeParameters = asJianyingRecord(widget.shape_params);
	// Same predicate as script-host-resolver's hasCustomContourShape: any
	// shape_type-4 shape counts, regardless of how custom_points is stored —
	// otherwise a shape the resolver flagged as host-requiring would survive
	// this filter when no compatible host is installed.
	return shapeParameters?.shape_type === CUSTOM_CONTOUR_POLYGON_SHAPE_TYPE;
}

export function filterJianyingScriptRuntimeCompatibleChildren({
	children,
}: {
	children: unknown[];
}) {
	if (!children.some((child) => isTextWidget({ value: child }))) {
		return children;
	}
	return children.filter(
		(child) => !isUnsupportedCustomContourShape({ value: child })
	);
}
