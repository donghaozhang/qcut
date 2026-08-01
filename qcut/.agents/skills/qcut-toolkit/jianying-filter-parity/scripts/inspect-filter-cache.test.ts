import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	findFilterRecords,
	inspectPackage,
	parsePngDimensions,
	parseVfHeader,
} from "./inspect-filter-cache";

function createVfCube({ size }: { size: number }) {
	const buffer = Buffer.alloc(10 + size ** 3 * 3 * 4);
	buffer.write("VF_V", 0, "ascii");
	buffer.writeUInt16LE(size, 4);
	buffer.writeUInt16LE(size, 6);
	buffer.writeUInt16LE(size, 8);
	return buffer;
}

function createPngHeader({ width, height }: { width: number; height: number }) {
	const buffer = Buffer.alloc(24);
	Buffer.from("89504e470d0a1a0a", "hex").copy(buffer, 0);
	buffer.write("IHDR", 12, "ascii");
	buffer.writeUInt32BE(width, 16);
	buffer.writeUInt32BE(height, 20);
	return buffer;
}

describe("inspect-filter-cache", () => {
	test("parses VF_V float cube dimensions and validates payload length", () => {
		expect(parseVfHeader({ buffer: createVfCube({ size: 17 }) })).toEqual({
			width: 17,
			height: 17,
			depth: 17,
			channels: 3,
			valueType: "float32-le",
		});
		expect(() =>
			parseVfHeader({ buffer: createVfCube({ size: 17 }).subarray(0, 100) })
		).toThrow("Invalid VF payload length");
	});

	test("parses PNG LUT dimensions", () => {
		expect(
			parsePngDimensions({
				buffer: createPngHeader({ width: 512, height: 512 }),
			})
		).toEqual({ width: 512, height: 512 });
	});

	test("classifies float cube and skin-segmented dual-LUT packages", () => {
		const temporaryRoot = mkdtempSync(
			path.join(os.tmpdir(), "qcut-filter-cache-")
		);
		try {
			const cubeRoot = path.join(temporaryRoot, "cube");
			mkdirSync(path.join(cubeRoot, "AmazingFeature/texture"), {
				recursive: true,
			});
			mkdirSync(path.join(cubeRoot, "AmazingFeature/lua"), { recursive: true });
			writeFileSync(
				path.join(cubeRoot, "AmazingFeature/texture/filter.cube.vf"),
				createVfCube({ size: 32 })
			);
			writeFileSync(
				path.join(cubeRoot, "AmazingFeature/lua/SeekModeScript.lua"),
				"return {}"
			);
			const cubePackage = inspectPackage({ packageRoot: cubeRoot });
			expect(cubePackage.kind).toBe("3d-lut");
			expect(cubePackage.cubes[0]).toMatchObject({
				width: 32,
				height: 32,
				depth: 32,
			});
			expect(cubePackage.luaFiles).toEqual([
				"AmazingFeature/lua/SeekModeScript.lua",
			]);

			const skinRoot = path.join(temporaryRoot, "skin");
			mkdirSync(path.join(skinRoot, "SkinFilter/image"), { recursive: true });
			mkdirSync(path.join(skinRoot, "SkinFilter/texture"), { recursive: true });
			for (const name of ["filter_bg.png", "filter_skin.png"]) {
				writeFileSync(
					path.join(skinRoot, "SkinFilter/image", name),
					createPngHeader({ width: 512, height: 512 })
				);
			}
			writeFileSync(
				path.join(skinRoot, "SkinFilter/texture/filter.cube.vf"),
				createVfCube({ size: 17 })
			);
			const skinPackage = inspectPackage({ packageRoot: skinRoot });
			expect(skinPackage.kind).toBe("skin-segmented-dual-lut");
			expect(skinPackage.imageLuts).toHaveLength(2);
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	test("maps exact HTTP-cache titles without losing 64-bit resource IDs", () => {
		const temporaryRoot = mkdtempSync(
			path.join(os.tmpdir(), "qcut-filter-db-")
		);
		try {
			const databasePath = path.join(temporaryRoot, "rp.db");
			const database = new Database(databasePath);
			database.exec(`
				CREATE TABLE http_cache (
					id INTEGER PRIMARY KEY,
					response_body TEXT NOT NULL,
					timestamp TEXT
				)
			`);
			const responseBody = JSON.stringify({
				data: {
					effect_item_list: [
						{
							common_attr: {
								title: "静谧暗调",
								id: "7630501558370733321",
								effect_id: "7630501558370733321",
								md5: "32893a4130581511f99ca8d1db4b258a",
								publish_source: "user_post",
								requirements: ["blit"],
							},
						},
					],
				},
			});
			database
				.query(
					"INSERT INTO http_cache (response_body, timestamp) VALUES (?, ?)"
				)
				.run(responseBody, "2026-08-01 12:00:00");
			database.close();

			const records = findFilterRecords({
				databasePaths: [databasePath],
				title: "静谧暗调",
			});
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				title: "静谧暗调",
				id: "7630501558370733321",
				md5: "32893a4130581511f99ca8d1db4b258a",
			});
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});
});
