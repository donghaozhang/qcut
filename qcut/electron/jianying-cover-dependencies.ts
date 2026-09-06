export interface CoverDependencyIdentity {
	resourceId: string;
	kind: "font" | "word-art" | "filter";
	name: string;
	version?: string;
}

function visitCoverMaterials({
	materials,
	visit,
}: {
	materials: Record<string, unknown>;
	visit: (record: Record<string, unknown>) => void;
}) {
	const walk = ({ value }: { value: unknown }): void => {
		if (!value || typeof value !== "object") return;
		const record = value as Record<string, unknown>;
		visit(record);
		for (const child of Object.values(record)) walk({ value: child });
	};
	// Author media is a replaceable background slot, not a redistributable dependency.
	for (const [kind, value] of Object.entries(materials)) {
		if (kind !== "videos" && kind !== "audios") walk({ value });
	}
}

export function coverDependencyReferences({
	materials,
}: {
	materials: Record<string, unknown>;
}): string[] {
	const references = new Set<string>();
	visitCoverMaterials({
		materials,
		visit: (record) => {
			for (const [key, child] of Object.entries(record)) {
				if (
					typeof child === "string" &&
					/(^path$|_path$)/.test(key) &&
					child &&
					child !== "text/"
				)
					references.add(child);
			}
		},
	});
	return [...references].sort();
}

export function identifyCoverDependency({
	reference,
	materials,
}: {
	reference: string;
	materials: Record<string, unknown>;
}): CoverDependencyIdentity | undefined {
	const found: CoverDependencyIdentity[] = [];
	let invalidIdentity = false;
	const resourceId = ({ value }: { value: unknown }): string => {
		if (value == null) return "";
		if (typeof value === "string") return value;
		// Numeric catalog IDs may already have lost precision; never treat them as a builtin.
		invalidIdentity = true;
		return "";
	};
	visitCoverMaterials({
		materials,
		visit: (record) => {
			if (record.font_path === reference)
				found.push({
					kind: "font",
					resourceId: resourceId({ value: record.font_resource_id }),
					name: typeof record.font_title === "string" ? record.font_title : "",
				});
			if (
				record.path === reference &&
				["filter", "text_effect", "brightness"].includes(String(record.type))
			) {
				if (record.version != null && typeof record.version !== "string")
					invalidIdentity = true;
				found.push({
					kind: record.type === "text_effect" ? "word-art" : "filter",
					resourceId: resourceId({ value: record.resource_id }),
					name:
						record.type === "brightness"
							? "builtin-brightness"
							: String(record.name ?? ""),
					...(typeof record.version === "string" && record.version
						? { version: record.version }
						: {}),
				});
			}
		},
	});
	if (invalidIdentity) return;
	const unique = new Map(found.map((item) => [JSON.stringify(item), item]));
	return unique.size === 1 ? [...unique.values()][0] : undefined;
}
