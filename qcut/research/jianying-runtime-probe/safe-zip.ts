import path from "node:path";

const ZIP_MODE_LINE_PATTERN = /^[bcdlps-][rwxStTs-]{9}\s/;

export function validateZipListings({
	entryNames,
	entryDetails,
}: {
	entryNames: string;
	entryDetails: string;
}): void {
	const names = entryNames.split("\n").filter(Boolean);
	const unsafeName = names.find(
		(entry) => path.isAbsolute(entry) || entry.split("/").includes("..")
	);
	if (unsafeName)
		throw new Error(`Unsafe package archive entry: ${unsafeName}`);

	const modes = entryDetails
		.split("\n")
		.map((line) => line.trimStart())
		.filter((line) => ZIP_MODE_LINE_PATTERN.test(line))
		.map((line) => line.slice(0, 10));
	if (modes.length !== names.length) {
		throw new Error("Could not verify package archive entry types.");
	}
	const unsafeMode = modes.find((mode) => mode[0] !== "-" && mode[0] !== "d");
	if (unsafeMode) {
		throw new Error(`Unsafe package archive entry type: ${unsafeMode}`);
	}
}
