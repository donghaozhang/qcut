/**
 * QCut Release Script
 *
 * Date-based versioning: YYYY.MM.DD.N
 *   - YYYY.MM.DD is today's date
 *   - N is the build number for that day (starts at 1)
 *
 * Automates the release process:
 * 1. Version bumping (date-based)
 * 2. Building the application
 * 3. Generating checksums
 * 4. Creating release notes template
 *
 * Usage:
 *   bun scripts/release.ts              # Next version for today (2026.02.15.1 or .2, .3, etc.)
 *   bun scripts/release.ts alpha        # 2026.02.15.1-alpha.1
 *   bun scripts/release.ts beta         # 2026.02.15.1-beta.1
 *   bun scripts/release.ts rc           # 2026.02.15.1-rc.1
 *   bun scripts/release.ts promote      # 2026.02.15.1-rc.2 -> 2026.02.15.1
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

type ReleaseType = "stable" | "alpha" | "beta" | "rc" | "promote";
const RELEASE_TYPES: ReleaseType[] = [
	"stable",
	"alpha",
	"beta",
	"rc",
	"promote",
];

type PrereleaseChannel = "alpha" | "beta" | "rc";
const PRERELEASE_CHANNELS: PrereleaseChannel[] = ["alpha", "beta", "rc"];

interface PackageJson {
	version: string;
	[key: string]: any;
}

interface ParsedVersion {
	year: number;
	month: number;
	day: number;
	build: number;
	prerelease: { channel: string; number: number } | null;
}

/**
 * Resolves the build output directory based on environment
 */
function resolveBuildOutputDir(): string {
	if (process.env.BUILD_OUTPUT_DIR) {
		return process.env.BUILD_OUTPUT_DIR;
	}

	const currentDir = import.meta.dirname;
	const isCompiled = currentDir.includes("dist");
	const rootDir = isCompiled
		? path.join(currentDir, "../../")
		: path.join(currentDir, "../");

	return path.join(rootDir, "dist-electron");
}

function main(): void {
	const releaseType: string = process.argv[2] || "stable";

	if (!RELEASE_TYPES.includes(releaseType as ReleaseType)) {
		process.stderr.write(
			"Usage: bun run release [stable|alpha|beta|rc|promote]\n\n" +
				"  (default) - Next date-based version (2026.02.15.1)\n" +
				"  alpha     - Create/bump alpha prerelease (2026.02.15.1-alpha.1)\n" +
				"  beta      - Create/bump beta prerelease (2026.02.15.1-beta.1)\n" +
				"  rc        - Create/bump release candidate (2026.02.15.1-rc.1)\n" +
				"  promote   - Promote prerelease to stable (2026.02.15.1-rc.2 -> 2026.02.15.1)\n"
		);
		process.exit(1);
	}

	const label = releaseType === "stable" ? "date" : releaseType;
	process.stdout.write(`🚀 Starting ${label} release process...\n\n`);

	try {
		// Step 1: Check working directory is clean
		process.stdout.write("📋 Step 1: Checking git status...\n");
		checkGitStatus();

		// Step 2: Bump version
		process.stdout.write("📋 Step 2: Bumping version...\n");
		const newVersion: string = bumpVersion(releaseType as ReleaseType);

		// Step 3: Generate release doc in docs/releases/
		process.stdout.write("📋 Step 3: Generating release doc...\n");
		generateReleaseDoc(newVersion, releaseType as ReleaseType);

		// Step 4: Build web application
		process.stdout.write("📋 Step 4: Building web application...\n");
		buildWebApp();

		// Step 5: Build Electron application
		process.stdout.write("📋 Step 5: Building Electron application...\n");
		buildElectronApp();

		// Step 6: Generate checksums
		process.stdout.write("📋 Step 6: Generating checksums...\n");
		generateChecksums();

		// Step 7: Create git tag
		process.stdout.write("📋 Step 7: Creating git tag...\n");
		createGitTag(newVersion);

		// Step 8: Generate release notes template
		process.stdout.write("📋 Step 8: Generating release notes...\n");
		generateReleaseNotes(newVersion);

		process.stdout.write(
			`\n✅ Release v${newVersion} prepared successfully!\n`
		);
		process.stdout.write("\n📋 Next steps:\n");
		process.stdout.write("1. Review the generated files\n");
		process.stdout.write(
			"2. Push the tag: git push origin v" + newVersion + "\n"
		);
		process.stdout.write("3. Create GitHub release with the installer\n");
		process.stdout.write("4. Use the generated release notes template\n");
	} catch (error: any) {
		process.stderr.write(
			`\n❌ Release process failed: ${error?.message || error}\n`
		);
		process.exit(1);
	}
}

