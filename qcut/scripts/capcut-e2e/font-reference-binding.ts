import { isDeepStrictEqual } from "node:util";

export interface FieldSnapshot {
	present: boolean;
	value: unknown;
}

export interface CapCut81FontBindingSnapshot {
	materialFields: Readonly<Record<string, unknown>>;
	materialFonts: FieldSnapshot;
	styleFonts: readonly (FieldSnapshot & { styleIndex: number })[];
	text: string;
	topLevelFontMaterials: FieldSnapshot;
}

export function collectFontBindingChangedPaths({
	after,
	before,
}: {
	after: CapCut81FontBindingSnapshot;
	before: CapCut81FontBindingSnapshot;
}): string[] {
	const materialKeys = new Set([
		...Object.keys(before.materialFields),
		...Object.keys(after.materialFields),
	]);
	const changedMaterialPaths = [...materialKeys]
		.sort()
		.filter(
			(key) =>
				!isDeepStrictEqual(
					before.materialFields[key],
					after.materialFields[key]
				)
		)
		.map((key) => `material.${key}`);
	const styleCount = Math.max(
		before.styleFonts.length,
		after.styleFonts.length
	);
	const changedStylePaths = Array.from(
		{ length: styleCount },
		(_, styleIndex) =>
			isDeepStrictEqual(
				before.styleFonts[styleIndex],
				after.styleFonts[styleIndex]
			)
				? null
				: `content.styles[${styleIndex}].font`
	).filter((path): path is string => path !== null);
	return [
		...changedMaterialPaths,
		...(isDeepStrictEqual(before.materialFonts, after.materialFonts)
			? []
			: ["material.fonts"]),
		...(isDeepStrictEqual(
			before.topLevelFontMaterials,
			after.topLevelFontMaterials
		)
			? []
			: ["materials.fonts"]),
		...changedStylePaths,
	];
}

function containsExactString({
	needle,
	value,
}: {
	needle: string;
	value: unknown;
}): boolean {
	if (typeof value === "string") return value === needle;
	if (Array.isArray(value)) {
		return value.some((entry) => containsExactString({ needle, value: entry }));
	}
	if (value === null || typeof value !== "object") return false;
	return Object.values(value as Record<string, unknown>).some((entry) =>
		containsExactString({ needle, value: entry })
	);
}

function collectResourceIds({ value }: { value: unknown }): string[] {
	if (Array.isArray(value)) {
		return value.flatMap((entry) => collectResourceIds({ value: entry }));
	}
	if (value === null || typeof value !== "object") return [];
	return Object.entries(value as Record<string, unknown>).flatMap(
		([key, entry]) =>
			(key === "id" || key.endsWith("_id")) &&
			typeof entry === "string" &&
			entry.length > 0
				? [entry]
				: []
	);
}

export function fontBindingContainsExactLabel({
	binding,
	fontLabel,
}: {
	binding: CapCut81FontBindingSnapshot;
	fontLabel: string;
}): boolean {
	const targetBindings = [
		binding.materialFields,
		binding.materialFonts.value,
		binding.styleFonts.map(({ value }) => value),
	];
	if (
		targetBindings.some((value) =>
			containsExactString({ needle: fontLabel, value })
		)
	) {
		return true;
	}
	const topLevelResources = binding.topLevelFontMaterials.value;
	if (!containsExactString({ needle: fontLabel, value: topLevelResources })) {
		return false;
	}
	return collectResourceIds({ value: topLevelResources }).some((resourceId) =>
		targetBindings.some((value) =>
			containsExactString({ needle: resourceId, value })
		)
	);
}
