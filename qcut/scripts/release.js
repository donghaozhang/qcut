#!/usr/bin/env node
/**
 * QCut Release Script
 *
 * Automates the release process:
 * 1. Version bumping
 * 2. Building the application
 * 3. Generating checksums
 * 4. Creating release notes template
 *
 * Usage:
 *   node scripts/release.js patch   # 0.1.0 -> 0.1.1
 *   node scripts/release.js minor   # 0.1.0 -> 0.2.0
 *   node scripts/release.js major   # 0.1.0 -> 1.0.0
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const RELEASE_TYPES = ["patch", "minor", "major"];

function main() {
  const releaseType = process.argv[2];

  if (!releaseType || !RELEASE_TYPES.includes(releaseType)) {
    console.error("❌ Usage: node scripts/release.js <patch|minor|major>");
    process.exit(1);
  }

  console.log(`🚀 Starting ${releaseType} release process...\n`);

  try {
    // Step 1: Check working directory is clean
    console.log("📋 Step 1: Checking git status...");
    checkGitStatus();

    // Step 2: Bump version
    console.log("📋 Step 2: Bumping version...");
    const newVersion = bumpVersion(releaseType);

    // Step 3: Build web application
    console.log("📋 Step 3: Building web application...");
    buildWebApp();

    // Step 4: Build Electron application
    console.log("📋 Step 4: Building Electron application...");
    buildElectronApp();

    // Step 5: Generate checksums
    console.log("📋 Step 5: Generating checksums...");
    generateChecksums();

    // Step 6: Create git tag
    console.log("📋 Step 6: Creating git tag...");
    createGitTag(newVersion);

    // Step 7: Generate release notes template
    console.log("📋 Step 7: Generating release notes...");
    generateReleaseNotes(newVersion);

    console.log(`\n✅ Release v${newVersion} prepared successfully!`);
    console.log("\n📋 Next steps:");
    console.log("1. Review the generated files");
    console.log("2. Push the tag: git push origin v" + newVersion);
    console.log("3. Create GitHub release with the installer");
    console.log("4. Use the generated release notes template");
  } catch (error) {
    console.error("\n❌ Release process failed:", error.message);
    process.exit(1);
  }
}

function checkGitStatus() {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf8" });
    if (status.trim()) {
      throw new Error(
        "Working directory is not clean. Please commit your changes first."
      );
    }
    console.log("✅ Working directory is clean");
  } catch (error) {
    throw error;
  }
}

function bumpVersion(releaseType) {
  const packagePath = path.join(__dirname, "../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

  const currentVersion = packageJson.version;
  const [major, minor, patch] = currentVersion.split(".").map(Number);

  let newVersion;
  switch (releaseType) {
    case "patch":
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
    case "minor":
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case "major":
      newVersion = `${major + 1}.0.0`;
      break;
  }

  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + "\n");

  console.log(`✅ Version bumped: ${currentVersion} -> ${newVersion}`);
  return newVersion;
}

function buildWebApp() {
  try {
    execSync("bun run build", { stdio: "inherit" });
    console.log("✅ Web application built successfully");
  } catch (error) {
    throw new Error("Failed to build web application");
  }
}

function buildElectronApp() {
  try {
    execSync("bun run dist:win:release", { stdio: "inherit" });
    console.log("✅ Electron application built successfully");
  } catch (error) {
    throw new Error("Failed to build Electron application");
  }
}

function generateChecksums() {
  const buildDir = "d:/AI_play/AI_Code/build_opencut";
  const installerPattern = /QCut.*Setup.*\.exe$/;

  try {
    const files = fs.readdirSync(buildDir);
    const installerFile = files.find((file) => installerPattern.test(file));

    if (!installerFile) {
      throw new Error("Installer file not found");
    }

    const installerPath = path.join(buildDir, installerFile);

    // Generate SHA256 checksum
    const checksum = execSync(
      `powershell "Get-FileHash '${installerPath}' -Algorithm SHA256 | Select-Object -ExpandProperty Hash"`,
      { encoding: "utf8" }
    ).trim();

    // Write checksums file
    const checksumContent = `SHA256 Checksums for QCut Release
=================================

${installerFile}
SHA256: ${checksum}

Verification:
1. Download the installer
2. Run: certutil -hashfile "${installerFile}" SHA256
3. Compare with the hash above
`;

    fs.writeFileSync(path.join(buildDir, "SHA256SUMS.txt"), checksumContent);
    console.log(`✅ Checksums generated for ${installerFile}`);
  } catch (error) {
    throw new Error("Failed to generate checksums: " + error.message);
  }
}

function createGitTag(version) {
  try {
    // Add package.json to staging
    execSync("git add package.json");

    // Commit version bump
    execSync(`git commit -m "chore: bump version to v${version}"`);

    // Create tag
    execSync(`git tag -a v${version} -m "Release v${version}"`);

    console.log(`✅ Git tag v${version} created`);
  } catch (error) {
    throw new Error("Failed to create git tag: " + error.message);
  }
}

function generateReleaseNotes(version) {
  const buildDir = "d:/AI_play/AI_Code/build_opencut";
  const installerPattern = /QCut.*Setup.*\.exe$/;

  try {
    const files = fs.readdirSync(buildDir);
    const installerFile = files.find((file) => installerPattern.test(file));
    const installerStats = fs.statSync(path.join(buildDir, installerFile));
    const fileSizeMB = (installerStats.size / (1024 * 1024)).toFixed(1);

    const releaseNotes = `# QCut Video Editor v${version}

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

**Full Changelog:** https://github.com/your-org/qcut/compare/v${getPreviousVersion()}...v${version}
`;

    fs.writeFileSync(path.join(buildDir, "RELEASE_NOTES.md"), releaseNotes);
    console.log("✅ Release notes template generated");
  } catch (error) {
    console.log(
      "⚠️  Could not generate full release notes template, creating basic version"
    );

    const basicNotes = `# QCut Video Editor v${version}

## Download
- Windows Installer: Available in this release
- See SHA256SUMS.txt for checksums

## Security Notice
This is an unsigned installer - see documentation for details.
`;

    fs.writeFileSync(path.join(__dirname, "../RELEASE_NOTES.md"), basicNotes);
  }
}

function getPreviousVersion() {
  try {
    const tags = execSync("git tag --sort=-version:refname", {
      encoding: "utf8",
    });
    const tagList = tags
      .trim()
      .split("\n")
      .filter((tag) => tag.match(/^v\d+\.\d+\.\d+$/));
    return tagList[1] || "v0.0.0"; // Return second tag (previous version)
  } catch (error) {
    return "v0.0.0";
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, bumpVersion, generateChecksums };
