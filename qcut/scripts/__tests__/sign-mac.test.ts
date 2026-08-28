// @vitest-environment node
import path from "node:path";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signAsync, type SignOptions } from "@electron/osx-sign";
import { sign, withTransitionBridgeEntitlements } from "../sign-mac.mjs";

vi.mock("@electron/osx-sign", () => ({ signAsync: vi.fn() }));

const app = path.resolve("/tmp/QCut AI Video Editor.app");
const bridgePath = path.join(
	app,
	"Contents/Resources/bin/jianying-transition-bridge"
);
const personCutoutBridgePath = path.join(
	app,
	"Contents/Resources/bin/jianying-person-cutout-bridge"
);
const saliencyBridgePath = path.join(
	app,
	"Contents/Resources/bin/jianying-saliency-script-bridge"
);
const original = {
	entitlements: "build/entitlements.mac.plist",
	hardenedRuntime: true,
	timestamp: "none",
	requirements: "=designated => anchor apple generic",
};

afterEach(() => vi.clearAllMocks());

describe("macOS transition bridge signing", () => {
	it("uses dedicated entitlements only for the exact bundled helper", () => {
		const options = withTransitionBridgeEntitlements({
			options: { app, optionsForFile: () => original },
		});
		expect(options.optionsForFile?.(bridgePath)).toEqual({
			...original,
			entitlements: expect.stringContaining(
				"build/entitlements.transition-bridge.mac.plist"
			),
		});
		expect(options.optionsForFile?.(personCutoutBridgePath)).toEqual({
			...original,
			entitlements: expect.stringContaining(
				"build/entitlements.transition-bridge.mac.plist"
			),
		});
		expect(options.optionsForFile?.(saliencyBridgePath)).toEqual({
			...original,
			entitlements: expect.stringContaining(
				"build/entitlements.transition-bridge.mac.plist"
			),
		});
		for (const filePath of [
			app,
			path.join(app, "Contents/MacOS/QCut AI Video Editor"),
			path.join(app, "Contents/Resources/bin/ffmpeg"),
			path.join(app, "Contents/Resources/bin/jianying-text-runtime-bridge"),
			path.join(app, "Contents/Frameworks/jianying-transition-bridge"),
			path.join(
				app,
				"../Other.app/Contents/Resources/bin/jianying-transition-bridge"
			),
		]) {
			expect(options.optionsForFile?.(filePath)).toBe(original);
		}
	});

	it("retains hardened runtime even if the upstream callback omits it", () => {
		const options = withTransitionBridgeEntitlements({ options: { app } });
		expect(options.optionsForFile?.(bridgePath)?.hardenedRuntime).toBe(true);
		expect(options.optionsForFile?.(app)).toEqual({});
	});

	it("delegates signing and preserves identity, keychain, and verification", async () => {
		const options: SignOptions = {
			app,
			identity: "test-identity",
			keychain: "/tmp/test.keychain",
			strictVerify: true,
			identityValidation: false,
			optionsForFile: () => original,
		};
		await sign(options);
		expect(signAsync).toHaveBeenCalledOnce();
		expect(signAsync).toHaveBeenCalledWith({
			...options,
			optionsForFile: expect.any(Function),
		});
		const passed = vi.mocked(signAsync).mock.calls[0][0];
		expect(passed.optionsForFile?.(bridgePath)?.entitlements).not.toBe(
			original.entitlements
		);
	});

	it("propagates signing failures instead of publishing an unsigned app", async () => {
		vi.mocked(signAsync).mockRejectedValueOnce(new Error("signature failed"));
		await expect(sign({ app })).rejects.toThrow("signature failed");
	});

	it("wires the signing hook into electron-builder without changing app entitlements", () => {
		const pkg = JSON.parse(
			readFileSync(new URL("../../package.json", import.meta.url), "utf8")
		);
		expect(pkg.build.mac.sign).toBe("./scripts/sign-mac.mjs");
		expect(pkg.build.mac.entitlements).toBe("build/entitlements.mac.plist");
		expect(pkg.build.mac.entitlementsInherit).toBe(
			"build/entitlements.mac.plist"
		);
	});
});
