import { existsSync } from "node:fs";
import path from "node:path";

export type AuditOrientation = "portrait" | "landscape";

export interface PortraitAuditFixture {
	fileName: string;
	orientation: AuditOrientation;
	width: number;
	height: number;
	duration: number;
}

export const portraitAuditDirectory =
	process.env.QCUT_PORTRAIT_AUDIT_DIR ??
	path.resolve("output/playwright/portrait-filter-transition-audit/sources");

export const portraitAuditFixtures: PortraitAuditFixture[] = [
	{
		fileName: "colorful-influencer-10s.mp4",
		orientation: "portrait",
		width: 720,
		height: 1280,
		duration: 10.01,
	},
	{
		fileName: "neon-man-10s.mp4",
		orientation: "portrait",
		width: 720,
		height: 1280,
		duration: 10.01,
	},
	{
		fileName: "beach-woman-10s.mp4",
		orientation: "portrait",
		width: 720,
		height: 1280,
		duration: 10.01,
	},
	{
		fileName: "university-woman-landscape-10s.mp4",
		orientation: "landscape",
		width: 1280,
		height: 720,
		duration: 10.01,
	},
	{
		fileName: "office-woman-landscape-10s.mp4",
		orientation: "landscape",
		width: 1280,
		height: 720,
		duration: 10.01,
	},
	{
		fileName: "chroma-man-landscape-10s.mp4",
		orientation: "landscape",
		width: 1280,
		height: 720,
		duration: 10.01,
	},
];

export function portraitAuditFixturePath({
	fixture,
}: {
	fixture: PortraitAuditFixture;
}) {
	return path.join(portraitAuditDirectory, fixture.fileName);
}

export function missingPortraitAuditFixtures() {
	return portraitAuditFixtures.filter(
		(fixture) => !existsSync(portraitAuditFixturePath({ fixture }))
	);
}
