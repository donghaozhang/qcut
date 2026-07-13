/**
 * Setup script to copy FFmpeg WebAssembly files from node_modules to public directory
 *
 * This script copies the necessary FFmpeg.wasm files to the public directory so they can be
 * served statically by the web server and loaded by the FFmpeg worker at runtime.
 */

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadFFmpegManifest } from "./ffmpeg-manifest.js";

async function setupFFmpeg() {
	try {
		console.log("🔧 Setting up FFmpeg WebAssembly files...");
		const manifest = await loadFFmpegManifest();

		// Dynamically resolve @ffmpeg/core package path to handle different package managers
		let ffmpegCorePath: string;

		try {
			// Use createRequire for robust cross-platform resolution
			const require = createRequire(import.meta.url);
			const ffmpegCoreRoot = dirname(
				require.resolve("@ffmpeg/core/package.json")
			);
			ffmpegCorePath = join(ffmpegCoreRoot, "dist", "esm");
			console.log(`📦 Resolved @ffmpeg/core path: ${ffmpegCoreRoot}`);
			console.log(`📂 Using source directory: ${ffmpegCorePath}`);
		} catch (error) {
			// Fallback to checking common locations if resolution fails
			const possiblePaths = [
				join(process.cwd(), "node_modules", "@ffmpeg", "core", "dist", "esm"),
				join(
					dirname(fileURLToPath(import.meta.url)),
					"..",
					"node_modules",
					"@ffmpeg",
					"core",
					"dist",
					"esm"
				),
			];

			for (const path of possiblePaths) {
				if (existsSync(join(path, "ffmpeg-core.js"))) {
					ffmpegCorePath = path;
					console.log(`📦 Found @ffmpeg/core at: ${path}`);
					break;
				}
			}

			if (!ffmpegCorePath!) {
				throw new Error(
					`Failed to resolve @ffmpeg/core package. Make sure it's installed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
		const corePackage = JSON.parse(
			await readFile(join(ffmpegCorePath, "..", "..", "package.json"), "utf8")
		) as { version: string };
		if (corePackage.version !== manifest.wasm.packageVersion) {
			throw new Error(
				`FFmpeg.wasm package mismatch: expected ${manifest.wasm.packageVersion}, received ${corePackage.version}`
			);
		}
		const publicFFmpegPath = "apps/web/public/ffmpeg";
		const electronFFmpegPath = "electron/resources/ffmpeg";

		// Files to copy (worker.js may not exist in this version)
		const filesToCopy = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

		// Target directories to create
		const targetPaths = [publicFFmpegPath, electronFFmpegPath];

		// Create target directories if they don't exist
		for (const targetPath of targetPaths) {
			if (!existsSync(targetPath)) {
				await mkdir(targetPath, { recursive: true });
				console.log(`📁 Created directory: ${targetPath}`);
			}
		}

		// Copy files to both locations concurrently
		const copyOperations = filesToCopy.flatMap((file) => {
			const sourcePath = join(ffmpegCorePath, file);

			return targetPaths.map(async (targetPath) => {
				const destPath = join(targetPath, file);
				try {
					await copyFile(sourcePath, destPath);
					console.log(`✅ Copied: ${file} → ${targetPath}`);
				} catch (error) {
					const fileError = error as NodeJS.ErrnoException;
					if (fileError.code === "ENOENT" && fileError.path === sourcePath) {
						console.error(`❌ Source file not found: ${sourcePath}`);
						process.exit(1);
					}
					throw error;
				}
			});
		});

		await Promise.all(copyOperations);

		console.log("🎉 FFmpeg setup completed successfully!");
		console.log(`📍 Web files: ${publicFFmpegPath}`);
		console.log(`📍 Electron files: ${electronFFmpegPath}`);
		console.log("ℹ️  Files excluded from git via .gitignore patterns");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error("❌ Failed to setup FFmpeg files:", errorMessage);
		process.exit(1);
	}
}

// Run the setup
setupFFmpeg();