/**
 * Generate a release doc in docs/releases/ from the [Unreleased] section of CHANGELOG.md.
 * Also updates latest.md for stable releases.
 */
function generateReleaseDoc(version: string, releaseType: ReleaseType): void {
	const currentDir = import.meta.dirname;
	const isCompiled = currentDir.includes("dist");
	const rootDir = isCompiled
		? path.join(currentDir, "../../")
		: path.join(currentDir, "../");

	const releasesDir = path.join(rootDir, "docs", "releases");
	const changelogPath = path.join(rootDir, "CHANGELOG.md");

	if (!fs.existsSync(releasesDir)) {
		fs.mkdirSync(releasesDir, { recursive: true });
	}

	const today = new Date().toISOString().split("T")[0];
	const channel =
		releaseType === "promote" || releaseType === "stable"
			? "stable"
			: releaseType;

	// Extract [Unreleased] content from CHANGELOG.md
	let unreleasedContent = "";
	if (fs.existsSync(changelogPath)) {
		const changelog = fs.readFileSync(changelogPath, "utf-8");
		const unreleasedMatch = changelog.match(
			/## \[Unreleased\][^\r\n]*\r?\n([\s\S]*?)(?=\r?\n## \[|$)/
		);
		if (unreleasedMatch) {
			unreleasedContent = unreleasedMatch[1].trim();
		}
	}

	const sections = unreleasedContent || `- Release v${version}`;
	const releaseDoc = `---
version: "${version}"
date: "${today}"
channel: "${channel}"
---

# QCut v${version}

${sections}
`;

	const filename = `v${version}.md`;
	fs.writeFileSync(path.join(releasesDir, filename), releaseDoc);
	process.stdout.write(`✅ Created docs/releases/${filename}\n`);

	if (channel === "stable") {
		fs.writeFileSync(path.join(releasesDir, "latest.md"), releaseDoc);
		process.stdout.write("✅ Updated docs/releases/latest.md\n");
	}

	// Update CHANGELOG.md: move [Unreleased] content to new version section
	if (fs.existsSync(changelogPath) && unreleasedContent) {
		const changelog = fs.readFileSync(changelogPath, "utf-8");
		const updatedChangelog = changelog.replace(
			/## \[Unreleased\][^\r\n]*\r?\n[\s\S]*?(?=\r?\n## \[|$)/,
			`## [Unreleased]\n\n## [${version}] - ${today}\n\n${unreleasedContent}\n`
		);
		fs.writeFileSync(changelogPath, updatedChangelog);
		process.stdout.write("✅ Updated CHANGELOG.md with new version section\n");
	}

	// Stage the release docs for the git tag step
	try {
		execSync(`git add docs/releases/${filename}`);
		if (channel === "stable") {
			execSync("git add docs/releases/latest.md");
		}
		if (unreleasedContent) {
			execSync("git add CHANGELOG.md");
		}
	} catch {
		process.stdout.write("⚠️  Could not stage release docs (non-fatal)\n");
	}
}

function checkGitStatus(): void {
	const status: string = execSync("git status --porcelain", {
		encoding: "utf8",
	});
	if (status.trim()) {
		throw new Error(
			"Working directory is not clean. Please commit your changes first."
		);
	}
	process.stdout.write("✅ Working directory is clean\n");
}

/**
 * Get today's date components
 */
