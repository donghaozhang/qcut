import {
	cacheQCutJianyingTextCatalog,
	verifyQCutJianyingTextCatalogCache,
} from "../electron/jianying-text-private-catalog-cache.js";
import { ensureQCutJianyingTextPrivateArchive } from "../electron/jianying-text-private-archive.js";

function parseConcurrency() {
	const option = process.argv.find((argument) =>
		argument.startsWith("--concurrency=")
	);
	if (!option) return 6;
	const value = Number(option.slice("--concurrency=".length));
	if (!(Number.isSafeInteger(value) && value > 0 && value <= 12)) {
		throw new Error("--concurrency must be an integer from 1 to 12");
	}
	return value;
}

function selectedTargets() {
	if (process.argv.includes("--styles-only")) return ["styles"] as const;
	if (process.argv.includes("--animations-only")) {
		return ["animations"] as const;
	}
	return ["styles", "animations"] as const;
}

async function main() {
	const archive = await ensureQCutJianyingTextPrivateArchive();
	if (process.argv.includes("--verify-only")) {
		const verification = await verifyQCutJianyingTextCatalogCache({ archive });
		process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
		if (!verification.complete) process.exitCode = 1;
		return;
	}
	let lastReported = 0;
	const summary = await cacheQCutJianyingTextCatalog({
		archive,
		concurrency: parseConcurrency(),
		targets: [...selectedTargets()],
		onProgress: ({ completed, total }) => {
			if (completed !== total && completed - lastReported < 25) return;
			lastReported = completed;
			process.stderr.write(`QCut 花字私有缓存：${completed}/${total}\n`);
		},
	});
	const refreshedArchive = await ensureQCutJianyingTextPrivateArchive({
		refresh: true,
	});

	process.stdout.write(
		`${JSON.stringify(
			{
				...summary,
				archiveContainers: refreshedArchive.manifest.containers,
			},
			null,
			2
		)}\n`
	);
}

void main().catch((cause: unknown) => {
	process.stderr.write(
		`${cause instanceof Error ? cause.stack : String(cause)}\n`
	);
	process.exitCode = 1;
});
