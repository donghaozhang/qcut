import { asJianyingRecord } from "../jianying-text-package-metadata.js";

const CUSTOM_CONTOUR_POLYGON_SHAPE_TYPE = 4;

function isTextWidget({ value }: { value: unknown }) {
	return asJianyingRecord(value)?.type === "text";
}

function isUnsupportedCustomContourShape({ value }: { value: unknown }) {
	const widget = asJianyingRecord(value);
	if (widget?.type !== "shape") return false;
	const shapeParameters = asJianyingRecord(widget.shape_params);
	return (
		shapeParameters?.shape_type === CUSTOM_CONTOUR_POLYGON_SHAPE_TYPE &&
		asJianyingRecord(shapeParameters.custom_points) !== null
	);
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