function getTodayComponents(): { year: number; month: number; day: number } {
	const now = new Date();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1,
		day: now.getDate(),
	};
}

/**
 * Format date components with zero-padding for month and day
 */
function formatDateVersion(year: number, month: number, day: number): string {
	const mm = String(month).padStart(2, "0");
	const dd = String(day).padStart(2, "0");
	return `${year}.${mm}.${dd}`;
}

/**
 * Parse a date-based version string into its components
 * Handles: 2026.02.15.1 and 2026.02.15.1-beta.3
 * Also handles legacy semver: 0.3.72
 */
function parseVersion(version: string): ParsedVersion {
	// Try date-based format: YYYY.MM.DD.N or YYYY.MM.DD.N-channel.N
	const dateMatch = version.match(
		/^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)(?:-([a-z]+)\.(\d+))?$/
	);
	if (dateMatch) {
		return {
			year: parseInt(dateMatch[1], 10),
			month: parseInt(dateMatch[2], 10),
			day: parseInt(dateMatch[3], 10),
			build: parseInt(dateMatch[4], 10),
			prerelease: dateMatch[5]
				? { channel: dateMatch[5], number: parseInt(dateMatch[6], 10) }
				: null,
		};
	}

	// Legacy semver format - treat as needing a fresh date version
	const semverMatch = version.match(
		/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/
	);
	if (semverMatch) {
		const today = getTodayComponents();
		return {
			year: today.year,
			month: today.month,
			day: today.day,
			build: 0, // Will be bumped to 1
			prerelease: semverMatch[4]
				? { channel: semverMatch[4], number: parseInt(semverMatch[5], 10) }
				: null,
		};
	}

	throw new Error(`Invalid version format: ${version}`);
}

/**
 * Determine if the parsed version matches today's date
 */
function isToday(parsed: ParsedVersion): boolean {
	const today = getTodayComponents();
	return (
		parsed.year === today.year &&
		parsed.month === today.month &&
		parsed.day === today.day
	);
}

function bumpVersion(releaseType: ReleaseType): string {
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const isCompiled = currentDir.includes(`${path.sep}dist${path.sep}`);
	const rootDir = isCompiled
		? path.join(currentDir, "../../")
		: path.join(currentDir, "../");

	const packagePath: string = path.join(rootDir, "package.json");
	const packageJson: PackageJson = JSON.parse(
		fs.readFileSync(packagePath, "utf8")
	);

	const currentVersion: string = packageJson.version;
	const parsed = parseVersion(currentVersion);
	const today = getTodayComponents();
	const dateStr = formatDateVersion(today.year, today.month, today.day);

	let newVersion: string;

	if (releaseType === "promote") {
		if (!parsed.prerelease) {
			throw new Error("Cannot promote: current version is not a prerelease");
		}
		// Remove prerelease suffix
		newVersion = `${formatDateVersion(parsed.year, parsed.month, parsed.day)}.${parsed.build}`;
	} else if (PRERELEASE_CHANNELS.includes(releaseType as PrereleaseChannel)) {
		const channel = releaseType as PrereleaseChannel;

		if (
			parsed.prerelease &&
			parsed.prerelease.channel === channel &&
			isToday(parsed)
		) {
			// Same channel, same day: bump prerelease number
			newVersion = `${dateStr}.${parsed.build}-${channel}.${parsed.prerelease.number + 1}`;
		} else if (isToday(parsed) && !parsed.prerelease) {
			// Same day, stable -> prerelease: bump build and start at 1
			newVersion = `${dateStr}.${parsed.build + 1}-${channel}.1`;
		} else if (isToday(parsed) && parsed.prerelease) {
			// Same day, different channel: keep build, start new channel at 1
			newVersion = `${dateStr}.${parsed.build}-${channel}.1`;
		} else {
			// New day: start fresh
			newVersion = `${dateStr}.1-${channel}.1`;
		}
	} else {
		// Stable release
		if (isToday(parsed) && !parsed.prerelease) {
			// Same day: bump build number
			newVersion = `${dateStr}.${parsed.build + 1}`;
		} else {
			// New day or from prerelease: start at 1
			newVersion = `${dateStr}.1`;
		}
	}

	packageJson.version = newVersion;
	fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, "\t") + "\n");

	process.stdout.write(
		`✅ Version bumped: ${currentVersion} -> ${newVersion}\n`
	);
	return newVersion;
}

