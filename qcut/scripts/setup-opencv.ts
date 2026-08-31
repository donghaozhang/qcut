import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const runtimePath = Bun.resolveSync(
	"@techstark/opencv-js",
	join(process.cwd(), "apps", "web", "package.json")
);
const packageRoot = dirname(dirname(runtimePath));
const targetDirectory = join(process.cwd(), "apps", "web", "public", "opencv");

async function setupOpenCv(): Promise<void> {
	await mkdir(targetDirectory, { recursive: true });
	await Promise.all([
		copyFile(
			join(packageRoot, "dist", "opencv.js"),
			join(targetDirectory, "opencv.js")
		),
		copyFile(join(packageRoot, "LICENSE"), join(targetDirectory, "LICENSE")),
	]);
}

await setupOpenCv();
