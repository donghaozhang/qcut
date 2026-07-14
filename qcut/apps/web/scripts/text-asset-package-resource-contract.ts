import { posix } from "node:path";
import type { TextAssetUploadPlanItem } from "./upload-text-assets-cdn";

export type TextAssetPackageResourceContractIssue = {
	detail: string;
	key: string;
};

type TextAssetPackageCompanionRole = Extract<
	TextAssetUploadPlanItem["role"],
	"source" | "thumbnail"
>;

type TextAssetPackageCompanionResource = {
	byteSize: number;
	checksumSha256: string;
	mimeType: string;
	path: string;
	role: TextAssetPackageCompanionRole;
	url: string;
};

const REQUIRED_COMPANION_ROLES = ["thumbnail", "source"] as const;

export function verifyTextAssetPackageResourceManifest({
	items,
	packageBytes,
	packageItem,
	prefix,
}: {
	items: readonly TextAssetUploadPlanItem[];
	packageBytes: Buffer;
	packageItem: TextAssetUploadPlanItem;
	prefix: string;
}): TextAssetPackageResourceContractIssue[] {
	if (packageItem.role !== "package") return [];
	const resources = parsePackageResources({ packageBytes, packageItem });
	if (!resources.ok) return [resources.issue];
	const companionIssues = verifyRequiredCompanionResources({
		packageItem,
		resources: resources.resources,
	});
	const itemsByKey = new Map(items.map((item) => [item.key, item]));
	return [
		...companionIssues,
		...resources.resources.flatMap((resource) =>
			verifyPackageCompanionResource({
				itemsByKey,
				packageItem,
				prefix,
				resource,
			})
		),
	];
}

function parsePackageResources({
	packageBytes,
	packageItem,
}: {
	packageBytes: Buffer;
	packageItem: TextAssetUploadPlanItem;
}):
	| { ok: true; resources: TextAssetPackageCompanionResource[] }
	| { issue: TextAssetPackageResourceContractIssue; ok: false } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(packageBytes.toString("utf8")) as unknown;
	} catch {
		return {
			ok: false,
			issue: {
				detail: "QCut text package must be valid JSON",
				key: packageItem.key,
			},
		};
	}
	const record = asRecord({ value: parsed });
	if (!record || record.kind !== "qcut-text-template-package") {
		return {
			ok: false,
			issue: {
				detail:
					"QCut text package must declare kind qcut-text-template-package",
				key: packageItem.key,
			},
		};
	}
	const rawResources = record.resources;
	if (!Array.isArray(rawResources) || rawResources.length === 0) {
		return {
			ok: false,
			issue: {
				detail: "QCut text package must include companion resource manifest",
				key: packageItem.key,
			},
		};
	}
	const resources: TextAssetPackageCompanionResource[] = [];
	for (const [index, rawResource] of rawResources.entries()) {
		const resource = parsePackageResource({ rawResource });
		if (!resource) {
			return {
				ok: false,
				issue: {
					detail: `Invalid companion resource at index ${index}`,
					key: packageItem.key,
				},
			};
		}
		resources.push(resource);
	}
	return { ok: true, resources };
}

function verifyRequiredCompanionResources({
	packageItem,
	resources,
}: {
	packageItem: TextAssetUploadPlanItem;
	resources: readonly TextAssetPackageCompanionResource[];
}): TextAssetPackageResourceContractIssue[] {
	const issues: TextAssetPackageResourceContractIssue[] = [];
	for (const role of REQUIRED_COMPANION_ROLES) {
		if (resources.some((resource) => resource.role === role)) continue;
		issues.push({
			detail: `QCut text package is missing ${role} companion resource`,
			key: packageItem.key,
		});
	}
	const seen = new Set<string>();
	for (const resource of resources) {
		const key = `${resource.role}:${resource.path}`;
		if (!seen.has(key)) {
			seen.add(key);
			continue;
		}
		issues.push({
			detail: `QCut text package declares duplicate companion resource ${key}`,
			key: packageItem.key,
		});
	}
	return issues;
}

function verifyPackageCompanionResource({
	itemsByKey,
	packageItem,
	prefix,
	resource,
}: {
	itemsByKey: ReadonlyMap<string, TextAssetUploadPlanItem>;
	packageItem: TextAssetUploadPlanItem;
	prefix: string;
	resource: TextAssetPackageCompanionResource;
}): TextAssetPackageResourceContractIssue[] {
	const expectedKey = posix.join(posix.dirname(packageItem.key), resource.path);
	const item = itemsByKey.get(expectedKey);
	if (!item) {
		return [
			{
				detail: `QCut text package references missing companion file ${expectedKey}`,
				key: packageItem.key,
			},
		];
	}
	const expectedUrl = publicUrlForUploadItem({ item, prefix });
	const mismatches = [
		item.role === resource.role ? null : `role expected ${item.role}`,
		item.contentType === resource.mimeType
			? null
			: `mimeType expected ${item.contentType}`,
		item.size === resource.byteSize ? null : `byteSize expected ${item.size}`,
		item.sha256.toLocaleLowerCase() ===
		resource.checksumSha256.toLocaleLowerCase()
			? null
			: `checksumSha256 expected ${item.sha256}`,
		resource.url === expectedUrl ? null : `url expected ${expectedUrl}`,
	].filter((mismatch): mismatch is string => Boolean(mismatch));
	if (mismatches.length === 0) return [];
	return [
		{
			detail: `${resource.role} companion resource mismatch: ${mismatches.join(", ")}`,
			key: packageItem.key,
		},
	];
}

function parsePackageResource({
	rawResource,
}: {
	rawResource: unknown;
}): TextAssetPackageCompanionResource | null {
	const record = asRecord({ value: rawResource });
	if (!record) return null;
	const role = companionRole({ value: record.role });
	const path = stringValue({ record, key: "path" });
	const url = stringValue({ record, key: "url" });
	const mimeType = stringValue({ record, key: "mimeType" });
	const byteSize = numberValue({ record, key: "byteSize" });
	const checksumSha256 = stringValue({ record, key: "checksumSha256" });
	if (
		!role ||
		!path ||
		!isSafeRelativeFilePath({ value: path }) ||
		!url ||
		!mimeType ||
		!byteSize ||
		!isSha256({ value: checksumSha256 })
	) {
		return null;
	}
	return { byteSize, checksumSha256, mimeType, path, role, url };
}

function publicUrlForUploadItem({
	item,
	prefix,
}: {
	item: TextAssetUploadPlanItem;
	prefix: string;
}): string {
	const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
	const key = item.key.replace(/^\/+/, "");
	const withoutPrefix =
		cleanPrefix && key.startsWith(`${cleanPrefix}/`)
			? key.slice(cleanPrefix.length + 1)
			: key;
	return `/${withoutPrefix}`;
}

function companionRole({
	value,
}: {
	value: unknown;
}): TextAssetPackageCompanionRole | undefined {
	return value === "thumbnail" || value === "source" ? value : undefined;
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function stringValue({
	key,
	record,
}: {
	key: string;
	record: Record<string, unknown>;
}): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue({
	key,
	record,
}: {
	key: string;
	record: Record<string, unknown>;
}): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function isSafeRelativeFilePath({ value }: { value: string }): boolean {
	return (
		value === posix.basename(value) &&
		value !== "." &&
		value !== ".." &&
		!value.includes("/") &&
		!value.includes("\\")
	);
}

function isSha256({ value }: { value?: string }): value is string {
	return typeof value === "string" && /^[a-f\d]{64}$/i.test(value);
}