function buildWebApp(): void {
	try {
		execSync("bun run build", { stdio: "inherit" });
		process.stdout.write("✅ Web application built successfully\n");
	} catch (error: any) {
		throw new Error("Failed to build web application");
	}
}

function getDistCommand(): string {
	const stageCmd =
		"bun run stage-ffmpeg-binaries && bun run stage-aicp-binaries";
	switch (process.platform) {
		case "darwin":
			return `${stageCmd} && npx electron-builder --mac --publish never`;
		case "linux":
			return `${stageCmd} && npx electron-builder --linux --publish never`;
		case "win32":
			return "bun run dist:win:release";
		default:
			return `${stageCmd} && npx electron-builder --mac --publish never`;
	}
}

function getInstallerPattern(): RegExp {
	switch (process.platform) {
		case "darwin":
			return /QCut.*\.(dmg|zip)$/;
		case "linux":
			return /QCut.*\.(AppImage|deb)$/;
		case "win32":
			return /QCut.*Setup.*\.exe$/;
		default:
			return /QCut.*\.(dmg|zip)$/;
	}
}

function buildElectronApp(): void {
	try {
		execSync("bun run compile-afterpack", { stdio: "inherit" });
	} catch {
		process.stdout.write("⚠️  afterPack compilation skipped (non-fatal)\n");
	}

	const cmd = getDistCommand();
	try {
		execSync(cmd, { stdio: "inherit" });
		process.stdout.write("✅ Electron application built successfully\n");
	} catch (error: any) {
		throw new Error("Failed to build Electron application");
	}

	try {
		execSync("bun run verify:packaged-ffmpeg", { stdio: "inherit" });
	} catch {
		process.stdout.write("⚠️  FFmpeg verification failed (non-fatal)\n");
	}
	try {
		execSync("bun run verify:packaged-aicp", {
			stdio: "inherit",
			timeout: 15_000,
		});
	} catch {
		process.stdout.write("⚠️  AICP verification skipped (non-fatal)\n");
	}
}

function computeChecksum(filePath: string): string {
	const fileBuffer = fs.readFileSync(filePath);
	return crypto
		.createHash("sha256")
		.update(fileBuffer)
		.digest("hex")
		.toUpperCase();
}

function generateChecksums(): void {
	const buildDir: string = resolveBuildOutputDir();
	const installerPattern: RegExp = getInstallerPattern();

	try {
		const files: string[] = fs.readdirSync(buildDir);
		const installerFiles: string[] = files.filter((file: string) =>
			installerPattern.test(file)
		);

		if (installerFiles.length === 0) {
			throw new Error("Installer file not found");
		}

		let checksumContent =
			"SHA256 Checksums for QCut Release\n=================================\n\n";

		for (const installerFile of installerFiles) {
			const installerPath: string = path.join(buildDir, installerFile);
			const checksum = computeChecksum(installerPath);
			checksumContent += `${installerFile}\nSHA256: ${checksum}\n\n`;
		}

		checksumContent += `Verification:\n1. Download the installer\n2. Verify checksum with your platform's tool\n3. Compare with the hash above\n`;

		fs.writeFileSync(path.join(buildDir, "SHA256SUMS.txt"), checksumContent);
		process.stdout.write(
			`✅ Checksums generated for ${installerFiles.length} file(s)\n`
		);
	} catch (error: any) {
		throw new Error("Failed to generate checksums: " + error.message);
	}
}

function createGitTag(version: string): void {
	try {
		execSync("git add package.json");
		execSync(`git commit -m "chore: bump version to v${version}"`);
		execSync(`git tag -a v${version} -m "Release v${version}"`);
		process.stdout.write(`✅ Git tag v${version} created\n`);
	} catch (error: any) {
		throw new Error("Failed to create git tag: " + error.message);
	}
}

function generateReleaseNotes(version: string): void {
	const buildDir: string = resolveBuildOutputDir();
	const installerPattern: RegExp = getInstallerPattern();

	try {
		const files: string[] = fs.readdirSync(buildDir);
		const installerFile: string | undefined = files.find((file: string) =>
			installerPattern.test(file)
		);

		if (!installerFile) {
			throw new Error("Installer file not found for release notes");
		}

		const installerStats: fs.Stats = fs.statSync(
			path.join(buildDir, installerFile)
		);
		const fileSizeMB: string = (installerStats.size / (1024 * 1024)).toFixed(1);

		const releaseNotes: string = `# QCut Video Editor v${version}

## 🎉 What's New

<!-- Add your changes here -->
-

## 🐛 Bug Fixes

<!-- Add bug fixes here -->
-

## 🔧 Technical Changes

<!-- Add technical changes here -->
-

## 📦 Download

**Windows Installer:**
- **File:** \`${installerFile}\`
- **Size:** ${fileSizeMB} MB
- **SHA256:** See SHA256SUMS.txt

## 🔒 Security Notice

⚠️ **This is an unsigned installer.** QCut is an open-source project and releases are not code signed due to cost constraints.

**Expected Windows behavior:**
- Windows Defender SmartScreen will show a warning
- Click "More info" then "Run anyway"
- This is normal for open-source software

**Verify authenticity:**
1. Only download from official GitHub releases
2. Check SHA256 checksum matches SHA256SUMS.txt
3. All source code is available for review

## 📋 Installation

1. Download \`${installerFile}\`
2. Run the installer (see security notice above)
3. Follow the installation wizard
4. QCut will be available in Start Menu and Desktop

## 🔄 Auto-Updates

This version includes auto-update functionality:
- Checks for updates automatically every hour
- Notifies when updates are available
- Updates install on next app restart

## 🛠️ Technical Requirements

- **OS:** Windows 10/11 (64-bit)
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 500MB free space
- **GPU:** DirectX 11 compatible (recommended)

## 🐛 Known Issues

- FFmpeg path issue in installed version (export may fail)
- First launch may take longer due to initial setup

---

**Full Changelog:** https://github.com/qcut-team/qcut/compare/v${getPreviousVersion()}...v${version}
`;

		fs.writeFileSync(path.join(buildDir, "RELEASE_NOTES.md"), releaseNotes);
		process.stdout.write("✅ Release notes template generated\n");
	} catch (error: any) {
		process.stdout.write(
			"⚠️  Could not generate full release notes template, creating basic version\n"
		);

		const currentDir = import.meta.dirname;
		const isCompiled = currentDir.includes("dist");
		const rootDir = isCompiled
			? path.join(currentDir, "../../")
			: path.join(currentDir, "../");

		const basicNotes: string = `# QCut Video Editor v${version}

## Download
- Windows Installer: Available in this release
- See SHA256SUMS.txt for checksums

## Security Notice
This is an unsigned installer - see documentation for details.
`;

		fs.writeFileSync(path.join(rootDir, "RELEASE_NOTES.md"), basicNotes);
	}
}

function getPreviousVersion(): string {
	try {
		const tags: string = execSync("git tag --sort=-version:refname", {
			encoding: "utf8",
		});
		const tagList: string[] = tags
			.trim()
			.split("\n")
			.filter((tag: string) =>
				tag.match(
					/^v(\d{4}\.\d{2}\.\d{2}\.\d+|\d+\.\d+\.\d+)(-(?:alpha|beta|rc)\.\d+)?$/
				)
			);
		return tagList[1] || "v0.0.0";
	} catch (error: any) {
		return "v0.0.0";
	}
}

main();

export { main, bumpVersion, generateChecksums, parseVersion };
export type { ReleaseType, PackageJson, ParsedVersion, PrereleaseChannel };
